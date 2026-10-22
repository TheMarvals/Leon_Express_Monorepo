'use strict';

const { Op } = require('sequelize');
const { Client, User, ClientOtp } = require('../models');

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

// The caller holds the client row lock and commits all profile changes together.
async function syncClientEmail(client, value, transaction) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) fail(400, 'El cliente debe tener un correo de acceso válido.');

  const users = await User.findAll({
    where: { client_id: client.client_id }, transaction, lock: transaction.LOCK.UPDATE,
  });
  if (users.length > 1) {
    fail(409, 'El cliente tiene varios usuarios asociados. Revisa sus accesos antes de cambiar el correo.');
  }
  const [otherClient, otherUser] = await Promise.all([
    Client.findOne({ where: { email, client_id: { [Op.ne]: client.client_id } }, transaction }),
    User.findOne({
      where: { email, ...(users.length ? { user_id: { [Op.notIn]: users.map(user => user.user_id) } } : {}) },
      transaction,
    }),
  ]);
  if (otherClient || otherUser) fail(409, 'El correo ya pertenece a otra cuenta.');

  const previousEmails = [client.email, ...users.map(user => user.email)].filter(Boolean);
  const changed = previousEmails.some(previous => previous !== email);
  if (changed) {
    // Neither old codes nor codes issued for a previous owner of the new address may be reused.
    await ClientOtp.update({ is_used: true }, {
      where: { email: { [Op.in]: [...new Set([...previousEmails, email])] }, is_used: false }, transaction,
    });
  }
  await client.update({ email }, { transaction });
  for (const user of users) {
    await user.update({ email }, { transaction });
  }
  return email;
}

module.exports = { syncClientEmail };
