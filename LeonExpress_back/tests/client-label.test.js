'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');
const sharp = require('sharp');
const { normalizeLabelLogo } = require('../services/labelLogoService');

async function fixture(t, options = {}) {
  const rows = new Map();
  const filename = path.resolve(__dirname, '../routes/clientLabel.js');
  const realRequire = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, console, require(id) {
    if (id === '../models') return {
      User: { findByPk: async id => ({ user_id: id, client_id: options.moved ? 'other' : id, is_active: !options.inactive, archived_at: options.archived ? new Date() : null }) },
      Client: { findByPk: async id => ({ client_id: id, is_active: !options.clientInactive }) },
      ClientLabelBranding: {
        findByPk: async id => rows.get(id),
        upsert: async data => rows.set(data.client_id, data),
        destroy: async ({ where }) => rows.delete(where.client_id),
      },
    };
    if (id === '../middlewares/authenticateToken') return (req, res, next) => {
      if (!req.get('x-role')) return res.sendStatus(401);
      req.user = { role: req.get('x-role'), user_id: req.get('x-client'), client_id: req.get('x-client') }; next();
    };
    return realRequire(id);
  } }, { filename });
  const app = express(); app.use(express.json()); app.use('/', module.exports);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { rows, async request(method, { client = 'a', role = 'CLIENT', file, query = '', fields } = {}) {
    let body;
    if (file) { body = new FormData(); body.append('logo', new Blob([file], { type: 'image/png' }), 'logo.png');
      if (fields) body.append('client_id', fields); }
    return fetch(`http://127.0.0.1:${server.address().port}/${query}`, {
      method, headers: { ...(role ? { 'x-role': role } : {}), 'x-client': client }, body,
    });
  } };
}
async function image() { return sharp({ create: { width: 1200, height: 600, channels: 3, background: '#cc2200' } }).png().toBuffer(); }

test('normalizes actual image bytes, caps dimensions and strips color', async () => {
  const logo = await normalizeLabelLogo({ buffer: await image() });
  assert.ok(logo.startsWith('data:image/png;base64,'));
  const output = sharp(Buffer.from(logo.split(',')[1], 'base64'));
  const metadata = await output.metadata();
  assert.equal(metadata.width, 900); assert.equal(metadata.height, 450); assert.equal(metadata.format, 'png');
  const pixel = await output.raw().toBuffer(); assert.equal(pixel[0], pixel[1]); assert.equal(pixel[1], pixel[2]);
  for (const buffer of [Buffer.from('bad bytes'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
    await assert.rejects(normalizeLabelLogo({ buffer }), error => error.status === 400);
  }
});
test('logos persist independently per authenticated client and can be replaced or removed', async t => {
  const f = await fixture(t); const file = await image();
  assert.equal((await f.request('PUT', { file })).status, 200);
  assert.equal(f.rows.size, 1);
  assert.ok((await (await f.request('GET')).json()).logo_data_url);
  assert.equal((await (await f.request('GET', { client: 'b' })).json()).logo_data_url, null);
  assert.equal((await f.request('PUT', { file, fields: 'b' })).status, 400);
  assert.equal((await f.request('PUT', { file, query: '?client_id=b' })).status, 200);
  assert.equal(f.rows.has('b'), false);
  assert.equal((await f.request('DELETE', { client: 'b', query: '?client_id=a' })).status, 200);
  assert.equal(f.rows.has('a'), true);
  assert.equal((await f.request('DELETE')).status, 200); assert.equal(f.rows.size, 0);
});
test('rejects anonymous, internal, disabled, archived and reassigned sessions', async t => {
  const f = await fixture(t);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    assert.equal((await f.request(method, { role: '' })).status, 401);
    for (const role of ['DRIVER', 'ADMIN']) assert.equal((await f.request(method, { role })).status, 403);
  }
  for (const options of [{ inactive: true }, { archived: true }, { clientInactive: true }, { moved: true }]) {
    const disabled = await fixture(t, options);
    assert.equal((await disabled.request('PUT', { file: await image() })).status, 403);
    assert.equal(disabled.rows.size, 0);
  }
});
test('invalid and oversized uploads leave an existing logo intact', async t => {
  const f = await fixture(t); f.rows.set('a', { logo_data_url: 'existing' });
  for (const file of [Buffer.from('fake png'), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
    assert.equal((await f.request('PUT', { file })).status, 400);
    assert.equal(f.rows.get('a').logo_data_url, 'existing');
  }
  assert.equal((await f.request('PUT')).status, 400);
});

test('label observations accept 120 characters and reject 121, including nested parentheses', () => {
  const { validateLabelNotes } = require('../utils/labelNotes');
  assert.equal(validateLabelNotes('Una dirección sin observaciones'.repeat(10)), true);
  assert.equal(validateLabelNotes(`Calle 123, Santiago (Obs: ${'a'.repeat(120)})`), true);
  assert.equal(validateLabelNotes('Calle 123 (Obs: Entregar en recepción (piso 1))'), true);
  assert.throws(() => validateLabelNotes(`Calle 123 (Obs: ${'a'.repeat(121)})`), /120/);
  assert.throws(() => validateLabelNotes(`Calle 123 (OBS: ${'a'.repeat(121)} (recepción)) `), /120/);
});
