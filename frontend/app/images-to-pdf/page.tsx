"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type ImageItem = {
  id: string;
  file: File;
  previewUrl: string;
};

// Same-origin path; next.config.ts rewrites it to the FastAPI service.
// No trailing slash: Next strips it before rewriting, which would leave the
// backend redirecting to an internal host the browser cannot reach.
const CONVERT_ENDPOINT = "/api/pdf/images-to-pdf";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff"];
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"];

function isImage(file: File) {
  return (
    ACCEPTED_TYPES.includes(file.type) ||
    ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Collision-free, traversal-free name for the multipart part. */
function partName(name: string, index: number) {
  const safe = name.replace(/[^\w.-]+/g, "_").slice(-80) || "image";
  return `${String(index + 1).padStart(3, "0")}-${safe}`;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Reads the `detail` field FastAPI puts on HTTPException responses. */
async function errorDetail(res: Response, fallback: string) {
  const detail = await res
    .json()
    .then((body) => (typeof body?.detail === "string" ? body.detail : ""))
    .catch(() => "");
  return detail || `${fallback} (${res.status})`;
}

export default function ImagesToPdfPage() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [isFileDragActive, setIsFileDragActive] = useState(false);

  const downloadLinkRef = useRef<HTMLAnchorElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const all = Array.from(incoming);
    const images = all.filter(isImage);
    const skipped = all.length - images.length;

    setNotice(
      skipped > 0
        ? `Skipped ${skipped} file${skipped === 1 ? "" : "s"} that ${skipped === 1 ? "is" : "are"} not an image.`
        : "",
    );
    if (images.length === 0) return;

    setError("");
    setItems((prev) => [
      ...prev,
      ...images.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  const replaceDownloadUrl = useCallback((url: string | null) => {
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  // Release object URLs (previews + combined-file) on unmount.
  const itemsRef = useRef<ImageItem[]>([]);
  const downloadUrlRef = useRef<string | null>(null);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    downloadUrlRef.current = downloadUrl;
  }, [downloadUrl]);
  useEffect(
    () => () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    },
    [],
  );

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
    replaceDownloadUrl(null);
  };

  const clearAll = () => {
    for (const item of items) URL.revokeObjectURL(item.previewUrl);
    setItems([]);
    setError("");
    setNotice("");
    replaceDownloadUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const reorder = (from: number, to: number) => {
    setItems((prev) => move(prev, from, to));
    replaceDownloadUrl(null);
  };

  const handleConvert = async () => {
    if (items.length < 1) {
      setError("Add at least one image to convert.");
      return;
    }
    setLoading(true);
    setError("");
    replaceDownloadUrl(null);

    const formData = new FormData();
    items.forEach((item, index) => {
      // Send in on-screen order; the backend builds pages in the order it receives.
      formData.append("files", item.file, partName(item.file.name, index));
    });

    try {
      const res = await fetch(CONVERT_ENDPOINT, { method: "POST", body: formData });
      if (!res.ok) {
        throw new Error(await errorDetail(res, "Failed to convert images"));
      }
      replaceDownloadUrl(URL.createObjectURL(await res.blob()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Start the download as soon as the combined file is ready.
  useEffect(() => {
    if (downloadUrl) downloadLinkRef.current?.click();
  }, [downloadUrl]);

  const totalSize = items.reduce((sum, i) => sum + i.file.size, 0);

  return (
    <div className="relative isolate min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(249,115,22,0.16),transparent)]"
      />

      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="size-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6 6-6-6 6-6" />
          </svg>
          All tools
        </Link>

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Images to PDF</h1>
            <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
              Add your images, drag them into the order you want, then combine them into a single
              PDF — one page per image.
            </p>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              Clear all
            </button>
          )}
        </header>

        <DropZone
          active={isFileDragActive}
          hasItems={items.length > 0}
          inputRef={fileInputRef}
          onFiles={addFiles}
          onActiveChange={setIsFileDragActive}
        />

        {items.length > 0 && (
          <section aria-labelledby="order-heading" className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="order-heading" className="text-sm font-semibold tracking-tight">
                Page order
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                {items.length} image{items.length === 1 ? "" : "s"} · {formatBytes(totalSize)}
              </p>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Drag a row to reposition it, or use the arrow buttons.
            </p>

            <ol className="mt-4 flex flex-col gap-2">
              {items.map((item, index) => (
                <ImageRow
                  key={item.id}
                  item={item}
                  index={index}
                  total={items.length}
                  isDragging={dragIndex === index}
                  isDropTarget={dropIndex === index && dragIndex !== null && dragIndex !== index}
                  onDragStart={() => setDragIndex(index)}
                  onDragEnterRow={() => dragIndex !== null && setDropIndex(index)}
                  onDropRow={() => {
                    if (dragIndex !== null) reorder(dragIndex, index);
                    setDragIndex(null);
                    setDropIndex(null);
                  }}
                  onDragEndRow={() => {
                    setDragIndex(null);
                    setDropIndex(null);
                  }}
                  onMove={(to) => reorder(index, to)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </ol>
          </section>
        )}

        {(error || notice) && (
          <div className="mt-6 space-y-2" aria-live="polite">
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                {notice}
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleConvert}
            disabled={loading || items.length < 1}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950"
          >
            {loading && (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 animate-spin">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  opacity="0.25"
                />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            )}
            {loading
              ? "Converting…"
              : `Convert ${items.length > 1 ? `${items.length} Images` : "Image"} to PDF`}
          </button>

          {items.length < 1 && (
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              Add at least one image to enable converting.
            </span>
          )}

          {downloadUrl && (
            <a
              href={downloadUrl}
              download="images.pdf"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="size-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v12m0 0 4-4m-4 4-4-4M4 20h16"
                />
              </svg>
              Download again
            </a>
          )}
        </div>

        {/* Hidden anchor used to start the download automatically. */}
        {downloadUrl && (
          <a href={downloadUrl} download="images.pdf" ref={downloadLinkRef} className="hidden">
            Download PDF
          </a>
        )}
      </div>
    </div>
  );
}

type DropZoneProps = {
  active: boolean;
  hasItems: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList | File[] | null) => void;
  onActiveChange: (active: boolean) => void;
};

function DropZone({ active, hasItems, inputRef, onFiles, onActiveChange }: DropZoneProps) {
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        onActiveChange(true);
      }}
      onDragLeave={() => onActiveChange(false)}
      onDrop={(e) => {
        e.preventDefault();
        onActiveChange(false);
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
      className={`mt-8 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 text-center transition-colors ${
        hasItems ? "py-8" : "py-14"
      } ${
        active
          ? "border-orange-500 bg-orange-50/70 dark:border-orange-400 dark:bg-orange-950/30"
          : "border-zinc-300 bg-white/60 hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-zinc-600"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        className="size-8 text-orange-600 dark:text-orange-400"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 16V4m0 0 4 4m-4-4-4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        />
      </svg>
      <span className="text-sm font-semibold">
        {hasItems ? "Add more images" : "Drop images here or click to browse"}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-500">
        JPEG, PNG, WebP, GIF, BMP, TIFF · they stay on your machine
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={[...ACCEPTED_TYPES, ...ACCEPTED_EXTENSIONS].join(",")}
        multiple
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
        className="sr-only"
      />
    </label>
  );
}

type ImageRowProps = {
  item: ImageItem;
  index: number;
  total: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragEnterRow: () => void;
  onDropRow: () => void;
  onDragEndRow: () => void;
  onMove: (to: number) => void;
  onRemove: () => void;
};

function ImageRow({
  item,
  index,
  total,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnterRow,
  onDropRow,
  onDragEndRow,
  onMove,
  onRemove,
}: ImageRowProps) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        onDragStart();
      }}
      onDragEnter={onDragEnterRow}
      onDragOver={(e) => {
        // Only intercept row reordering, not files dragged in from the OS.
        if (e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropRow();
      }}
      onDragEnd={onDragEndRow}
      className={`group flex cursor-grab items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition active:cursor-grabbing dark:bg-zinc-900 ${
        isDragging ? "opacity-40" : "opacity-100"
      } ${
        isDropTarget
          ? "border-orange-500 ring-2 ring-orange-500/40 dark:border-orange-400"
          : "border-zinc-200 hover:shadow-md dark:border-zinc-800"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="size-4 shrink-0 text-zinc-300 dark:text-zinc-600"
      >
        <circle cx="9" cy="6" r="1.5" />
        <circle cx="15" cy="6" r="1.5" />
        <circle cx="9" cy="12" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="9" cy="18" r="1.5" />
        <circle cx="15" cy="18" r="1.5" />
      </svg>

      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-white dark:text-zinc-900">
        {index + 1}
      </span>

      <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        <Image
          src={item.previewUrl}
          alt=""
          fill
          sizes="36px"
          className="object-cover"
          unoptimized
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={item.file.name}>
          {item.file.name}
        </span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-500">
          {formatBytes(item.file.size)}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onMove(index - 1)}
          disabled={index === 0}
          aria-label={`Move ${item.file.name} earlier`}
          className="flex size-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="size-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 15l-6-6-6 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onMove(index + 1)}
          disabled={index === total - 1}
          aria-label={`Move ${item.file.name} later`}
          className="flex size-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="size-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onRemove}
          onDragStart={(e) => e.preventDefault()}
          aria-label={`Remove ${item.file.name}`}
          className="flex size-8 items-center justify-center rounded-lg border border-transparent text-zinc-500 transition-colors hover:bg-red-600 hover:text-white dark:text-zinc-400"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="size-4"
          >
            <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </span>
    </li>
  );
}
