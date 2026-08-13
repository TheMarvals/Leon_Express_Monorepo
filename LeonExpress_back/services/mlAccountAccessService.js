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

  const limit = Math.max(1, Math.min(Number(params.limit) || 50, 200));
  const offset = Math.max(0, Number(params.offset) || 0);
  const requiredPerAccount = offset + limit;
  const baseParams = { ...params };
  delete baseParams.ml_account_id;
  delete baseParams.limit;
  delete baseParams.offset;

  const responses = await Promise.all(selected.map(async account => {
    const shipments = [];
    let accountOffset = 0;
    let total = 0;
    do {
      const response = await mlGatewayClient.getPendingShipments({
        ...baseParams,
        ml_account_id: account.ml_account_id,
        limit: Math.min(200, requiredPerAccount - shipments.length),
        offset: accountOffset,
      });
      total = Number(response.total || 0);
      const page = response.shipments || [];
      shipments.push(...page);
      accountOffset += page.length;
      if (page.length === 0) break;
    } while (shipments.length < Math.min(requiredPerAccount, total));
    return { total, shipments };
  }));
  const total = responses.reduce((sum, response) => sum + Number(response.total || 0), 0);
  const shipments = responses
    .flatMap(response => response.shipments || [])
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(offset, offset + limit);
  return { total, shipments };
}

async function getPendingCount(accountId) {
  const accounts = accountId ? [await assertAccessible(accountId)] : await getAccounts();
  const counts = await Promise.all(accounts.map(account =>
    mlGatewayClient.getPendingShipmentsCount(account.ml_account_id),
  ));
  return counts.reduce((sum, count) => sum + Number(count || 0), 0);
}

async function syncAccessibleAccounts() {
  const accounts = await getAccounts();
  await Promise.all(accounts.map(account => mlGatewayClient.forceSyncNow(account.ml_account_id)));
  return { message: `Sincronización iniciada para ${accounts.length} cuenta(s) de Leon Express.` };
}

module.exports = {
  getAccounts,
  getAvailableAccounts,
  linkAccount,
  excludeAccount,
  assertAccessible,
  getPendingShipments,
  getPendingCount,
  syncAccessibleAccounts,
};
