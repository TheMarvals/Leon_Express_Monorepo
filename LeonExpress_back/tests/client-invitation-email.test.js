const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildClientInvitationEmail } = require('../services/emailTemplates/clientInvitation');

const invitation = {
  clientName: 'Marval test', basePrice: 3500, hasFreePickups: true,
  inviteUrl: 'https://app.leonexpress.cl/portal/registro?token=test-token&source=invitation'
};

test('includes the app logo inline and preserves activation and agreed conditions', () => {
  const mail = buildClientInvitationEmail(invitation);
  assert.ok(mail.html.includes('background-color:#03323A'));
  assert.ok(mail.html.includes('background-color:#F4F6F8'));
  assert.ok(mail.html.includes('href="https://app.leonexpress.cl/portal/registro?token=test-token&amp;source=invitation"'));
  assert.ok(mail.html.includes('$3.500'));
  assert.ok(mail.html.includes('Gratis en tu dirección'));
  assert.ok(mail.text.includes(invitation.inviteUrl));
  assert.ok(mail.text.includes('válido por 7 días'));
  const [logo] = mail.attachments;
  assert.ok(mail.html.includes(`src="cid:${logo.contentId}"`));
  assert.equal(logo.contentType, 'image/png');
  assert.deepEqual([...logo.content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('escapes client names and renders paid pickup terms in HTML and plain text', () => {
  const mail = buildClientInvitationEmail({ ...invitation, clientName: 'Tienda <Sur> & "Norte"', hasFreePickups: false });
  assert.ok(mail.html.includes('Tienda &lt;Sur&gt; &amp; &quot;Norte&quot;'));
  assert.ok(!mail.html.includes('Tienda <Sur>'));
  assert.ok(mail.html.includes('Según volumen de paquetes'));
  assert.ok(mail.text.includes('Según volumen de paquetes'));
  assert.ok(mail.text.includes('Tienda <Sur> & "Norte"'));
});

test('rejects non-web activation links', () => {
  assert.throws(() => buildClientInvitationEmail({ ...invitation, inviteUrl: 'javascript:alert(1)' }), /URL de invitación inválida/);
});

test('the email service passes the HTML, text and inline logo to the mail provider', async () => {
  const sent = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../services/emailService.js'), 'utf8'), {
    module, exports: module.exports,
    process: { env: { RESEND_API_KEY: 'test-key', EMAIL_FROM: 'León Express <no-reply@example.test>' } },
    console: { log() {}, warn() {}, error() {} },
    require(id) {
      if (id === 'resend') return { Resend: class { constructor() { this.emails = { send: async mail => { sent.push(mail); return { data: { id: 'test-email' } }; } }; } } };
      if (id.startsWith('./emailTemplates/')) return require('../services/' + id.slice(2));
      throw Error(`Unexpected dependency: ${id}`);
    }
  });
  const result = await module.exports.sendClientInvitationEmail({ ...invitation, to: 'client@example.test' });
  assert.equal(result.success, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'client@example.test');
  assert.ok(sent[0].subject.includes('Bienvenido'));
  assert.ok(sent[0].html.includes('Activar mi cuenta'));
  assert.ok(sent[0].text.includes(invitation.inviteUrl));
  assert.equal(sent[0].attachments[0].contentId, 'leon-express-logo');
});
