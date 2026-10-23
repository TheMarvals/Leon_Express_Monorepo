'use strict';

// Los campos ocultos no son datos del destinatario. Tampoco deben borrar
// información válida obtenida en una consulta anterior.
function clean(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value).trim();
  return !text || /(?:x{3,}|\*{3,})/i.test(text) || /^(null|undefined|comprador(?: ml)?|sin nombre|no disponible)$/i.test(text) ? '' : text;
}
function mergeAddress(previous = {}, incoming = {}) {
  const result = { ...previous };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) result[key] = mergeAddress(previous?.[key] || {}, value);
    else if (clean(value)) result[key] = value;
  }
  return result;
}
function parseAddress(value) {
  if (value && typeof value === 'object') return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return clean(value) ? { address_line: clean(value) } : {}; }
}
function normalizeShipment(data) {
  return {
    ...data,
    receiver_address: data.receiver_address || { ...data.destination?.shipping_address, receiver_name: data.destination?.receiver_name, receiver_phone: data.destination?.receiver_phone },
    logistic_type: data.logistic_type || data.logistic?.type,
  };
}
function contactPayload(data, existing = {}) {
  const address = mergeAddress(mergeAddress({}, parseAddress(existing.buyer_address)), data.receiver_address || {});
  const fields = {
    buyer_name: clean(data.receiver_address?.receiver_name) || clean(existing.buyer_name) || null,
    buyer_phone: clean(data.receiver_address?.receiver_phone) || clean(existing.buyer_phone) || null,
    buyer_address: JSON.stringify(address),
    buyer_city: clean(address.city?.name) || clean(existing.buyer_city) || null,
    buyer_state: clean(address.state?.name) || clean(existing.buyer_state) || null,
    buyer_zip: clean(address.zip_code) || clean(existing.buyer_zip) || null,
  };
  return fields;
}

async function fetchShipmentDetails(account, id, knownOrderId, request) {
  const call = request || require('./mlLiveClient').request;
  const raw = normalizeShipment(await call(account, 'get', `/shipments/${id}`));
  if (String(raw.id) !== String(id)) throw new Error('Mercado Libre devolvió un envío distinto');
  if (raw.sender_id && String(raw.sender_id) !== String(account.ml_user_id)) throw Object.assign(new Error('El envío pertenece a otra cuenta'), { status: 403 });
  let orderId = knownOrderId;
  // Los registros legacy guardaban el shipment ID en ml_order_id.
  if (!orderId || String(orderId) === String(id)) orderId = raw.order_id;
  try {
    if (!orderId || String(orderId) === String(id)) {
      const orders = await call(account, 'get', `/shipments/${id}/orders`, { headers: { 'X-New-Domain': 'true' } });
      orderId = (Array.isArray(orders) ? orders : []).find(o => !o.seller_id || String(o.seller_id) === String(account.ml_user_id))?.order_id;
    }
    if (orderId) {
      const response = await call(account, 'get', `/orders/${orderId}/shipments`, {
        headers: { 'X-New-Domain': 'true', 'X-Api-Version': '2' },
        params: { views: 'origin,destination', list_all: true },
      });
      // Puede haber devoluciones y varios paquetes: nunca usar el primer elemento.
      const detail = (Array.isArray(response) ? response : [response]).find(s => String(s?.id) === String(id) && (!s.type || s.type === 'forward'));
      if (detail && (!detail.sender_id || String(detail.sender_id) === String(account.ml_user_id))) {
        raw.receiver_address = mergeAddress(raw.receiver_address, normalizeShipment(detail).receiver_address);
      }
    }
  } catch (error) {
    // La falta de PII no impide consultar el estado; se reintentará en el próximo ciclo.
    console.warn(`[ML Details] Datos de destinatario pendientes para ${id}: ${error.response?.status || error.code || 'unavailable'}`);
  }
  if (orderId && String(orderId) !== String(id)) raw.order_id = String(orderId);
  return raw;
}
module.exports = { clean, mergeAddress, parseAddress, normalizeShipment, contactPayload, fetchShipmentDetails };
