'use strict';

const { buildBrandedEmail, escapeHtml } = require('./brandLayout');

function buildOtpEmail({ code, clientName = '' }) {
  return buildBrandedEmail({
    title: 'Tu código de acceso · León Express',
    previewText: `Tu código de acceso es ${code}. Válido por 15 minutos.`,
    content: `
      <tr><td class="email-padding" style="padding:32px 36px 0;">
        <p style="margin:0 0 12px;color:#03323A;font-size:11px;font-weight:700;letter-spacing:1.4px;line-height:16px;">ACCESO AL PORTAL</p>
        <h1 class="email-heading" style="margin:0 0 18px;color:#03323A;font-size:30px;line-height:1.2;font-weight:700;letter-spacing:-0.6px;">Tu código de acceso.</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:24px;">${clientName ? `Hola, <strong>${escapeHtml(clientName)}</strong>:` : 'Hola:'}</p>
        <p style="margin:0;color:#526366;font-size:15px;line-height:24px;">Utiliza este código para ingresar a tu cuenta de León Express.</p>
      </td></tr>
      <tr><td class="email-padding" style="padding:24px 36px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F9F9;border:1px solid #E4E9E9;border-radius:8px;">
          <tr><td align="center" style="padding:24px 16px;">
            <p style="margin:0 0 12px;color:#526366;font-size:11px;font-weight:700;letter-spacing:1px;line-height:16px;">CÓDIGO DE VERIFICACIÓN</p>
            <p style="margin:0;color:#03323A;font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:6px;line-height:48px;">${escapeHtml(code)}</p>
            <p style="margin:12px 0 0;color:#526366;font-size:12px;line-height:19px;">Válido por 15 minutos</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="email-padding" style="padding:24px 36px 32px;">
        <p style="margin:0 0 12px;color:#03323A;font-size:14px;font-weight:700;line-height:22px;">Tu código es personal.</p>
        <p style="margin:0;color:#526366;font-size:13px;line-height:22px;">No lo compartas con nadie. Si no solicitaste este acceso, puedes ignorar este correo.</p>
      </td></tr>`,
    text: `Tu código de acceso · León Express\n\n${clientName ? `Hola, ${clientName}:` : 'Hola:'}\nUtiliza este código para ingresar a tu cuenta:\n\n${code}\n\nVálido por 15 minutos. No lo compartas con nadie.\nSi no solicitaste este acceso, puedes ignorar este correo.\n\n¿Necesitas ayuda? soporte@leonexpress.cl\nLeón Express · Logística de envíos`,
  });
}

module.exports = { buildOtpEmail };
