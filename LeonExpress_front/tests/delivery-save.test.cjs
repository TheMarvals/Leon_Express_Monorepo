const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const vue = require('vue')
const ts = require('typescript')
const { File } = require('node:buffer')
const { parse, compileScript } = require('@vue/compiler-sfc')

const filename = path.resolve(__dirname, '../src/pages/packages/PackageDetailPage.vue')
const compiled = compileScript(parse(fs.readFileSync(filename, 'utf8')).descriptor, { id: 'delivery-test' })
const script = ts.transpileModule(compiled.content.replaceAll('import.meta.env.VITE_API_BASE_URL', "'http://localhost:4100/api'"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function fixture(createDelivery) {
  const notifications = [], redirects = []
  const module = { exports: {} }
  vm.runInNewContext(script, {
    module, exports: module.exports, FormData, File,
    console: { log() {}, warn() {}, error() {} },
    navigator: { geolocation: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } },
    require(id) {
      if (id === 'vue') return { ...vue, onMounted() {} }
      if (id === 'vue-router') return {
        useRoute: () => ({ params: { id: 'package-1' } }),
        useRouter: () => ({ push: (route) => redirects.push(route) }),
      }
      if (id === 'vuestic-ui') return { useToast: () => ({ init: (notice) => notifications.push(notice) }) }
      if (id.endsWith('/services/api')) return { default: { createDelivery } }
      if (id.endsWith('/stores/user-store')) return { useUserStore: () => ({ isDriver: true }) }
      if (id.endsWith('/useChunkedUpload') || id.endsWith('.vue') || id === 'vue-easy-lightbox') return {}
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  const component = module.exports.default.setup({}, { expose() {} })
  component.pkg.value = { package_id: 'package-1' }
  component.doShowDeliveryModal.value = true
  const form = new FormData()
  form.append('status_at_delivery', 'ENTREGADO')
  form.append('photos', new File(['photo-1'], 'one.jpg', { type: 'image/jpeg' }))
  form.append('photos', new File(['photo-2'], 'two.jpg', { type: 'image/jpeg' }))
  return { component, form, notifications, redirects }
}

for (const [name, error, expected] of [
  ['route rejection', { response: { status: 403, data: { error: 'El paquete ya no está a tu cargo.' } } }, 'El paquete ya no está a tu cargo.'],
  ['delivery conflict', { response: { status: 409, data: { error: 'Este paquete ya tiene una entrega registrada.' } } }, 'Este paquete ya tiene una entrega registrada.'],
  ['validation errors', { response: { status: 400, data: { errors: [{ msg: 'RUT inválido.' }, { msg: 'Nombre requerido.' }] } } }, 'RUT inválido. Nombre requerido.'],
  ['message response', { response: { status: 400, data: { message: 'No se pudo guardar.' } } }, 'No se pudo guardar.'],
  ['proxy upload limit', { response: { status: 413, data: '<html>Too large</html>' } }, 'Las fotos superan el tamaño permitido.'],
  ['lost connection', { code: 'ERR_NETWORK' }, 'No se pudo confirmar el guardado.'],
]) {
  test(`shows ${name} and preserves the form`, async () => {
    const f = fixture(async () => { throw error })
    await f.component.handleDeliverySave(f.form)
    const notice = f.notifications.find((notice) => notice.color === 'danger')
    assert.ok(notice.message.startsWith(expected))
    assert.equal(f.component.doShowDeliveryModal.value, true)
    assert.equal(f.component.isSavingDelivery.value, false)
    assert.equal(f.form.getAll('photos').length, 2)
    assert.equal(f.redirects.length, 0)
  })
}

test('saves all photos once and redirects even when GPS permission is denied', async () => {
  let calls = 0
  const f = fixture(async (id, form) => {
    calls++
    assert.equal(id, 'package-1')
    assert.equal(form.getAll('photos').length, 2)
    return { data: { delivery: { delivery_id: 'delivery-1' }, route_id: 'route-1' } }
  })
  await f.component.handleDeliverySave(f.form)
  assert.equal(calls, 1)
  assert.equal(f.notifications.some((notice) => notice.color === 'success'), true)
  assert.equal(f.component.doShowDeliveryModal.value, false)
  assert.equal(f.redirects[0].params.id, 'route-1')
})

test('a second save cannot create a concurrent delivery', async () => {
  let resolve, calls = 0
  const f = fixture(() => { calls++; return new Promise((done) => { resolve = done }) })
  const first = f.component.handleDeliverySave(f.form)
  await f.component.handleDeliverySave(f.form)
  assert.equal(calls, 1)
  resolve({ data: { route_id: 'route-1' } })
  await first
  assert.equal(f.component.isSavingDelivery.value, false)
})
