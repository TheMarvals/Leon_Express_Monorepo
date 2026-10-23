'use strict';
const { buildBrandedEmail, escapeHtml } = require('./brandLayout');
const { getFrontendUrl } = require('../../utils/frontendUrl');
function buildProspectReceivedEmail({ prospect }) {
  const url = `${getFrontendUrl()}/prospects`;
  const fields = [['Empresa', prospect.company], ['Contacto', prospect.contact_name], ['Correo', prospect.email], ['Teléfono', prospect.phone], ['Comuna de retiro', prospect.commune], ['Envíos diarios', prospect.volume], ['Mensaje', prospect.message || 'Sin comentarios adicionales']];
  return buildBrandedEmail({
    title: 'Nueva solicitud comercial',
    previewText: `${prospect.company} quiere trabajar con León Express`,
    content: `<tr><td class="email-padding" style="padding:32px 36px;"><p style="color:#526366;font-size:12px;letter-spacing:1px;">NUEVA SOLICITUD COMERCIAL</p><h1 class="email-heading" style="color:#03323A;font-size:28px;line-height:36px;">Una empresa quiere trabajar con nosotros.</h1><p style="font-size:15px;line-height:24px;">Revisa sus datos y coordina el siguiente paso desde el panel administrativo.</p><table role="presentation" width="100%" style="margin:24px 0;background:#F4F8F7;border-radius:8px;">${fields.map(([label, value]) => `<tr><td style="padding:10px 16px;color:#526366;font-size:13px;vertical-align:top;">${label}</td><td style="padding:10px 16px;color:#03323A;font-size:14px;word-break:break-word;white-space:pre-wrap;">${escapeHtml(value)}</td></tr>`).join('')}</table><a class="email-button" href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;background:#03323A;border-radius:6px;color:white;text-decoration:none;font-weight:bold;">Ver solicitudes</a><p style="font-size:12px;color:#526366;line-height:20px;margin-top:20px;">Esta solicitud no crea una cuenta de cliente ni habilita el acceso al portal.</p></td></tr>`,
    text: `Nueva solicitud comercial\n\n${fields.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nVer solicitudes: ${url}\nLa solicitud no habilita acceso al portal.`,
  });
}
module.exports = { buildProspectReceivedEmail };
