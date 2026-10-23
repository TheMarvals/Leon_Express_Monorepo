<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import logo from '@/assets/leon-express-light.svg'
import { submitProspect } from '@/services/prospects'
const route = useRoute()
const applicationDialog = ref<HTMLDialogElement | null>(null)
let previousOverflow = ''
let bodyLocked = false
const form = reactive({
  company: '',
  contact_name: '',
  email: '',
  phone: '',
  commune: '',
  volume: '',
  message: '',
  website: '',
  consent: false,
})
const submitting = ref(false)
const sent = ref(false)
const error = ref('')
const volumes = ['Menos de 10', '10 a 50', '51 a 100', 'Más de 100', 'Estoy comenzando']
function openForm() {
  if (!applicationDialog.value || applicationDialog.value.open) return
  previousOverflow = document.body.style.overflow
  bodyLocked = true
  document.body.style.overflow = 'hidden'
  applicationDialog.value.showModal()
}
function closeForm() {
  applicationDialog.value?.close()
  onDialogClose()
}
function onDialogClose() {
  if (!bodyLocked) return
  document.body.style.overflow = previousOverflow
  bodyLocked = false
}
function dismissBackdrop(event: MouseEvent) {
  const dialog = applicationDialog.value
  if (event.target !== dialog || !dialog) return
  const rect = dialog.getBoundingClientRect()
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    closeForm()
}
onMounted(() => {
  if (route.hash === '#trabaja-con-nosotros') openForm()
})
onBeforeUnmount(onDialogClose)
async function submit() {
  if (submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await submitProspect({ ...form })
    sent.value = true
  } catch (err: any) {
    error.value =
      err.response?.data?.error || 'No pudimos enviar tu solicitud. Revisa tu conexión e intenta nuevamente.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="landing">
    <img
      src="/santiago_chile.jpg"
      alt="Vista nocturna de Santiago con la cordillera de los Andes"
      class="city-photo"
      fetchpriority="high"
      width="1920"
      height="1280"
    />
    <div class="photo-shade" aria-hidden="true"></div>
    <div class="hero-frame">
      <header class="site-header">
        <span class="header-location">SANTIAGO, CHILE</span>
        <nav aria-label="Accesos">
          <RouterLink to="/auth/login" class="staff-link">Acceso personal</RouterLink
          ><RouterLink to="/portal/login" class="portal-link"
            >Portal clientes <span aria-hidden="true">↗</span></RouterLink
          >
        </nav>
      </header>
      <main class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow">
            LEÓN EXPRESS · TU NEGOCIO EN MOVIMIENTO
          </p>
          <h1 id="hero-title">Tu negocio,<br /><span>más lejos.</span></h1>
          <p class="hero-description">Tú creas las oportunidades.<br />Nosotros llevamos tus paquetes.</p>
          <button id="trabaja-con-nosotros" class="hero-cta" type="button" aria-haspopup="dialog" @click="openForm">
            Trabaja con nosotros <span aria-hidden="true">↗</span>
          </button>
          <div class="hero-services" aria-label="Servicios">
            <span>Colectas</span><span>Portal de seguimiento para clientes</span>
          </div>
        </div>
        <div class="city-caption" aria-hidden="true">
          <span class="caption-line"></span><span>DESDE SANTIAGO.<br />PARA TU PRÓXIMO PASO.</span>
        </div>
      </main>
      <footer class="site-footer">
        <RouterLink to="/" class="footer-brand" aria-label="León Express, inicio"
          ><img :src="logo" alt="León Express · Logística de envíos" width="125" height="61" /></RouterLink
        ><span class="footer-tagline">Conectamos negocios.<br />Acercamos personas.</span
        ><span class="footer-copyright">© {{ new Date().getFullYear() }} León Express</span>
      </footer>
    </div>
    <dialog
      ref="applicationDialog"
      class="application-dialog"
      aria-labelledby="application-title"
      @close="onDialogClose"
      @click="dismissBackdrop"
    >
      <div class="modal-content">
        <header class="modal-header">
          <div>
            <h2 id="application-title">Trabajemos juntos.</h2>
          </div>
          <button class="close-button" aria-label="Cerrar formulario" type="button" @click="closeForm">×</button>
        </header>
        <div v-if="sent" class="success-state" role="status">
          <span class="material-icons success-icon" aria-hidden="true">check_circle</span>
          <h3>¡Solicitud recibida!</h3>
          <p>Gracias por contarnos sobre tu negocio. Nuestro equipo se pondrá en contacto contigo.</p>
          <p class="success-note">
            Recibirás una invitación para activar tu portal cuando coordinemos las condiciones del servicio.
          </p>
          <button class="submit-button" type="button" @click="closeForm">
            Volver al inicio <span aria-hidden="true">↗</span>
          </button>
        </div>
        <template v-else>
          <form @submit.prevent="submit">
            <p class="modal-intro">Cuéntanos sobre tu negocio y coordinemos tus próximos envíos.</p>
            <p class="form-intro">Los campos con * son obligatorios.</p>
            <div class="form-grid">
              <label class="full"
                >Nombre de tu empresa o tienda *<input
                  v-model="form.company"
                  name="company"
                  autofocus
                  autocomplete="organization"
                  required
                  minlength="2"
                  maxlength="120"
                  placeholder="¿Cómo se llama tu negocio?"
              /></label>
              <label class="full"
                >Nombre de contacto *<input
                  v-model="form.contact_name"
                  name="contact_name"
                  autocomplete="name"
                  required
                  minlength="2"
                  maxlength="100"
                  placeholder="Tu nombre y apellido"
              /></label>
              <label
                >Correo electrónico *<input
                  v-model="form.email"
                  name="email"
                  type="email"
                  autocomplete="email"
                  required
                  maxlength="100"
                  placeholder="nombre@empresa.cl"
              /></label>
              <label
                >Teléfono o WhatsApp *<input
                  v-model="form.phone"
                  name="phone"
                  type="tel"
                  autocomplete="tel"
                  required
                  minlength="8"
                  maxlength="20"
                  pattern="[+0-9 ()\-]{8,20}"
                  placeholder="+56 9 1234 5678"
              /></label>
              <label
                >Comuna de retiro *<input
                  v-model="form.commune"
                  name="commune"
                  autocomplete="address-level3"
                  required
                  minlength="2"
                  maxlength="100"
                  placeholder="Ej. Providencia"
              /></label>
              <label
                >Envíos diarios estimados *<select v-model="form.volume" name="volume" required>
                  <option disabled value="">Selecciona una opción</option>
                  <option v-for="volume in volumes" :key="volume">{{ volume }}</option>
                </select></label
              >
              <label class="full"
                >¿Qué necesitas para tus envíos? <span class="optional">(opcional)</span
                ><textarea
                  v-model="form.message"
                  name="message"
                  rows="3"
                  maxlength="2000"
                  placeholder="Cuéntanos sobre tus productos, retiros o entregas."
                />
              </label>
            </div>
            <div class="honey" aria-hidden="true">
              <label>Sitio web<input v-model="form.website" name="website" tabindex="-1" autocomplete="off" /></label>
            </div>
            <label class="consent"
              ><input v-model="form.consent" type="checkbox" required name="consent" /><span
                >Autorizo a León Express a utilizar estos datos para contactarme sobre sus servicios de envío.</span
              ></label
            >
            <p v-if="error" class="form-error" role="alert">{{ error }}</p>
            <button class="submit-button" type="submit" :disabled="submitting" :aria-busy="submitting">
              {{ submitting ? 'Enviando solicitud…' : 'Enviar solicitud'
              }}<span v-if="!submitting" aria-hidden="true">↗</span>
            </button>
            <p class="form-footnote">Revisaremos tu solicitud antes de habilitar una cuenta de cliente.</p>
          </form>
        </template>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.landing {
  --ink: #03323a;
  --accent: #d5f3aa;
  position: relative;
  isolation: isolate;
  min-height: 100svh;
  background: #102e30;
  color: white;
  font-family: Inter, Arial, sans-serif;
  line-height: 1.5;
  overflow: hidden;
}
.landing * {
  box-sizing: border-box;
}
.landing a {
  text-decoration: none;
  color: inherit;
}
.landing button {
  font-family: inherit;
}
.landing a:focus-visible,
.landing button:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 5px;
}
.city-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 63%;
  z-index: -3;
}
.photo-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(0, 26, 29, 0.89) 0%, rgba(0, 26, 29, 0.66) 38%, rgba(0, 26, 29, 0.08) 78%),
    linear-gradient(0deg, rgba(0, 20, 23, 0.8), transparent 30%, transparent 75%, rgba(0, 20, 23, 0.32));
  z-index: -2;
}
.hero-frame {
  width: 100%;
  max-width: 1680px;
  min-height: 100svh;
  margin: auto;
  display: flex;
  flex-direction: column;
  padding: 0 6%;
}
.site-header {
  padding: 27px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}
.header-location {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 9px;
  letter-spacing: 1.8px;
  color: #dbe7df;
  font-weight: 600;
}
.site-header nav {
  display: flex;
  align-items: center;
  gap: 30px;
  font-size: 12px;
  font-weight: 600;
}
.staff-link {
  color: #d7e2df !important;
}
.portal-link {
  display: flex;
  gap: 25px;
  align-items: center;
  padding: 13px 19px;
  border: 1px solid #ffffff70;
  background: #ffffff0a;
  backdrop-filter: blur(12px);
  border-radius: 5px;
}
.portal-link:hover {
  background: #ffffff20;
}
.portal-link span {
  font-size: 18px;
  line-height: 1;
}
.hero {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  padding: 60px 0 85px;
  min-height: 600px;
}
.hero-copy {
  max-width: 850px;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 2px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 11px;
  line-height: 1.7;
  margin: 0 0 28px;
}
.hero h1 {
  font-size: clamp(76px, 8.6vw, 132px);
  line-height: 1.01;
  letter-spacing: -6px;
  font-weight: 600;
  margin: 0 0 29px;
}
.hero h1 span {
  color: var(--accent);
}
.hero-description {
  font-size: 17px;
  line-height: 1.85;
  letter-spacing: -0.2px;
  color: #dde8e4;
  margin: 0 0 34px;
  max-width: 420px;
}
.hero-cta {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 55px;
  background: var(--accent);
  color: var(--ink);
  border: 0;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 700;
  min-height: 55px;
  padding: 16px 23px;
  cursor: pointer;
  transition:
    background 0.2s,
    transform 0.2s;
}
.hero-cta:hover {
  background: #e3ffc0;
  transform: translateY(-2px);
}
.hero-cta span {
  font-size: 24px;
  line-height: 1;
  font-weight: 400;
}
.hero-services {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  color: #bfd0c8;
  font-size: 10px;
  letter-spacing: 0.2px;
  margin-top: 30px;
}
.hero-services span + span:before {
  content: '·';
  color: #9fb99c;
  margin-right: 12px;
}
.city-caption {
  position: absolute;
  right: 0;
  bottom: 90px;
  display: flex;
  gap: 15px;
  align-items: center;
  font-size: 9px;
  letter-spacing: 1.8px;
  line-height: 1.9;
  color: #f1f6ed;
}
.caption-line {
  display: block;
  height: 1px;
  width: 43px;
  background: #d5f3aa;
}
.site-footer {
  padding: 20px 0;
  border-top: 1px solid #ffffff30;
  display: flex;
  align-items: center;
  gap: 27px;
  color: #c3d2ca;
  font-size: 10px;
  letter-spacing: 0.2px;
}
.footer-brand {
  display: block;
  flex-shrink: 0;
}
.footer-brand img {
  display: block;
  width: 125px;
  height: 61px;
  object-fit: contain;
}
.footer-tagline {
  line-height: 1.7;
  padding-left: 25px;
  border-left: 1px solid #ffffff30;
}
.footer-copyright {
  margin-left: auto;
  font-size: 9px;
  letter-spacing: 0.4px;
}
.application-dialog {
  border: 1px solid #d6dfd9;
  border-radius: 13px;
  width: min(580px, calc(100% - 32px));
  max-height: calc(100svh - 40px);
  margin: auto;
  padding: 0;
  color: var(--ink);
  background: #fff;
  box-shadow: 0 30px 100px #00171970;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.application-dialog::backdrop {
  background: #001d24b8;
  backdrop-filter: blur(9px);
}
.modal-content {
  padding: 30px;
}
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.modal-header .eyebrow {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: #628266;
  margin-bottom: 8px;
}
.modal-header h2 {
  font-size: 29px;
  letter-spacing: -1.1px;
  font-weight: 600;
  line-height: 1.2;
  margin: 0;
}
.close-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  background: #f0f4f0;
  color: #365457;
  border: 0;
  border-radius: 50%;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}
.close-button:hover {
  background: #e2ebe2;
}
.application-dialog .close-button:focus-visible {
  outline-color: #527f65;
}
.modal-intro {
  font-size: 13px;
  color: #617575;
  line-height: 1.7;
  margin-bottom: 5px;
}
.form-intro {
  font-size: 10px;
  color: #617575;
  margin-bottom: 20px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 14px;
}
.form-grid label {
  font-size: 11px;
  font-weight: 600;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.full {
  grid-column: 1/-1;
}
.form-grid input,
.form-grid select,
.form-grid textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid #d4deda;
  border-radius: 5px;
  background: #fafcf9;
  padding: 10px 11px;
  font-family: inherit;
  font-size: 13px;
  color: var(--ink);
  outline: none;
  line-height: 1.5;
}
.form-grid input:focus,
.form-grid select:focus,
.form-grid textarea:focus {
  border-color: #527f65;
  box-shadow: 0 0 0 3px #a8cda333;
}
.form-grid textarea {
  resize: vertical;
  min-height: 75px;
}
.optional {
  display: contents;
  color: #617575;
  font-weight: 400;
}
.consent {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 11px;
  line-height: 1.7;
  color: #617575;
  margin: 18px 0;
}
.consent input {
  accent-color: var(--ink);
  margin-top: 2px;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
}
.submit-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: var(--ink);
  color: #fff;
  border: 0;
  border-radius: 5px;
  width: 100%;
  font-size: 13px;
  font-weight: 600;
  min-height: 48px;
  padding: 13px 19px;
  cursor: pointer;
}
.submit-button:hover {
  background: #14525a;
}
.submit-button:focus-visible {
  outline-color: #527f65 !important;
}
.submit-button span {
  font-size: 21px;
  line-height: 1;
}
.submit-button:disabled {
  opacity: 0.65;
  cursor: wait;
}
.form-footnote {
  font-size: 10px;
  color: #617575;
  line-height: 1.7;
  text-align: center;
  margin: 13px 0 0;
}
.form-error {
  padding: 11px;
  background: #fff0ec;
  border-radius: 5px;
  color: #a12c1a;
  font-size: 12px;
  line-height: 1.7;
  margin-bottom: 15px;
}
.honey {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.success-state {
  padding: 20px 0 4px;
}
.success-icon {
  color: #588765;
  font-size: 45px;
  margin-bottom: 20px;
}
.success-state h3 {
  font-size: 26px;
  letter-spacing: -0.8px;
  font-weight: 600;
  margin-bottom: 15px;
}
.success-state p {
  font-size: 14px;
  line-height: 1.9;
  color: #617575;
  margin-bottom: 22px;
}
.success-state .success-note {
  font-size: 12px;
  background: #f4f7f1;
  padding: 16px;
  border-radius: 6px;
}
@media (min-width: 1600px) {
  .hero-frame {
    padding-left: 100px;
    padding-right: 100px;
  }
  .hero {
    min-height: 700px;
  }
}
@media (max-width: 900px) {
  .hero h1 {
    font-size: 95px;
    letter-spacing: -4px;
  }
  .city-caption {
    display: none;
  }
  .hero {
    padding: 65px 0 80px;
    min-height: 620px;
  }
  .photo-shade {
    background: linear-gradient(90deg, #001a1de0, #001a1d60), linear-gradient(0deg, #001417b3, transparent 45%);
  }
  .site-header nav {
    gap: 20px;
  }
}
@media (max-width: 600px) {
  .hero-frame {
    padding: 0 7%;
    min-height: 100svh;
  }
  .site-header {
    padding: 22px 0 20px;
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
    border-bottom: 1px solid #ffffff24;
  }

  .site-header nav {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: stretch;
    font-size: 12px;
  }
  .site-header nav a {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 11px 10px;
    border-radius: 5px;
    font-size: 12px;
  }
  .portal-link {
    order: -1;
    gap: 10px;
    background: #ffffff12;
  }
  .staff-link {
    border: 1px solid #ffffff30;
    background: #001a1d24;
  }
  .hero {
    padding: 45px 0 65px;
    min-height: 510px;
    align-items: center;
  }
  .hero h1 {
    font-size: clamp(67px, 15.5vw, 92px);
    letter-spacing: -3.8px;
    margin-bottom: 25px;
  }
  .hero .eyebrow {
    font-size: 8px;
    letter-spacing: 1.3px;
    gap: 9px;
    margin-bottom: 26px;
  }
  .hero-description {
    font-size: 14px;
    line-height: 1.9;
    margin-bottom: 30px;
  }
  .hero-cta {
    padding: 16px 20px;
    gap: 36px;
    min-height: 53px;
    font-size: 12px;
  }
  .hero-services {
    font-size: 9px;
    gap: 9px;
    margin-top: 26px;
  }
  .hero-services span + span:before {
    margin-right: 9px;
  }
  .city-photo {
    object-position: 70% center;
  }
  .photo-shade {
    background: linear-gradient(90deg, #001a1dc9, #001a1d80),
      linear-gradient(0deg, #001417cc, transparent 40%, #0014171a);
  }
  .header-location {
    display: none;
  }
  .site-footer {
    padding: 18px 0;
    gap: 17px;
    flex-wrap: wrap;
  }
  .footer-brand img {
    width: 96px;
    height: 47px;
  }
  .footer-tagline {
    font-size: 9px;
    padding-left: 16px;
  }
  .footer-copyright {
    font-size: 8px;
    margin-left: auto;
  }
  .application-dialog {
    max-height: calc(100svh - 24px);
    width: calc(100% - 24px);
    border-radius: 10px;
  }
  .modal-content {
    padding: 24px 20px;
  }
  .modal-header h2 {
    font-size: 26px;
  }
  .form-grid input,
  .form-grid select,
  .form-grid textarea {
    font-size: 16px;
  }
  .form-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .full {
    grid-column: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hero-cta {
    transition: none;
  }
  .hero-cta:hover {
    transform: none;
  }
}
</style>
