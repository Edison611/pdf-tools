
import pymupdf  # the `fitz` alias is deprecated and slated for removal
import os
import logging

# Set up logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def combine_pdfs(pdf_paths, output_path):
    if not isinstance(pdf_paths, (list, tuple)) or len(pdf_paths) < 2:
        logger.error("pdf_paths must be a list or tuple with at least two PDF file paths.")
        raise ValueError("pdf_paths must be a list or tuple with at least two PDF file paths.")

    for path in pdf_paths:
        if not os.path.exists(path):
            logger.error(f"File not found: {path}")
            raise FileNotFoundError(f"File not found: {path}")

    logger.info(f"Combining {len(pdf_paths)} PDFs into {output_path}")

    # Open all PDFs
    pdf_docs = [pymupdf.open(path) for path in pdf_paths]

    # Create a new PDF
    combined = pymupdf.open()

    # Insert all PDFs
    for pdf in pdf_docs:
        combined.insert_pdf(pdf)

    # Save result
    combined.save(output_path)
    logger.info(f"Combined PDF saved to {output_path}")

    # Close files
    for pdf in pdf_docs:
        pdf.close()
    combined.close()
