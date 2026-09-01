# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8081 \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

# tesseract-ocr: the OCR engine itself (no Python bindings needed; PyMuPDF
# shells out to the `tesseract` binary directly for OCR support).
# tesseract-ocr-eng: English language data, the only language this app
# currently offers in its UI.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so code edits don't invalidate the install layer.
# PyMuPDF ships manylinux wheels, so no compiler toolchain is needed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 1001 appuser
USER appuser

# Sidecar container: no EXPOSE / containerPort. Only the ingress
# container in a Cloud Run service may declare a port.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
