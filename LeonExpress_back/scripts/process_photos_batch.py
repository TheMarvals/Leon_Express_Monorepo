import os
from PIL import Image
import pytesseract
import re

# Configuración de rutas
PHOTOS_DIR = '../../uploads/delivery-photos/'

# Simulación de función para asociar foto a paquete en la base de datos
def associate_photo_to_package(photo_path, package_id):
    print(f"Asociando {photo_path} al paquete {package_id}")
    # Aquí iría la lógica real de asociación (DB/API)

# Expresión regular para buscar número de guía, ejemplo: 'Guía: 123456'
GUIDE_REGEX = r'Gu[ií]a[:\s]+(\d+)'  # Ajusta según formato de etiqueta

def extract_package_id_from_text(text):
    match = re.search(GUIDE_REGEX, text)
    if match:
        return match.group(1)
    return None

def process_photos():
    for root, dirs, files in os.walk(PHOTOS_DIR):
        for file in files:
            if file.lower().endswith(('.jpg', '.jpeg', '.png')):
                photo_path = os.path.join(root, file)
                try:
                    img = Image.open(photo_path)
                    text = pytesseract.image_to_string(img, lang='spa')
                    package_id = extract_package_id_from_text(text)
                    if package_id:
                        associate_photo_to_package(photo_path, package_id)
                    else:
                        print(f"No se encontró número de guía en {photo_path}")
                except Exception as e:
                    print(f"Error procesando {photo_path}: {e}")

if __name__ == "__main__":
    process_photos()
