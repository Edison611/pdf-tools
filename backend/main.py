import os
import shutil
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response

from utils.combine_pdfs import combine_pdfs

# Kept under the 32 MiB request ceiling most serverless platforms impose.
MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024

app = FastAPI(title="PDF Tools API")

# No CORS middleware on purpose: the browser talks to the Next.js server,
# which proxies /api/pdf/* here over the internal network. Same origin.


@app.get("/health")
def read_health():
    return {"message": "PDF Tools API is running"}


@app.post("/combine-pdfs")
# Next.js strips trailing slashes before applying rewrites, so the canonical
# path has none. The slashed alias keeps direct callers (curl, older clients)
# from bouncing through a 307 that redirects to an unreachable internal host.
@app.post("/combine-pdfs/", include_in_schema=False)
async def combine_pdfs_route(files: list[UploadFile] = File(...)):
    """Merge uploaded PDFs in the order they were received."""
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least two PDF files are required.")

    # mkdtemp() honors TMPDIR and is writable by an unprivileged container
    # user, unlike a relative path under the app's working directory.
    temp_dir = tempfile.mkdtemp(prefix="combine-")
    try:
        pdf_paths: list[str] = []
        total_bytes = 0

        for index, upload in enumerate(files):
            # Client filenames are ignored entirely: they can contain path
            # traversal ("../../x") and duplicates would overwrite each other.
            # The index keeps the caller's ordering.
            path = os.path.join(temp_dir, f"{index:03d}.pdf")
            with open(path, "wb") as buffer:
                while chunk := await upload.read(READ_CHUNK_BYTES):
                    total_bytes += len(chunk)
                    if total_bytes > MAX_TOTAL_UPLOAD_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=(
                                "Total upload exceeds "
                                f"{MAX_TOTAL_UPLOAD_BYTES // (1024 * 1024)} MB."
                            ),
                        )
                    buffer.write(chunk)
            pdf_paths.append(path)

        output_path = os.path.join(temp_dir, "combined.pdf")
        combine_pdfs(pdf_paths, output_path)

        with open(output_path, "rb") as merged:
            body = merged.read()
    finally:
        # Synchronous cleanup: background threads are unreliable on serverless
        # platforms that throttle CPU once the response has been sent.
        shutil.rmtree(temp_dir, ignore_errors=True)

    return Response(
        content=body,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="combined.pdf"'},
    )
