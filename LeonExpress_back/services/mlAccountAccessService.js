'use strict';

const { Client, SystemConfig } = require('../models');
const mlGatewayClient = require('./mlGatewayClient');

const EXCLUSIONS_KEY = 'mercadolibre_excluded_account_ids';
const LINKS_KEY = 'mercadolibre_account_links';

async function readJsonConfig(key, fallback) {
  const row = await SystemConfig.findByPk(key);
  if (!row) return fallback;
  try { return JSON.parse(row.config_value); } catch { return fallback; }
}

async function getExcludedIds() {
  const value = await readJsonConfig(EXCLUSIONS_KEY, []);
  return new Set(Array.isArray(value) ? value.map(String) : []);
}

async function getAccounts() {
  const [gatewayData, clients, excluded, manualLinks] = await Promise.all([
    mlGatewayClient.getAccounts(),
    Client.findAll({ where: { is_active: true }, attributes: ['client_id'], raw: true }),
    getExcludedIds(),
    readJsonConfig(LINKS_KEY, {}),
  ]);
  const clientIds = new Set(clients.map(client => String(client.client_id)));
  return (gatewayData.accounts || []).flatMap(account => {
    const accountId = String(account.ml_account_id);
    const clientId = manualLinks[accountId] || account.client_id;
    if (!clientIds.has(String(clientId)) || excluded.has(accountId)) return [];
    return [{ ...account, client_id: clientId }];
  });
}

async function getAvailableAccounts() {
  const [gatewayData, linked] = await Promise.all([mlGatewayClient.getAccounts(), getAccounts()]);
  const linkedIds = new Set(linked.map(account => String(account.ml_account_id)));
  return (gatewayData.accounts || []).filter(account => !linkedIds.has(String(account.ml_account_id)));
}

async function linkAccount(accountId, clientId) {
  const [client, gatewayData, manualLinks, excluded] = await Promise.all([
    Client.findOne({ where: { client_id: clientId, is_active: true } }),
    mlGatewayClient.getAccounts(),
    readJsonConfig(LINKS_KEY, {}),
    getExcludedIds(),
  ]);
  if (!client) throw new Error('El cliente de Leon Express no existe o está inactivo');
  const account = (gatewayData.accounts || []).find(item => String(item.ml_account_id) === String(accountId));
  if (!account) throw new Error('La cuenta no existe o no está activa en el gateway');
  manualLinks[String(accountId)] = String(clientId);
  excluded.delete(String(accountId));
  await Promise.all([
    SystemConfig.upsert({ config_key: LINKS_KEY, config_value: JSON.stringify(manualLinks), description: 'Vinculaciones locales de cuentas ML en Leon Express' }),
    SystemConfig.upsert({ config_key: EXCLUSIONS_KEY, config_value: JSON.stringify([...excluded]), description: 'Cuentas del gateway ocultas únicamente en Leon Express' }),
  ]);
  return { ...account, client_id: String(clientId) };
}

async function excludeAccount(accountId) {
  const excluded = await getExcludedIds();
  excluded.add(String(accountId));
  await SystemConfig.upsert({
    config_key: EXCLUSIONS_KEY,
    config_value: JSON.stringify([...excluded]),
    description: 'Cuentas del gateway ocultas únicamente en Leon Express',
  });
}

async function assertAccessible(accountId) {
  const accounts = await getAccounts();
  const account = accounts.find(item => String(item.ml_account_id) === String(accountId));
  if (!account) {
    const error = new Error('La cuenta no está vinculada a Leon Express');
    error.status = 403;
    throw error;
  }
  return account;
}

async function getPendingShipments(params = {}) {
  const accounts = await getAccounts();
  const requestedId = params.ml_account_id ? String(params.ml_account_id) : null;
  const selected = requestedId
    ? accounts.filter(account => String(account.ml_account_id) === requestedId)
    : accounts;
  if (requestedId && selected.length === 0) await assertAccessible(requestedId);
  if (selected.length === 0) return { total: 0, shipments: [] };

  return require('./mlLiveShipments').getPendingShipments(selected, params);
}

async function getPendingCount(accountId) {
  const data = await getPendingShipments(accountId ? { ml_account_id: accountId, limit: 1 } : { limit: 1 });
  return { count: data.total, complete: data.complete, refreshing: data.refreshing, errors: data.errors };
}

async function refreshAccount(accountId) {
  const account = await assertAccessible(accountId);
  return require('./mlLiveShipments').refresh(account);
}

async function syncAccessibleAccounts() {
  const accounts = await getAccounts();
  for (const account of accounts) require('./mlLiveShipments').refresh(account);
  return { message: `Consulta directa iniciada para ${accounts.length} cuenta(s).` };
}

module.exports = {
  getAccounts,
  getAvailableAccounts,
  linkAccount,
  excludeAccount,
  assertAccessible,
  getPendingShipments,
  getPendingCount,
  refreshAccount,
  syncAccessibleAccounts,
};
