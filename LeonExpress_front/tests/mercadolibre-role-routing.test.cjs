const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const vue = require('vue')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')

const filename = path.resolve(__dirname, '../src/pages/mercadolibre/MercadoLibrePage.vue')
const compiled = compileScript(parse(fs.readFileSync(filename, 'utf8')).descriptor, {
  id: 'ml-role-routing-test', inlineTemplate: true,
})
const script = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function fixture(role) {
  const mounted = [], unmounted = []
  const store = vue.reactive({ isClient: role === 'CLIENT', isAdmin: role === 'ADMIN' })
  const child = name => ({
    setup() {
      vue.onMounted(() => mounted.push(name))
      vue.onUnmounted(() => unmounted.push(name))
      return () => vue.h('div')
    },
  })
  const module = { exports: {} }
  vm.runInNewContext(script, {
    module, exports: module.exports,
    require(id) {
      if (id === 'vue') return vue
      if (id === '@/stores/user-store') return { useUserStore: () => store }
      if (id === './ClientMercadoLibre.vue') return { default: child('CLIENT') }
      if (id === './AdminMercadoLibre.vue') return { default: child('ADMIN') }
      throw Error(`Unexpected import: ${id}`)
    },
  })
  const renderer = vue.createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null,
  })
  const app = renderer.createApp(module.exports.default)
  app.mount({})
  return { app, store, mounted, unmounted }
}

for (const role of ['CLIENT', 'ADMIN']) {
  test(`${role} mounts only its own Mercado Libre view and lifecycle`, () => {
    const { app, mounted } = fixture(role)
    assert.deepEqual(mounted, [role])
    app.unmount()
  })
}

test('unknown or unresolved roles do not mount either view', () => {
  const { app, mounted } = fixture(null)
  assert.deepEqual(mounted, [])
  app.unmount()
})

test('changing roles unmounts the previous view and its polling lifecycle', async () => {
  const { app, store, mounted, unmounted } = fixture('ADMIN')
  store.isAdmin = false
  store.isClient = true
  await vue.nextTick()
  assert.deepEqual(mounted, ['ADMIN', 'CLIENT'])
  assert.deepEqual(unmounted, ['ADMIN'])
  app.unmount()
})
