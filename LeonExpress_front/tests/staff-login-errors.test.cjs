const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const vue = require('vue')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')

const filename = path.resolve(__dirname, '../src/pages/auth/Login.vue')
const compiled = compileScript(parse(fs.readFileSync(filename, 'utf8')).descriptor, { id: 'staff-login-test' })
const script = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function fixture(error) {
  const module = { exports: {} }
  vm.runInNewContext(script, {
    module, exports: module.exports,
    require(id) {
      if (id === 'vue') return { ...vue, onUnmounted() {} }
      if (id === 'vue-router') return { useRoute: () => ({ query: {} }), useRouter: () => ({ push() {} }) }
      if (id === 'vuestic-ui') return { useForm: () => ({ validate: () => true }), useToast: () => ({ init() {} }) }
      if (id === '@stores/user-store') return { useUserStore: () => ({}) }
      if (id.endsWith('/services/api')) return { default: { login: async () => { throw error } } }
      if (id.endsWith('/services/utils')) return { validators: {} }
      if (id.endsWith('/services/sessionExpiry')) return { SESSION_EXPIRED_MESSAGE: 'Sesión expirada' }
      if (id === '@fortawesome/vue-fontawesome') return {}
      throw Error(`Unexpected import: ${id}`)
    },
  })
  return module.exports.default.setup({}, { expose() {} })
}

for (const status of [500, 502, 503]) {
  test(`HTTP ${status} explains service unavailability instead of blaming credentials`, async () => {
    const page = fixture({ response: { status, data: '<html>Bad Gateway</html>' } })
    await page.submit()
    assert.equal(page.errorMessage.value, 'El servicio de acceso no está disponible. Intenta nuevamente en unos minutos.')
    assert.equal(page.isLoading.value, false)
  })
}

test('connection failures explain connectivity', async () => {
  const page = fixture(new Error('Network Error'))
  await page.submit()
  assert.match(page.errorMessage.value, /No se pudo conectar/)
})

test('authentication failures retain the server explanation', async () => {
  const page = fixture({ response: { status: 401, data: { error: 'Credenciales inválidas' } } })
  await page.submit()
  assert.equal(page.errorMessage.value, 'Credenciales inválidas')
})
