import base64
import io
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
import easyocr
from PIL import Image
import numpy as np

app = FastAPI(title="Leon Express OCR API")

# Initialize the EasyOCR reader (this will load models into memory)
print("Initializing EasyOCR reader...")
reader = easyocr.Reader(['es', 'en'], gpu=False)
print("EasyOCR reader initialized!")

@app.get("/health")
def health_check():
    return {"status": "up"}

@app.post("/parse/image")
async def parse_image(
    base64Image: str = Form(None),
    language: str = Form('spa'),
    file: UploadFile = File(None)
):
    try:
        if file:
            content = await file.read()
            img = Image.open(io.BytesIO(content)).convert('RGB')
        elif base64Image:
            # Strip data URI scheme prefix if present
            if base64Image.startswith('data:'):
                base64Image = base64Image.split(',', 1)[1]
            content = base64.b64decode(base64Image)
            img = Image.open(io.BytesIO(content)).convert('RGB')
        else:
            raise HTTPException(status_code=400, detail="No image provided")

        img_np = np.array(img)
        
        # Read text
        # detail=0 returns a list of strings
        # paragraph=True groups text into paragraphs
        result = reader.readtext(img_np, detail=0, paragraph=True)
        parsed_text = "\n".join(result)

        # Mocking the OCR.space response structure closely
        return {
            "ParsedResults": [
                {
                    "ParsedText": parsed_text
                }
            ],
            "OCRExitCode": 1,
            "IsErroredOnProcessing": False,
            "ErrorMessage": None,
            "ProcessingTimeInMilliseconds": "0" 
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "IsErroredOnProcessing": True,
            "ErrorMessage": [str(e)],
            "ParsedResults": []
        }
