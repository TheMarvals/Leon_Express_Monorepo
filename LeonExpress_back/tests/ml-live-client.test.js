const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture({ wrongSeller = false, fail = 401 } = {}) {
  const requests = [], grants = [], module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../services/mlLiveClient.js'), 'utf8'), {
    module, setTimeout: callback => callback(),
    require(id) {
      if (id === './mlGatewayClient') return { getAccountToken: async (accountId, rejected) => {
        grants.push({ accountId, rejected });
        return { access_token: rejected ? 'fresh' : 'old', ml_user_id: wrongSeller ? 'other' : 'seller', expires_at: new Date(Date.now() + 3600000).toISOString() };
      } };
      if (id === 'axios') return async config => {
        requests.push(config);
        if (requests.length === 1) throw { response: { status: fail }, config: { headers: { Authorization: 'secret-must-not-escape' } } };
        return { data: { id: 123 } };
      };
      throw Error(id);
    },
  });
  return { client: module.exports, requests, grants };
}
const account = { ml_account_id: 'account', ml_user_id: 'seller' };
test('rejected token is renewed only by the gateway, then a read is retried once', async () => {
  const f = fixture();
  assert.equal((await f.client.request(account, 'get', '/shipments/123')).id, 123);
  assert.equal(f.grants.length, 2); assert.equal(f.grants[1].rejected, 'old');
  assert.equal(f.requests[1].headers.Authorization, 'Bearer fresh');
  assert.equal(f.requests[1].maxRedirects, 0);
});
test('foreign authorization and arbitrary URLs fail before querying ML', async () => {
  const f = fixture({ wrongSeller: true });
  await assert.rejects(f.client.request(account, 'get', '/shipments/123'), /no corresponde/);
  await assert.rejects(f.client.request(account, 'get', 'https://example.test'), /no permitido/);
  await assert.rejects(f.client.request(account, 'post', '/shipments/123'), /no permitido/);
  assert.equal(f.requests.length, 0);
});
test('API errors carry a status without exposing authorization configuration', async () => {
  const f = fixture({ fail: 403 });
  await assert.rejects(f.client.request(account, 'get', '/shipments/123'), error => {
    assert.equal(error.response.status, 403); assert.equal(error.config, undefined);
    assert(!JSON.stringify(error).includes('secret')); return true;
  });
});
