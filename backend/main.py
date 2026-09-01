import json
import os
import shutil
import tempfile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from utils.combine_pdfs import combine_pdfs
from utils.compress_pdf import PdfError as CompressPdfError
from utils.compress_pdf import compress_pdf
from utils.images_to_pdf import ImageError, images_to_pdf
from utils.ocr_pdf import PdfError as OcrPdfError
from utils.ocr_pdf import ocr_pdf
from utils.pdf_pages import PdfError, extract_pages, render_page_previews

# Kept under the 32 MiB request ceiling most serverless platforms impose.
MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024

app = FastAPI(title="PDF Tools API")

# No CORS middleware on purpose: the browser talks to the Next.js server,
# which proxies /api/pdf/* here over the internal network. Same origin.


@app.get("/health")
def read_health():
    return {"message": "PDF Tools API is running"}


async def _read_upload(upload: UploadFile, limit: int = MAX_TOTAL_UPLOAD_BYTES) -> bytes:
    """Read an upload into memory, refusing anything over `limit`."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(READ_CHUNK_BYTES):
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=413,
                detail=f"Upload exceeds {limit // (1024 * 1024)} MB.",
            )
        chunks.append(chunk)
    if total == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    return b"".join(chunks)


def _pdf_response(body: bytes, filename: str) -> Response:
    return Response(
        content=body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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

    return _pdf_response(body, "combined.pdf")


@app.post("/images-to-pdf")
@app.post("/images-to-pdf/", include_in_schema=False)
async def images_to_pdf_route(files: list[UploadFile] = File(...)):
    """Build a PDF with one page per uploaded image, in the order received."""
    if len(files) < 1:
        raise HTTPException(status_code=400, detail="At least one image file is required.")

    images: list[bytes] = []
    total_bytes = 0
    for upload in files:
        chunks: list[bytes] = []
        while chunk := await upload.read(READ_CHUNK_BYTES):
            total_bytes += len(chunk)
            if total_bytes > MAX_TOTAL_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Total upload exceeds {MAX_TOTAL_UPLOAD_BYTES // (1024 * 1024)} MB.",
                )
            chunks.append(chunk)
        if not chunks:
            raise HTTPException(status_code=400, detail="One of the uploaded images is empty.")
        images.append(b"".join(chunks))

    try:
        body = images_to_pdf(images)
    except ImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _pdf_response(body, "images.pdf")


@app.post("/pdf-pages")
@app.post("/pdf-pages/", include_in_schema=False)
async def pdf_pages_route(file: UploadFile = File(...)):
    """Return a thumbnail of every page, for page-level editing UIs."""
    data = await _read_upload(file)
    try:
        pages = render_page_previews(data)
    except PdfError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"pageCount": len(pages), "pages": pages}


@app.post("/extract-pages")
@app.post("/extract-pages/", include_in_schema=False)
async def extract_pages_route(
    file: UploadFile = File(...),
    pages: str = Form(..., description="JSON array of 0-based page indexes, in output order"),
):
    """Build a new PDF from the given page indexes, in the order supplied."""
    data = await _read_upload(file)

    try:
        order = json.loads(pages)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422, detail="`pages` must be a JSON array of page indexes."
        ) from exc

    # bool is a subclass of int, so exclude it explicitly.
    if not isinstance(order, list) or any(
        isinstance(index, bool) or not isinstance(index, int) for index in order
    ):
        raise HTTPException(
            status_code=422, detail="`pages` must be a JSON array of integers."
        )

    try:
        body = extract_pages(data, order)
    except PdfError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _pdf_response(body, "extracted.pdf")


@app.post("/compress-pdf")
@app.post("/compress-pdf/", include_in_schema=False)
async def compress_pdf_route(
    file: UploadFile = File(...),
    level: str = Form("medium", description="Compression level: low, medium, or high"),
):
    """Recompress a PDF's embedded images to reduce file size."""
    data = await _read_upload(file)

    try:
        body = compress_pdf(data, level)
    except CompressPdfError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _pdf_response(body, "compressed.pdf")


@app.post("/ocr-pdf")
@app.post("/ocr-pdf/", include_in_schema=False)
async def ocr_pdf_route(file: UploadFile = File(...)):
    """Add a hidden, searchable text layer to a scanned/image-only PDF.

    OCR is CPU-bound and roughly three orders of magnitude slower than
    normal text extraction, so it runs in a worker thread to keep the event
    loop free for other requests (e.g. the health check) while it runs.
    """
    data = await _read_upload(file)

    try:
        body = await run_in_threadpool(ocr_pdf, data)
    except OcrPdfError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _pdf_response(body, "ocr.pdf")
