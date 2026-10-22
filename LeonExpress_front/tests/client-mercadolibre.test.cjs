const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const vue = require('vue')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')

const filename = path.resolve(__dirname, '../src/pages/mercadolibre/ClientMercadoLibre.vue')
const compiled = compileScript(parse(fs.readFileSync(filename, 'utf8')).descriptor, { id: 'client-ml-test' })
const script = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function fixture(api = {}) {
  const notices = [], location = { href: '' }, module = { exports: {} }
  vm.runInNewContext(script, {
    module, exports: module.exports, window: { location },
    console: { error() {} },
    require(id) {
      if (id === 'vue') return { ...vue, onMounted() {} }
      if (id === 'vuestic-ui') return {
        useToast: () => ({ init: notice => notices.push(notice) }),
        useModal: () => ({ confirm: async () => true }),
      }
      if (id.endsWith('/services/api')) return { default: api }
      throw Error(`Unexpected import: ${id}`)
    },
  })
  return { page: module.exports.default.setup({}, { expose() {} }), notices, location }
}

test('reads a linked account from the API envelope and displays the gateway nickname', async () => {
  const { page } = fixture({ getMyMlAccount: async () => ({ data: { account: { ml_account_id: 'account-1', ml_nickname: 'Mi tienda' } } }) })
  await page.loadAccount()
  assert.equal(page.mlAccounts.value.length, 1)
  assert.equal(page.mlAccounts.value[0].nickname, 'Mi tienda')
  assert.equal(page.gatewayUnavailable.value, false)
})

test('a missing account remains unlinked', async () => {
  const { page } = fixture({ getMyMlAccount: async () => ({ data: { account: null } }) })
  await page.loadAccount()
  assert.equal(page.mlAccounts.value.length, 0)
  assert.equal(page.gatewayUnavailable.value, false)
})

test('gateway outages are visible instead of silently being treated as a disconnected account', async () => {
  const { page } = fixture({ getMyMlAccount: async () => ({ data: { account: null, gateway_status: 'UNAVAILABLE' } }) })
  await page.loadAccount()
  assert.equal(page.gatewayUnavailable.value, true)
})

test('linking opens the returned authorization URL', async () => {
  const { page, location } = fixture({ linkMyMlAccount: async () => ({ data: { url: 'https://gateway.example.test/connect/token' } }) })
  await page.linkAccount()
  assert.equal(location.href, 'https://gateway.example.test/connect/token')
  assert.equal(page.isLinking.value, false)
})

test('link failures explain the error and release the loading button', async () => {
  const { page, notices, location } = fixture({ linkMyMlAccount: async () => { throw { response: { data: { error: 'No se pudo generar el enlace de vinculación' } } } } })
  await page.linkAccount()
  assert.equal(location.href, '')
  assert.equal(page.isLinking.value, false)
  assert.equal(notices[0].message, 'No se pudo generar el enlace de vinculación')
})

test('linking reads the URL inside the gateway link object', async () => {
  const url = 'https://gateway.example.test/ml/vincular/token'
  const { page, location } = fixture({ linkMyMlAccount: async () => ({ data: { link: { url, token_id: 'link-1' } } }) })
  await page.linkAccount()
  assert.equal(location.href, url)
})

for (const data of [{ link: {} }, { url: {} }, {}, { url: 'javascript:alert(1)' }]) {
  test(`invalid link responses keep the user on the page: ${JSON.stringify(data)}`, async () => {
    const { page, notices, location } = fixture({ linkMyMlAccount: async () => ({ data }) })
    await page.linkAccount()
    assert.equal(location.href, '')
    assert.equal(notices[0].color, 'danger')
    assert.equal(page.isLinking.value, false)
  })
}

test('loads every account and unlinks only the selected account', async () => {
  const removed = [];
  const { page } = fixture({
    getMyMlAccount: async () => ({ data: { accounts: [
      { ml_account_id: 'one', ml_nickname: 'Primera tienda' },
      { ml_account_id: 'two', ml_nickname: 'Segunda tienda' },
    ] } }),
    unlinkMyMlAccount: async id => removed.push(id),
  });
  await page.loadAccount();
  assert.equal(page.mlAccounts.value.length, 2);
  await page.unlinkAccount(page.mlAccounts.value[1]);
  assert.deepEqual(removed, ['two']);
  assert.equal(page.mlAccounts.value.length, 1);
  assert.equal(page.mlAccounts.value[0].ml_account_id, 'one');
});
test('sync sends the selected account id or no id for all accounts', async () => {
  const synced = [];
  const { page } = fixture({ syncMyMlAccount: async id => { synced.push(id); return { data: {} }; } });
  await page.syncAccount('two');
  await page.syncAccount();
  assert.deepEqual(synced, ['two', undefined]);
});
test('a failed unlink preserves every linked account and clears loading state', async () => {
  const { page, notices } = fixture({
    getMyMlAccount: async () => ({ data: { accounts: [{ ml_account_id: 'one' }, { ml_account_id: 'two' }] } }),
    unlinkMyMlAccount: async () => { throw Error('Gateway unavailable'); },
  });
  await page.loadAccount();
  await page.unlinkAccount(page.mlAccounts.value[1]);
  assert.equal(page.mlAccounts.value.length, 2);
  assert.equal(page.unlinkingAccountId.value, null);
  assert.equal(notices[0].color, 'danger');
});
