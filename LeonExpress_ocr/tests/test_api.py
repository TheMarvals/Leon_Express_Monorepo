import base64
import importlib.util
import io
import sys
import threading
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image


class OcrApiTests(unittest.TestCase):
    def setUp(self):
        self.readers = []
        self.block = None
        self.started = threading.Event()
        owner = self

        class Reader:
            def __init__(self, languages, **kwargs):
                owner.readers.append((languages, kwargs))

            def readtext(self, image, **kwargs):
                owner.started.set()
                if owner.block:
                    owner.block.wait(timeout=5)
                return ["LEON EXPRESS", "Pedernal 3793"]

        previous = sys.modules.get("easyocr")
        sys.modules["easyocr"] = types.SimpleNamespace(Reader=Reader)

        def restore_easyocr():
            if previous is None:
                sys.modules.pop("easyocr", None)
            else:
                sys.modules["easyocr"] = previous

        self.addCleanup(restore_easyocr)
        filename = Path(__file__).resolve().parents[1] / "main.py"
        spec = importlib.util.spec_from_file_location("ocr_test_app", filename)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        image = io.BytesIO()
        Image.new("RGB", (64, 32), "white").save(image, format="PNG")
        self.image = image.getvalue()

    def test_model_loads_once_at_startup_and_never_downloads_at_runtime(self):
        self.assertEqual(self.readers, [])
        with TestClient(self.module.app) as client:
            for _ in range(2):
                response = client.post("/parse/image", data={"base64Image": base64.b64encode(self.image).decode()})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["ParsedResults"][0]["ParsedText"], "LEON EXPRESS\nPedernal 3793")
                self.assertFalse(response.json()["IsErroredOnProcessing"])
            self.assertEqual(client.get("/health").json(), {"status": "up", "ready": True})
        self.assertEqual(len(self.readers), 1)
        languages, options = self.readers[0]
        self.assertEqual(languages, ["es", "en"])
        self.assertFalse(options["download_enabled"])
        self.assertFalse(options["gpu"])
        self.assertIsNone(self.module.app.state.reader)

    def test_health_reports_unready_before_loading_models(self):
        client = TestClient(self.module.app)
        self.assertEqual(client.get("/health").status_code, 503)

    def test_upload_and_data_uri_keep_the_backend_api_contract(self):
        with TestClient(self.module.app) as client:
            uploaded = client.post("/parse/image", files={"file": ("label.png", self.image, "image/png")})
            data_uri = client.post("/parse/image", data={"base64Image": "data:image/png;base64," + base64.b64encode(self.image).decode()})
            self.assertEqual(uploaded.json()["ParsedResults"], data_uri.json()["ParsedResults"])
            self.assertEqual(client.post("/parse/image").status_code, 400)

    def test_health_remains_available_while_inference_is_busy(self):
        self.block = threading.Event()
        with TestClient(self.module.app) as client, ThreadPoolExecutor(max_workers=2) as pool:
            processing = pool.submit(client.post, "/parse/image", data={"base64Image": base64.b64encode(self.image).decode()})
            self.assertTrue(self.started.wait(timeout=2))
            try:
                health = pool.submit(client.get, "/health").result(timeout=2)
                self.assertEqual(health.status_code, 200)
            finally:
                self.block.set()
            self.assertEqual(processing.result(timeout=2).status_code, 200)


if __name__ == "__main__":
    unittest.main()
