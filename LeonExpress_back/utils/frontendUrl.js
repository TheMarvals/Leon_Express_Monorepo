'use strict';

function parseWebUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('FRONTEND_URL debe ser una URL HTTP o HTTPS válida.');
  }
  return url;
}

function getFrontendUrl(req) {
  const configured = process.env.FRONTEND_URL?.trim();
  if (configured) {
    const url = parseWebUrl(configured);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  }

  // Vite y el proxy inverso conservan el origen del navegador, aunque Host apunte al backend.
  for (const header of ['origin', 'referer']) {
    const value = req?.get?.(header);
    if (!value || value === 'null') continue;
    try { return parseWebUrl(value).origin; } catch { /* Intentar con la siguiente cabecera. */ }
  }

  if (process.env.NODE_ENV !== 'production') return 'http://localhost:5173';
  throw new Error('Configura FRONTEND_URL con la URL pública de la aplicación para generar enlaces.');
}

module.exports = { getFrontendUrl };
