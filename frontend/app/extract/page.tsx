"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type PagePreview = {
  index: number;
  width: number;
  height: number;
  thumbnail: string;
};

const PAGES_ENDPOINT = "/api/pdf/pdf-pages";
const EXTRACT_ENDPOINT = "/api/pdf/extract-pages";

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

export default function ExtractPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PagePreview[]>([]);
  // Page indexes in output order. Dropping an entry deletes that page.
  const [order, setOrder] = useState<number[]>([]);
  const [rendering, setRendering] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [isFileDragActive, setIsFileDragActive] = useState(false);

  const downloadLinkRef = useRef<HTMLAnchorElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const replaceDownloadUrl = useCallback((url: string | null) => {
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  const downloadUrlRef = useRef<string | null>(null);
  downloadUrlRef.current = downloadUrl;
  useEffect(
    () => () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    },
    [],
  );

  const loadFile = useCallback(
    async (incoming: File | null | undefined) => {
      if (!incoming) return;
      if (!isPdf(incoming)) {
        setError("That file is not a PDF.");
        return;
      }

      setFile(incoming);
      setPages([]);
      setOrder([]);
      setError("");
      setRendering(true);
      replaceDownloadUrl(null);

      const formData = new FormData();
      // Server-side rendering means no PDF library in the browser bundle.
      formData.append("file", incoming, "upload.pdf");

      try {
        const res = await fetch(PAGES_ENDPOINT, { method: "POST", body: formData });
        if (!res.ok) throw new Error(await errorDetail(res, "Could not read that PDF"));
        const body: { pages: PagePreview[] } = await res.json();
        setPages(body.pages);
        setOrder(body.pages.map((page) => page.index));
      } catch (err) {
        setFile(null);
        setError(err instanceof Error ? err.message : "Could not read that PDF");
      } finally {
        setRendering(false);
      }
    },
    [replaceDownloadUrl],
  );

  const reorder = (from: number, to: number) => {
    setOrder((prev) => move(prev, from, to));
    replaceDownloadUrl(null);
  };

  const removeAt = (position: number) => {
    setOrder((prev) => prev.filter((_, i) => i !== position));
    replaceDownloadUrl(null);
  };

  const reset = () => {
    setOrder(pages.map((page) => page.index));
    setError("");
    replaceDownloadUrl(null);
  };

  const startOver = () => {
    setFile(null);
    setPages([]);
    setOrder([]);
    setError("");
    replaceDownloadUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExtract = async () => {
    if (!file || order.length === 0) return;

    setExtracting(true);
    setError("");
    replaceDownloadUrl(null);

    const formData = new FormData();
    formData.append("file", file, "upload.pdf");
    formData.append("pages", JSON.stringify(order));

    try {
      const res = await fetch(EXTRACT_ENDPOINT, { method: "POST", body: formData });
      if (!res.ok) throw new Error(await errorDetail(res, "Failed to extract pages"));
      replaceDownloadUrl(URL.createObjectURL(await res.blob()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setExtracting(false);
    }
  };

  useEffect(() => {
    if (downloadUrl) downloadLinkRef.current?.click();
  }, [downloadUrl]);

  const previewsByIndex = new Map(pages.map((page) => [page.index, page]));
  const removedCount = pages.length - order.length;
  const hasChanges =
    pages.length > 0 &&
    (removedCount > 0 || order.some((pageIndex, position) => pageIndex !== position));

  return (
    <div className="relative isolate min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(139,92,246,0.16),transparent)]"
      />

      <div className="mx-auto w-full max-w-6xl px-6 py-10">
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
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Extract Pages</h1>
            <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
              Upload a PDF, drag its pages into the order you want, remove the ones you don&apos;t,
              then save the result as a new document.
            </p>
          </div>
          {file && (
            <div className="flex items-center gap-2">
              {hasChanges && (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                >
                  Reset order
                </button>
              )}
              <button
                type="button"
                onClick={startOver}
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                Choose another file
              </button>
            </div>
          )}
        </header>

        {!file && (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsFileDragActive(true);
            }}
            onDragLeave={() => setIsFileDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsFileDragActive(false);
              void loadFile(e.dataTransfer.files[0]);
            }}
            className={`mt-8 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
              isFileDragActive
                ? "border-violet-500 bg-violet-50/70 dark:border-violet-400 dark:bg-violet-950/30"
                : "border-zinc-300 bg-white/60 hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-zinc-600"
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              className="size-8 text-violet-600 dark:text-violet-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16V4m0 0 4 4m-4-4-4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              />
            </svg>
            <span className="text-sm font-semibold">Drop a PDF here or click to browse</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              One file at a time · up to 25 MB
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                void loadFile(e.target.files?.[0]);
                e.target.value = "";
              }}
              className="sr-only"
            />
          </label>
        )}

        {rendering && (
          <div className="mt-8">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Rendering page previews…</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[1/1.414] animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800"
                />
              ))}
            </div>
          </div>
        )}

        {file && !rendering && pages.length > 0 && (
          <section aria-labelledby="pages-heading" className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="pages-heading" className="text-sm font-semibold tracking-tight">
                Pages to keep
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                {file.name} · {formatBytes(file.size)} · {order.length} of {pages.length} page
                {pages.length === 1 ? "" : "s"}
                {removedCount > 0 && ` · ${removedCount} removed`}
              </p>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Drag a page to reposition it, or use the arrow buttons. The badge shows its number in
              the original document.
            </p>

            {order.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
                <p className="text-sm font-medium">Every page has been removed.</p>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900"
                >
                  Restore all pages
                </button>
              </div>
            ) : (
              <ol className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {order.map((pageIndex, position) => {
                  const preview = previewsByIndex.get(pageIndex);
                  if (!preview) return null;
                  return (
                    <PageCard
                      key={`${pageIndex}-${position}`}
                      preview={preview}
                      position={position}
                      total={order.length}
                      isDragging={dragIndex === position}
                      isDropTarget={
                        dropIndex === position && dragIndex !== null && dragIndex !== position
                      }
                      onDragStart={() => setDragIndex(position)}
                      onDragEnterCard={() => dragIndex !== null && setDropIndex(position)}
                      onDropCard={() => {
                        if (dragIndex !== null) reorder(dragIndex, position);
                        setDragIndex(null);
                        setDropIndex(null);
                      }}
                      onDragEndCard={() => {
                        setDragIndex(null);
                        setDropIndex(null);
                      }}
                      onMove={(to) => reorder(position, to)}
                      onRemove={() => removeAt(position)}
                    />
                  );
                })}
              </ol>
            )}
          </section>
        )}

        {error && (
          <p
            aria-live="polite"
            className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}

        {file && pages.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting || order.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950"
            >
              {extracting && (
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
              {extracting
                ? "Building PDF…"
                : `Save ${order.length} page${order.length === 1 ? "" : "s"}`}
            </button>

            {downloadUrl && (
              <a
                href={downloadUrl}
                download="extracted.pdf"
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
        )}

        {downloadUrl && (
          <a href={downloadUrl} download="extracted.pdf" ref={downloadLinkRef} className="hidden">
            Download extracted PDF
          </a>
        )}
      </div>
    </div>
  );
}

type PageCardProps = {
  preview: PagePreview;
  position: number;
  total: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragEnterCard: () => void;
  onDropCard: () => void;
  onDragEndCard: () => void;
  onMove: (to: number) => void;
  onRemove: () => void;
};

function PageCard({
  preview,
  position,
  total,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnterCard,
  onDropCard,
  onDragEndCard,
  onMove,
  onRemove,
}: PageCardProps) {
  const pageLabel = `page ${preview.index + 1}`;

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(position));
        onDragStart();
      }}
      onDragEnter={onDragEnterCard}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropCard();
      }}
      onDragEnd={onDragEndCard}
      className={`group relative flex cursor-grab flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition active:cursor-grabbing dark:bg-zinc-900 ${
        isDragging ? "opacity-40" : "opacity-100"
      } ${
        isDropTarget
          ? "border-violet-500 ring-2 ring-violet-500/40 dark:border-violet-400"
          : "border-zinc-200 hover:shadow-md dark:border-zinc-800"
      }`}
    >
      <div className="relative bg-zinc-100 p-2 dark:bg-zinc-950/60">
        <span className="absolute left-2 top-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-zinc-900/85 px-1.5 text-xs font-semibold text-white dark:bg-white/90 dark:text-zinc-900">
          {preview.index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          onDragStart={(e) => e.preventDefault()}
          aria-label={`Remove ${pageLabel}`}
          className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full bg-white/90 text-zinc-600 shadow-sm transition-colors hover:bg-red-600 hover:text-white focus-visible:ring-2 focus-visible:ring-red-500 dark:bg-zinc-800/90 dark:text-zinc-300"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            className="size-3.5"
          >
            <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>

        {/* Rendered server-side by PyMuPDF and inlined as a data URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview.thumbnail}
          alt={`Preview of ${pageLabel}`}
          width={preview.width}
          height={preview.height}
          draggable={false}
          className="mx-auto h-auto w-full rounded-md bg-white shadow-sm ring-1 ring-black/5"
        />
      </div>

      <div className="flex items-center justify-between gap-1 border-t border-zinc-100 px-2 py-2 dark:border-zinc-800">
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-500">
          Position {position + 1}
        </span>
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onMove(position - 1)}
            disabled={position === 0}
            aria-label={`Move ${pageLabel} earlier`}
            className="flex size-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="size-3.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onMove(position + 1)}
            disabled={position === total - 1}
            aria-label={`Move ${pageLabel} later`}
            className="flex size-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="size-3.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </span>
      </div>
    </li>
  );
}
