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

async function migrateAccount(accountId, targetClientId, options = {}) {
  const { migratePackages = true, migrateAllFromSource = false } = options;
  const { Client, Package, Pickup, MlImport, sequelize } = require('../models');
  const { Op } = require('sequelize');

  const [targetClient, gatewayData, manualLinks, excluded] = await Promise.all([
    Client.findOne({ where: { client_id: targetClientId, is_active: true } }),
    mlGatewayClient.getAccounts(),
    readJsonConfig(LINKS_KEY, {}),
    getExcludedIds(),
  ]);

  if (!targetClient) {
    const error = new Error('El cliente destino no existe o está inactivo.');
    error.status = 404;
    throw error;
  }

  const account = (gatewayData.accounts || []).find(item => String(item.ml_account_id) === String(accountId));
  if (!account) {
    const error = new Error('La cuenta de Mercado Libre no existe o no está registrada en el gateway.');
    error.status = 404;
    throw error;
  }

  const currentClientId = manualLinks[String(accountId)] || account.client_id;
  if (String(currentClientId) === String(targetClientId)) {
    const error = new Error('La cuenta ya pertenece al cliente seleccionado.');
    error.status = 400;
    throw error;
  }

  const t = await sequelize.transaction();
  let migratedPackagesCount = 0;
  let migratedPickupsCount = 0;

  try {
    // 1. Reasignar cuenta localmente
    manualLinks[String(accountId)] = String(targetClientId);
    excluded.delete(String(accountId));

    await Promise.all([
      SystemConfig.upsert({
        config_key: LINKS_KEY,
        config_value: JSON.stringify(manualLinks),
        description: 'Vinculaciones locales de cuentas ML en Leon Express',
      }, { transaction: t }),
      SystemConfig.upsert({
        config_key: EXCLUSIONS_KEY,
        config_value: JSON.stringify([...excluded]),
        description: 'Cuentas del gateway ocultas únicamente en Leon Express',
      }, { transaction: t }),
    ]);

    // 2. Si se solicitó migrar paquetes
    if (migratePackages || migrateAllFromSource) {
      let packageCondition = null;
      if (migrateAllFromSource && currentClientId) {
        packageCondition = { client_id: String(currentClientId) };
      } else {
        const mlImports = await MlImport.findAll({
          where: { ml_account_id: String(accountId) },
          attributes: ['package_id'],
          transaction: t,
          raw: true,
        });
        const packageIds = mlImports.map(r => r.package_id).filter(Boolean);
        if (packageIds.length > 0) {
          packageCondition = { package_id: { [Op.in]: packageIds } };
        }
      }

      if (packageCondition) {
        const [updatedCount] = await Package.update(
          { client_id: String(targetClientId) },
          { where: packageCondition, transaction: t }
        );
        migratedPackagesCount = updatedCount;

        // Actualizar colectas asociadas
        if (migrateAllFromSource && currentClientId) {
          const [pUpdated] = await Pickup.update(
            { client_id: String(targetClientId) },
            { where: { client_id: String(currentClientId) }, transaction: t }
          );
          migratedPickupsCount = pUpdated;
        } else {
          const pkgs = await Package.findAll({
            where: packageCondition,
            attributes: ['pickup_id'],
            transaction: t,
            raw: true,
          });
          const pickupIds = [...new Set(pkgs.map(p => p.pickup_id).filter(Boolean))];
          if (pickupIds.length > 0 && currentClientId) {
            const [pUpdated] = await Pickup.update(
              { client_id: String(targetClientId) },
              {
                where: {
                  pickup_id: { [Op.in]: pickupIds },
                  client_id: String(currentClientId),
                },
                transaction: t,
              }
            );
            migratedPickupsCount = pUpdated;
          }
        }
      }
    }

    await t.commit();

    try {
      require('./mlLiveShipments').invalidate(accountId);
    } catch (e) {
      // Ignorar si el cache no estaba inicializado
    }

    return {
      success: true,
      account: { ...account, client_id: String(targetClientId) },
      from_client_id: String(currentClientId),
      to_client_id: String(targetClientId),
      migrated_packages_count: migratedPackagesCount,
      migrated_pickups_count: migratedPickupsCount,
    };
  } catch (err) {
    if (t) await t.rollback();
    throw err;
  }
}

module.exports = {
  getAccounts,
  getAvailableAccounts,
  linkAccount,
  migrateAccount,
  excludeAccount,
  assertAccessible,
  getPendingShipments,
  getPendingCount,
  refreshAccount,
  syncAccessibleAccounts,
};
