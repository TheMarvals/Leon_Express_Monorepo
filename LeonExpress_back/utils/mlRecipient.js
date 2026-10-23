'use strict';
function clean(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value).trim();
  return /(?:x{3,}|\*{3,})/i.test(text) || /^(null|undefined|comprador(?: ml)?|sin nombre|no disponible|direcci[oó]n (?:pendiente de ml|de mercadolibre)|destinatario mercadolibre)$/i.test(text) ? '' : text;
}
function recipientFromShipment(ship) {
  let address = {};
  try { address = typeof ship.buyer_address === 'object' ? ship.buyer_address || {} : JSON.parse(ship.buyer_address); } catch { address = { address_line: ship.buyer_address }; }
  if (!address || typeof address !== 'object') address = {};
  const street = clean(address.address_line) || [clean(address.street_name), clean(address.street_number)].filter(Boolean).join(' ');
  const city = clean(address.city?.name) || clean(ship.buyer_city);
  return {
    recipient_name: (clean(ship.buyer_name) || clean(address.receiver_name)).slice(0, 100),
    recipient_phone: (clean(ship.buyer_phone) || clean(address.receiver_phone)).slice(0, 20),
    destination_address: street ? [street, city, clean(address.comment)].filter(Boolean).join(', ') : '',
  };
}
function missingContactPatch(pkg, contact) {
  return Object.fromEntries(['recipient_name', 'recipient_phone', 'destination_address'].filter(key => !clean(pkg[key]) && clean(contact[key])).map(key => [key, clean(contact[key])]));
}
module.exports = { clean, recipientFromShipment, missingContactPatch };
