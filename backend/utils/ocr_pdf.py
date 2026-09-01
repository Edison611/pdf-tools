"""Searchable-PDF OCR: render each page and burn in a hidden Tesseract text layer.

Uses PyMuPDF's built-in OCR integration (Pixmap.pdfocr_tobytes), which shells
out to the `tesseract` binary directly. No Python OCR wrapper (e.g.
pytesseract) is involved; the only runtime requirement is the `tesseract`
binary and its language data (installed in the Dockerfile) with
TESSDATA_PREFIX pointed at the tessdata directory.
"""

import logging

import pymupdf

logger = logging.getLogger(__name__)

# OCR is roughly three orders of magnitude slower than normal text
# extraction, so a large document could tie up a worker thread for minutes.
# Cap page count to keep worst-case request latency bounded.
MAX_OCR_PAGES = 50

# Render pages at this resolution before handing them to Tesseract. Higher
# improves recognition accuracy on small text; too high mostly just slows
# things down without much accuracy gain.
OCR_DPI = 300


class PdfError(ValueError):
    """Input the caller can fix: malformed, encrypted, or too large."""


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


def ocr_pdf(data: bytes, language: str = "eng") -> bytes:
    """Return a copy of `data` with a hidden, searchable text layer added.

    Each page is rasterized and re-OCR'd from scratch, so the result is a
    new PDF that looks the same as the original but supports text
    selection, search, and copy. Vector graphics and any pre-existing text
    layer are not preserved on OCR'd pages -- Tesseract only recognizes what
    it can see in the rendered image.
    """
    doc = _open(data)
    try:
        if doc.page_count > MAX_OCR_PAGES:
            raise PdfError(
                f"That PDF has {doc.page_count} pages; OCR is limited to {MAX_OCR_PAGES}."
            )

        logger.info("OCRing %d-page PDF (language=%s)", doc.page_count, language)
        out = pymupdf.open()
        try:
            zoom = OCR_DPI / 72  # PDF units are 1/72 inch; Matrix scale is a multiplier on that.
            matrix = pymupdf.Matrix(zoom, zoom)

            for page in doc:
                pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                try:
                    page_pdf_bytes = pixmap.pdfocr_tobytes(language=language)
                except Exception as exc:  # pymupdf doesn't document a specific type
                    # Tesseract missing, language data missing, etc. Same
                    # failure for every page, so fail the whole request.
                    raise PdfError(
                        "OCR failed. The server may be missing Tesseract or "
                        f"the '{language}' language data."
                    ) from exc
                out.insert_pdf(pymupdf.open(stream=page_pdf_bytes, filetype="pdf"))

            # garbage=3 prunes objects no longer referenced after rebuilding
            # each page from a rendered image.
            return out.tobytes(garbage=3, deflate=True)
        finally:
            out.close()
    finally:
        doc.close()
