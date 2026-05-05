from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import uuid
from utils.combine_pdfs import combine_pdfs


app = FastAPI()

# Allow CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def read_health():
    return {"message": "PDF Tools API is running"}

# Route to combine multiple uploaded PDFs
@app.post("/combine-pdfs/")
async def combine_pdfs_route(files: list[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least two PDF files are required.")

    temp_dir = f"temp_{uuid.uuid4().hex}"
    os.makedirs(temp_dir, exist_ok=True)
    pdf_paths = []
    try:
        # Save uploaded files to temp directory
        for file in files:
            file_path = os.path.join(temp_dir, file.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            pdf_paths.append(file_path)

        # Output file path
        output_path = os.path.join(temp_dir, "combined.pdf")
        combine_pdfs(pdf_paths, output_path)

        return FileResponse(output_path, filename="combined.pdf", media_type="application/pdf")
    finally:
        # Clean up temp files after response is sent
        import threading
        import time
        def cleanup(path):
            time.sleep(5)
            shutil.rmtree(path, ignore_errors=True)
        threading.Thread(target=cleanup, args=(temp_dir,), daemon=True).start()
