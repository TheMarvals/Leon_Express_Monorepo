const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const secret = 'client-token-test-secret';
const moduleObject = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../middlewares/authenticateToken.js'), 'utf8'), {
  module: moduleObject, process: { env: { JWT_SECRET: secret } }, require: () => jwt,
});
for (const [payload, expected] of [
  [{ role: 'CLIENT', user_id: 'client-user' }, 403],
  [{ role: 'CLIENT', user_id: 'client-user', client_id: 'client-1' }, 200],
  [{ role: 'ADMIN', user_id: 'admin-user' }, 200],
]) {
  test(`authentication requires a client association only for CLIENT: ${expected}`, () => {
    const req = { headers: { authorization: 'Bearer ' + jwt.sign(payload, secret) } };
    let status = 200, nextCalled = false;
    const res = { status(value) { status = value; return this; }, json() {} };
    moduleObject.exports(req, res, () => { nextCalled = true; });
    assert.equal(status, expected);
    assert.equal(nextCalled, expected === 200);
  });
}
