import base64
import io
import logging
import os
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import easyocr
from PIL import Image
import numpy as np

logger = logging.getLogger("uvicorn.error")
reader_lock = threading.Lock()


@asynccontextmanager
async def lifespan(application: FastAPI):
    logger.info("Loading EasyOCR models into memory (runtime downloads disabled)...")
    application.state.reader = easyocr.Reader(
        ['es', 'en'],
        gpu=False,
        model_storage_directory=os.getenv("OCR_MODEL_DIR", "/opt/easyocr/models"),
        download_enabled=False,
    )
    logger.info("EasyOCR is ready")
    yield
    application.state.reader = None


app = FastAPI(title="Leon Express OCR API", lifespan=lifespan)


@app.get("/health")
async def health_check():
    if getattr(app.state, "reader", None) is None:
        raise HTTPException(status_code=503, detail="OCR models are not ready")
    return {"status": "up", "ready": True}


# FastAPI executes synchronous endpoints in a thread pool, keeping health requests responsive.
@app.post("/parse/image")
def parse_image(
    base64Image: str = Form(None),
    language: str = Form('spa'),
    file: UploadFile = File(None),
):
    reader = getattr(app.state, "reader", None)
    if reader is None:
        raise HTTPException(status_code=503, detail="OCR models are not ready")
    started = time.perf_counter()
    try:
        if file:
            content = file.file.read()
        elif base64Image:
            if base64Image.startswith('data:'):
                base64Image = base64Image.split(',', 1)[1]
            content = base64.b64decode(base64Image, validate=True)
        else:
            raise HTTPException(status_code=400, detail="No image provided")

        with Image.open(io.BytesIO(content)) as img:
            img_np = np.array(img.convert('RGB'))

        # One CPU inference at a time, using the same loaded model for all requests.
        with reader_lock:
            result = reader.readtext(img_np, detail=0, paragraph=True)

        return {
            "ParsedResults": [{"ParsedText": "\n".join(result)}],
            "OCRExitCode": 1,
            "IsErroredOnProcessing": False,
            "ErrorMessage": None,
            "ProcessingTimeInMilliseconds": str(round((time.perf_counter() - started) * 1000)),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("OCR processing failed")
        return {
            "IsErroredOnProcessing": True,
            "ErrorMessage": [str(exc)],
            "ParsedResults": [],
        }
