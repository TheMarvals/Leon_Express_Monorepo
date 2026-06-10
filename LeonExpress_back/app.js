
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { syncDatabase } = require('./models');
const app = express();
const axios = require('axios');
const PORT = process.env.PORT || 4100;


// --- INICIO: DEPENDENCIAS PARA OCR ---
const sharp = require('sharp');
const Jimp = require('jimp');
const tesseract = require('node-tesseract-ocr');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
// --- FIN: DEPENDENCIAS PARA OCR ---

app.use(cors({ 
  origin: [
    'http://localhost:5173', 
    'http://localhost:5174',
    'http://localhost', 
    'http://localhost:80',
    'http://localhost:3000',
    'http://192.168.1.97:5173',
     /^https:\/\/.+\.ngrok-free\.app$/
  ] 
}));
// Aumentar límite a 200MB para permitir múltiples imágenes de alta calidad desde Android/iOS
// Las imágenes en base64 con calidad 0.98 pueden ser grandes, especialmente con ImageCapture API
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// --- INICIO DE CONFIGURACIÓN DE SWAGGER ---
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Leon Express API',
      version: '1.0.0',
      description: 'Documentación de la API para el sistema de logística Leon Express',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`, // Se ajusta la URL base para incluir el /api en las rutas
        description: 'Servidor de Desarrollo'
      }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            }
        }
    },
    security: [{
        bearerAuth: []
    }]
  },
  apis: ['./routes/*.js', './routes/ocr.js'], // Añadimos la nueva ruta de OCR a la documentación
};

const openapiSpecification = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification));

app.use('/uploads', express.static('uploads'));

// --- FIN DE CONFIGURACIÓN DE SWAGGER ---


// --- INICIO: LÓGICA DE OCR AÑADIDA ---

const tesseractConfig = {
  lang: "spa",
  oem: 3,
  psm: 6,
};

async function preprocessImage(imageBuffer) {
  console.log("Iniciando pre-procesamiento de imagen...");
  const processedBuffer = await sharp(imageBuffer)
    .greyscale()
    .sharpen({ sigma: 1 })
    .normalise()
    .toBuffer();
  console.log("Pre-procesamiento completado.");
  return processedBuffer;
}

/**
 * @swagger
 * /api/ocr:
 * post:
 * summary: Procesa una imagen para extraer texto usando OCR.
 * description: Recibe una imagen en formato base64, la pre-procesa para mejorar la calidad y utiliza Tesseract para extraer el texto contenido.
 * tags: [OCR]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * image:
 * type: string
 * description: La imagen codificada en base64 (formato data URL).
 * example: "data:image/jpeg;base64,/9j/4AAQSkZJRgABA..."
 * responses:
 * 200:
 * description: Texto extraído exitosamente.
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * text:
 * type: string
 * example: "NOMBRE: JUAN PEREZ\nDIRECCION: AV. SIEMPRE VIVA 123"
 * 400:
 * description: No se proporcionó ninguna imagen.
 * 500:
 * description: Error interno del servidor al procesar la imagen.
 */


const FormData = require('form-data'); // Librería para enviar la imagen

async function callOcrSpace(image) {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    throw new Error('La API Key de OCR.space no está configurada en el archivo .env');
  }

  const apiUrl = 'https://api.ocr.space/parse/image';
  const form = new FormData();

  form.append('base64Image', image);
  form.append('language', 'spa');
  form.append('apikey', apiKey);
  form.append('detectOrientation', 'true');
  form.append('OCREngine', '2');

  const response = await axios.post(apiUrl, form, {
    headers: form.getHeaders(),
  });

  if (response.data.IsErroredOnProcessing) {
    const errorMessage = Array.isArray(response.data.ErrorMessage)
      ? response.data.ErrorMessage.join(', ')
      : 'Error desconocido del servicio OCR';
    const error = new Error(errorMessage);
    error.isOcrSpaceError = true;
    throw error;
  }

  const parsedText = response.data.ParsedResults?.[0]?.ParsedText || '';

  return {
    text: parsedText,
    overlay:
      response.data.ParsedResults?.[0]?.TextOverlay?.Lines?.map((line) => ({
        texto: line.LineText,
        confianza: 1.0,
      })) || [],
  };
}

// Nota: Los límites de body ya están configurados arriba (50mb)

app.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Se requiere una imagen en base64.' });
    }

    console.log('➡️ Enviando petición a OCR.space (usando Motor 2)...');

    const { text: fullText, overlay } = await callOcrSpace(image);

    console.log('✅ Respuesta recibida de OCR.space');

    if (!fullText) {
      return res.json({ status: 'not_found', message: 'No se detectó texto en la imagen.' });
    }
    res.json({
      status: 'success',
      text: fullText,
      resultado: overlay,
    });

  } catch (error) {
    console.error('[OCR Service Error]', error.message);
    res.status(500).json({ error: 'Error interno al procesar la imagen con el servicio de OCR.' });
  }
});

// Nuevo endpoint: Subir fotos para procesamiento diferido
app.post('/api/batch-photos/upload', async (req, res) => {
  try {
    console.log('📸 BATCH UPLOAD: Nueva solicitud de subida de lote');
    const { images, pickup_id, metadata } = req.body;
    
    if (!Array.isArray(images) || images.length === 0) {
      console.log('❌ BATCH UPLOAD: No se enviaron imágenes');
      return res.status(400).json({ error: 'Se requiere un arreglo de imágenes.' });
    }
    
    if (!pickup_id) {
      console.log('❌ BATCH UPLOAD: No se envió pickup_id');
      return res.status(400).json({ error: 'Se requiere pickup_id.' });
    }
    
    console.log(`📸 BATCH UPLOAD: Procesando ${images.length} imágenes para pickup ${pickup_id}`);

    const batchId = `batch_${pickup_id}_${Date.now()}`;
    const uploadDir = path.join(__dirname, 'uploads', 'batch-photos', batchId);
    
    // Crear directorio para este lote
    await fs.mkdir(uploadDir, { recursive: true });
    
    const uploadedFiles = [];
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (typeof image === 'string' && image.startsWith('data:image/')) {
        const base64Data = image.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `photo_${i + 1}.jpg`;
        const filepath = path.join(uploadDir, filename);
        
        await fs.writeFile(filepath, buffer);
        uploadedFiles.push({
          filename,
          filepath,
          index: i,
          uploaded_at: new Date().toISOString()
        });
      }
    }
    
    // Guardar metadata del lote
    const batchMetadata = {
      batch_id: batchId,
      pickup_id,
      uploaded_files: uploadedFiles,
      status: 'pending_processing',
      created_at: new Date().toISOString(),
      metadata: metadata || {}
    };
    
    const metadataPath = path.join(uploadDir, 'batch_metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(batchMetadata, null, 2));
    
    console.log(`📸 BATCH UPLOAD: ${uploadedFiles.length} fotos subidas para pickup ${pickup_id}, batch ${batchId}`);
    
    res.json({
      status: 'success',
      batch_id: batchId,
      uploaded_count: uploadedFiles.length,
      message: 'Fotos subidas exitosamente. Procesamiento OCR iniciado en segundo plano.'
    });
    
    // Iniciar procesamiento en background (no bloquea la respuesta)
    processOcrBatchInBackground(batchId, uploadDir);
    
  } catch (error) {
    console.error('[Batch Upload Error]', error.message);
    res.status(500).json({ error: 'Error al subir el lote de fotos.' });
  }
});

// Endpoint: Consultar estado del procesamiento
app.get('/api/batch-photos/:batchId/status', async (req, res) => {
  try {
    const { batchId } = req.params;
    const batchDir = path.join(__dirname, 'uploads', 'batch-photos', batchId);
    const metadataPath = path.join(batchDir, 'batch_metadata.json');
    
    const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
    if (!metadataExists) {
      return res.status(404).json({ error: 'Lote no encontrado.' });
    }
    
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    res.json(metadata);
    
  } catch (error) {
    console.error('[Batch Status Error]', error.message);
    res.status(500).json({ error: 'Error al consultar estado del lote.' });
  }
});

// Función de procesamiento en background
async function processOcrBatchInBackground(batchId, uploadDir) {
  try {
    console.log(`🔄 OCR BACKGROUND: Iniciando procesamiento para batch ${batchId}`);
    
    const metadataPath = path.join(uploadDir, 'batch_metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    
    // Actualizar estado a "procesando"
    metadata.status = 'processing';
    metadata.processing_started_at = new Date().toISOString();
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    const results = [];
    for (const fileInfo of metadata.uploaded_files) {
      try {
        const imageBuffer = await fs.readFile(fileInfo.filepath);
        const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        
        const { text, overlay } = await callOcrSpace(base64Image);
        results.push({
          filename: fileInfo.filename,
          index: fileInfo.index,
          status: text ? 'success' : 'not_found',
          text,
          overlay,
          processed_at: new Date().toISOString()
        });
        
        // Pausa entre llamadas para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (err) {
        console.error(`[OCR Background Error] ${fileInfo.filename}:`, err.message);
        results.push({
          filename: fileInfo.filename,
          index: fileInfo.index,
          status: 'error',
          message: err.isOcrSpaceError ? err.message : 'Error interno al procesar la imagen.',
          processed_at: new Date().toISOString()
        });
      }
    }
    
    // Guardar resultados finales
    metadata.status = 'completed';
    metadata.processing_completed_at = new Date().toISOString();
    metadata.ocr_results = results;
    metadata.success_count = results.filter(r => r.status === 'success').length;
    
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    console.log(`✅ OCR BACKGROUND: Completado batch ${batchId} - ${metadata.success_count}/${results.length} exitosos`);
    
  } catch (error) {
    console.error(`❌ OCR BACKGROUND: Error procesando batch ${batchId}:`, error.message);
    
    // Marcar como fallido
    try {
      const metadataPath = path.join(uploadDir, 'batch_metadata.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      metadata.status = 'failed';
      metadata.error_message = error.message;
      metadata.failed_at = new Date().toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (saveError) {
      console.error('Error guardando estado de falla:', saveError.message);
    }
  }
}

app.post('/api/ocr/batch', async (req, res) => {
  try {
    const { images } = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Se requiere un arreglo de imágenes en base64.' });
    }

    const results = [];
    for (let i = 0; i < images.length; i += 1) {
      const image = images[i];
      if (typeof image !== 'string' || image.trim() === '') {
        results.push({ index: i, status: 'invalid', message: 'Imagen vacía o no válida.' });
        continue;
      }
      try {
        const { text, overlay } = await callOcrSpace(image);
        results.push({ index: i, status: text ? 'success' : 'not_found', text, overlay });
      } catch (err) {
        console.error(`[OCR Batch Error] Imagen ${i}:`, err.message);
        const message = err.isOcrSpaceError ? err.message : 'Error interno al procesar la imagen.';
        results.push({ index: i, status: 'error', message });
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const hasSuccess = results.some((result) => result.status === 'success');
    const overallStatus = hasSuccess ? 'success' : 'partial';

    res.json({ status: overallStatus, results });
  } catch (error) {
    console.error('[OCR Batch Service Error]', error.message);
    res.status(500).json({ error: 'Error interno al procesar el lote de imágenes con el servicio de OCR.' });
  }
});



// --- FIN: LÓGICA DE OCR AÑADIDA ---


// Routes
const MainRoutes = require('./routes/index');
app.use('/api', MainRoutes);
const invoiceRoutes = require('./routes/invoice');
app.use('/api/invoices', invoiceRoutes);
const pushRoutes = require('./routes/push');
app.use('/api/push', pushRoutes);
app.use('/push', pushRoutes); // También mantener /push para compatibilidad
const debugRoutes = require('./routes/debug');
app.use('/api/debug', debugRoutes);
const smartBatchRoutes = require('./routes/smartBatch');
app.use('/api/smart-batch', smartBatchRoutes);
const billingRoutes = require('./routes/billing');
app.use('/api/billing', billingRoutes);
const mercadolibreRoutes = require('./routes/mercadolibre');
app.use('/api/mercadolibre', mercadolibreRoutes);
// ml_confirm routes are already mounted via MainRoutes (/api/ml-confirm)



const https = require('https');
const http = require('http');

async function startServer() {
  // await syncDatabase();
  
  // Iniciar el servicio de automatización de facturación
  const billingAutomation = require('./services/billingAutomation');
  billingAutomation.startBillingAutomation();
  
  // Configuración de timeouts para manejar cargas grandes (10 minutos = 600000ms)
  const serverTimeout = 600000; // 10 minutos en milisegundos
  const headersTimeout = 610000; // 10 minutos + margen para headers
  
  if (process.env.NODE_ENV === 'production') {
    // En producción, usar HTTP (nginx maneja SSL)
    const server = http.createServer(app);
    
    // Configurar timeouts para evitar error 408 con cargas grandes
    server.timeout = serverTimeout;
    server.headersTimeout = headersTimeout;
    server.keepAliveTimeout = 610000; // 10 minutos + margen
    server.requestTimeout = serverTimeout;
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor Express HTTP corriendo en puerto ${PORT}`);
      console.log(`Documentación de la API disponible en http://localhost:${PORT}/api-docs`);
      console.log(`⏱️  Timeouts configurados: ${serverTimeout/1000}s para cargas grandes`);
    });
  } else {
    // En desarrollo, usar HTTPS con certificados locales si existen, sino HTTP
    const keyPath = path.resolve(__dirname, '../key.pem');
    const certPath = path.resolve(__dirname, '../cert.pem');
    
    if (fsSync.existsSync(keyPath) && fsSync.existsSync(certPath)) {
      try {
        const options = {
          key: fsSync.readFileSync(keyPath),
          cert: fsSync.readFileSync(certPath),
        };
        const server = https.createServer(options, app);
        
        // Configurar timeouts para evitar error 408 con cargas grandes
        server.timeout = serverTimeout;
        server.headersTimeout = headersTimeout;
        server.keepAliveTimeout = 610000; // 10 minutos + margen
        server.requestTimeout = serverTimeout;
        
        server.listen(PORT, '0.0.0.0', () => {
          console.log(`Servidor Express HTTPS corriendo en puerto ${PORT}`);
          console.log(`Documentación de la API disponible en https://localhost:${PORT}/api-docs`);
          console.log(`⏱️  Timeouts configurados: ${serverTimeout/1000}s para cargas grandes`);
        });
      } catch (error) {
        console.warn('⚠️  Error al cargar certificados SSL, usando HTTP:', error.message);
        const server = http.createServer(app);
        
        // Configurar timeouts para evitar error 408 con cargas grandes
        server.timeout = serverTimeout;
        server.headersTimeout = headersTimeout;
        server.keepAliveTimeout = 610000;
        server.requestTimeout = serverTimeout;
        
        server.listen(PORT, '0.0.0.0', () => {
          console.log(`Servidor Express HTTP corriendo en puerto ${PORT}`);
          console.log(`Documentación de la API disponible en http://localhost:${PORT}/api-docs`);
          console.log(`⏱️  Timeouts configurados: ${serverTimeout/1000}s para cargas grandes`);
        });
      }
    } else {
      console.warn('⚠️  Certificados SSL no encontrados, usando HTTP');
      const server = http.createServer(app);
      
      // Configurar timeouts para evitar error 408 con cargas grandes
      server.timeout = serverTimeout;
      server.headersTimeout = headersTimeout;
      server.keepAliveTimeout = 610000;
      server.requestTimeout = serverTimeout;
      
      server.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor Express HTTP corriendo en puerto ${PORT}`);
        console.log(`Documentación de la API disponible en http://localhost:${PORT}/api-docs`);
        console.log(`⏱️  Timeouts configurados: ${serverTimeout/1000}s para cargas grandes`);
      });
    }
  }
}

startServer();