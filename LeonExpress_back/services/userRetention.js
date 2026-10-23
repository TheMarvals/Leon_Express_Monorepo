'use strict';
const { Op, QueryTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const { User, AuditLog, sequelize } = require('../models');

function inactivityCutoff(now = new Date()) {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDay));
  return cutoff;
}
const quote = identifier => '`' + identifier.replace(/`/g, '``') + '`';

async function userReferences() {
  // Include real FKs and legacy actor columns that do not declare a foreign key.
  return sequelize.query(`SELECT DISTINCT c.TABLE_NAME AS table_name, c.COLUMN_NAME AS column_name,
      CASE WHEN k.REFERENCED_TABLE_NAME='users' THEN k.REFERENCED_COLUMN_NAME ELSE 'user_id' END AS reference_key
    FROM information_schema.COLUMNS c
    LEFT JOIN information_schema.KEY_COLUMN_USAGE k
      ON k.TABLE_SCHEMA=c.TABLE_SCHEMA AND k.TABLE_NAME=c.TABLE_NAME AND k.COLUMN_NAME=c.COLUMN_NAME
    WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME <> 'users'
      AND ((k.REFERENCED_TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME='users')
        OR c.COLUMN_NAME='user_id' OR RIGHT(c.COLUMN_NAME, 8)='_user_id'
        OR c.COLUMN_NAME IN ('created_by','approved_by','reviewed_by','corrected_by','change_received_by'))`,
    { type: QueryTypes.SELECT });
}
async function hasHistory(user, references, transaction) {
  // Keep portal identities: deleting one could let OTP provisioning recreate a deactivated access.
  if (user.client_id) return true;
  if (await AuditLog.findOne({ where: { action: 'ARCHIVE_INACTIVE_USER', target_table: 'users', target_id: user.user_id }, transaction })) return true;
  for (const reference of references) {
    const rows = await sequelize.query(`SELECT 1 FROM ${quote(reference.table_name)} WHERE ${quote(reference.column_name)}=:userId LIMIT 1`, {
      replacements: { userId: user[reference.reference_key || 'user_id'] }, transaction, type: QueryTypes.SELECT,
    });
    if (rows.length) return true;
  }
  return false;
}
async function runUserRetention({ now = new Date(), batchSize = 100, dryRun = false } = {}) {
  const cutoff = inactivityCutoff(now);
  const references = await userReferences();
  const result = { deleted: 0, archived: 0, skipped: 0 };
  let cursor = '';
  for (;;) {
    const users = await User.findAll({
      where: { user_id: { [Op.gt]: cursor }, is_active: false, archived_at: null, deactivated_at: { [Op.lte]: cutoff } },
      attributes: ['user_id'], order: [['user_id', 'ASC']], limit: batchSize,
    });
    if (!users.length) break;
    for (const candidate of users) {
      await sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
        const user = await User.findByPk(candidate.user_id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user || user.is_active || user.archived_at || !user.deactivated_at || Number.isNaN(new Date(user.deactivated_at).getTime()) || new Date(user.deactivated_at) > cutoff) {
          result.skipped++; return;
        }
        const archive = await hasHistory(user, references, transaction);
        if (!dryRun) {
          if (archive) await user.update({ archived_at: now }, { transaction });
          else await user.destroy({ transaction });
          await AuditLog.create({
            log_id: uuidv4(), user_id: null, target_table: 'users', target_id: user.user_id,
            action: archive ? 'ARCHIVE_INACTIVE_USER' : 'PURGE_INACTIVE_USER',
            details: JSON.stringify({ user_id: user.user_id, deactivated_at: user.deactivated_at, retention_months: 3 }),
          }, { transaction });
        }
        result[archive ? 'archived' : 'deleted']++;
      });
    }
    cursor = users[users.length - 1].user_id;
  }
  return result;
}
let task;
let running = false;
function startUserRetention() {
  if (task) return task;
  task = cron.schedule('15 4 * * *', async () => {
    if (running) return;
    running = true;
    try { console.log('[USER RETENTION]', await runUserRetention()); }
    catch (error) { console.error('[USER RETENTION] No se pudo completar la limpieza:', error.message); }
    finally { running = false; }
  }, { timezone: 'America/Santiago' });
  return task;
}
module.exports = { runUserRetention, startUserRetention, inactivityCutoff };
