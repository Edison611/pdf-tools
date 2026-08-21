import type { NextConfig } from "next";

// In production this points at the FastAPI sidecar over the Cloud Run
// instance's localhost. Locally it points at `uvicorn --port 8081`.
const API_ORIGIN = process.env.API_ORIGIN || "http://127.0.0.1:8081";

const nextConfig: NextConfig = {
  // Emits .next/standalone: a self-contained server with only the
  // dependencies it actually needs. Required by frontend/Dockerfile.
  output: "standalone",

  // Keeps the browser on a single origin, so there is no CORS and the
  // Python process needs no public route of its own.
  async rewrites() {
    return [{ source: "/api/pdf/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
