const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')
const vue = require('vue')
const mod = { exports: {} }
const source = fs.readFileSync(path.resolve(__dirname, '../src/services/sessionExpiry.ts'), 'utf8')
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module: mod, exports: mod.exports })
const { createSessionExpiryHandler, SESSION_EXPIRED_MESSAGE } = mod.exports

function fixture(user = {}, clientLoginPath) {
  const data = new Map([['token', 'expired-token'], ['user', JSON.stringify(user)], ['preference', 'keep']])
  const redirects = []
  const handler = createSessionExpiryHandler({
    storage: { getItem: (key) => data.get(key) || null, removeItem: (key) => data.delete(key) },
    redirect: (url) => redirects.push(url), loginPath: '/auth/login', clientLoginPath,
  })
  return { data, redirects, handler }
}
function error(status = 401, url = '/routes/route-1', message = 'Token expirado') {
  return { response: { status, data: { error: message } }, config: { url, headers: { Authorization: 'Bearer expired-token' } } }
}

test('expired requests clear credentials and send the user to login with an explanation', () => {
  const f = fixture()
  f.handler(error())
  assert.equal(f.data.has('token'), false)
  assert.equal(f.data.has('user'), false)
  assert.equal(f.data.get('preference'), 'keep')
  assert.deepEqual(f.redirects, ['/auth/login?reason=session-expired'])
})
test('parallel failures redirect only once', () => {
  const f = fixture()
  for (let i = 0; i < 4; i++) f.handler(error())
  assert.equal(f.redirects.length, 1)
})
test('incorrect login credentials do not trigger session expiry', () => {
  const f = fixture()
  f.handler(error(401, '/auth/login', 'Credenciales inválidas'))
  assert.equal(f.data.get('token'), 'expired-token')
  assert.equal(f.redirects.length, 0)
})
test('permission, server and connection errors keep the session', () => {
  const f = fixture()
  f.handler(error(403, '/events/packages/one/deliveries', 'No tienes permisos.'))
  f.handler(error(500))
  f.handler({ code: 'ERR_NETWORK' })
  assert.equal(f.data.get('token'), 'expired-token')
  assert.equal(f.redirects.length, 0)
})
test('invalid authentication tokens also require login', () => {
  const f = fixture()
  f.handler(error(403, '/auth/me', 'Token inválido'))
  assert.equal(f.redirects.length, 1)
})
test('a late rejection cannot log out a new session', () => {
  const f = fixture()
  f.data.set('token', 'new-token')
  f.handler(error())
  assert.equal(f.data.get('token'), 'new-token')
  assert.equal(f.redirects.length, 0)
})
test('anonymous requests do not redirect', () => {
  const f = fixture()
  f.data.delete('token')
  f.handler(error())
  assert.equal(f.redirects.length, 0)
})

const filename = path.resolve(__dirname, '../src/pages/routes/RouteDetailPage.vue')
const compiled = compileScript(parse(fs.readFileSync(filename, 'utf8')).descriptor, { id: 'route-session-test' })
const script = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
function routePage(requestError) {
  const notifications = [], module = { exports: {} }
  vm.runInNewContext(script, {
    module, exports: module.exports,
    require(id) {
      if (id === 'vue') return { ...vue, onMounted() {}, watch() {} }
      if (id === 'vue-router') return { useRoute: () => ({ params: { id: 'route-1' } }) }
      if (id === 'vuestic-ui') return {
        useToast: () => ({ init: (notice) => notifications.push(notice) }),
        defineVaDataTableColumns: (columns) => columns,
      }
      if (id.endsWith('/services/api')) return { default: {
        getRouteById: async () => { throw requestError },
        getPackages: async () => ({ data: { packages: [] } }),
        getRoutes: async () => ({ data: { routes: [] } }),
      } }
      if (id.endsWith('/sessionExpiry')) return mod.exports
      if (id.endsWith('/stores/user-store')) return { useUserStore: () => ({ isDriver: true }) }
      if (id.endsWith('/data/comunas') || id.endsWith('.vue')) return {}
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  return { component: module.exports.default.setup({}, { expose() {} }), notifications }
}
test('route loading explains expired sessions without a generic error toast', async () => {
  const f = routePage(error())
  await f.component.fetchData()
  assert.equal(f.component.loadError.value, SESSION_EXPIRED_MESSAGE)
  assert.equal(f.component.isLoading.value, false)
  assert.equal(f.notifications.length, 0)
})
test('real missing routes display the server message', async () => {
  const f = routePage(error(404, '/routes/route-1', 'Ruta no encontrada'))
  await f.component.fetchData()
  assert.equal(f.component.loadError.value, 'Ruta no encontrada')
  assert.equal(f.notifications[0].message, 'Ruta no encontrada')
})

const apiSource = fs.readFileSync(path.resolve(__dirname, '../src/services/api.ts'), 'utf8')
const apiScript = ts.transpileModule(apiSource.replaceAll('import.meta.env', "({ VITE_API_BASE_URL: '/api', BASE_URL: '/' })"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

test('the API interceptor redirects expired sessions while preserving the rejected request', async () => {
  const axios = require('axios')
  const data = new Map([['token', 'expired-token'], ['user', '{}']])
  const redirects = []
  let loadingHidden = 0
  const requestLogs = []
  const module = { exports: {} }
  vm.runInNewContext(apiScript, {
    module, exports: module.exports,
    console: { log: (...args) => requestLogs.push(args), error() {} },
    localStorage: { getItem: (key) => data.get(key), removeItem: (key) => data.delete(key) },
    window: { location: { replace: (url) => redirects.push(url) } },
    require(id) {
      if (id === 'axios') return { default: axios }
      if (id.endsWith('/useLoading')) return { useLoading: () => ({ show() {}, hide() { loadingHidden++ } }) }
      if (id === './sessionExpiry') return mod.exports
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  const api = module.exports.axiosInstance
  api.defaults.adapter = async (config) => {
    throw new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
      status: 401, data: { error: 'Token expirado' }, headers: {}, config,
    })
  }
  await assert.rejects(api.get('/routes/route-1'), (err) => err.response.status === 401)
  assert.equal(loadingHidden, 1)
  assert.deepEqual(redirects, ['/auth/login?reason=session-expired'])
  assert.equal(data.has('token'), false)
  await assert.rejects(module.exports.default.login({ username: 'test-staff', password: 'sensitive-test-password' }))
  assert.deepEqual(requestLogs, [])
})


test('client session expiry returns to OTP while staff returns to its own login', () => {
  const client = fixture({ role: 'CLIENT' }, '/portal/login')
  client.handler(error())
  assert.deepEqual(client.redirects, ['/portal/login?reason=session-expired'])
  const staff = fixture({ role: 'ADMIN' }, '/portal/login')
  staff.handler(error())
  assert.deepEqual(staff.redirects, ['/auth/login?reason=session-expired'])
})
test('corrupt local user data still clears the expired session', () => {
  const f = fixture({}, '/portal/login')
  f.data.set('user', '{invalid')
  f.handler(error())
  assert.deepEqual(f.redirects, ['/auth/login?reason=session-expired'])
  assert.equal(f.data.has('token'), false)
})
