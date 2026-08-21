"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type PdfItem = {
  id: string;
  file: File;
};

// Same-origin path; next.config.ts rewrites it to the FastAPI service.
// No trailing slash: Next strips it before rewriting, which would leave the
// backend redirecting to an internal host the browser cannot reach.
const COMBINE_ENDPOINT = "/api/pdf/combine-pdfs";

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
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
  const safe = name.replace(/[^\w.-]+/g, "_").slice(-80) || "file.pdf";
  return `${String(index + 1).padStart(3, "0")}-${safe}`;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function CombinePage() {
  const [items, setItems] = useState<PdfItem[]>([]);
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
    const pdfs = all.filter(isPdf);
    const skipped = all.length - pdfs.length;

    setNotice(
      skipped > 0
        ? `Skipped ${skipped} file${skipped === 1 ? "" : "s"} that ${skipped === 1 ? "is" : "are"} not a PDF.`
        : "",
    );
    if (pdfs.length === 0) return;

    setError("");
    setItems((prev) => [...prev, ...pdfs.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }, []);

  const replaceDownloadUrl = useCallback((url: string | null) => {
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  // Release the combined-file object URL on unmount.
  const downloadUrlRef = useRef<string | null>(null);
  downloadUrlRef.current = downloadUrl;
  useEffect(
    () => () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    },
    [],
  );

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    replaceDownloadUrl(null);
  };

  const clearAll = () => {
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

  const handleCombine = async () => {
    if (items.length < 2) {
      setError("Add at least two PDFs to combine.");
      return;
    }
    setLoading(true);
    setError("");
    replaceDownloadUrl(null);

    const formData = new FormData();
    items.forEach((item, index) => {
      // Send in on-screen order; the backend merges in the order it receives.
      formData.append("files", item.file, partName(item.file.name, index));
    });

    try {
      const res = await fetch(COMBINE_ENDPOINT, { method: "POST", body: formData });
      if (!res.ok) {
        const detail = await res
          .json()
          .then((body) => (typeof body?.detail === "string" ? body.detail : ""))
          .catch(() => "");
        throw new Error(detail || `Failed to combine PDFs (${res.status})`);
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
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(59,130,246,0.16),transparent)]"
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
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Combine PDFs</h1>
            <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
              Add your files, drag them into the order you want, then combine them into a single
              PDF.
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
                Merge order
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                {items.length} file{items.length === 1 ? "" : "s"} · {formatBytes(totalSize)}
              </p>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Drag a row to reposition it, or use the arrow buttons.
            </p>

            <ol className="mt-4 flex flex-col gap-2">
              {items.map((item, index) => (
                <PdfRow
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
            onClick={handleCombine}
            disabled={loading || items.length < 2}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950"
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
            {loading ? "Combining…" : `Combine ${items.length > 1 ? `${items.length} PDFs` : "PDFs"}`}
          </button>

          {items.length < 2 && (
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              Add at least two PDFs to enable combining.
            </span>
          )}

          {downloadUrl && (
            <a
              href={downloadUrl}
              download="combined.pdf"
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
          <a href={downloadUrl} download="combined.pdf" ref={downloadLinkRef} className="hidden">
            Download combined PDF
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
          ? "border-blue-500 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-950/30"
          : "border-zinc-300 bg-white/60 hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-zinc-600"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        className="size-8 text-blue-600 dark:text-blue-400"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 16V4m0 0 4 4m-4-4-4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        />
      </svg>
      <span className="text-sm font-semibold">
        {hasItems ? "Add more PDFs" : "Drop PDFs here or click to browse"}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-500">
        PDF files only · they stay on your machine
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
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

type PdfRowProps = {
  item: PdfItem;
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

function PdfRow({
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
}: PdfRowProps) {
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
          ? "border-blue-500 ring-2 ring-blue-500/40 dark:border-blue-400"
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

      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          className="size-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8m-5-5 5 5m-5-5v5h5"
          />
        </svg>
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
