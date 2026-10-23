'use strict';
const MAX_LABEL_NOTES = 120;
function validateLabelNotes(address) {
  const notes = typeof address === 'string' ? address.match(/\s*\(Obs:\s*([\s\S]*)\)\s*$/i)?.[1]?.trim() : '';
  if (notes && notes.length > MAX_LABEL_NOTES) {
    throw new Error(`Las observaciones de la etiqueta admiten hasta ${MAX_LABEL_NOTES} caracteres.`);
  }
  return true;
}
module.exports = { MAX_LABEL_NOTES, validateLabelNotes };
