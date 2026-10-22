const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildPickupRequestedEmail } = require('../services/emailTemplates/pickupRequested');
const { buildOtpEmail } = require('../services/emailTemplates/otp');

const pickup = {
  clientName: 'Tienda <Sur> & Norte', scheduledDate: '2026-10-22T17:30:00Z',
  notes: 'Retirar en recepción\nTocar timbre <2B>', pickupId: 'retiro-ejemplo',
  pickupAddress: 'Pedernal 3793, Puente Alto', portalUrl: 'https://app.leonexpress.cl/pickups'
};

test('pickup email shows Chile time, pending status, address and escaped instructions', () => {
  const mail = buildPickupRequestedEmail(pickup);
  assert.ok(mail.html.includes('14:30'));
  assert.ok(mail.html.includes('Pendiente de asignación'));
  assert.ok(mail.html.includes(pickup.pickupAddress));
  assert.ok(mail.html.includes(pickup.pickupId));
  assert.ok(mail.html.includes('Tienda &lt;Sur&gt; &amp; Norte'));
  assert.ok(mail.html.includes('Retirar en recepción<br>Tocar timbre &lt;2B&gt;'));
  assert.ok(mail.html.includes(`href="${pickup.portalUrl}"`));
  assert.ok(mail.text.includes('Tocar timbre <2B>'));
  assert.ok(mail.text.includes('14:30'));
  assert.ok(mail.text.includes(pickup.portalUrl));
});

test('pickup email omits absent details and supports an unconfirmed date', () => {
  const mail = buildPickupRequestedEmail({ clientName: 'Cliente', scheduledDate: 'invalid-date', notes: '   ' });
  assert.ok(mail.html.includes('Fecha por confirmar'));
  for (const absent of ['Dirección de retiro', 'Instrucciones para el retiro', 'N° de solicitud', 'Invalid Date', 'undefined']) {
    assert.ok(!mail.html.includes(absent), absent);
  }
});

test('access code email shares the branding and preserves code and validity', () => {
  const mail = buildOtpEmail({ code: '012345', clientName: 'Cliente <Sur>' });
  assert.ok(mail.html.includes('Cliente &lt;Sur&gt;'));
  assert.ok(mail.html.includes('012345'));
  assert.ok(mail.text.includes('012345'));
  assert.ok(mail.html.includes('Válido por 15 minutos'));
  assert.ok(mail.html.includes('No lo compartas con nadie'));
  assert.ok(mail.html.includes('cid:leon-express-logo'));
  assert.equal(mail.attachments[0].contentId, 'leon-express-logo');
});

for (const [method, input] of [
  ['sendPickupRequestedNotification', { ...pickup, to: 'client@example.test' }],
  ['sendOtpEmail', { to: 'client@example.test', clientName: 'Cliente', code: '012345' }],
]) {
  test(`${method} sends HTML, plain text and the inline logo through the provider`, async () => {
    const sent = [], module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../services/emailService.js'), 'utf8'), {
      module, exports: module.exports,
      process: { env: { RESEND_API_KEY: 'test-key' } },
      console: { log() {}, warn() {}, error() {} },
      require(id) {
        if (id === 'resend') return { Resend: class { constructor() { this.emails = { send: async mail => { sent.push(mail); return { data: { id: 'test-mail' } }; } }; } } };
        if (id.startsWith('./emailTemplates/')) return require('../services/' + id.slice(2));
        throw Error(`Unexpected dependency: ${id}`);
      }
    });
    assert.equal((await module.exports[method](input)).success, true);
    assert.equal(sent.length, 1);
    assert.ok(sent[0].html.includes('cid:leon-express-logo'));
    assert.ok(sent[0].text.length > 0);
    assert.equal(sent[0].attachments[0].contentId, 'leon-express-logo');
  });
}
