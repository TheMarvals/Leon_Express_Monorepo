import { axiosInstance as apiClient } from './api'

export interface MlAccount {
  ml_account_id: string
  client_id: string
  ml_nickname: string
  is_active: boolean
  sync_enabled: boolean
  last_sync_at: string | null
  sync_errors: number
}

export interface MlPendingShipment {
  ml_shipment_id: string
  ml_account_id: string
  ml_shipment_external_id: number
  buyer_name: string
  buyer_phone: string
  buyer_city: string
  buyer_address: string
  account?: MlAccount
  imported_to_le: boolean
  created_at: string
}

const mercadolibreService = {
  /**
   * Obtiene la lista de cuentas de ML vinculadas.
   */
  async getAccounts(): Promise<MlAccount[]> {
    const response = await apiClient.get('/mercadolibre/accounts')
    return response.data.accounts || response.data
  },

  /**
   * Obtiene los envíos pendientes del Gateway con soporte para paginación y búsqueda.
   */
  async getPendingShipments(params?: {
    ml_account_id?: string
    limit?: number
    offset?: number
    search?: string
  }): Promise<{ total: number; shipments: MlPendingShipment[] }> {
    const response = await apiClient.get('/mercadolibre/shipments/pending', { params })
    // Normalise: el gateway devuelve { total, shipments }
    if (Array.isArray(response.data)) {
      return { total: response.data.length, shipments: response.data }
    }
    return {
      total: response.data.total ?? response.data.shipments?.length ?? 0,
      shipments: response.data.shipments ?? response.data,
    }
  },

  /**
   * Obtiene la cantidad de envíos pendientes (para badges).
   */
  async getPendingCount(mlAccountId?: string): Promise<number> {
    const params = mlAccountId ? { ml_account_id: mlAccountId } : {}
    const response = await apiClient.get('/mercadolibre/shipments/pending/count', { params })
    return response.data.count
  },

  /**
   * Importa envíos desde el Gateway asignándolos a un Pickup existente de Leon Express.
   * @param shipmentIds Array de UUIDs de los shipments que se quieren importar.
   * @param targetPickupId UUID del Pickup al cual adjuntarlos.
   */
  async importShipments(shipmentIds: string[], targetPickupId: string): Promise<any> {
    const payload = {
      shipment_ids: shipmentIds,
      target_pickup_id: targetPickupId,
    }
    const response = await apiClient.post('/mercadolibre/shipments/import', payload)
    return response.data
  },

  /**
   * Genera un enlace de vinculación seguro para enviárselo a un cliente nuevo.
   */
  async generateLink(clientId: string): Promise<{ link: string }> {
    const response = await apiClient.post(`/mercadolibre/generate-link/${clientId}`)
    return response.data
  },

  /**
   * Fuerza una sincronización manual con MercadoLibre a través del Gateway
   */
  async forceSync(): Promise<any> {
    const response = await apiClient.post('/mercadolibre/sync')
    return response.data
  },

  /**
   * Fuerza una sincronización manual de una cuenta específica
   */
  async forceSyncAccount(accountId: string): Promise<any> {
    const response = await apiClient.post(`/mercadolibre/accounts/${accountId}/sync`)
    return response.data
  },

  /**
   * Desvincula (soft-delete) una cuenta de ML del gateway
   */
  async deleteAccount(accountId: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/mercadolibre/accounts/${accountId}`)
    return response.data
  },
}

export default mercadolibreService
