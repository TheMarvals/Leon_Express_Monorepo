'use strict';

const { buildBrandedEmail, escapeHtml } = require('./brandLayout');

function buildClientInvitationEmail({ clientName, basePrice, hasFreePickups, inviteUrl }) {
  const url = new URL(inviteUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL de invitación inválida');
  const name = escapeHtml(clientName);
  const link = escapeHtml(inviteUrl);
  const price = Number(basePrice).toLocaleString('es-CL');
  const pickupTerms = hasFreePickups ? 'Gratis en tu dirección' : 'Según volumen de paquetes';

  return buildBrandedEmail({
    title: 'Bienvenido a León Express',
    previewText: 'Tu portal de cliente te espera. Activa tu cuenta y comienza a gestionar tus envíos con León Express.',
    content: `        <tr><td class="email-padding" style="padding:32px 36px 0;">
          <p style="margin:0 0 12px;color:#03323A;font-size:11px;font-weight:700;letter-spacing:1.4px;line-height:16px;">BIENVENIDO A LEÓN EXPRESS</p>
          <h1 class="email-heading" style="margin:0 0 18px;color:#03323A;font-size:30px;line-height:1.2;font-weight:700;letter-spacing:-0.6px;">Tus envíos, en un solo lugar.</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:24px;">Hola, <strong>${name}</strong>:</p>
          <p style="margin:0;color:#526366;font-size:15px;line-height:24px;">Te invitamos a nuestro portal de clientes. Activa tu cuenta para coordinar tus retiros y gestionar tus envíos con León Express.</p>
        </td></tr>
        <tr><td class="email-padding" style="padding:24px 36px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F9F9;border:1px solid #E4E9E9;border-radius:8px;">
            <tr><td style="padding:20px 20px 16px;color:#03323A;font-size:11px;font-weight:700;letter-spacing:0.8px;">CONDICIONES DE TU CUENTA</td></tr>
            <tr><td style="padding:0 20px 16px;">
              <p style="margin:0 0 4px;color:#526366;font-size:13px;line-height:20px;">Tarifa base acordada</p>
              <p style="margin:0;color:#03323A;font-size:24px;font-weight:700;line-height:30px;">$${price} <span style="font-size:13px;font-weight:400;">+ IVA</span></p>
              <p style="margin:2px 0 0;color:#526366;font-size:12px;line-height:18px;">Por paquete entregado</p>
            </td></tr>
            <tr><td style="padding:16px 20px 20px;border-top:1px solid #E4E9E9;">
              <p style="margin:0 0 4px;color:#526366;font-size:13px;line-height:20px;">Colectas y recolección</p>
              <p style="margin:0;color:#03323A;font-size:14px;font-weight:700;line-height:22px;">${pickupTerms}</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td class="email-padding" style="padding:24px 36px 0;">
          <p style="margin:0 0 12px;color:#03323A;font-size:14px;font-weight:700;line-height:22px;">Desde tu portal podrás</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:#526366;font-size:14px;line-height:22px;">
            <tr><td width="24" valign="top" style="padding-bottom:8px;color:#03323A;">01</td><td style="padding-left:10px;padding-bottom:8px;">Solicitar colectas y consultar su estado.</td></tr>
            <tr><td width="24" valign="top" style="padding-bottom:8px;color:#03323A;">02</td><td style="padding-left:10px;padding-bottom:8px;">Crear envíos e imprimir tus etiquetas.</td></tr>
            <tr><td width="24" valign="top" style="color:#03323A;">03</td><td style="padding-left:10px;">Conectar tu cuenta de Mercado Libre.</td></tr>
          </table>
        </td></tr>
        <tr><td class="email-padding" style="padding:28px 36px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#03323A" style="border-radius:6px;mso-padding-alt:15px 24px;">
            <a class="email-button" href="${link}" target="_blank" style="display:block;padding:15px 24px;border:1px solid #03323A;border-radius:6px;color:#FFFFFF;background-color:#03323A;font-size:15px;line-height:22px;font-weight:700;text-decoration:none;">Activar mi cuenta</a>
          </td></tr></table>
          <p style="margin:12px 0 0;color:#526366;text-align:center;font-size:12px;line-height:19px;">Tu enlace es personal, de uso único y válido por 7 días.</p>
        </td></tr>
        <tr><td class="email-padding" style="padding:24px 36px 32px;">
          <p style="margin:0 0 6px;color:#6C7779;font-size:12px;line-height:19px;">Si el botón no funciona, copia este enlace en tu navegador:</p>
          <p style="margin:0;font-size:12px;line-height:19px;overflow-wrap:anywhere;word-break:break-all;"><a href="${link}" style="color:#03323A;text-decoration:underline;word-break:break-all;">${link}</a></p>
        </td></tr>
`,
    text: `Bienvenido a León Express\n\nHola, ${clientName}:\nActiva tu cuenta para coordinar tus retiros y gestionar tus envíos.\n\nCondiciones de tu cuenta\nTarifa base acordada: $${price} + IVA por paquete entregado.\nColectas y recolección: ${pickupTerms}.\n\nDesde tu portal podrás solicitar colectas, crear envíos e imprimir tus etiquetas y conectar tu cuenta de Mercado Libre.\n\nActivar mi cuenta: ${inviteUrl}\nTu enlace es personal, de uso único y válido por 7 días.\n\n¿Necesitas ayuda? soporte@leonexpress.cl\nLeón Express · Logística de envíos`,
  });
}

module.exports = { buildClientInvitationEmail };
