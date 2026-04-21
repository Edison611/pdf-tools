import fitz  # PyMuPDF
import sys
import os


def combine_pdfs(pdf1_path, pdf2_path, output_path):
    if not os.path.exists(pdf1_path):
        raise FileNotFoundError(f"File not found: {pdf1_path}")
    if not os.path.exists(pdf2_path):
        raise FileNotFoundError(f"File not found: {pdf2_path}")

    # Open PDFs
    pdf1 = fitz.open(pdf1_path)
    pdf2 = fitz.open(pdf2_path)

    # Create a new PDF
    combined = fitz.open()

    # Insert both PDFs
    combined.insert_pdf(pdf1)
    combined.insert_pdf(pdf2)

    # Save result
    combined.save(output_path)

    # Close files
    pdf1.close()
    pdf2.close()
    combined.close()

    print(f"Combined PDF saved as: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python combine_pdfs.py <pdf1> <pdf2> <output>")
        sys.exit(1)

    pdf1 = sys.argv[1]
    pdf2 = sys.argv[2]
    output = sys.argv[3]

    combine_pdfs(pdf1, pdf2, output)
