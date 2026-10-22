'use strict';

// Genera archivos locales con datos ficticios; no llama al proveedor de correo.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildClientInvitationEmail } = require('../services/emailTemplates/clientInvitation');
const { buildOtpEmail } = require('../services/emailTemplates/otp');
const { buildPickupRequestedEmail } = require('../services/emailTemplates/pickupRequested');
const { escapeHtml } = require('../services/emailTemplates/brandLayout');

function generateEmailPreviews(outputDirectory = path.join(os.tmpdir(), 'leon-correos')) {
  const examples = [
    { file: 'bienvenida', title: 'Bienvenida', description: 'Invitación para activar la cuenta de cliente.', mail: buildClientInvitationEmail({
      clientName: 'Marval test', basePrice: 3500, hasFreePickups: true,
      inviteUrl: 'https://app.leonexpress.cl/portal/registro?token=ejemplo-de-invitacion'
    }) },
    { file: 'codigo-acceso', title: 'Código de acceso', description: 'Código temporal para ingresar al portal.', mail: buildOtpEmail({ clientName: 'Marval test', code: '482916' }) },
    { file: 'solicitud-recolecta', title: 'Solicitud de recolecta', description: 'Confirmación del retiro solicitado, pendiente de asignación.', mail: buildPickupRequestedEmail({
      clientName: 'Marval test', scheduledDate: '2026-10-22T17:30:00Z',
      notes: 'Retirar en recepción.\nTocar timbre 2B. Hay 15 paquetes.',
      pickupId: 'LE-RETIRO-EJEMPLO', pickupAddress: 'Pedernal 3793, Puente Alto',
      portalUrl: 'https://app.leonexpress.cl/pickups'
    }) },
  ];
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const example of examples) {
    example.html = example.mail.html;
    for (const attachment of example.mail.attachments) {
      example.html = example.html.replaceAll(`cid:${attachment.contentId}`, `data:${attachment.contentType};base64,${attachment.content.toString('base64')}`);
    }
    fs.writeFileSync(path.join(outputDirectory, `${example.file}.html`), example.html);
    fs.writeFileSync(path.join(outputDirectory, `${example.file}.txt`), example.mail.text);
  }
  const gallery = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Correos de León Express</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#F4F6F8;color:#03323A;font-family:Arial,Helvetica,sans-serif}main{max-width:1700px;margin:auto;padding:32px 24px}header{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:28px}h1{font-size:28px;letter-spacing:-.7px;margin:0 0 8px}p{font-size:14px;line-height:1.5;color:#526366;margin:0}nav{display:flex;gap:8px}button{border:1px solid #CED9D9;border-radius:6px;background:white;color:#03323A;padding:10px 16px;font-weight:700;cursor:pointer}button[aria-pressed=true]{background:#03323A;color:white;border-color:#03323A}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.card{min-width:0}.card-heading{padding:18px;background:white;border:1px solid #E4E9E9;border-radius:8px 8px 0 0}h2{font-size:17px;margin:0 0 6px}.card-heading a{display:inline-block;margin-top:10px;color:#03323A;font-size:12px}.window{position:relative;overflow:hidden;background:#F4F6F8;border:1px solid #E4E9E9;border-top:0;border-radius:0 0 8px 8px}iframe{display:block;border:0;transform-origin:top left}.demo{margin-top:24px;font-size:12px}@media(max-width:850px){.grid{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}main{padding:24px 16px}}
</style></head><body><main>
<header><div><h1>Correos de León Express</h1><p>Los tres correos de la app, con una misma identidad visual.</p></div><nav aria-label="Tamaño de vista previa"><button aria-pressed="true" onclick="setMode(false)">Escritorio</button><button aria-pressed="false" onclick="setMode(true)">Móvil</button></nav></header>
<div class="grid">${examples.map(example => `<section class="card"><div class="card-heading"><h2>${escapeHtml(example.title)}</h2><p>${escapeHtml(example.description)}</p><a href="${example.file}.html" target="_blank">Abrir correo completo</a></div><div class="window"><iframe title="${escapeHtml(example.title)}" srcdoc="${escapeHtml(example.html)}"></iframe></div></section>`).join('')}</div>
<p class="demo">Vista previa con datos de ejemplo.</p></main>
<script>
let mobile=false;
function fit(frame){const width=mobile?375:600;frame.style.width=width+'px';frame.style.height='100px';const height=Math.max(frame.contentDocument.body.scrollHeight,frame.contentDocument.documentElement.scrollHeight);const scale=Math.min(1,frame.parentElement.clientWidth/width);frame.style.height=height+'px';frame.style.transform='scale('+scale+')';frame.parentElement.style.height=Math.ceil(height*scale)+'px'}
function fitAll(){document.querySelectorAll('iframe').forEach(frame=>{if(frame.contentDocument?.body)fit(frame)})}
function setMode(value){mobile=value;document.querySelectorAll('nav button').forEach((button,index)=>button.setAttribute('aria-pressed',String(Boolean(index)===mobile)));fitAll()}
document.querySelectorAll('iframe').forEach(frame=>frame.addEventListener('load',()=>fit(frame)));window.addEventListener('resize',fitAll);window.addEventListener('load',fitAll);
</script></body></html>`;
  fs.writeFileSync(path.join(outputDirectory, 'index.html'), gallery);
  return outputDirectory;
}

if (require.main === module) console.log(generateEmailPreviews(process.argv[2]));
module.exports = { generateEmailPreviews };
