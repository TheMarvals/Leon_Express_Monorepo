'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LOGO_CID = 'leon-express-logo';
const logo = fs.readFileSync(path.resolve(__dirname, '../../assets/email/leon-express-logo.png'));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function buildBrandedEmail({ title, previewText, content, text }) {
  return {
    html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-outer { padding: 16px 12px !important; }
      .email-padding { padding-left: 24px !important; padding-right: 24px !important; }
      .email-heading { font-size: 26px !important; }
      .email-button { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F8;color:#262824;font-family:Inter,Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(previewText)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F6F8;">
    <tr><td align="center" class="email-outer" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E4E9E9;border-radius:8px;border-spacing:0;">
        <tr><td class="email-padding" style="padding:28px 36px 24px;border-bottom:1px solid #E4E9E9;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><img src="cid:${LOGO_CID}" width="152" height="72" alt="León Express · Logística de envíos" style="display:block;width:152px;height:72px;border:0;color:#03323A;font-size:14px;"></td>
            <td align="right" style="color:#526366;font-size:10px;font-weight:700;letter-spacing:1px;line-height:16px;">PORTAL<br>DE CLIENTES</td>
          </tr></table>
        </td></tr>
${content}
        <tr><td class="email-padding" style="padding:22px 36px;border-top:1px solid #E4E9E9;background-color:#F7F9F9;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 6px;color:#03323A;font-size:13px;line-height:20px;font-weight:700;">Estamos para ayudarte.</p>
          <p style="margin:0;color:#526366;font-size:12px;line-height:20px;">Escríbenos a <a href="mailto:soporte@leonexpress.cl" style="color:#03323A;text-decoration:underline;">soporte@leonexpress.cl</a></p>
          <p style="margin:14px 0 0;color:#6C7779;font-size:11px;line-height:18px;">León Express · Logística de envíos<br>Este correo se generó automáticamente.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`,
    text,
    attachments: [{ filename: 'leon-express-logo.png', content: logo, contentType: 'image/png', contentId: LOGO_CID }],
  };
}

module.exports = { buildBrandedEmail, escapeHtml };
