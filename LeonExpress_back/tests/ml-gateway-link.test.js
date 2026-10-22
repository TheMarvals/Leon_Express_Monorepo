const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(data) {
  const calls = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../services/mlGatewayClient.js'), 'utf8'), {
    module, exports: module.exports, process: { env: {} }, URL,
    console: { error() {} },
    require(id) {
      assert.equal(id, 'axios');
      return { create: () => ({ post: async (...args) => { calls.push(args); return { data }; } }) };
    },
  });
  return { gateway: module.exports, calls };
}

for (const nested of [true, false]) {
  test(`normalizes ${nested ? 'the gateway link envelope' : 'a flat link response'} to a URL string`, async () => {
    const link = { url: 'https://gateway.example.test/ml/vincular/token', token_id: 'link-1', expires_at: '2026-10-22' };
    const { gateway, calls } = fixture(nested ? { message: 'Enlace creado', link } : link);
    const result = await gateway.generateLink('client-1', 'Cliente prueba');
    assert.equal(result.url, link.url);
    assert.equal(result.token_id, link.token_id);
    assert.equal(result.expires_at, link.expires_at);
    assert.equal(calls[0][0], '/api/generate-link');
    assert.equal(calls[0][1].client_id, 'client-1');
  });
}

for (const url of [undefined, {}, '[object Object]', '/relative', 'javascript:alert(1)', 'https://']) {
  test(`rejects invalid gateway URL: ${JSON.stringify(url)}`, async () => {
    const { gateway } = fixture({ link: { url } });
    await assert.rejects(gateway.generateLink('client-1', 'Cliente prueba'));
  });
}
