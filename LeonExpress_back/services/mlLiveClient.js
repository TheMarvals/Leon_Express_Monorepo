'use strict';

const axios = require('axios');
const gateway = require('./mlGatewayClient');
const tokens = new Map();
const pending = new Map();

async function token(account, rejectedToken) {
  const id = String(account.ml_account_id);
  const cached = tokens.get(id);
  if (!rejectedToken && cached && cached.until > Date.now()) return cached.value;
  if (pending.has(id)) return pending.get(id);
  const promise = gateway.getAccountToken(id, rejectedToken).then(data => {
    if (String(data.ml_user_id) !== String(account.ml_user_id) || !data.access_token) {
      throw new Error('La autorización de Mercado Libre no corresponde a la cuenta');
    }
    tokens.set(id, { value: data.access_token, until: Math.min(Date.now() + 60000, new Date(data.expires_at).getTime() - 60000) });
    return data.access_token;
  }).finally(() => pending.delete(id));
  pending.set(id, promise);
  return promise;
}

async function request(account, method, path, options = {}) {
  if (method !== 'get' || !/^\/(orders|shipments)(\/|$)/.test(path) || path.includes('..')) {
    throw new Error('Recurso de Mercado Libre no permitido');
  }
  let authorization = await token(account);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await axios({
        ...options, method: 'get', url: `https://api.mercadolibre.com${path}`, timeout: 12000, maxRedirects: 0,
        headers: { ...options.headers, Authorization: `Bearer ${authorization}` },
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 && attempt === 0) {
        authorization = await token(account, authorization);
        continue;
      }
      if (status === 429 && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      // No propagar el Axios config: contiene el token de autorización.
      throw Object.assign(new Error(`No fue posible consultar Mercado Libre (${status || 'sin respuesta'})`), {
        status: status === 404 ? 404 : 502, response: { status }, code: 'ML_UNAVAILABLE',
      });
    }
  }
}

module.exports = { request };
