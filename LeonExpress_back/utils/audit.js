// utils/audit.js
const { AuditLog } = require('../models'); // Fix model name to AuditLog
const { v4: uuidv4 } = require('uuid');

async function logAudit(user_id, action, details, options = {}) {
  try {
    let detailsStr;
    if (details === undefined) {
      detailsStr = '';
    } else if (details === null) {
      detailsStr = 'null';
    } else if (typeof details === 'string') {
      detailsStr = details;
    } else {
      try {
        detailsStr = JSON.stringify(details);
      } catch (e) {
        detailsStr = String(details);
      }
    }
    const createOptions = options && options.transaction ? { transaction: options.transaction } : {};
    await AuditLog.create({
      log_id: uuidv4(),
      user_id,
      action,
      details: detailsStr,
      created_at: new Date()
    }, createOptions);
  } catch (error) {
    console.error("Error al registrar auditoría:", error);
    // No interrumpir la operación principal si falla el log
  }
}

module.exports = { logAudit }; // Export as object