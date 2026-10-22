'use strict';

const { Resend } = require('resend');
const { buildClientInvitationEmail } = require('./emailTemplates/clientInvitation');
const { buildPickupRequestedEmail } = require('./emailTemplates/pickupRequested');
const { buildOtpEmail } = require('./emailTemplates/otp');

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 'YOUR_RESEND_API_KEY') {
    return null;
  }
  return new Resend(apiKey);
}

function getDefaultFrom() {
  return process.env.EMAIL_FROM || 'Leon Express <onboarding@resend.dev>';
}

module.exports = {
  /**
   * Envía el código de acceso temporal (OTP) al cliente
   */
  async sendOtpEmail({ to, code, clientName = '' }) {
    const { html, text, attachments } = buildOtpEmail({ code, clientName });

    const resend = getResend();
    const defaultFrom = getDefaultFrom();

    if (!resend) {
      console.warn(`⚠️ [EMAIL] RESEND_API_KEY no configurada. Simulando envío de OTP a ${to}: [${code}]`);
      return { success: true, simulated: true };
    }

    try {
      const response = await resend.emails.send({
        from: defaultFrom,
        to,
        subject: `Tu código de acceso: ${code} - León Express`,
        html,
        text,
        attachments,
      });

      console.log(`✉️ [EMAIL] Correo OTP enviado exitosamente a ${to}. ID: ${response?.data?.id || 'OK'}`);
      return { success: true, id: response?.data?.id };
    } catch (error) {
      console.error(`❌ [EMAIL] Error enviando correo OTP a ${to}:`, error.message);
      // No frenar la app si falla el proveedor de correo
      return { success: false, error: error.message };
    }
  },

  /**
   * Notificación cuando el cliente solicita una colecta
   */
  async sendPickupRequestedNotification({ to, clientName, scheduledDate, notes, pickupId, pickupAddress, portalUrl }) {
    const { html, text, attachments } = buildPickupRequestedEmail({
      clientName, scheduledDate, notes, pickupId, pickupAddress, portalUrl
    });

    const resend = getResend();
    const defaultFrom = getDefaultFrom();

    if (!resend) {
      console.warn(`⚠️ [EMAIL] RESEND_API_KEY no configurada. Simulando notificación de colecta para ${to}`);
      return { success: true, simulated: true };
    }

    try {
      const response = await resend.emails.send({
        from: defaultFrom,
        to,
        subject: `Solicitud de Colecta Recibida - León Express`,
        html,
        text,
        attachments,
      });
      return { success: true, id: response?.data?.id };
    } catch (error) {
      console.error(`❌ [EMAIL] Error enviando confirmación de colecta a ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Envía la invitación privada de registro al nuevo cliente
   */
  async sendClientInvitationEmail({ to, clientName, basePrice, hasFreePickups, inviteUrl }) {
    const { html, text, attachments } = buildClientInvitationEmail({
      clientName, basePrice, hasFreePickups, inviteUrl
    });

    const resend = getResend();
    const defaultFrom = getDefaultFrom();

    if (!resend) {
      console.warn(`⚠️ [EMAIL] RESEND_API_KEY no configurada. Simulando invitación a ${to}: ${inviteUrl}`);
      return { success: true, simulated: true };
    }

    try {
      const response = await resend.emails.send({
        from: defaultFrom,
        to,
        subject: `¡Bienvenido a León Express! Activa tu cuenta de cliente`,
        html,
        text,
        attachments,
      });
      console.log(`✉️ [EMAIL] Invitación enviada exitosamente a ${to}. ID: ${response?.data?.id || 'OK'}`);
      return { success: true, id: response?.data?.id };
    } catch (error) {
      console.error(`❌ [EMAIL] Error enviando invitación a ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};
