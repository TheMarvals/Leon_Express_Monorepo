const { sequelize, Pickup } = require('../models');

// Serialize package creation for a collection across requests, OCR workers and server processes.
// The pickup row exists even when no package has been created yet.
async function withPickupPackageLock(pickupId, callback) {
  return sequelize.transaction(async (transaction) => {
    const pickup = await Pickup.findByPk(pickupId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!pickup) {
      const error = new Error('Recolección no encontrada.');
      error.status = 404;
      throw error;
    }
    return callback(pickup, transaction);
  });
}

module.exports = { withPickupPackageLock };
