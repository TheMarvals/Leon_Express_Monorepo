<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import LabelBranding from './LabelBranding.vue'
import { MAX_LABEL_NOTES } from './labelNotes'

const props = defineProps<{ pkg: any }>()
const emit = defineEmits<{ (event: 'ready'): void; (event: 'error', message: string): void }>()
const host = ref<HTMLElement | null>(null)
const labelRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const qrCanvasRef = ref<HTMLCanvasElement | null>(null)
const isCompact = ref(false)
const previewScale = ref(1)
const previewHeight = ref(567)
let observer: ResizeObserver | undefined
let revision = 0

const destinationDetails = computed(() => {
  const address = props.pkg?.destination_address || ''
  const notes = address.match(/\s*\(Obs:\s*([\s\S]*)\)\s*$/i)
  return { address: notes ? address.slice(0, notes.index).trim() : address.trim(), notes: notes?.[1]?.trim() || '' }
})
const extractedCommune = computed(() => {
  if (props.pkg?.commune) return String(props.pkg.commune).toUpperCase()
  const parts = destinationDetails.value.address.split(',')
  return parts.length > 1 ? parts[parts.length - 1].trim().toUpperCase() : 'DESTINO'
})
const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) : ''

function fitPreview() {
  if (!host.value || !labelRef.value) return
  previewScale.value = Math.min(1, host.value.clientWidth / labelRef.value.offsetWidth)
  previewHeight.value = labelRef.value.offsetHeight * previewScale.value
}
async function preparePrint() {
  const current = ++revision
  if (!qrCanvasRef.value || !props.pkg?.tracking_code) throw new Error('Falta el código de seguimiento.')
  if (destinationDetails.value.notes.length > MAX_LABEL_NOTES) {
    throw new Error(
      `Las observaciones superan los ${MAX_LABEL_NOTES} caracteres. Acórtalas antes de imprimir la etiqueta.`,
    )
  }
  await QRCode.toCanvas(qrCanvasRef.value, props.pkg.tracking_code, {
    width: 540,
    margin: 4,
    color: { dark: '#000000', light: '#ffffff' },
  })
  await document.fonts.ready
  await Promise.all(
    Array.from(labelRef.value?.querySelectorAll('img') || []).map(async (image) => {
      try {
        await image.decode()
      } catch {
        throw new Error('No se pudo cargar uno de los logos. Vuelve a cargar la etiqueta.')
      }
    }),
  )
  if (current !== revision) return
  isCompact.value = false
  await nextTick()
  const label = labelRef.value!
  const content = contentRef.value!
  const available =
    label.clientHeight -
    parseFloat(getComputedStyle(label).paddingTop) -
    parseFloat(getComputedStyle(label).paddingBottom)
  if (content.scrollHeight > available + 1) {
    isCompact.value = true
    await nextTick()
  }
  if (content.scrollHeight > available + 1) {
    throw new Error(
      'Los datos exceden el espacio de la etiqueta de 100 × 150 mm. Revisa la dirección y las observaciones antes de imprimir.',
    )
  }
  fitPreview()
}
async function renderLabel() {
  try {
    await preparePrint()
    emit('ready')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : 'No se pudo preparar la etiqueta.')
  }
}
onMounted(() => {
  observer = new ResizeObserver(fitPreview)
  if (host.value) observer.observe(host.value)
  renderLabel()
})
watch(() => props.pkg, renderLabel, { deep: true, flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  revision++
})
defineExpose({ preparePrint })
</script>

<template>
  <div ref="host" class="label-preview" :style="{ height: `${previewHeight}px` }">
    <div
      ref="labelRef"
      class="thermal-label"
      :class="{ 'thermal-label--compact': isCompact }"
      :style="{ transform: `scale(${previewScale})` }"
    >
      <div ref="contentRef" class="label-content">
        <LabelBranding :client-logo="pkg.client_label_logo" :client-name="pkg.client?.client_name" />

        <div class="commune-box">
          <span class="section-title">COMUNA DE DESTINO</span>
          <strong>{{ extractedCommune }}</strong>
        </div>

        <section class="qr-section">
          <canvas
            ref="qrCanvasRef"
            class="qr-canvas"
            role="img"
            :aria-label="`Código QR: ${pkg.tracking_code}`"
          ></canvas>
          <div class="tracking-details">
            <span class="section-title">N° DE SEGUIMIENTO</span>
            <p class="tracking-code">{{ pkg.tracking_code }}</p>
          </div>
        </section>

        <section class="recipient-section">
          <div class="address-block">
            <div class="section-title">DIRECCIÓN DE ENTREGA</div>
            <p class="recipient-address">{{ destinationDetails.address }}</p>
          </div>
          <div class="contact-block">
            <div class="section-title">RECIBE</div>
            <p class="recipient-name">{{ pkg.recipient_name }}</p>
            <p v-if="pkg.recipient_phone" class="recipient-phone">
              <span class="phone-label">TEL.</span> {{ pkg.recipient_phone }}
            </p>
          </div>
          <div v-if="destinationDetails.notes" class="notes-block">
            <div class="section-title">OBSERVACIONES</div>
            <p>{{ destinationDetails.notes }}</p>
          </div>
        </section>

        <!-- Bloque COD (Cobro contra entrega) si aplica -->
        <section v-if="pkg.is_cod && Number(pkg.cod_amount) > 0" class="cod-banner">
          <span class="cod-tag">COBRO CONTRA ENTREGA (COD)</span>
          <span class="cod-amount"> ${{ Number(pkg.cod_amount).toLocaleString('es-CL') }} </span>
        </section>

        <!-- Pie de Etiqueta con Remitente y Fecha -->
        <footer class="label-footer">
          <div>
            <span class="section-title">REMITENTE</span>
            <span class="font-bold">{{ pkg.client?.client_name || 'Cliente' }}</span>
          </div>
          <div>
            <span class="section-title">FECHA DE EMISIÓN</span>
            <span>{{ formatDate(pkg.created_at) }}</span>
          </div>
        </footer>
      </div>
    </div>
  </div>
</template>
<style scoped>
.label-preview {
  width: 100%;
  max-width: 100mm;
  margin-inline: auto;
}
.thermal-label {
  width: 100mm;
  height: 150mm;
  padding: 5mm;
  overflow: hidden;
  box-sizing: border-box;
  background: white;
  color: black;
  transform-origin: top left;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10pt;
  line-height: 1.2;
  text-align: left;
  font-weight: 400;
  letter-spacing: normal;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.thermal-label *,
.thermal-label *::before,
.thermal-label *::after {
  box-sizing: border-box;
}
.label-content {
  display: flex;
  flex-direction: column;
  gap: 3mm;
  min-height: 140mm;
  transform-origin: top center;
}
.label-content > * {
  flex-shrink: 0;
  min-width: 0;
}
.thermal-label--compact .label-content {
  gap: 1.5mm;
}
.font-bold {
  font-weight: 700;
}
@media print {
  .label-preview {
    width: 100mm !important;
    max-width: none;
    height: 150mm !important;
    margin: 0;
  }
  .thermal-label {
    transform: none !important;
    margin: 0;
    break-inside: avoid;
  }
}
.commune-box {
  display: flex;
  flex-direction: column;
  gap: 1mm;
  border-top: 0.6mm solid #000;
  border-bottom: 0.6mm solid #000;
  padding: 2.5mm 0;
}

.commune-box strong {
  font-size: 21pt;
  font-weight: 900;
  line-height: 1.05;
  overflow-wrap: anywhere;
}

.section-title {
  display: block;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.7px;
  line-height: 1.2;
  color: #000;
}

.qr-section {
  display: flex;
  align-items: center;
  gap: 4mm;
  border-bottom: 0.3mm solid #000;
  padding-bottom: 3mm;
}

.qr-canvas {
  display: block;
  flex: 0 0 40mm;
  width: 40mm !important;
  height: 40mm !important;
}

.tracking-details {
  flex: 1;
  min-width: 0;
}

.tracking-code {
  margin: 2mm 0 0;
  font-family: monospace;
  font-size: 16pt;
  font-weight: 900;
  letter-spacing: 0.6px;
  overflow-wrap: anywhere;
  line-height: 1.25;
}

.recipient-section {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 3mm;
}

.recipient-address {
  margin: 1.5mm 0 0;
  font-size: 16pt;
  font-weight: 800;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.recipient-name {
  margin: 1mm 0;
  font-size: 12pt;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.recipient-phone {
  margin: 1mm 0 0;
  font-size: 11pt;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.phone-label {
  font-size: 7pt;
  letter-spacing: 0.5px;
}

.notes-block {
  border: 0.3mm dashed #000;
  padding: 2mm;
}

.notes-block p {
  margin: 1mm 0 0;
  font-size: 10pt;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.cod-banner {
  border: 0.6mm solid #000;
  padding: 2mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2mm;
}

.cod-tag {
  font-size: 8pt;
  font-weight: 900;
  max-width: 45mm;
}

.cod-amount {
  font-size: 17pt;
  font-weight: 900;
  font-family: monospace;
  white-space: nowrap;
}

.label-footer {
  border-top: 0.3mm solid #000;
  padding-top: 2mm;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3mm;
  font-size: 8pt;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.label-footer .section-title {
  margin-bottom: 1mm;
  font-size: 6pt;
}

.thermal-label--compact {
  gap: 2mm;
}

.thermal-label--compact .commune-box {
  padding: 1.5mm 0;
}

.thermal-label--compact .commune-box strong {
  font-size: 17pt;
}

.thermal-label--compact .qr-canvas {
  flex-basis: 30mm;
  width: 30mm !important;
  height: 30mm !important;
}

.thermal-label--compact .qr-section {
  padding-bottom: 2mm;
}

.thermal-label--compact .recipient-section {
  gap: 1.5mm;
}

.thermal-label--compact .recipient-address {
  font-size: 13pt;
}

.thermal-label--compact .notes-block p {
  font-size: 9pt;
}
.thermal-label--compact :deep(.label-branding),
.thermal-label--compact :deep(.label-branding img) {
  height: 12mm;
}
.thermal-label--compact .notes-block {
  padding: 1.5mm;
}
</style>
