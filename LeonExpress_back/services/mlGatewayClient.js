'use strict';

const axios = require('axios');

/**
 * URL base del Microservicio ML Gateway.
 * Dominio canónico compartido con LeónImport y el servicio de vinculación.
 * ML_GATEWAY_URL permite indicar una instancia local para desarrollo.
 */
const GATEWAY_URL = process.env.ML_GATEWAY_URL || 'https://gateway.leonexpress.cl';
const API_KEY = process.env.ML_GATEWAY_API_KEY || 'le-ml-gateway-dev-key-2026';
const APP_ID = 'leon-express';

/**
 * Instancia de Axios preconfigurada para el Gateway
 */
const gatewayApi = axios.create({
  baseURL: GATEWAY_URL,
  timeout: 30000,
  headers: {
    'X-API-Key': API_KEY,
    'X-App-Id': APP_ID,
    'Content-Type': 'application/json',
  },
});

module.exports = {
  async getAccountToken(accountId, rejectedToken) {
    const path = `/api/accounts/${encodeURIComponent(accountId)}/token`;
    const response = rejectedToken
      ? await gatewayApi.post(`${path}/refresh`, { rejected_token: rejectedToken })
      : await gatewayApi.get(path);
    return response.data;
  },
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
      // El gateway envuelve el enlace en { message, link: { url, ... } }.
      const link = response.data?.link ?? response.data;
      const url = link?.url;
      if (typeof url !== 'string' || !['http:', 'https:'].includes(new URL(url).protocol)) {
        throw new Error('El gateway no devolvió una URL de vinculación válida');
      }
      return { ...link, url }; // { token_id, token, url, expires_at }
    } catch (error) {
      console.error('[ML Client] Error generateLink:', error.message);
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
