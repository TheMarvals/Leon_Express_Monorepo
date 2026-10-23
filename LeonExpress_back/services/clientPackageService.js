'use strict';
const { v4: uuidv4 } = require('uuid');
const { validateLabelNotes } = require('../utils/labelNotes');
const fail = (status, message) => Object.assign(new Error(message), { status });
const EDITABLE_FIELDS = ['recipient_name', 'recipient_phone', 'destination_address', 'is_cod', 'cod_amount'];

function validateClientPackageInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !EDITABLE_FIELDS.includes(key))) {
    throw fail(400, 'Solo puedes modificar los datos del destinatario, la dirección y el cobro contra entrega.');
  }
  const fields = {};
  for (const [key, max, required] of [['recipient_name', 100, true], ['recipient_phone', 20, false], ['destination_address', 1000, true]]) {
    const value = data[key];
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
      throw fail(400, `Revisa ${key === 'recipient_name' ? 'el destinatario' : key === 'recipient_phone' ? 'el teléfono' : 'la dirección'} (máximo ${max} caracteres).`);
    }
    fields[key] = value.trim();
  }
  try { validateLabelNotes(fields.destination_address); } catch (error) { throw fail(400, error.message); }
  if (typeof data.is_cod !== 'boolean') throw fail(400, 'Indica si el envío tiene cobro contra entrega.');
  const amount = data.cod_amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 99999999.99 || (data.is_cod && amount <= 0)) {
    throw fail(400, 'El monto de cobro contra entrega debe ser válido y mayor que cero cuando corresponde.');
  }
  fields.is_cod = data.is_cod;
  fields.cod_amount = data.is_cod ? Math.round(amount * 100) / 100 : 0;
  return fields;
}

function createClientPackageService(models) {
  const { sequelize, Package, User, Client, AuditLog } = models;
  async function mutate(actor, id, data, remove = false) {
    if (actor.role !== 'CLIENT' || !actor.client_id) throw fail(403, 'Acceso exclusivo para clientes.');
    const fields = remove ? null : validateClientPackageInput(data);
    return sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
      const user = await User.findByPk(actor.user_id, { transaction });
      const client = await Client.findByPk(actor.client_id, { transaction });
      if (!user?.is_active || user.archived_at || !client?.is_active || String(user.client_id) !== String(actor.client_id)) {
        throw fail(403, 'Tu cuenta no tiene acceso a esta operación.');
      }
      const pkg = await Package.findOne({ where: { package_id: id, client_id: actor.client_id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!pkg) throw fail(404, 'Envío no encontrado.');
      if (pkg.external_tracking_code || pkg.sales_codes || pkg.has_multiple_labels) {
        throw fail(409, 'Solo puedes editar o eliminar envíos manuales.');
      }
      if (pkg.status !== 'PENDIENTE_RECOLECCION' || pkg.scanned_at_origin_datetime || pkg.received_at_warehouse_datetime ||
          pkg.assigned_to_route_datetime || pkg.delivered_datetime || pkg.returned_datetime || pkg.change_received || pkg.pending_return_user_id) {
        throw fail(409, 'El envío ya no está pendiente de recolección. Actualiza la lista para ver su estado.');
      }
      // Nunca borrar ni modificar un envío con historial operativo o financiero, incluso si su estado es inconsistente.
      const references = ['Delivery', 'RoutePackage', 'InvoiceItem', 'PayoutItem', 'Return', 'Cancellation', 'OcrProcessingQueue', 'PackageCost'];
      for (const name of references) {
        if (await models[name].count({ where: { package_id: id }, transaction })) {
          throw fail(409, 'Este envío ya tiene movimientos registrados. Contacta a León Express para modificarlo.');
        }
      }
      const before = pkg.toJSON();
      if (remove) await pkg.destroy({ transaction });
      else await pkg.update(fields, { transaction });
      // Auditoría en la misma transacción: también se conserva si se elimina el registro del envío.
      await AuditLog.create({ log_id: uuidv4(), user_id: actor.user_id, action: remove ? 'CLIENT_DELETE_PACKAGE' : 'CLIENT_UPDATE_PACKAGE',
        target_table: 'packages', target_id: id,
        details: JSON.stringify({ client_id: actor.client_id, tracking_code: before.tracking_code, before, ...(remove ? {} : { after: pkg.toJSON() }) }),
      }, { transaction });
      return remove ? { message: 'Envío eliminado.' } : pkg.toJSON();
    });
  }
  return { update: (actor, id, data) => mutate(actor, id, data), remove: (actor, id) => mutate(actor, id, null, true) };
}
module.exports = { createClientPackageService, validateClientPackageInput };
