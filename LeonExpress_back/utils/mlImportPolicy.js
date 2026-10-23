'use strict';
const ALLOWED_COMMUNES_LOWER = [
  'providencia', 'estación central', 'estacion central',
  'quinta normal', 'la florida', 'quilicura', 'renca',
  'las condes', 'san bernardo', 'lo espejo',
  'pedro aguirre cerda', 'pac', 'santiago', 'ñuñoa', 'la reina',
  'macul', 'peñalolén', 'peñalolen', 'conchalí', 'conchali',
  'independencia', 'huechuraba', 'recoleta', 'lo barnechea',
  'vitacura', 'pudahuel', 'lo prado', 'cerro navia',
  'maipú', 'maipu', 'cerrillos', 'padre hurtado',
  'la granja', 'el bosque', 'la pintana', 'san ramón', 'san ramon',
  'la cisterna', 'puente alto', 'san miguel', 'san joaquín', 'san joaquin',
  'colina',
];

// Statuses de ML que significan que el envío ya no está activo
const CLOSED_STATUSES = ['cancelled', 'not_delivered', 'returned', 'delivered', 'lost', 'refunded'];


function importable(ship) {
  return (!ship.type || ship.type === 'forward') &&
    ['pending', 'handling', 'ready_to_ship', 'shipped', 'to_be_agreed', 'not_verified'].includes(ship.status_ml) &&
    ['self_service', 'xd_drop_off'].includes(ship.logistic_type) &&
    (!ship.buyer_city || ALLOWED_COMMUNES_LOWER.includes(ship.buyer_city.toLowerCase()));
}
module.exports = { importable, CLOSED_STATUSES };
