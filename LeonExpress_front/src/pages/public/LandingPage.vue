<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { gsap } from 'gsap'
import logo from '@/assets/leon-express-light.svg'
import VaIconArrowUpRight from '@/components/icons/VaIconArrowUpRight.vue'
import { submitProspect } from '@/services/prospects'
const route = useRoute()
const landing = ref<HTMLElement | null>(null)
const titleLines = ['Tu negocio,', 'más lejos.']
let motion: gsap.MatchMedia | undefined
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
  motion = gsap.matchMedia()
  motion.add(
    '(prefers-reduced-motion: no-preference)',
    () => {
      const zoom = gsap.to('.city-photo', {
        scale: 1.075,
        duration: 24,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      })
      gsap.set('.title-character', { autoAlpha: 0 })
      const typing = gsap.timeline({ defaults: { duration: 0, ease: 'none' }, delay: 0.2 })
      typing
        .to('.title-line:first-child .title-character', { autoAlpha: 1, stagger: 0.075 })
        .to('.title-line:last-child .title-character', { autoAlpha: 1, stagger: 0.075 }, '+=0.16')

      const syncVisibility = () => {
        zoom.paused(document.hidden)
        typing.paused(document.hidden)
      }
      document.addEventListener('visibilitychange', syncVisibility)
      syncVisibility()
      return () => document.removeEventListener('visibilitychange', syncVisibility)
    },
    landing.value!,
  )
  if (route.hash === '#trabaja-con-nosotros') openForm()
})
onBeforeUnmount(() => {
  motion?.revert()
  onDialogClose()
})
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
  <div ref="landing" class="landing">
    <img
      src="/santiago_chile.webp"
      alt="Vista nocturna de Santiago con la cordillera de los Andes"
      class="city-photo"
      fetchpriority="high"
      width="1920"
      height="1280"
    />
    <div class="photo-shade" aria-hidden="true"></div>
    <div class="hero-frame">
      <header class="site-header">
        <RouterLink to="/" class="header-brand" aria-label="León Express, inicio">
          <img :src="logo" alt="León Express · Logística de envíos" width="190" height="92" />
        </RouterLink>
        <nav aria-label="Accesos">
          <RouterLink to="/auth/login" class="staff-link">Acceso personal</RouterLink>
          <RouterLink to="/portal/login" class="portal-link">Portal Partners <VaIconArrowUpRight /></RouterLink>
        </nav>
      </header>
      <main class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <h1 id="hero-title" aria-label="Tu negocio, más lejos.">
            <span
              v-for="(line, lineIndex) in titleLines"
              :key="line"
              class="title-line"
              :class="{ 'title-accent': lineIndex === 1 }"
              aria-hidden="true"
              ><span v-for="(character, index) in Array.from(line)" :key="index" class="title-character">{{
                character
              }}</span></span
            >
          </h1>
          <div class="hero-details">
            <p class="hero-description">Tú creas las oportunidades.<br />Nosotros llevamos tus paquetes.</p>
            <div class="cta-container">
              <button id="trabaja-con-nosotros" class="hero-cta" type="button" aria-haspopup="dialog" @click="openForm">
                <span>Trabaja con nosotros</span>
                <VaIconArrowUpRight />
              </button>
            </div>
            <div class="hero-services" aria-label="Servicios">
              <span>Colectas</span>
              <span>Portal de seguimiento para partners</span>
            </div>
          </div>
        </div>
        <div class="city-caption" aria-hidden="true">
          <span class="caption-line"></span><span>DESDE SANTIAGO.<br />PARA TU PRÓXIMO PASO.</span>
        </div>
      </main>
      <nav class="mobile-access" aria-label="Accesos móviles">
        <RouterLink to="/portal/login" class="portal-link">Portal Partners <VaIconArrowUpRight /></RouterLink>
        <RouterLink to="/auth/login" class="staff-link">Acceso personal</RouterLink>
      </nav>
      <footer class="site-footer">
        <span class="footer-tagline">Conectamos negocios.<br />Acercamos personas.</span>
        <span class="footer-copyright">© {{ new Date().getFullYear() }} León Express</span>
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
            Volver al inicio <VaIconArrowUpRight />
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
              {{ submitting ? 'Enviando solicitud…' : 'Enviar solicitud' }}<VaIconArrowUpRight v-if="!submitting" />
            </button>
            <p class="form-footnote">Revisaremos tu solicitud antes de habilitar tu cuenta de partner.</p>
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
  background: #081d22;
  color: #fff;
  font-family: Inter, Arial, sans-serif;
  line-height: 1.5;
  overflow: hidden;
}
.landing * {
  box-sizing: border-box;
}
.landing a {
  color: inherit;
  text-decoration: none;
}
.landing button {
  font-family: inherit;
}
.landing a:focus-visible,
.landing button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 5px;
}
.city-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 62%;
  z-index: -3;
}
.photo-shade {
  position: absolute;
  inset: 0;
  background-color: #00182045;
  background-image: linear-gradient(180deg, #00151d33, transparent 35%, #00151d14 65%, #00151d9c),
    linear-gradient(90deg, #001c2633, transparent);
  z-index: -2;
}
.hero-frame {
  width: 100%;
  max-width: 1680px;
  min-height: 100svh;
  margin: auto;
  padding: 0 6%;
  display: flex;
  flex-direction: column;
}
.site-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 24px;
}
.header-brand {
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 27px 23px 29px;
  border: 1px solid #ffffff38;
  border-top: 0;
  border-radius: 0 0 6px 6px;
  background: linear-gradient(160deg, #d7eddf14, #d7eddf0a);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
.header-brand img {
  display: block;
  width: 170px;
  height: 83px;
  object-fit: contain;
}
.site-header nav {
  grid-column: 3;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 30px;
  font-size: 12px;
  font-weight: 600;
}
.site-header nav a,
.mobile-access a {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 12px 16px;
  border-radius: 6px;
  gap: 10px;
}
.staff-link {
  color: #edf5ef !important;
  border: 1px solid #ffffff3d;
  background: #001d2229;
}
.portal-link {
  border: 1px solid #ffffff70;
  background: #ffffff12;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.staff-link:hover,
.portal-link:hover {
  background: #ffffff24;
}
.mobile-access {
  display: none;
}
.hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 64px 0 76px;
  min-height: 550px;
}
.hero-copy {
  width: min(100%, 760px);
  text-align: left;
}
.hero h1 {
  font-size: clamp(72px, 7.4vw, 110px);
  font-weight: 700;
  line-height: 1.02;
  letter-spacing: -0.055em;
  margin: 0 0 23px;
  text-shadow: 0 2px 18px #00131b70;
}
.title-accent {
  color: var(--accent);
}
.title-line {
  display: block;
  white-space: pre;
}
.hero-description {
  font-size: 15px;
  line-height: 1.85;
  color: #f1f5ef;
  max-width: 410px;
  margin: 0 0 29px;
  margin-inline: 0;
  text-shadow: 0 1px 10px #00131b99;
}
.cta-container {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
.hero-cta {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  background: var(--accent);
  border: 0;
  border-radius: 6px;
  color: var(--ink);
  padding: 15px 20px;
  min-height: 52px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}
.hero-cta:hover {
  background: #e4ffc2;
}
.hero-services {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px 24px;
  flex-wrap: wrap;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.8;
  color: #fff;
  text-shadow: 0 1px 6px #00131bcc;
  margin-top: 25px;
}
.city-caption {
  position: absolute;
  right: 0;
  bottom: 50px;
  display: flex;
  align-items: center;
  gap: 15px;
  font-size: 9px;
  letter-spacing: 1.4px;
  line-height: 1.9;
  color: #f1f5ef;
}
.caption-line {
  height: 1px;
  width: 35px;
  background: #d5f3aa;
}
.site-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 0;
  border-top: 1px solid #ffffff30;
  font-size: 10px;
  line-height: 1.8;
  color: #dae6df;
}
.footer-copyright {
  font-size: 9px;
  letter-spacing: 0.3px;
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

@media (min-width: 1101px) {
  .hero-frame {
    max-width: none;
    padding-inline: 6%;
  }
  .site-header {
    grid-template-columns: auto 1fr;
  }
  .header-brand {
    grid-column: 1;
  }
  .site-header nav {
    grid-column: 2;
    padding-top: 38px;
  }
  .hero {
    justify-content: flex-start;
    padding-block: 64px 96px;
  }
  .hero-copy {
    width: min(65%, 900px);
  }
  .hero h1 {
    font-size: clamp(84px, 8.1vw, 150px);
    line-height: 0.98;
    margin-bottom: 36px;
  }
  .hero-details {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 28px;
    max-width: 700px;
  }
  .hero-description {
    font-size: clamp(16px, 1.15vw, 20px);
    line-height: 1.7;
    margin-bottom: 0;
  }
  .hero-cta {
    min-height: 54px;
    padding-inline: 24px;
    gap: 28px;
    white-space: nowrap;
  }
  .hero-services {
    grid-column: 1 / -1;
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid #ffffff30;
    gap: 24px;
    font-size: 13px;
  }
  .photo-shade {
    background-image: linear-gradient(180deg, #00151d20, transparent 35%, #00151d14 65%, #00151d9c),
      linear-gradient(90deg, #00151d70, #00151d20 48%, transparent 72%);
  }
}
@media (max-width: 1100px) {
  .site-header {
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
  }
  .header-brand {
    padding: 24px 20px 26px;
  }
  .header-brand img {
    width: 150px;
    height: 73px;
  }
  .site-header nav {
    gap: 8px;
    flex-direction: column;
    align-items: stretch;
    padding-top: 20px;
    font-size: 11px;
  }
  .site-header nav a {
    min-height: 40px;
    padding: 9px 13px;
  }
  .hero-copy {
    width: min(100%, 680px);
    padding: 40px;
  }
  .hero h1 {
    font-size: 76px;
  }
  .city-caption {
    display: none;
  }
}
@media (max-width: 600px) {
  .hero-frame {
    padding: 0 6%;
    min-height: 100svh;
  }
  .site-header {
    display: flex;
    justify-content: center;
  }
  .header-brand {
    padding: 26px 19px 28px;
  }
  .header-brand img {
    width: 158px;
    height: 77px;
  }
  .site-header nav {
    display: none;
  }
  .hero {
    padding: 36px 0;
    min-height: 0;
    justify-content: center;
    align-items: center;
  }
  .hero-copy {
    width: 100%;
    padding: 0;
  }
  .hero h1 {
    font-size: clamp(46px, 14vw, 68px);
    letter-spacing: -0.055em;
    margin-bottom: 19px;
  }
  .hero-description {
    font-size: 14px;
    line-height: 1.9;
    margin-bottom: 25px;
  }
  .hero-cta {
    font-size: 13px;
    min-height: 52px;
    padding: 15px 20px;
    gap: 28px;
  }
  .hero-services {
    font-size: 12px;
    gap: 8px 20px;
    margin-top: 22px;
    align-items: center;
  }
  .city-photo {
    object-position: 70% center;
  }
  .photo-shade {
    background-image: linear-gradient(180deg, #00151d26, transparent 30%, #00151d14 65%, #00151db3);
  }
  .mobile-access {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 21px;
    font-size: 11px;
    font-weight: 600;
  }
  .mobile-access a {
    min-height: 46px;
    padding: 10px;
    gap: 9px;
  }
  .site-footer {
    padding: 17px 0;
    font-size: 9px;
    gap: 15px;
  }
  .footer-copyright {
    font-size: 8px;
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
}
</style>
