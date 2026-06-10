// routes/index.js
'use strict';

const express = require('express');
const router = express.Router();

// Importar los routers de cada recurso
const authRoutes = require('./auth');
const userRoutes = require('./user');
const clientRoutes = require('./client');
const packageRoutes = require('./package');
const warehouseRoutes = require('./warehouse');
const vehicleRoutes = require('./vehicle');
const vehicleTypeRoutes = require('./vehicle_type');
const routeMgmtRoutes = require('./route');
const pickupRoutes = require('./pickup');
const payoutRoutes = require('./payout');
const invoiceRoutes = require('./invoice');
const systemConfigRoutes = require('./system_config');
const deliveryEventRoutes = require('./delivery_events');
const auditLogRoutes = require('./audit_log');
const revenueRoutes = require('./revenues');
const driverSummaryRoutes = require('./driver_summary');
const driverPayoutsRoutes = require('./driver-payouts');
const notificationRoutes = require('./notifications');
const ocrReviewRoutes = require('./ocr_review');
const ocrDuplicateConfirmRoutes = require('./ocr_duplicate_confirm');
const billingRoutes = require('./billing');
const changeManagementRoutes = require('./change_management');
const ocrLearningRoutes = require('./ocr_learning');
const mlRoutes = require('./mercadolibre');
const mlConfirmRoutes = require('./ml_confirm');

// Montar los routers en sus rutas base
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/clients', clientRoutes);
router.use('/packages', packageRoutes);
router.use('/warehouses', warehouseRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/vehicle-types', vehicleTypeRoutes);
router.use('/routes', routeMgmtRoutes);
router.use('/pickups', pickupRoutes);
router.use('/payouts', payoutRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/system-config', systemConfigRoutes);
router.use('/events', deliveryEventRoutes);
router.use('/audit-log', auditLogRoutes);
router.use('/revenues', revenueRoutes);
router.use('/driver/summary', driverSummaryRoutes);
router.use('/driver-payouts', driverPayoutsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/ocr-review', ocrReviewRoutes);
router.use('/ocr-duplicate', ocrDuplicateConfirmRoutes);
router.use('/billing', billingRoutes);
router.use('/change-management', changeManagementRoutes);
router.use('/ocr-learning', ocrLearningRoutes);
router.use('/mercadolibre', mlRoutes);
router.use('/ml-confirm', mlConfirmRoutes);

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    console.log('File mimetype:', file.mimetype); // Debug mimetype
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'), false);
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB - Coincide con Express y nginx para imágenes de alta calidad
});

module.exports = router;