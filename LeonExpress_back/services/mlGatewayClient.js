'use strict';

const axios = require('axios');

/**
 * URL base del Microservicio ML Gateway.
 * En Docker: http://ml-gateway:4200 (si están en la misma red)
 * En dev: http://localhost:4200
 */
const GATEWAY_URL = process.env.ML_GATEWAY_URL || 'http://localhost:4200';
const API_KEY = process.env.ML_GATEWAY_API_KEY || 'le-ml-gateway-dev-key-2026';
const APP_ID = 'leon-express';

/**
 * Instancia de Axios preconfigurada para el Gateway
 */
const gatewayApi = axios.create({
  baseURL: GATEWAY_URL,
  headers: {
    'X-API-Key': API_KEY,
    'X-App-Id': APP_ID,
    'Content-Type': 'application/json',
  },
});

module.exports = {
  /**
   * Obtiene todas las cuentas vinculadas
   */
  async getAccounts() {
    try {
      const response = await gatewayApi.get('/api/accounts');
      return response.data;
    } catch (error) {
      console.error('[ML Client] Error getAccounts:', error.message);
      throw error;
    }
  },

  /**
   * Genera un link dinámico de vinculación para un cliente
   * @param {string} clientId UUID del client en LeonExpress
   * @param {string} createdByInfo Info de auditoria (ej: 'Admin Eduardo')
   */
  async generateLink(clientId, createdByInfo) {
    try {
      const response = await gatewayApi.post('/api/generate-link', {
        client_id: clientId,
        app_id: APP_ID,
        created_by_info: createdByInfo,
      });
      return response.data; // { token_id, token, url, expires_at }
    } catch (error) {
      console.error('[ML Client] Error generateLink:', error.message);
      throw error;
    }
  },

  /**
   * Cuentas las recíprocamente importables
   */
  async getPendingShipmentsCount(accountId = null) {
    try {
      const params = accountId ? { ml_account_id: accountId } : {};
      const response = await gatewayApi.get('/api/shipments/pending/count', { params });
      return response.data.count || 0;
    } catch (error) {
      console.error('[ML Client] Error getPendingShipmentsCount:', error.message);
      throw error;
    }
  },

  /**
   * Obtiene la lista completa o paginada de envíos a la espera de ser procesados por LE
   */
  async getPendingShipments(params = {}) {
    try {
      const response = await gatewayApi.get('/api/shipments/pending', { params });
      return response.data; // { total, shipments: [] }
    } catch (error) {
      console.error('[ML Client] Error getPendingShipments:', error.message);
      throw error;
    }
  },

  /**
   * Marca en el microservicio el envío como completado para que no se duplique
   */
  async markShipmentAsImported(shipmentId, packageIdRef) {
    try {
      const response = await gatewayApi.post(`/api/shipments/${shipmentId}/mark-imported`, {
        reference_id: packageIdRef,
      });
      return response.data;
    } catch (error) {
      console.error('[ML Client] Error markShipmentAsImported:', error.message);
      throw error;
    }
  },

  /**
   * Fuerza el ciclo de auto-sync de una cuenta (bypass del CronJob)
   */
  async forceSyncNow(accountId) {
    try {
      const response = await gatewayApi.post(`/api/accounts/${accountId}/sync-now`);
      return response.data;
    } catch (error) {
      console.error('[ML Client] Error forceSyncNow:', error.message);
      throw error;
    }
  },

  /**
   * Fuerza el ciclo de auto-sync de todas las cuentas activas (bypass del CronJob)
   */
  async syncAll() {
    try {
      const response = await gatewayApi.post(`/api/accounts/sync-all`);
      return response.data;
    } catch (error) {
      console.error('[ML Client] Error syncAll:', error.message);
      throw error;
    }
  },

  /**
   * Desvincula (soft-delete) una cuenta de ML del gateway
   * @param {string} accountId UUID de la cuenta en ml_accounts
   */
  async deleteAccount(accountId) {
    try {
      const response = await gatewayApi.delete(`/api/accounts/${accountId}`);
      return response.data;
    } catch (error) {
      console.error('[ML Client] Error deleteAccount:', error.message);
      throw error;
    }
  }
};
