'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Ajusta la ruta a tu configuración de base de datos

// --- DEFINICIÓN DE MODELOS ---

const Role = sequelize.define('Role', {
  role_id: { type: DataTypes.STRING(36), primaryKey: true },
  role_name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
}, { tableName: 'roles', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Warehouse = sequelize.define('Warehouse', {
  warehouse_id: { type: DataTypes.STRING(36), primaryKey: true },
  warehouse_name: { type: DataTypes.STRING(100), allowNull: false },
  address: { type: DataTypes.TEXT, allowNull: false },
}, { tableName: 'warehouses', timestamps: true, createdAt: 'created_at', updatedAt: false });

const User = sequelize.define('User', {
  user_id: { type: DataTypes.STRING(36), primaryKey: true },
  username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  role_id: { type: DataTypes.STRING(36), allowNull: false },
  warehouse_id: { type: DataTypes.STRING(36), allowNull: false },
  full_name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(100) }, // unique: true removed
  phone: { type: DataTypes.STRING(20) },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'users', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const Client = sequelize.define('Client', {
  client_id: { type: DataTypes.STRING(36), primaryKey: true },
  verification_code: { type: DataTypes.STRING(10), allowNull: false },
  client_name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  phone: { type: DataTypes.STRING(20) },
  address: { type: DataTypes.TEXT },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  has_free_pickups: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
}, { tableName: 'clients', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const VehicleType = sequelize.define('VehicleType', {
  type_id: { type: DataTypes.STRING(36), primaryKey: true },
  type_name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  base_delivery_cost: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
}, { tableName: 'vehicle_types', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Vehicle = sequelize.define('Vehicle', {
  vehicle_id: { type: DataTypes.STRING(36), primaryKey: true },
  user_id: { type: DataTypes.STRING(36) },
  type_id: { type: DataTypes.STRING(36), allowNull: false },
  license_plate: { type: DataTypes.STRING(20), allowNull: false, unique: true },
}, { tableName: 'vehicles', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const ClientPricing = sequelize.define('ClientPricing', {
  pricing_id: { type: DataTypes.STRING(36), primaryKey: true },
  client_id: { type: DataTypes.STRING(36), allowNull: false },
  base_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  valid_from: { type: DataTypes.DATEONLY, allowNull: false },
  valid_to: { type: DataTypes.DATEONLY },
}, { tableName: 'client_pricing', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const Pickup = sequelize.define('Pickup', {
  pickup_id: { type: DataTypes.STRING(36), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  client_id: { type: DataTypes.STRING(36), allowNull: false },
  pickup_scheduled_date: { type: DataTypes.DATE, allowNull: false },
  status: {
    type: DataTypes.ENUM('ASIGNADO_A_RECOLECTOR', 'EN_PROCESO_RECOLECCION', 'RECOLECCION_FINALIZADA_DRIVER', 'ENTREGADO_EN_ALMACEN', 'VERIFICADO_EN_ALMACEN', 'CANCELADO'),
    defaultValue: 'ASIGNADO_A_RECOLECTOR',
    allowNull: false,
  },
  notes: { type: DataTypes.TEXT },
  pickup_cost: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
  pickup_completed_by_driver_at: { type: DataTypes.DATE },
  arrived_at_warehouse_at: { type: DataTypes.DATE },
  verified_at_warehouse_at: { type: DataTypes.DATE },
}, { tableName: 'pickups', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const Package = sequelize.define('Package', {
  package_id: { type: DataTypes.STRING(36), primaryKey: true },
  tracking_code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  external_tracking_code: { type: DataTypes.STRING(100) }, // Removido unique: true
  duplicate_handling: {
    type: DataTypes.ENUM('pending', 'error_return', 'multi_part', 'confirmed_unique'),
    defaultValue: null
  },
  duplicate_notes: { type: DataTypes.TEXT },
  duplicate_reviewed_by: { type: DataTypes.STRING(36) },
  duplicate_reviewed_at: { type: DataTypes.DATE },
  pickup_id: { type: DataTypes.STRING(36), allowNull: false },
  client_id: { type: DataTypes.STRING(36), allowNull: false },
  status: {
    type: DataTypes.ENUM('PENDIENTE_RECOLECCION', 'RECOLECTADO_EN_ORIGEN', 'RECIBIDO_EN_ALMACEN', 'ASIGNADO_A_RUTA', 'EN_RUTA_ENTREGA', 'ENTREGADO', 'INCIDENCIA_ENTREGA', 'REPROGRAMADO', 'DEVUELTO_ALMACEN', 'EN_RUTA_DEVOLUCION', 'DEVUELTO_A_CLIENTE', 'CANCELADO'),
    defaultValue: 'RECOLECTADO_EN_ORIGEN',
    allowNull: false,
  },
  is_cod: { type: DataTypes.BOOLEAN, defaultValue: false },
  cod_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  is_change: { type: DataTypes.BOOLEAN, defaultValue: false },
  change_received: { type: DataTypes.BOOLEAN, defaultValue: false },
  change_received_at: { type: DataTypes.DATE },
  change_received_by: { type: DataTypes.STRING(36) },
  change_notes: { type: DataTypes.TEXT },
  has_multiple_labels: { type: DataTypes.BOOLEAN, defaultValue: false },
  sales_codes: { type: DataTypes.TEXT },
  client_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  delivery_cost: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  is_delivery_cost_manual: { type: DataTypes.BOOLEAN, defaultValue: false },
  scanned_at_origin_datetime: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  received_at_warehouse_datetime: { type: DataTypes.DATE },
  assigned_to_route_datetime: { type: DataTypes.DATE },
  delivered_datetime: { type: DataTypes.DATE },
  returned_datetime: { type: DataTypes.DATE },
  destination_address: { type: DataTypes.TEXT, allowNull: false },
  recipient_name: { type: DataTypes.STRING(100), allowNull: false },
  recipient_phone: { type: DataTypes.STRING(20) },
  pending_return_user_id: { type: DataTypes.STRING(36) }
}, { tableName: 'packages', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const OcrProcessingQueue = sequelize.define('OcrProcessingQueue', {
  id: { type: DataTypes.STRING(36), primaryKey: true },
  pickup_id: { type: DataTypes.STRING(36), allowNull: false },
  batch_id: { type: DataTypes.STRING(36), allowNull: false },
  image_path: { type: DataTypes.TEXT, allowNull: false },
  filename: { type: DataTypes.STRING(255), allowNull: false },
  status: {
    type: DataTypes.ENUM('queued', 'processing', 'completed', 'auto_approved', 'needs_review', 'error'),
    defaultValue: 'queued'
  },

  // Datos OCR
  ocr_raw_text: { type: DataTypes.TEXT },
  ocr_provider: { type: DataTypes.STRING(50), defaultValue: 'ocrspace' },

  // Datos extraídos
  extracted_data: { type: DataTypes.JSON },
  confidence_scores: { type: DataTypes.JSON },
  overall_confidence: { type: DataTypes.DECIMAL(5, 2) },
  parser_used: { type: DataTypes.STRING(100) },
  fields_extracted: { type: DataTypes.INTEGER, defaultValue: 0 },

  // Manejo de duplicados
  is_duplicate: { type: DataTypes.BOOLEAN, defaultValue: false },
  duplicate_of_package_id: { type: DataTypes.STRING(36) },
  duplicate_reason: { type: DataTypes.TEXT },

  // Estado de procesamiento
  auto_approved: { type: DataTypes.BOOLEAN, defaultValue: false },
  package_id: { type: DataTypes.STRING(36) },
  error_message: { type: DataTypes.TEXT },

  // Auditoría
  processing_started_at: { type: DataTypes.DATE },
  processed_at: { type: DataTypes.DATE },
  reviewed_by: { type: DataTypes.STRING(36) },
  reviewed_at: { type: DataTypes.DATE }
}, {
  tableName: 'ocr_processing_queue',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

const Route = sequelize.define('Route', {
  route_id: { type: DataTypes.STRING(36), primaryKey: true },
  route_name: { type: DataTypes.STRING(150), allowNull: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  vehicle_id: { type: DataTypes.STRING(36), allowNull: false },
  warehouse_id: { type: DataTypes.STRING(36), allowNull: false },
  start_date: { type: DataTypes.DATE, allowNull: false },
  end_date: { type: DataTypes.DATE },
  status: { type: DataTypes.ENUM('PENDIENTE', 'EN_PROGRESO', 'FINALIZADA', 'CANCELADA'), defaultValue: 'PENDIENTE', allowNull: false },
  route_type: { type: DataTypes.ENUM('ENTREGA', 'DEVOLUCION'), defaultValue: 'ENTREGA', allowNull: false },
  loading_status: { type: DataTypes.ENUM('NOT_STARTED', 'LOADING', 'LOADING_COMPLETED', 'APPROVED'), defaultValue: 'NOT_STARTED', allowNull: false },
}, { tableName: 'routes', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const RoutePackage = sequelize.define('RoutePackage', {
  route_package_id: { type: DataTypes.STRING(36), primaryKey: true },
  route_id: { type: DataTypes.STRING(36), allowNull: false },
  package_id: { type: DataTypes.STRING(36), allowNull: false },
  sequence_in_route: { type: DataTypes.INTEGER },
}, { tableName: 'route_packages', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Delivery = sequelize.define('Delivery', {
  delivery_id: { type: DataTypes.STRING(36), primaryKey: true },
  package_id: { type: DataTypes.STRING(36), allowNull: false },
  route_package_id: { type: DataTypes.STRING(36) },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  status_at_delivery: {
    type: DataTypes.ENUM('ENTREGADO', 'NO_HAY_NADIE', 'DIRECCION_INCORRECTA', 'RECHAZADO_POR_CLIENTE', 'REPROGRAMADO_POR_CLIENTE', 'OTRA_INCIDENCIA'),
    allowNull: false,
  },
  receiver_name: { type: DataTypes.STRING(100) },
  receiver_rut: { type: DataTypes.STRING(20) },
  observation: { type: DataTypes.TEXT },
  gps_latitude: { type: DataTypes.DECIMAL(10, 8) },
  gps_longitude: { type: DataTypes.DECIMAL(11, 8) },
  attempted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  payment_type: {
    type: DataTypes.ENUM('PAGADO_ONLINE', 'EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NO_APLICA'),
    allowNull: false,
    defaultValue: 'NO_APLICA',
  },
  collected_amount: { type: DataTypes.DECIMAL(10, 2) },
  payment_reference: { type: DataTypes.STRING(100) },
}, { tableName: 'deliveries', timestamps: false });

const DeliveryPhoto = sequelize.define('DeliveryPhoto', {
  photo_id: { type: DataTypes.STRING(36), primaryKey: true },
  delivery_id: { type: DataTypes.STRING(36), allowNull: false },
  photo_url: { type: DataTypes.STRING(255), allowNull: false },
}, { tableName: 'delivery_photos', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Return = sequelize.define('Return', {
  return_id: { type: DataTypes.STRING(36), primaryKey: true },
  package_id: { type: DataTypes.STRING(36), allowNull: false },
  reason: { type: DataTypes.ENUM('RECHAZADO_DESTINATARIO', 'DIRECCION_INCORRECTA', 'NO_RECLAMADO', 'OTRO'), allowNull: false },
  notes: { type: DataTypes.TEXT },
}, { tableName: 'returns', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Cancellation = sequelize.define('Cancellation', {
  cancellation_id: { type: DataTypes.STRING(36), primaryKey: true },
  package_id: { type: DataTypes.STRING(36), allowNull: false },
  reason: { type: DataTypes.ENUM('SOLICITUD_CLIENTE', 'FALTA_STOCK', 'ERROR_SISTEMA', 'OTRO'), allowNull: false },
  refund_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  notes: { type: DataTypes.TEXT },
}, { tableName: 'cancellations', timestamps: true, createdAt: 'created_at', updatedAt: false });

const AuditLog = sequelize.define('AuditLog', {
  log_id: { type: DataTypes.STRING(36), primaryKey: true },
  user_id: { type: DataTypes.STRING(36) },
  action: { type: DataTypes.STRING(100), allowNull: false },
  target_table: { type: DataTypes.STRING(50) },
  target_id: { type: DataTypes.STRING(36) },
  details: { type: DataTypes.TEXT },
}, { tableName: 'audit_log', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Cost = sequelize.define('Cost', {
  cost_id: { type: DataTypes.STRING(36), primaryKey: true },
  cost_name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT },
}, { tableName: 'costs', timestamps: true, createdAt: 'created_at', updatedAt: false });

const PackageCost = sequelize.define('PackageCost', {
  package_cost_id: { type: DataTypes.STRING(36), primaryKey: true },
  package_id: { type: DataTypes.STRING(36), allowNull: false },
  cost_id: { type: DataTypes.STRING(36), allowNull: false },
  applied_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  cost_type: { type: DataTypes.ENUM('DRIVER_CREDIT', 'CLIENT_CHARGE'), allowNull: false },
}, { tableName: 'package_costs', timestamps: true, createdAt: 'created_at', updatedAt: false });

const BillingPeriod = sequelize.define('BillingPeriod', {
  period_id: { type: DataTypes.STRING(36), primaryKey: true },
  period_type: { type: DataTypes.ENUM('WEEKLY', 'MONTHLY', 'CUSTOM'), allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  year_number: { type: DataTypes.INTEGER, allowNull: false },
  period_number: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.ENUM('ACTIVE', 'CLOSED'), defaultValue: 'ACTIVE' },
}, { tableName: 'billing_periods', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Invoice = sequelize.define('Invoice', {
  invoice_id: { type: DataTypes.STRING(36), primaryKey: true },
  client_id: { type: DataTypes.STRING(36), allowNull: false },
  period_id: { type: DataTypes.STRING(36) },
  invoice_date: { type: DataTypes.DATEONLY, allowNull: false },
  due_date: { type: DataTypes.DATEONLY, allowNull: false },
  total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
  status: { type: DataTypes.ENUM('PENDIENTE', 'PAGADA', 'VENCIDA', 'CANCELADA'), defaultValue: 'PENDIENTE', allowNull: false },
  paid_at: { type: DataTypes.DATE },
  invoice_number: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'invoices', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const InvoiceItem = sequelize.define('InvoiceItem', {
  invoice_item_id: { type: DataTypes.STRING(36), primaryKey: true },
  invoice_id: { type: DataTypes.STRING(36), allowNull: false },
  package_id: { type: DataTypes.STRING(36), allowNull: false },
  item_description: { type: DataTypes.STRING(255), allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
}, { tableName: 'invoice_items', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Payment = sequelize.define('Payment', {
  payment_id: { type: DataTypes.STRING(36), primaryKey: true },
  invoice_id: { type: DataTypes.STRING(36), allowNull: false },
  payment_date: { type: DataTypes.DATE, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  payment_method: { type: DataTypes.ENUM('TRANSFERENCIA', 'EFECTIVO', 'TARJETA'), allowNull: false },
  transaction_reference: { type: DataTypes.STRING(100) },
  notes: { type: DataTypes.TEXT },
}, { tableName: 'payments', timestamps: true, createdAt: 'created_at', updatedAt: false });

const DriverPayment = sequelize.define('DriverPayment', {
  payment_id: { type: DataTypes.STRING(36), primaryKey: true },
  payout_id: { type: DataTypes.STRING(36), allowNull: false },
  payment_date: { type: DataTypes.DATE, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  payment_method: { type: DataTypes.ENUM('TRANSFERENCIA', 'EFECTIVO', 'TARJETA'), allowNull: false },
  transaction_reference: { type: DataTypes.STRING(100) },
  notes: { type: DataTypes.TEXT },
}, { tableName: 'driver_payments', timestamps: true, createdAt: 'created_at', updatedAt: false });

const DriverPayout = sequelize.define('DriverPayout', {
  payout_id: { type: DataTypes.STRING(36), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  period_id: { type: DataTypes.STRING(36) },
  payout_date: { type: DataTypes.DATEONLY, allowNull: false },
  total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
  status: { type: DataTypes.ENUM('PENDIENTE', 'PAGADO', 'CANCELADO', 'PARCIALMENTE_PAGADO'), defaultValue: 'PENDIENTE', allowNull: false },
  paid_at: { type: DataTypes.DATE },
  notes: { type: DataTypes.TEXT },
  payout_number: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'driver_payouts', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const PayoutItem = sequelize.define('PayoutItem', {
  payout_item_id: { type: DataTypes.STRING(36), primaryKey: true },
  payout_id: { type: DataTypes.STRING(36), allowNull: false },
  package_id: { type: DataTypes.STRING(36) },
  pickup_id: { type: DataTypes.STRING(36) },
  item_description: { type: DataTypes.STRING(255), allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
}, { tableName: 'payout_items', timestamps: true, createdAt: 'created_at', updatedAt: false });

const SystemConfig = sequelize.define('SystemConfig', {
  config_key: { type: DataTypes.STRING(100), primaryKey: true },
  config_value: { type: DataTypes.TEXT, allowNull: false },
  description: { type: DataTypes.TEXT },
}, { tableName: 'system_config', timestamps: true, createdAt: false, updatedAt: 'updated_at' });

const PushSubscription = require('./PushSubscription')(sequelize, DataTypes);

const OcrCorrection = sequelize.define('OcrCorrection', {
  id: { type: DataTypes.STRING(36), primaryKey: true },
  queue_id: { type: DataTypes.STRING(36), allowNull: false },
  field_name: { type: DataTypes.STRING(50), allowNull: false },
  original_value: { type: DataTypes.TEXT },
  corrected_value: { type: DataTypes.TEXT, allowNull: false },
  correction_type: { type: DataTypes.STRING(50) },
  confidence_before: { type: DataTypes.DECIMAL(5, 2) },
  corrected_by: { type: DataTypes.STRING(36), allowNull: false },
  parser_used: { type: DataTypes.STRING(100) },
  ocr_raw_text: { type: DataTypes.TEXT },
}, {
  tableName: 'ocr_corrections',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

const LearnedPattern = sequelize.define('LearnedPattern', {
  id: { type: DataTypes.STRING(36), primaryKey: true },
  pattern_name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  pattern_type: { type: DataTypes.STRING(50), allowNull: false },
  regex_pattern: { type: DataTypes.TEXT, allowNull: false },
  replacement: { type: DataTypes.TEXT },
  field_name: { type: DataTypes.STRING(50) },
  parser_name: { type: DataTypes.STRING(100) },
  confidence_threshold: { type: DataTypes.DECIMAL(5, 2), defaultValue: 80.00 },
  usage_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  success_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  success_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0.00 },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  source_corrections: { type: DataTypes.JSON },
}, {
  tableName: 'learned_patterns',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const Notification = sequelize.define('Notification', {
  notification_id: { type: DataTypes.STRING(36), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  message: { type: DataTypes.TEXT },
  link: { type: DataTypes.STRING(255) },
  is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'notifications', timestamps: true, createdAt: 'created_at', updatedAt: false });


// --- DEFINICIÓN DE ASOCIACIONES (CON ALIAS CORREGIDOS) ---

// Role
Role.hasMany(User, { foreignKey: 'role_id', as: 'users' });
User.belongsTo(Role, { foreignKey: 'role_id', onDelete: 'RESTRICT', as: 'role' });

// Warehouse
Warehouse.hasMany(User, { foreignKey: 'warehouse_id', as: 'users' });
Warehouse.hasMany(Route, { foreignKey: 'warehouse_id', as: 'routes' });
User.belongsTo(Warehouse, { foreignKey: 'warehouse_id', onDelete: 'RESTRICT', as: 'warehouse' });
Route.belongsTo(Warehouse, { foreignKey: 'warehouse_id', onDelete: 'RESTRICT', as: 'warehouse' });

// User
User.hasMany(Vehicle, { foreignKey: 'user_id', as: 'vehicles' });
User.hasMany(Pickup, { foreignKey: 'user_id', as: 'pickups' });
User.hasMany(Route, { foreignKey: 'user_id', as: 'routes' });
User.hasMany(Delivery, { foreignKey: 'user_id', as: 'deliveries' });
User.hasMany(DriverPayout, { foreignKey: 'user_id', as: 'driverPayouts' });
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });

// Client
Client.hasMany(ClientPricing, { foreignKey: 'client_id', as: 'clientPricings' });
Client.hasMany(Pickup, { foreignKey: 'client_id', as: 'pickups' });
Client.hasMany(Package, { foreignKey: 'client_id', as: 'packages' });
Client.hasMany(Invoice, { foreignKey: 'client_id', as: 'invoices' });

// VehicleType
VehicleType.hasMany(Vehicle, { foreignKey: 'type_id', as: 'vehicles' });
Vehicle.belongsTo(VehicleType, { foreignKey: 'type_id', onDelete: 'RESTRICT', as: 'vehicleType' });

// Vehicle
Vehicle.belongsTo(User, { foreignKey: 'user_id', onDelete: 'SET NULL', as: 'user' });
Vehicle.hasMany(Route, { foreignKey: 'vehicle_id', as: 'routes' });

// ClientPricing
ClientPricing.belongsTo(Client, { foreignKey: 'client_id', onDelete: 'CASCADE', as: 'client' });

// Pickup
Pickup.belongsTo(User, { foreignKey: 'user_id', onDelete: 'RESTRICT', as: 'user' });
Pickup.belongsTo(User, { foreignKey: 'user_id', onDelete: 'RESTRICT', as: 'driver' }); // Alias driver
Pickup.belongsTo(Client, { foreignKey: 'client_id', onDelete: 'RESTRICT', as: 'client' });
Pickup.hasMany(Package, { foreignKey: 'pickup_id', as: 'packages' });
Pickup.hasMany(PayoutItem, { foreignKey: 'pickup_id', as: 'payoutItems' });

// Package
Package.belongsTo(Pickup, { foreignKey: 'pickup_id', onDelete: 'RESTRICT', as: 'pickup' });
Package.belongsTo(Client, { foreignKey: 'client_id', onDelete: 'RESTRICT', as: 'client' });
Package.belongsTo(User, { foreignKey: 'change_received_by', onDelete: 'SET NULL', as: 'changeReceivedByUser' });
Package.hasMany(RoutePackage, { foreignKey: 'package_id', as: 'routePackages' });
// Refuerza el alias 'deliveries' para que coincida con el include del backend
Package.hasMany(Delivery, { foreignKey: 'package_id', as: 'deliveries' });
Package.hasOne(Return, { foreignKey: 'package_id', as: 'return' });
Package.hasOne(Cancellation, { foreignKey: 'package_id', as: 'cancellation' });
Package.hasMany(PackageCost, { foreignKey: 'package_id', as: 'packageCosts' });
Package.hasMany(InvoiceItem, { foreignKey: 'package_id', as: 'invoiceItems' });
Package.hasMany(PayoutItem, { foreignKey: 'package_id', as: 'payoutItems' });
Package.belongsTo(User, { foreignKey: 'pending_return_user_id', as: 'pendingReturnDriver' });

// Route
Route.belongsTo(User, { foreignKey: 'user_id', onDelete: 'RESTRICT', as: 'user' });
Route.belongsTo(Vehicle, { foreignKey: 'vehicle_id', onDelete: 'RESTRICT', as: 'vehicle' });
Route.hasMany(RoutePackage, { foreignKey: 'route_id', as: 'routePackages' });

// RoutePackage
RoutePackage.belongsTo(Route, { foreignKey: 'route_id', onDelete: 'CASCADE', as: 'route' });
RoutePackage.belongsTo(Package, { foreignKey: 'package_id', onDelete: 'CASCADE', as: 'package' });
RoutePackage.hasMany(Delivery, { foreignKey: 'route_package_id', as: 'deliveries' });

// Delivery
Delivery.belongsTo(Package, { foreignKey: 'package_id', onDelete: 'CASCADE', as: 'package' });
Delivery.belongsTo(RoutePackage, { foreignKey: 'route_package_id', onDelete: 'SET NULL', as: 'routePackage' });
Delivery.belongsTo(User, { foreignKey: 'user_id', onDelete: 'RESTRICT', as: 'user' });
Delivery.hasMany(DeliveryPhoto, { foreignKey: 'delivery_id', as: 'deliveryPhotos' });

// DeliveryPhoto
DeliveryPhoto.belongsTo(Delivery, { foreignKey: 'delivery_id', onDelete: 'CASCADE', as: 'delivery' });

// Return & Cancellation
Return.belongsTo(Package, { foreignKey: 'package_id', onDelete: 'CASCADE', as: 'package' });
Cancellation.belongsTo(Package, { foreignKey: 'package_id', onDelete: 'CASCADE', as: 'package' });

// AuditLog
AuditLog.belongsTo(User, { foreignKey: 'user_id', onDelete: 'SET NULL', as: 'user' });

// Cost & PackageCost
Cost.hasMany(PackageCost, { foreignKey: 'cost_id', as: 'packageCosts' });
PackageCost.belongsTo(Package, { foreignKey: 'package_id', onDelete: 'CASCADE', as: 'package' });
PackageCost.belongsTo(Cost, { foreignKey: 'cost_id', onDelete: 'RESTRICT', as: 'cost' });

// BillingPeriod
BillingPeriod.hasMany(Invoice, { foreignKey: 'period_id', as: 'invoices' });
BillingPeriod.hasMany(DriverPayout, { foreignKey: 'period_id', as: 'driverPayouts' });

// Invoice
Invoice.belongsTo(Client, { foreignKey: 'client_id', onDelete: 'RESTRICT', as: 'client' });
Invoice.belongsTo(BillingPeriod, { foreignKey: 'period_id', onDelete: 'RESTRICT', as: 'billingPeriod' });
Invoice.hasMany(InvoiceItem, { foreignKey: 'invoice_id', as: 'invoiceItems' });
Invoice.hasMany(Payment, { foreignKey: 'invoice_id', as: 'payments' });

// InvoiceItem
InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoice_id', onDelete: 'CASCADE', as: 'invoice' });
InvoiceItem.belongsTo(Package, { foreignKey: 'package_id', onDelete: 'CASCADE', as: 'package' });

// Payment
Payment.belongsTo(Invoice, { foreignKey: 'invoice_id', onDelete: 'RESTRICT', as: 'invoice' });

// DriverPayout
DriverPayout.belongsTo(User, { foreignKey: 'user_id', onDelete: 'RESTRICT', as: 'user' });
DriverPayout.belongsTo(BillingPeriod, { foreignKey: 'period_id', onDelete: 'RESTRICT', as: 'billingPeriod' });
DriverPayout.hasMany(PayoutItem, { foreignKey: 'payout_id', as: 'payoutItems' });
DriverPayout.hasMany(DriverPayment, { foreignKey: 'payout_id', as: 'payments' }); // Nueva asociación

// PayoutItem
PayoutItem.belongsTo(DriverPayout, { foreignKey: 'payout_id', onDelete: 'CASCADE', as: 'driverPayout' });
PayoutItem.belongsTo(Package, { foreignKey: 'package_id', onDelete: 'SET NULL', as: 'package' });
PayoutItem.belongsTo(Pickup, { foreignKey: 'pickup_id', onDelete: 'SET NULL', as: 'pickup' });

// DriverPayment
DriverPayment.belongsTo(DriverPayout, { foreignKey: 'payout_id', onDelete: 'RESTRICT', as: 'driverPayout' }); // Nueva asociación

// Notification
Notification.belongsTo(User, { foreignKey: 'user_id', onDelete: 'CASCADE', as: 'user' });

// OcrProcessingQueue
OcrProcessingQueue.belongsTo(Pickup, { foreignKey: 'pickup_id', onDelete: 'CASCADE', as: 'pickup' });
OcrProcessingQueue.belongsTo(Package, { foreignKey: 'package_id', onDelete: 'SET NULL', as: 'package' });
OcrProcessingQueue.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });
Pickup.hasMany(OcrProcessingQueue, { foreignKey: 'pickup_id', as: 'ocrQueue' });
Package.hasOne(OcrProcessingQueue, { foreignKey: 'package_id', as: 'ocrRecord' });

// OcrCorrection
OcrCorrection.belongsTo(OcrProcessingQueue, { foreignKey: 'queue_id', onDelete: 'CASCADE', as: 'queueItem' });
OcrCorrection.belongsTo(User, { foreignKey: 'corrected_by', onDelete: 'CASCADE', as: 'corrector' });
OcrProcessingQueue.hasMany(OcrCorrection, { foreignKey: 'queue_id', as: 'corrections' });


// --- EXPORTACIÓN DE MODELOS ---
const db = {
  Role,
  Warehouse,
  User,
  Client,
  VehicleType,
  Vehicle,
  ClientPricing,
  Pickup,
  Package,
  OcrProcessingQueue,
  OcrCorrection,
  LearnedPattern,
  Route,
  RoutePackage,
  Delivery,
  DeliveryPhoto,
  Return,
  Cancellation,
  AuditLog,
  Cost,
  PackageCost,
  BillingPeriod,
  Invoice,
  InvoiceItem,
  Payment,
  DriverPayout,
  DriverPayment,
  PayoutItem,
  SystemConfig,
  PushSubscription,
  Notification
};

db.sequelize = sequelize;
module.exports = db;