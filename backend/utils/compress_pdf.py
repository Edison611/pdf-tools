"""PDF compression: recompress embedded images and strip redundant objects."""

import logging

import pymupdf

logger = logging.getLogger(__name__)

# JPEG quality per compression level. Images are recompressed at this
# quality; anything already smaller than the recompressed version is left
# alone (see _compress_images).
_LEVEL_JPEG_QUALITY = {
    "low": 80,
    "medium": 60,
    "high": 35,
}

# Images below this size aren't worth the CPU time to recompress.
MIN_IMAGE_BYTES_TO_RECOMPRESS = 4 * 1024

# Downscale images whose resolution far exceeds what a printed page needs.
_LEVEL_MAX_DIMENSION_PX = {
    "low": 3000,
    "medium": 2000,
    "high": 1500,
}


class PdfError(ValueError):
    """Input the caller can fix: malformed, encrypted, or invalid options."""


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


def _compress_images(doc: pymupdf.Document, quality: int, max_dimension: int) -> None:
    """Recompress every embedded image in place, in its original format."""
    seen_xrefs: set[int] = set()

    for page_index in range(doc.page_count):
        for image in doc.get_page_images(page_index, full=True):
            xref = image[0]
            if xref in seen_xrefs:
                continue
            seen_xrefs.add(xref)

            try:
                info = doc.extract_image(xref)
            except Exception:  # pymupdf raises several types for odd streams
                continue

            original = info["image"]
            if len(original) < MIN_IMAGE_BYTES_TO_RECOMPRESS:
                continue

            try:
                pixmap = pymupdf.Pixmap(original)
            except Exception:
                continue

            # Drop alpha before re-encoding as JPEG, which has no alpha channel.
            if pixmap.alpha:
                pixmap = pymupdf.Pixmap(pixmap, 0)

            # shrink() only takes an integer power-of-2 factor and mutates
            # in place, so compute the largest factor that still keeps the
            # image at or above max_dimension.
            shrink_factor = 0
            longest_side = max(pixmap.width, pixmap.height, 1)
            while longest_side // 2 >= max_dimension and shrink_factor < 4:
                longest_side //= 2
                shrink_factor += 1
            if shrink_factor:
                pixmap.shrink(shrink_factor)

            try:
                recompressed = pixmap.tobytes("jpeg", jpg_quality=quality)
            except (TypeError, ValueError, RuntimeError):
                continue

            if len(recompressed) >= len(original):
                continue

            try:
                doc.update_stream(xref, recompressed)
                # update_stream doesn't update the image's declared filter or
                # colorspace; correct both so viewers decode it as JPEG in
                # the colorspace it was actually re-encoded in.
                doc.xref_set_key(xref, "Filter", "/DCTDecode")
                doc.xref_set_key(
                    xref,
                    "ColorSpace",
                    "/DeviceGray" if pixmap.colorspace.n == 1 else "/DeviceRGB",
                )
            except Exception:  # leave the original image if the swap fails
                logger.debug("Could not replace image xref %d", xref)
                continue


def compress_pdf(data: bytes, level: str = "medium") -> bytes:
    """Recompress `data` and return the smaller PDF as bytes.

    `level` controls the tradeoff between file size and image quality:
    "low" (larger, better quality), "medium", or "high" (smaller, more
    aggressive). If compression doesn't actually shrink the file (e.g. a
    PDF with no images, already-optimized images), the original bytes are
    returned unchanged.
    """
    if level not in _LEVEL_JPEG_QUALITY:
        raise PdfError(f"Unknown compression level '{level}'.")

    doc = _open(data)
    try:
        logger.info("Compressing %d-page PDF at '%s' level", doc.page_count, level)
        _compress_images(doc, _LEVEL_JPEG_QUALITY[level], _LEVEL_MAX_DIMENSION_PX[level])

        # garbage=4 dedupes and drops unreferenced objects; deflate
        # compresses streams (fonts, content streams) that aren't images.
        compressed = doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()

    # Guard against pathological inputs where recompression overhead (new
    # xref table, etc.) outweighs any savings.
    return compressed if len(compressed) < len(data) else data
