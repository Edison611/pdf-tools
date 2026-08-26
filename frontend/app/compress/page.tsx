"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// Same-origin path; next.config.ts rewrites it to the FastAPI service.
// No trailing slash: Next strips it before rewriting, which would leave the
// backend redirecting to an internal host the browser cannot reach.
const COMPRESS_ENDPOINT = "/api/pdf/compress-pdf";

type Level = "low" | "medium" | "high";

// Compression level is fixed; the UI no longer exposes a choice.
const LEVEL: Level = "medium";

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
function partName(name: string) {
  const safe = name.replace(/[^\w.-]+/g, "_").slice(-80) || "file.pdf";
  return safe;
}

export default function CompressPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [isFileDragActive, setIsFileDragActive] = useState(false);

  const downloadLinkRef = useRef<HTMLAnchorElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const replaceDownloadUrl = useCallback((url: string | null) => {
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  // Release the compressed-file object URL on unmount.
  const downloadUrlRef = useRef<string | null>(null);
  downloadUrlRef.current = downloadUrl;
  useEffect(
    () => () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    },
    [],
  );

  const setSingleFile = useCallback(
    (incoming: FileList | File[] | null) => {
      if (!incoming) return;
      const all = Array.from(incoming);
      const pdf = all.find(isPdf);
      const skipped = all.length - (pdf ? 1 : 0);

      setNotice(
        skipped > 0
          ? `Ignored ${skipped} file${skipped === 1 ? "" : "s"} that ${
              skipped === 1 ? "is" : "are"
            } not a PDF.`
          : "",
      );
      if (!pdf) return;

      setError("");
      setCompressedSize(null);
      replaceDownloadUrl(null);
      setFile(pdf);
    },
    [replaceDownloadUrl],
  );

  const clearFile = () => {
    setFile(null);
    setError("");
    setNotice("");
    setCompressedSize(null);
    replaceDownloadUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCompress = async () => {
    if (!file) {
      setError("Add a PDF to compress.");
      return;
    }
    setLoading(true);
    setError("");
    setCompressedSize(null);
    replaceDownloadUrl(null);

    const formData = new FormData();
    formData.append("file", file, partName(file.name));
    formData.append("level", LEVEL);

    try {
      const res = await fetch(COMPRESS_ENDPOINT, { method: "POST", body: formData });
      if (!res.ok) {
        const detail = await res
          .json()
          .then((body) => (typeof body?.detail === "string" ? body.detail : ""))
          .catch(() => "");
        throw new Error(detail || `Failed to compress PDF (${res.status})`);
      }
      const blob = await res.blob();
      setCompressedSize(blob.size);
      replaceDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Start the download as soon as the compressed file is ready.
  useEffect(() => {
    if (downloadUrl) downloadLinkRef.current?.click();
  }, [downloadUrl]);

  const savingsPct =
    file && compressedSize != null && file.size > 0
      ? Math.max(0, Math.round((1 - compressedSize / file.size) * 100))
      : null;

  return (
    <div className="relative isolate min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(245,158,11,0.16),transparent)]"
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
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Compress PDF</h1>
            <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
              Shrink file size for email and uploads by recompressing embedded images.
            </p>
          </div>
          {file && (
            <button
              type="button"
              onClick={clearFile}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              Clear
            </button>
          )}
        </header>

        {!file && (
          <DropZone
            active={isFileDragActive}
            inputRef={fileInputRef}
            onFiles={setSingleFile}
            onActiveChange={setIsFileDragActive}
          />
        )}

        {file && (
          <section aria-labelledby="file-heading" className="mt-8">
            <h2 id="file-heading" className="text-sm font-semibold tracking-tight">
              File
            </h2>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">
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
                <span className="block truncate text-sm font-medium" title={file.name}>
                  {file.name}
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-500">
                  {formatBytes(file.size)}
                  {compressedSize != null && (
                    <>
                      {" "}
                      → {formatBytes(compressedSize)}
                      {savingsPct != null && savingsPct > 0 && ` (${savingsPct}% smaller)`}
                    </>
                  )}
                </span>
              </span>
              <button
                type="button"
                onClick={clearFile}
                aria-label={`Remove ${file.name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-zinc-500 transition-colors hover:bg-red-600 hover:text-white dark:text-zinc-400"
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
            </div>
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
            onClick={handleCompress}
            disabled={loading || !file}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950"
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
            {loading ? "Compressing…" : "Compress PDF"}
          </button>

          {!file && (
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              Add a PDF to enable compressing.
            </span>
          )}

          {downloadUrl && (
            <a
              href={downloadUrl}
              download="compressed.pdf"
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
          <a href={downloadUrl} download="compressed.pdf" ref={downloadLinkRef} className="hidden">
            Download compressed PDF
          </a>
        )}
      </div>
    </div>
  );
}

type DropZoneProps = {
  active: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList | File[] | null) => void;
  onActiveChange: (active: boolean) => void;
};

function DropZone({ active, inputRef, onFiles, onActiveChange }: DropZoneProps) {
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
      className={`mt-8 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
        active
          ? "border-amber-500 bg-amber-50/70 dark:border-amber-400 dark:bg-amber-950/30"
          : "border-zinc-300 bg-white/60 hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-zinc-600"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        className="size-8 text-amber-600 dark:text-amber-400"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 16V4m0 0 4 4m-4-4-4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        />
      </svg>
      <span className="text-sm font-semibold">Drop a PDF here or click to browse</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-500">
        PDF files only · they stay on your machine
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
        className="sr-only"
      />
    </label>
  );
}
