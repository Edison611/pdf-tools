"""Page-level PDF operations: preview rendering and page extraction."""

import base64
import logging

import pymupdf

logger = logging.getLogger(__name__)

# Thumbnails are rendered a little wider than they display, so they stay sharp
# on high-DPI screens without inflating the response much.
PREVIEW_WIDTH_PX = 220
PREVIEW_JPEG_QUALITY = 72

# Guardrails: previews are returned inline as data URLs, so a huge document
# would otherwise produce a huge JSON payload.
MAX_PREVIEW_PAGES = 300
MAX_OUTPUT_PAGES = 2000


class PdfError(ValueError):
    """Input the caller can fix: malformed, encrypted, or out-of-range."""


def _open(data: bytes) -> pymupdf.Document:
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # pymupdf raises several types for bad input
        raise PdfError("Could not read that file as a PDF.") from exc

    if doc.needs_pass:
        doc.close()
        raise PdfError("That PDF is password protected.")
    if doc.page_count == 0:
        doc.close()
        raise PdfError("That PDF has no pages.")
    return doc


def _encode_thumbnail(pixmap: pymupdf.Pixmap) -> str:
    """Return a data URL, preferring JPEG for size and falling back to PNG."""
    try:
        payload = pixmap.tobytes("jpeg", jpg_quality=PREVIEW_JPEG_QUALITY)
        media_type = "image/jpeg"
    except (TypeError, ValueError, RuntimeError):
        # Older PyMuPDF builds may not expose JPEG output.
        payload = pixmap.tobytes("png")
        media_type = "image/png"
    return f"data:{media_type};base64,{base64.b64encode(payload).decode('ascii')}"


def render_page_previews(data: bytes, max_width: int = PREVIEW_WIDTH_PX) -> list[dict]:
    """Render every page to a small raster image, in document order."""
    doc = _open(data)
    try:
        if doc.page_count > MAX_PREVIEW_PAGES:
            raise PdfError(
                f"That PDF has {doc.page_count} pages; the limit is {MAX_PREVIEW_PAGES}."
            )

        logger.info("Rendering %d page previews", doc.page_count)
        previews: list[dict] = []
        for index, page in enumerate(doc):
            width = page.rect.width or max_width
            scale = max_width / width
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
            previews.append(
                {
                    "index": index,
                    "width": pixmap.width,
                    "height": pixmap.height,
                    "thumbnail": _encode_thumbnail(pixmap),
                }
            )
        return previews
    finally:
        doc.close()


def extract_pages(data: bytes, order: list[int]) -> bytes:
    """Build a new PDF from `order`, a list of 0-based page indexes.

    Order is honored as given, and repeats are allowed, so this covers
    reordering and duplication as well as deletion.
    """
    if not order:
        raise PdfError("Select at least one page.")
    if len(order) > MAX_OUTPUT_PAGES:
        raise PdfError(f"Too many pages requested; the limit is {MAX_OUTPUT_PAGES}.")

    doc = _open(data)
    try:
        for index in order:
            if index < 0 or index >= doc.page_count:
                raise PdfError(
                    f"Page {index + 1} is out of range; the document has "
                    f"{doc.page_count} pages."
                )

        logger.info("Extracting %d of %d pages", len(order), doc.page_count)
        out = pymupdf.open()
        try:
            for index in order:
                out.insert_pdf(doc, from_page=index, to_page=index)
            # garbage=3 prunes objects the selected pages no longer reference.
            return out.tobytes(garbage=3, deflate=True)
        finally:
            out.close()
    finally:
        doc.close()
