'use strict';

const { v4: uuidv4 } = require('uuid');
const { RoutePackage, Delivery, Route } = require('../models');

const OPEN_ROUTE_STATUSES = ['PENDIENTE', 'EN_PROGRESO'];
const PENDING_STATUSES = ['ASIGNADO_A_RUTA', 'EN_RUTA_ENTREGA'];

function conflict(message, details = {}) {
  return Object.assign(new Error(message), { status: 409, details });
}

// Caller locks the destination route and the package before invoking this helper.
// Historical assignments remain intact, including their delivery attempts.
async function assignPackage(pkg, route, transaction, { confirmTransfer = false, sourceRouteId, actorId } = {}) {
  if (!OPEN_ROUTE_STATUSES.includes(route.status)) throw conflict('La ruta de destino debe estar abierta.');
  if (!['RECOLECTADO_EN_ORIGEN', 'RECIBIDO_EN_ALMACEN', 'DEVUELTO_ALMACEN', 'ASIGNADO_A_RUTA', 'EN_RUTA_ENTREGA', 'INCIDENCIA_ENTREGA', 'REPROGRAMADO'].includes(pkg.status)) {
    throw conflict('El estado del paquete no permite asignarlo a una ruta.');
  }
  const assignments = await RoutePackage.findAll({
    where: { package_id: pkg.package_id, released_at: null },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const sameRoute = assignments.find((item) => item.route_id === route.route_id);
  const previous = assignments.filter((item) => item.route_id !== route.route_id);
  if (previous.length && route.route_type !== 'ENTREGA') throw conflict('Los traspasos requieren una ruta de entrega.');
  for (const item of previous) {
    const source = await Route.findByPk(item.route_id, { transaction });
    if (!source || source.route_type !== 'ENTREGA' || source.warehouse_id !== route.warehouse_id) {
      throw conflict('Solo se pueden transferir paquetes entre rutas de entrega de la misma bodega.');
    }
  }
  if (sourceRouteId && !previous.some((item) => item.route_id === sourceRouteId)) {
    throw conflict(`El paquete ${pkg.tracking_code} ya no está a cargo de la ruta de origen.`);
  }
  if (previous.length && !confirmTransfer) {
    throw conflict('El paquete está en otra ruta. Confirma el traspaso físico para continuar.', {
      code: 'TRANSFER_CONFIRMATION_REQUIRED', source_route_ids: previous.map((item) => item.route_id),
      package_id: pkg.package_id
    });
  }
  if (previous.length && !PENDING_STATUSES.includes(pkg.status) && pkg.status !== 'RECIBIDO_EN_ALMACEN' && pkg.status !== 'DEVUELTO_ALMACEN') {
    throw conflict('Solo se pueden transferir paquetes pendientes sin incidencia. Registra primero su recepción en bodega para un reintento.');
  }
  if (await Delivery.findOne({ where: { package_id: pkg.package_id, status_at_delivery: 'ENTREGADO' }, transaction })) {
    throw conflict('Este paquete ya tiene una entrega registrada.');
  }
  if (sameRoute && previous.length === 0) return { assignment: sameRoute, alreadyInRoute: true };
  for (const item of previous) {
    await item.update({
      released_at: new Date(), release_reason: 'TRANSFERIDO',
      status_at_release: pkg.status, transferred_to_route_id: route.route_id, released_by_user_id: actorId
    }, { transaction });
  }
  const assignment = sameRoute || await RoutePackage.create({
    route_package_id: uuidv4(), route_id: route.route_id, package_id: pkg.package_id
  }, { transaction });
  await pkg.update({
    status: route.status === 'EN_PROGRESO' ? 'EN_RUTA_ENTREGA' : 'ASIGNADO_A_RUTA',
    assigned_to_route_datetime: new Date(), pending_return_user_id: null
  }, { transaction });
  return { assignment, alreadyInRoute: false, transferred: previous.length > 0 };
}

module.exports = { assignPackage, conflict, OPEN_ROUTE_STATUSES, PENDING_STATUSES };
