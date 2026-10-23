const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vueRouter = require('vue-router')
const source = fs.readFileSync(path.resolve(__dirname, '../src/router/index.ts'), 'utf8').replace('import.meta.env.BASE_URL', "'/'")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
function fixture() {
  const module = { exports: {} }
  const store = { sessionChecked: true, isLoggedIn: false, user: null }
  vm.runInNewContext(compiled, { module, exports: module.exports, require(id) {
    if (id === 'vue-router') return { ...vueRouter, createWebHistory: () => vueRouter.createMemoryHistory() }
    if (id === '@stores/user-store') return { useUserStore: () => store }
    if (id === 'vuestic-ui') return { useToast: () => ({ init() {} }) }
    if (id.endsWith('.vue')) return {}
    throw Error(id)
  } })
  return module.exports.default
}
test('the homepage is public while every operational route still inherits authentication', () => {
  const router = fixture()
  assert.equal(router.resolve('/').name, 'home')
  assert.equal(router.resolve('/').meta.requiresAuth, undefined)
  for (const url of ['/dashboard', '/clients', '/users', '/routes', '/packages', '/pickups', '/mercadolibre', '/billing', '/payouts', '/invoices', '/prospects']) {
    assert.equal(router.resolve(url).meta.requiresAuth, true, url)
  }
  assert.deepEqual(Array.from(router.resolve('/prospects').meta.roles), ['ADMIN'])
})
test('introducing the public homepage preserves nested detail and existing portal URLs', () => {
  const router = fixture()
  for (const [url, name] of [['/payouts/test', 'payout-details'], ['/invoices/test', 'invoice-details'], ['/routes/test', 'route-details'], ['/portal/login', 'client-login'], ['/portal/registro?token=test', 'register-invite'], ['/auth/login', 'login']]) {
    assert.equal(router.resolve(url).name, name, url)
  }
  assert.equal(router.resolve({ name: 'payout-details', params: { id: 'test' } }).path, '/payouts/test')
})
test('obsolete public signup redirects to the registered client access flow', () => {
  const router = fixture()
  assert.equal(router.resolve('/auth/signup').matched.at(-1).redirect.name, 'client-login')
})
