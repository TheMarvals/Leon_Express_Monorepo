// api.ts
import axios from 'axios'
import { useLoading } from '@/composables/useLoading'

const { show: showLoading, hide: hideLoading } = useLoading()

// Axios instance
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

// Interceptor para agregar el token de autenticación y mostrar loading
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // Mostrar loading solo para peticiones POST, PUT, PATCH, DELETE (que modifican datos)
    const methodsWithLoading = ['post', 'put', 'patch', 'delete']
    if (methodsWithLoading.includes(config.method?.toLowerCase() || '')) {
      // Determinar mensaje según el método
      let message = 'Procesando...'
      if (config.method?.toLowerCase() === 'post') {
        message = 'Guardando...'
      } else if (config.method?.toLowerCase() === 'delete') {
        message = 'Eliminando...'
      } else if (config.method?.toLowerCase() === 'put' || config.method?.toLowerCase() === 'patch') {
        message = 'Actualizando...'
      }

      showLoading(message)
    }

    // --- INICIO DE LA DEPURACIÓN ---
    console.log(`➡️ Enviando petición: ${config.method?.toUpperCase()} a ${config.url}`)
    if (['post', 'put', 'patch'].includes(config.method?.toLowerCase() || '')) {
      console.log('📦 Payload enviado:', JSON.stringify(config.data, null, 2))
    }
    // --- FIN DE LA DEPURACIÓN ---

    return config
  },
  (error) => {
    hideLoading()
    return Promise.reject(error)
  },
)

// Interceptor para manejo de errores y ocultar loading
axiosInstance.interceptors.response.use(
  (response) => {
    // Ocultar loading para peticiones que modifican datos
    const methodsWithLoading = ['post', 'put', 'patch', 'delete']
    if (methodsWithLoading.includes(response.config.method?.toLowerCase() || '')) {
      hideLoading()
    }
    return response
  },
  (error) => {
    console.error('❌ Error en la API:', error.response?.data || error.message)
    hideLoading() // Asegurar que se oculte el loading en caso de error
    return Promise.reject(error)
  },
)

// Tipos
type ApiListParams = {
  page?: number
  perPage?: number
  pageSize?: number // Backend usa pageSize
  sortBy?: string
  sortOrder?: string
  search?: string
  isActive?: boolean
  status?: string
  pickupStatus?: string
  userId?: string
  isChange?: boolean
  changeReceived?: boolean
}

const mapParams = (params: ApiListParams) => {
  const mapped = { ...params }
  if (mapped.perPage && !mapped.pageSize) {
    mapped.pageSize = mapped.perPage
    delete mapped.perPage
  }
  return mapped
}

// API methods
const api = {
  // --- Métodos de Push Notifications ---
  pushSubscribe: (subscription: any) => axiosInstance.post('/push/subscribe', subscription),
  // --- Métodos de Auditoría ---
  getAuditLog: () => axiosInstance.get('/audit-log'),
  // --- Métodos de Usuario ---
  allUsers: (params: ApiListParams) => {
    return axiosInstance.get('/users', { params: mapParams(params) })
  },
  createUser: (data: any) => axiosInstance.post('/users', data),
  updateUser: (id: string, data: any) => axiosInstance.put(`/users/${id}`, data),
  deleteUser: (id: string) => axiosInstance.delete(`/users/${id}`),
  reactivateUser: (id: string) => axiosInstance.patch(`/users/${id}/activate`),

  login: (credentials: { username: string; password: string }) => axiosInstance.post('/auth/login', credentials),
  getMe: () => axiosInstance.get('/auth/me'),
  changePassword: (data: { currentPassword: string; newPassword: string; confirmNewPassword: string }) =>
    axiosInstance.patch('/auth/password', data),

  // --- Métodos de Roles y Almacenes ---
  getRoles: () => axiosInstance.get('/users/roles'),
  getWarehouses: () => axiosInstance.get('/warehouses'),

  // --- Métodos de Vehículo ---
  getVehicles: (params: ApiListParams) => {
    return axiosInstance.get('/vehicles', { params: mapParams(params) })
  },
  createVehicle: (data: any) => axiosInstance.post('/vehicles', data),
  updateVehicle: (id: string, data: any) => axiosInstance.put(`/vehicles/${id}`, data),
  deleteVehicle: (id: string) => axiosInstance.delete(`/vehicles/${id}`),

  // --- Métodos de Tipos de Vehículo ---
  getVehicleTypes: (params: ApiListParams) => axiosInstance.get('/vehicle-types', { params: mapParams(params) }),
  createVehicleType: (data: any) => axiosInstance.post('/vehicle-types', data),
  updateVehicleType: (id: string, data: any) => axiosInstance.put(`/vehicle-types/${id}`, data),
  removeVehicleType: (id: string) => axiosInstance.delete(`/vehicle-types/${id}`),

  // --- Métodos de Pickups ---
  getPickups: (params: ApiListParams) => axiosInstance.get('/pickups', { params: mapParams(params) }),
  createPickup: (data: any) => axiosInstance.post('/pickups', data),
  updatePickup: (id: string, data: any) => axiosInstance.put(`/pickups/${id}`, data),
  getPickupById: (id: string) => axiosInstance.get(`/pickups/${id}`),
  updatePickupStatus: (id: string, status: string) => axiosInstance.patch(`/pickups/${id}/status`, { status }),
  deletePickup: (id: string) => axiosInstance.delete(`/pickups/${id}`),

  // --- Métodos de client ---
  getClientById: (id: string) => axiosInstance.get(`/clients/${id}`),
  getClients: (params: ApiListParams) => {
    return axiosInstance.get('/clients', { params: mapParams(params) })
  },
  createClient: (data: any) => axiosInstance.post('/clients', data),
  updateClient: (id: string, data: any) => axiosInstance.put(`/clients/${id}`, data),
  deleteClient: (id: string) => axiosInstance.delete(`/clients/${id}`),
  getClientPricing: (clientId: string) => axiosInstance.get(`/clients/${clientId}/pricing`),
  getClientPricingHistory: (clientId: string) => axiosInstance.get(`/clients/${clientId}/pricing/history`),
  createClientPricing: (clientId: string, data: any) => axiosInstance.post(`/clients/${clientId}/pricing`, data),
  updateClientPricing: (clientId: string, pricingId: string, data: any) =>
    axiosInstance.put(`/clients/${clientId}/pricing/${pricingId}`, data),
  verifyClientCode: (payload: { verification_code: string; client_id: string }) =>
    axiosInstance.post('/clients/verify', payload),

  // --- Metodos Packages ----
  getPackages: (params: ApiListParams) => axiosInstance.get('/packages', { params: mapParams(params) }),
  getPackageById: (id: string) =>
    axiosInstance.get(`/packages/${id}`, {
      params: {
        include: ['client_id', 'client_price', 'delivery_cost'],
      },
    }),
  createPackage: (data: any) => axiosInstance.post('/packages', data),
  updatePackage: (id: string, data: any) => axiosInstance.put(`/packages/${id}`, data),
  updatePackageTracking: (id: string, externalTrackingCode: string) =>
    axiosInstance.patch(`/packages/${id}/tracking`, { external_tracking_code: externalTrackingCode }),
  deletePackage: (id: string) => axiosInstance.delete(`/packages/${id}`),
  postOcr: (imageBase64: string) => axiosInstance.post('/ocr', { image: imageBase64 }),

  // ---- Metodos routes ----
  getRoutes: (params: ApiListParams) => axiosInstance.get('/routes', { params: mapParams(params) }),
  getRouteById: (id: string) => axiosInstance.get(`/routes/${id}`),
  createRoute: (data: any) => axiosInstance.post('/routes', data),
  updateRoute: (id: string, data: any) => axiosInstance.put(`/routes/${id}`, data),
  deleteRoute: (id: string) => axiosInstance.delete(`/routes/${id}`),
  assignPackagesToRoute: (routeId: string, packageIds: string[]) =>
    axiosInstance.post(`/routes/${routeId}/packages`, { package_ids: packageIds }),
  removePackageFromRoute: (routeId: string, packageId: string) =>
    axiosInstance.delete(`/routes/${routeId}/packages/${packageId}`),
  updateRouteStatus: (routeId: string, status: string) => axiosInstance.put(`/routes/${routeId}/status`, { status }),
  scanPackageToRoute: (routeId: string, imageBase64: string | null, externalTrackingCode?: string) => {
    const payload: any = {}
    if (imageBase64) {
      payload.image = imageBase64
    }
    if (externalTrackingCode) {
      payload.external_tracking_code = externalTrackingCode
    }
    return axiosInstance.post(`/routes/${routeId}/scan-package`, payload)
  },
  finishRouteLoading: (routeId: string) => axiosInstance.post(`/routes/${routeId}/finish-loading`),
  approveRouteLoading: (routeId: string, expectedCount?: number) =>
    axiosInstance.post(`/routes/${routeId}/approve-loading`, { expected_count: expectedCount }),

  // ---- Métodos de Entregas (Events) ----
  getDeliveries: (params: any) => axiosInstance.get('/events', { params }),
  createDelivery: (packageId: string, formData: FormData) =>
    axiosInstance.post(`/events/packages/${packageId}/deliveries`, formData),
  uploadDeliveryPhoto: (deliveryId: string, photoFile: File) => {
    const formData = new FormData()
    formData.append('delivery_photo', photoFile)
    return axiosInstance.post(`/events/deliveries/${deliveryId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  // --- Métodos de Liquidaciones (Payouts) ---
  getDriverPayouts: (params: any) => axiosInstance.get('/driver-payouts', { params }),
  getPayoutById: (id: string) => axiosInstance.get(`/payouts/${id}`),
  updatePayoutStatus: (id: string, status: string) => axiosInstance.put(`/payouts/${id}/status`, { status }),
  registerDriverPayment: (id: string, data: any) => axiosInstance.post(`/payouts/${id}/payments`, data),

  // --- Métodos de Facturación a Clientes (Invoices) ---

  getInvoiceById: (id: string) => axiosInstance.get(`/invoices/${id}`),
  getClientInvoices(params: any) {
    return axiosInstance.get('/invoices', { params })
  },

  updateInvoiceStatus(invoiceId: string, status: string) {
    return axiosInstance.patch(`/invoices/${invoiceId}/status`, { status })
  },

  registerInvoicePayment(invoiceId: string, data: any) {
    return axiosInstance.post(`/invoices/${invoiceId}/payments`, data)
  },

  getPackageByTrackingCode: (trackingCode: string) => axiosInstance.get(`/packages/by-code/${trackingCode}`),

  verifyPackage: (packageId: string, data: any) => axiosInstance.put(`/packages/${packageId}/verify`, data),

  // --- Métodos de Paquetes ---
  getDeliveredPackages: (params: ApiListParams) =>
    axiosInstance.get('/packages/delivered', { params: mapParams(params) }),
  getDriverSummary: (params: any) => axiosInstance.get('/driver/summary', { params }),

  // --- Métodos de Notificaciones ---
  getNotifications: (params: { limit?: number } = {}) => axiosInstance.get('/notifications', { params }),
  markAllNotificationsAsRead: () => axiosInstance.post('/notifications/mark-all-as-read', {}),
  markNotificationAsRead: (notificationId: string) =>
    axiosInstance.post(`/notifications/${notificationId}/mark-as-read`, {}),
  postOcrBatch(images: string[]) {
    return axiosInstance.post('/ocr/batch', { images })
  },

  // Nuevo flujo: Subir fotos para procesamiento diferido
  uploadBatchPhotos(images: string[], pickupId: string, metadata?: any) {
    return axiosInstance.post('/batch-photos/upload', {
      images,
      pickup_id: pickupId,
      metadata,
    })
  },

  // Consultar estado del procesamiento
  getBatchPhotoStatus(batchId: string) {
    return axiosInstance.get(`/batch-photos/${batchId}/status`)
  },

  // --- Métodos de Administración Financiera (Billing) ---
  getBillingDiagnostics() {
    return axiosInstance.get('/billing/diagnostics')
  },
  initializeBillingPeriod() {
    return axiosInstance.post('/billing/initialize-period', {})
  },
  getBillingStatus() {
    return axiosInstance.get('/billing/status')
  },

  getBillingPeriods(limit?: number, status?: string) {
    const params: any = {}
    if (limit) params.limit = limit
    if (status) params.status = status
    return axiosInstance.get('/billing/periods', { params })
  },

  getBillingPeriod(periodId: string) {
    return axiosInstance.get(`/billing/period/${periodId}`)
  },

  closeBillingPeriod() {
    return axiosInstance.post('/billing/close-period', {})
  },

  generateInvoices(startDate: string, endDate: string) {
    return axiosInstance.post('/billing/generate-invoices', { startDate, endDate })
  },

  generatePayouts(startDate: string, endDate: string) {
    return axiosInstance.post('/billing/generate-payouts', { startDate, endDate })
  },

  getBillingAuditLog(limit?: number) {
    const params: any = {}
    if (limit) params.limit = limit
    return axiosInstance.get('/billing/audit-log', { params })
  },

  // --- Métodos de Smart Batch OCR ---
  uploadSmartBatch(data: {
    pickup_id: string
    images: string[]
    client_price?: number
    delivery_cost?: number
    metadata?: any
  }) {
    return axiosInstance.post('/smart-batch/upload', data, {
      timeout: 60000, // 60 segundos de timeout para evitar que se cuelgue en la red
    })
  },

  getSmartBatchStatus(batchId: string) {
    return axiosInstance.get(`/smart-batch/${batchId}/status`)
  },

  getSmartBatchStats() {
    return axiosInstance.get('/smart-batch/stats')
  },

  // --- Métodos de OCR Review ---
  getOcrReviewPending(params?: { page?: number; pageSize?: number; type?: 'all' | 'duplicates' | 'low_confidence' }) {
    return axiosInstance.get('/ocr-review/pending', { params })
  },

  getOcrReviewStats() {
    return axiosInstance.get('/ocr-review/stats')
  },

  getOcrReviewGrouped(params?: { include_duplicates?: boolean }) {
    return axiosInstance.get('/ocr-review/grouped', { params })
  },

  approveOcrPackage(queueId: string, correctedData: any, notes?: string) {
    return axiosInstance.post(`/ocr-review/${queueId}/approve`, { corrected_data: correctedData, notes })
  },

  rejectOcrPackage(queueId: string, reason: string) {
    return axiosInstance.post(`/ocr-review/${queueId}/reject`, { reason })
  },

  getOcrPendingDuplicates() {
    return axiosInstance.get('/ocr-review/pending', { params: { type: 'duplicates' } })
  },

  resolveOcrDuplicate: (queueId: string, action: 'create' | 'return' | 'discard', notes?: string) => {
    return axiosInstance.post('/ocr-duplicate/confirm', {
      queue_id: queueId,
      action,
      notes,
    })
  },

  getOcrReviewHistory: (params?: { search?: string; limit?: number }) => {
    return axiosInstance.get('/ocr-review/history', { params })
  },

  // --- Métodos de Gestión de Cambios ---
  markChangeReceived(packageId: string, notes?: string) {
    return axiosInstance.put(`/change-management/${packageId}/mark-change-received`, { notes })
  },

  getPendingChanges() {
    return axiosInstance.get('/change-management/pending-changes')
  },

  receivePackageAtWarehouse: (packageId: string) => axiosInstance.put(`/packages/${packageId}/receive-at-warehouse`),
  loadMyPendingPackages: (routeId: string) => axiosInstance.post(`/routes/${routeId}/load-my-pending-packages`),
}

export { axiosInstance }
export default api
