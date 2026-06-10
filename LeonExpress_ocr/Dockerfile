FROM python:3.10-slim

# Install system dependencies required for OpenCV and EasyOCR
RUN apt-get update && apt-get install -y \
    libglx-mesa0 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download EasyOCR models for English and Spanish to save time on first run
RUN python -c "import easyocr; reader = easyocr.Reader(['es', 'en'], gpu=False)"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
