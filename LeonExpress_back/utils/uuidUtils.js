let nanoid;
let customAlphabet;

(async () => {
  ({ customAlphabet } = await import('nanoid'));
})();
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

async function generateUniqueTrackingCode() {
  // Espera que customAlphabet esté cargado
  if (!customAlphabet) {
    ({ customAlphabet } = await import('nanoid'));
  }
  const nanoid = customAlphabet(alphabet, 8); // 8 caracteres
  return `LE${nanoid()}`;
}


module.exports = { generateUniqueTrackingCode };
