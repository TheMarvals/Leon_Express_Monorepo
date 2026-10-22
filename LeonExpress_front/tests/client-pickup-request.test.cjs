const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const vue = require('vue')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')

const filename = path.resolve(__dirname, '../src/pages/pickups/widgets/RequestPickupButton.vue')
const compiled = compileScript(parse(fs.readFileSync(filename, 'utf8')).descriptor, { id: 'client-pickup-test' })
const script = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function fixture(createPickup) {
  const notices = [], events = [], module = { exports: {} }
  vm.runInNewContext(script, {
    module, exports: module.exports, Date,
    console: { error() {} },
    require(id) {
      if (id === 'vue') return { ...vue, onMounted() {} }
      if (id === 'vue-router') return { useRouter: () => ({}) }
      if (id.endsWith('/stores/user-store')) return { useUserStore: () => ({ user: { role: 'CLIENT' } }) }
      if (id === 'vuestic-ui') return { useToast: () => ({ init: notice => notices.push(notice) }) }
      if (id === 'qrcode') return {}
      if (id.endsWith('/services/api')) return { default: {
        createPickup,
        getPackages: async () => ({ data: { packages: [] } }),
        getPickups: async () => ({ data: { pickups: [] } }),
        getMyMlAccount: async () => ({ data: null }),
      } }
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  const page = module.exports.default.setup({}, { expose() {}, emit: event => events.push(event) })
  page.openPickupModal()
  page.pickupDate.value = '2026-10-22T14:30'
  page.pickupNotes.value = 'Retirar en recepción'
  return { page, notices, events }
}

test('submits the selected local time and closes the modal only after success', async () => {
  let sent
  const { page, notices, events } = fixture(async data => { sent = data })
  await page.handleCreatePickup()
  assert.equal(sent.pickup_scheduled_date, new Date('2026-10-22T14:30').toISOString())
  assert.equal(sent.notes, 'Retirar en recepción')
  assert.equal(page.showPickupModal.value, false)
  assert.equal(page.pickupNotes.value, '')
  assert.equal(page.isSubmittingPickup.value, false)
  assert.equal(notices[0].color, 'success')
  assert.deepEqual(events, ['created'])
})

for (const [error, expected] of [
  [{ response: { data: { error: 'No se pudo guardar la solicitud.' } } }, 'No se pudo guardar la solicitud.'],
  [{ response: { data: { errors: [{ msg: 'Fecha de recolección inválida' }] } } }, 'Fecha de recolección inválida'],
  [{ code: 'ERR_NETWORK' }, 'No se pudo crear la solicitud de colecta. Intenta nuevamente.'],
]) {
  test(`keeps the modal and entered values when submitting fails: ${expected}`, async () => {
    const { page } = fixture(async () => { throw error })
    await page.handleCreatePickup()
    assert.equal(page.showPickupModal.value, true)
    assert.equal(page.pickupDate.value, '2026-10-22T14:30')
    assert.equal(page.pickupNotes.value, 'Retirar en recepción')
    assert.equal(page.pickupError.value, expected)
    assert.equal(page.isSubmittingPickup.value, false)
  })
}

test('blocks invalid dates and duplicate clicks while waiting for the server', async () => {
  let calls = 0, finish
  const { page } = fixture(() => { calls++; return new Promise(resolve => { finish = resolve }) })
  page.pickupDate.value = 'invalid'
  await page.handleCreatePickup()
  assert.equal(calls, 0)
  assert.ok(page.pickupError.value)
  page.pickupDate.value = '2026-10-22T14:30'
  const pending = page.handleCreatePickup()
  await page.handleCreatePickup()
  assert.equal(calls, 1)
  assert.equal(page.showPickupModal.value, true)
  finish()
  await pending
})

test('initial date uses local wall time for the datetime-local input', () => {
  const { page } = fixture(async () => {})
  const now = new Date()
  page.openPickupModal()
  const initial = new Date(page.pickupDate.value)
  assert.equal(initial.getHours(), now.getHours())
  assert.equal(initial.getDate(), now.getDate())
})
