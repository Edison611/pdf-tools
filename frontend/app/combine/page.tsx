
"use client";
import React, { useState, useEffect, useRef } from "react";

export default function CombinePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const downloadLinkRef = useRef<HTMLAnchorElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setDownloadUrl(null);
      setError("");
    }
  };

  const handleCombine = async () => {
    if (files.length < 2) {
      setError("Please select at least two PDF files.");
      return;
    }
    setLoading(true);
    setError("");
    setDownloadUrl(null);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
      const res = await fetch(`${backendUrl}/combine-pdfs/`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        throw new Error("Failed to combine PDFs");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Automatically trigger download when downloadUrl is set
  useEffect(() => {
    if (downloadUrl && downloadLinkRef.current) {
      downloadLinkRef.current.click();
    }
  }, [downloadUrl]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 dark:bg-black p-4">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-lg shadow-md p-8 flex flex-col items-center">
        <h2 className="text-2xl font-bold mb-6 text-black dark:text-zinc-50">Combine PDFs</h2>
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={handleFileChange}
          className="mb-4"
        />
        <button
          onClick={handleCombine}
          disabled={loading || files.length < 2}
          className="w-full px-6 py-3 rounded-lg bg-blue-600 text-white text-lg font-semibold text-center shadow hover:bg-blue-700 transition-colors disabled:opacity-50 mb-4"
        >
          {loading ? "Combining..." : "Combine"}
        </button>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        {/* Hidden download link for auto-download */}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download="combined.pdf"
            ref={downloadLinkRef}
            style={{ display: "none" }}
          >
            Download Combined PDF
          </a>
        )}
        {/* Optional: visible download link if user wants to download again */}
        {downloadUrl && (
          <div className="mt-4">
            <a
              href={downloadUrl}
              download="combined.pdf"
              className="px-6 py-3 rounded-lg bg-green-600 text-white font-semibold text-center shadow hover:bg-green-700 transition-colors"
            >
              Download Combined PDF Again
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
