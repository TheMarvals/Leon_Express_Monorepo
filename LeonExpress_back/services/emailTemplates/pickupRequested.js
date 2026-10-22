'use strict';

const { buildBrandedEmail, escapeHtml } = require('./brandLayout');
const { getFrontendUrl } = require('../../utils/frontendUrl');

function buildPickupRequestedEmail({ clientName, scheduledDate, notes, pickupId, pickupAddress, portalUrl }) {
  const scheduled = scheduledDate ? new Date(scheduledDate) : null;
  const formattedDate = scheduled && !Number.isNaN(scheduled.getTime())
    ? new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Santiago', hourCycle: 'h23'
    }).format(scheduled)
    : 'Fecha por confirmar';
  const portal = portalUrl || `${getFrontendUrl()}/pickups`;
  if (!['http:', 'https:'].includes(new URL(portal).protocol)) throw new Error('URL del portal inválida');
  const link = escapeHtml(portal);
  const fields = [
    ['Fecha solicitada (hora de Chile)', formattedDate],
    ...(pickupAddress ? [['Dirección de retiro', pickupAddress]] : []),
    ...(notes?.trim() ? [['Instrucciones para el retiro', notes.trim()]] : []),
    ...(pickupId ? [['N° de solicitud', pickupId]] : []),
  ];
  const rows = fields.map(([label, value]) => `<tr><td style="padding:16px 20px;border-top:1px solid #E4E9E9;">
    <p style="margin:0 0 4px;color:#526366;font-size:12px;line-height:19px;">${escapeHtml(label)}</p>
    <p style="margin:0;color:#03323A;font-size:14px;font-weight:600;line-height:22px;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(value).replace(/\r?\n/g, '<br>')}</p>
  </td></tr>`).join('');

  return buildBrandedEmail({
    title: 'Solicitud de colecta recibida · León Express',
    previewText: 'Recibimos tu solicitud de colecta. Está pendiente de asignación de conductor.',
    content: `
      <tr><td class="email-padding" style="padding:32px 36px 0;">
        <p style="margin:0 0 12px;color:#03323A;font-size:11px;font-weight:700;letter-spacing:1.4px;line-height:16px;">SOLICITUD DE COLECTA</p>
        <h1 class="email-heading" style="margin:0 0 18px;color:#03323A;font-size:30px;line-height:1.2;font-weight:700;letter-spacing:-0.6px;">Recibimos tu solicitud.</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:24px;">Hola, <strong>${escapeHtml(clientName)}</strong>:</p>
        <p style="margin:0;color:#526366;font-size:15px;line-height:24px;">Tu solicitud de retiro quedó registrada. Nuestro equipo coordinará la recolección de tus paquetes.</p>
      </td></tr>
      <tr><td class="email-padding" style="padding:24px 36px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F9F9;border:1px solid #E4E9E9;border-radius:8px;">
          <tr><td style="padding:20px;color:#03323A;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.8px;line-height:16px;">DETALLES DEL RETIRO</p>
            <span style="display:inline-block;padding:5px 10px;background-color:#FFF8D6;color:#6A5200;border-radius:4px;font-size:12px;font-weight:700;line-height:18px;">Solicitada · Pendiente de asignación</span>
          </td></tr>
          ${rows}
        </table>
      </td></tr>
      <tr><td class="email-padding" style="padding:24px 36px 0;">
        <p style="margin:0;color:#526366;font-size:14px;line-height:23px;">La solicitud está pendiente de asignación de conductor. Puedes consultar su estado y los datos del recolector desde tu portal.</p>
      </td></tr>
      <tr><td class="email-padding" style="padding:28px 36px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#03323A" style="border-radius:6px;mso-padding-alt:15px 24px;">
          <a class="email-button" href="${link}" target="_blank" style="display:block;padding:15px 24px;border:1px solid #03323A;border-radius:6px;color:#FFFFFF;background-color:#03323A;font-size:15px;line-height:22px;font-weight:700;text-decoration:none;">Ver mis colectas</a>
        </td></tr></table>
      </td></tr>
      <tr><td class="email-padding" style="padding:24px 36px 32px;">
        <p style="margin:0 0 6px;color:#6C7779;font-size:12px;line-height:19px;">Si el botón no funciona, ingresa desde este enlace:</p>
        <p style="margin:0;font-size:12px;line-height:19px;overflow-wrap:anywhere;word-break:break-all;"><a href="${link}" style="color:#03323A;text-decoration:underline;word-break:break-all;">${link}</a></p>
      </td></tr>`,
    text: `Solicitud de colecta recibida · León Express\n\nHola, ${clientName}:\nTu solicitud de retiro quedó registrada.\n\nEstado: Solicitada · Pendiente de asignación\n${fields.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nNuestro equipo coordinará la recolección de tus paquetes.\nVer mis colectas: ${portal}\n\n¿Necesitas ayuda? soporte@leonexpress.cl\nLeón Express · Logística de envíos`,
  });
}

module.exports = { buildPickupRequestedEmail };
