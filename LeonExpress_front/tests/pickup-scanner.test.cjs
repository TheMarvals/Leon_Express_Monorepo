const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const vue = require('vue')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')
const { webcrypto } = require('node:crypto')

const filename = path.resolve(__dirname, '../src/pages/pickups/UnifiedPickupScanner.vue')
const compiled = compileScript(parse(fs.readFileSync(filename, 'utf8')).descriptor, { id: 'scanner-test' })
const script = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function scanner({ post = async () => ({ data: { package: { name: 'Destinatario' } } }), upload = async () => {} } = {}) {
  const module = { exports: {} }
  let photoStarts = 0
  vm.runInNewContext(script, {
    module, exports: module.exports, console, setTimeout: (fn, ms) => setTimeout(fn, ms).unref(), clearTimeout,
    window: {}, navigator: { mediaDevices: { getUserMedia: async () => {
      photoStarts++
      return { getTracks: () => [{ stop() {} }] }
    } } },
    require(id) {
      if (id === 'vue') return { ...vue, onMounted() {}, onBeforeUnmount() {} }
      if (id === 'vue-router') return { useRoute: () => ({ params: { id: 'pickup-1' } }), useRouter: () => ({}), onBeforeRouteLeave() {} }
      if (id === 'vuestic-ui') return { useToast: () => ({ init: () => () => {} }) }
      if (id.endsWith('/services/api')) return { axiosInstance: { post } }
      if (id.endsWith('/useChunkedUpload')) return { uploadBatchChunked: upload }
      if (id.endsWith('.vue')) return {}
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  const component = module.exports.default.setup({}, { expose() {} })
  component.video.value = { play: async () => {}, srcObject: null }
  return { component, photoStarts: () => photoStarts }
}

test('photo capture is available without scanning any code and waits for the scanner camera to stop', async () => {
  const fixture = scanner()
  let stopped = false
  fixture.component.qrScannerRef.value = { stopCamera: async () => { await Promise.resolve(); stopped = true } }
  assert.equal(fixture.component.pendingNonMLCode.value, null)
  await fixture.component.switchToPhotoMode()
  assert.equal(stopped, true)
  assert.equal(fixture.component.photoModeActive.value, true)
  assert.equal(fixture.photoStarts(), 1)
})

test('repeated camera callbacks do not send concurrent requests for the same package', async () => {
  let complete
  let requests = 0
  const fixture = scanner({ post: () => { requests++; return new Promise((resolve) => { complete = resolve }) } })
  const first = fixture.component.handleQRScanned('48233839764')
  await fixture.component.handleQRScanned('48233-839764')
  assert.equal(requests, 1)
  complete({ data: { package: { name: 'Destinatario' } } })
  await first
  await fixture.component.handleQRScanned(' 48233839764 ')
  assert.equal(requests, 1)
  assert.equal(fixture.component.confirmedML.value.length, 1)
})

test('an unknown barcode leaves a persistent photo option', async () => {
  const fixture = scanner({ post: async () => { throw { response: { status: 404, data: { error: 'No existe', allow_photo: true } } } } })
  await fixture.component.handleQRScanned('MANUAL-UNKNOWN')
  assert.equal(fixture.component.pendingNonMLCode.value, 'MANUAL-UNKNOWN')
  assert.equal(fixture.component.lastScanFeedback.value.allowPhoto, true)
  assert.equal(fixture.component.isConfirming.value, false)
})

test('a different-client error does not suggest importing the package with a photo', async () => {
  const fixture = scanner({ post: async () => { throw { response: { status: 403, data: { error: 'Otro cliente', allow_photo: false } } } } })
  await fixture.component.handleQRScanned('48233839764')
  assert.equal(fixture.component.lastScanFeedback.value.allowPhoto, false)
  assert.equal(fixture.component.pendingNonMLCode.value, null)
})

test('manual entry does not reuse raw QR data from an earlier package', async () => {
  let payload
  const fixture = scanner({ post: async (_url, body) => { payload = body; return { data: { package: {} } } } })
  fixture.component.handleRawQRData('{"id":"old-package"}')
  fixture.component.manualTrackingCode.value = 'MANUAL-123'
  await fixture.component.submitManualCode()
  assert.equal(payload.raw_qr_data, null)
  assert.equal(payload.ml_code, 'MANUAL-123')
})

test('partial upload success removes only accepted photos and retries only the remainder', async () => {
  const uploaded = []
  const fixture = scanner({ upload: async ({ images, onProgress }) => {
    uploaded.push([...images])
    if (uploaded.length === 1) {
      onProgress(1, images.length)
      throw new Error('Network interrupted')
    }
    onProgress(images.length, images.length)
  } })
  fixture.component.capturedPhotos.value = ['photo-1', 'photo-2']
  await fixture.component.finishCollection()
  assert.deepEqual([...fixture.component.capturedPhotos.value], ['photo-2'])
  assert.equal(fixture.component.uploadComplete.value, false)
  await fixture.component.finishCollection()
  assert.deepEqual(uploaded, [['photo-1', 'photo-2'], ['photo-2']])
  assert.equal(fixture.component.uploadedPhotoCount.value, 2)
  assert.equal(fixture.component.uploadComplete.value, true)
})

test('double taps on finish do not upload the same photos twice', async () => {
  let complete
  let uploads = 0
  const fixture = scanner({ upload: () => { uploads++; return new Promise((resolve) => { complete = resolve }) } })
  fixture.component.capturedPhotos.value = ['photo-1']
  const first = fixture.component.finishCollection()
  await fixture.component.finishCollection()
  assert.equal(uploads, 1)
  complete()
  await first
})

test('upload retry keys remain stable for the same photos across separate attempts', async () => {
  const uploadFile = path.resolve(__dirname, '../src/composables/useChunkedUpload.ts')
  const code = ts.transpileModule(fs.readFileSync(uploadFile, 'utf8').replace('import.meta.env.VITE_API_BASE_URL', "'/api'"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const payloads = []
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, console: { log() {} }, crypto: webcrypto, TextEncoder, Uint8Array,
    localStorage: { getItem: () => null },
    require: () => ({ default: { post: async (_url, payload) => { payloads.push(payload); return { data: { batch_id: 'batch-1' } } } } }),
  })
  for (const images of [['photo-1'], ['photo-1'], ['photo-2']]) {
    await module.exports.uploadBatchChunked({ pickupId: 'pickup-1', images })
  }
  assert.equal(payloads[0].idempotency_key, payloads[1].idempotency_key)
  assert.notEqual(payloads[0].idempotency_key, payloads[2].idempotency_key)
})
