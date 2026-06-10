#!/bin/bash

echo "🧪 Prueba rápida de endpoint batch-photos..."

# Test del endpoint de upload
echo "📤 Probando POST /api/batch-photos/upload..."
curl -X POST http://localhost:4000/api/batch-photos/upload \
  -H "Content-Type: application/json" \
  -d '{
    "images": ["data:image/jpeg;base64,test"],
    "pickup_id": "test-pickup-123",
    "metadata": {"test": true}
  }' \
  -w "\nStatus: %{http_code}\n" 2>/dev/null

echo ""
echo "📥 Probando GET /api/batch-photos/test-batch-123/status..."
curl -X GET http://localhost:4000/api/batch-photos/test-batch-123/status \
  -w "\nStatus: %{http_code}\n" 2>/dev/null

echo ""
echo "✅ Prueba completada. Si ves status 400 para upload y 404 para status, los endpoints están funcionando."