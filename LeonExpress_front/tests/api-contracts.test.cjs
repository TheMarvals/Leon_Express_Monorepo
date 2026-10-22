const test = require('node:test')
const assert = require('node:assert/strict')
const report = require('../../scripts/audit-api-contracts.cjs')

test('frontend HTTP routes have a matching method and path in the mounted backend', () => {
  assert.ok(report.frontendCalls.length > 100, 'The inventory must include services and Vue component calls')
  assert.deepEqual(report.missing, [])
})

test('the contract inventory includes chunked OCR uploads and their authentication requirement', () => {
  assert.ok(report.frontendCalls.some(call => call.path === '/api/smart-batch/upload' && call.file.includes('useChunkedUpload')))
  assert.equal(report.backendRoutes.find(route => route.path === '/api/smart-batch/upload').requiresAuth, true)
})

test('OCR endpoints reject unauthenticated requests before image processing', () => {
  for (const endpoint of ['/api/ocr', '/api/ocr/batch', '/api/batch-photos/upload', '/api/batch-photos/:batchId/status']) {
    assert.equal(report.backendRoutes.find(route => route.path === endpoint).requiresAuth, true, endpoint)
  }
})
