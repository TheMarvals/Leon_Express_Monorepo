const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

async function generateUniqueTrackingCode() {
  let code = 'LE';
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

module.exports = { generateUniqueTrackingCode };
