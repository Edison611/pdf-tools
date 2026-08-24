"""Image-to-PDF conversion: one page per image, in the order given."""

import logging

import pymupdf

logger = logging.getLogger(__name__)

# Guardrail mirroring MAX_OUTPUT_PAGES in pdf_pages.py: keeps a single
# request from building an enormous document.
MAX_IMAGES = 500


class ImageError(ValueError):
    """Input the caller can fix: malformed or unsupported image data."""


def images_to_pdf(images: list[bytes]) -> bytes:
    """Build a PDF with one page per image, sized to that image.

    `images` are raw file bytes (JPEG, PNG, etc.) in the desired page order.
    """
    if not images:
        raise ImageError("Add at least one image.")
    if len(images) > MAX_IMAGES:
        raise ImageError(f"Too many images; the limit is {MAX_IMAGES}.")

    logger.info("Converting %d images to PDF", len(images))

    out = pymupdf.open()
    try:
        for index, data in enumerate(images):
            try:
                img_doc = pymupdf.open(stream=data, filetype=None)
            except Exception as exc:  # pymupdf raises several types for bad input
                raise ImageError(f"Image {index + 1} could not be read.") from exc

            try:
                if img_doc.is_pdf or img_doc.page_count == 0:
                    # `filetype=None` lets pymupdf sniff the format; guard
                    # against something that sneaks through as a non-image
                    # document (e.g. a PDF renamed to .jpg).
                    raise ImageError(f"File {index + 1} is not a supported image.")

                # Image documents from pymupdf.open() have exactly one page,
                # sized to the image's pixel dimensions (72 dpi assumed).
                rect = img_doc[0].rect
                page = out.new_page(width=rect.width, height=rect.height)
                page.insert_image(rect, stream=data)
            finally:
                img_doc.close()

        return out.tobytes(garbage=3, deflate=True)
    finally:
        out.close()
