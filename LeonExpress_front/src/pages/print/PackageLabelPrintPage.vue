<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import QRCode from 'qrcode'

const route = useRoute()
const trackingCode = computed(() => route.params.trackingCode as string)

const pkg = ref<any>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const qrCanvasRef = ref<HTMLCanvasElement | null>(null)
const isPrintReady = ref(false)
const labelRef = ref<HTMLElement | null>(null)
const isCompact = ref(false)

// Los envíos manuales guardan las observaciones al final de la dirección.
const destinationDetails = computed(() => {
  const address = pkg.value?.destination_address || ''
  const notes = address.match(/\s*\(Obs:\s*([\s\S]*)\)\s*$/i)
  return {
    address: notes ? address.slice(0, notes.index).trim() : address.trim(),
    notes: notes?.[1]?.trim() || '',
  }
})

const extractedCommune = computed(() => {
  if (pkg.value?.commune) return String(pkg.value.commune).toUpperCase()
  const parts = destinationDetails.value.address.split(',')
  return parts.length > 1 ? parts[parts.length - 1].trim().toUpperCase() : 'DESTINO'
})

const formatDate = (dateStr?: string) => {
  if (!dateStr) return new Date().toLocaleDateString('es-CL')
  return new Date(dateStr).toLocaleDateString('es-CL')
}

const printLabel = async () => {
  if (!isPrintReady.value) return
  await document.fonts.ready
  // Reducir los espacios para direcciones largas o etiquetas con cobro.
  isCompact.value = false
  await nextTick()
  const bounds = labelRef.value?.getBoundingClientRect()
  if (bounds && bounds.height > bounds.width * 1.5 + 1) {
    isCompact.value = true
    await nextTick()
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  window.print()
}

const closeWindow = () => {
  window.close()
}

const loadPackage = async () => {
  isLoading.value = true
  isPrintReady.value = false
  errorMessage.value = ''
  try {
    const { data } = await api.getPackageByTrackingCode(trackingCode.value)
    pkg.value = data

    // El canvas pertenece al v-else: debe montarse antes de dibujar el QR.
    isLoading.value = false
    await nextTick()
    if (!qrCanvasRef.value || !data.tracking_code) {
      throw new Error('No se pudo generar el código QR de la etiqueta.')
    }
    await QRCode.toCanvas(qrCanvasRef.value, data.tracking_code, {
      width: 540,
      margin: 4,
      color: { dark: '#000000', light: '#ffffff' },
    })

    isPrintReady.value = true
    await nextTick()
    await printLabel()
  } catch (err: any) {
    console.error('Error al cargar paquete para etiqueta:', err)
    isPrintReady.value = false
    errorMessage.value = err.response?.data?.error || err.message || 'No se pudo cargar la información del paquete.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadPackage()
})
</script>

<template>
  <div class="label-print-page">
    <!-- Barra superior de control (oculta al imprimir) -->
    <div class="no-print controls-bar">
      <div class="controls-content">
        <span class="font-semibold text-sm">Etiqueta Térmica: {{ trackingCode }}</span>
        <div class="flex items-center gap-2">
          <button class="btn btn-primary" :disabled="!isPrintReady" @click="printLabel">Imprimir Etiqueta</button>
          <button class="btn btn-secondary" @click="closeWindow">Cerrar</button>
        </div>
      </div>
    </div>

    <!-- Indicador de Carga / Error -->
    <div v-if="isLoading" class="no-print loading-state">Generando etiqueta térmica...</div>

    <div v-else-if="errorMessage" class="no-print error-state">
      <p class="text-danger font-bold">{{ errorMessage }}</p>
      <button class="btn btn-secondary mt-2" @click="closeWindow">Cerrar</button>
    </div>

    <!-- ETIQUETA TÉRMICA ESTÁNDAR 100x150 mm -->
    <div v-else-if="pkg" ref="labelRef" class="thermal-label" :class="{ 'thermal-label--compact': isCompact }">
      <header class="label-header">
        <div class="brand">
          <h1 class="brand-title">LEÓN EXPRESS</h1>
          <p class="brand-subtitle">ENVÍO FLEX EXPRESS</p>
        </div>
        <span class="label-type">ETIQUETA<br />DE ENVÍO</span>
      </header>

      <div class="commune-box">
        <span class="section-title">COMUNA DE DESTINO</span>
        <strong>{{ extractedCommune }}</strong>
      </div>

      <section class="qr-section">
        <canvas ref="qrCanvasRef" class="qr-canvas" role="img" :aria-label="`Código QR: ${pkg.tracking_code}`"></canvas>
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
</template>

<style scoped>
/* Configuración estricta de página para impresoras térmicas (100x150 mm / 4x6'') */
@page package-label {
  size: 100mm 150mm;
  margin: 0;
}

.label-print-page {
  background-color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: #000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.label-print-page {
  page: package-label;
  line-height: 1.2;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  padding: 1rem 0;
}

.controls-bar {
  width: 100%;
  max-width: 100mm;
  margin-bottom: 0.75rem;
}

.controls-content {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: #03323a;
  color: #ffffff;
}

.btn-secondary {
  background: #e2e8f0;
  color: #334155;
}

.btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.loading-state,
.error-state {
  margin-top: 2rem;
  background: #fff;
  padding: 1.5rem;
  border-radius: 6px;
  text-align: center;
}

/* ETIQUETA TÉRMICA (100mm x 150mm) */
.thermal-label {
  width: 100mm;
  min-height: 150mm;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #cbd5e1;
  padding: 5mm;
  display: flex;
  flex-direction: column;
  gap: 3mm;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  font-size: 10pt;
}

.thermal-label > * {
  flex-shrink: 0;
  min-width: 0;
}

.label-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 3mm;
}

.brand-title {
  margin: 0;
  font-size: 16pt;
  font-weight: 900;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.brand-subtitle {
  margin: 0.5mm 0 0;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 1.2px;
}

.label-type {
  font-size: 7pt;
  font-weight: 700;
  text-align: right;
  line-height: 1.3;
  letter-spacing: 0.5px;
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
  padding: 2mm 0;
}

.thermal-label--compact .commune-box strong {
  font-size: 17pt;
}

.thermal-label--compact .qr-canvas {
  flex-basis: 32mm;
  width: 32mm !important;
  height: 32mm !important;
}

.thermal-label--compact .qr-section {
  padding-bottom: 2mm;
}

.thermal-label--compact .recipient-section {
  gap: 2mm;
}

.thermal-label--compact .recipient-address {
  font-size: 13pt;
}

.thermal-label--compact .notes-block p {
  font-size: 9pt;
}

/* REGLAS EXCLUSIVAS DE IMPRESIÓN */
@media print {
  :global(html:has(.label-print-page)),
  :global(body:has(.label-print-page)) {
    background: #ffffff !important;
    padding: 0 !important;
    margin: 0 !important;
    min-width: 0 !important;
  }

  .label-print-page {
    display: block;
    min-height: 0;
    width: 100mm;
    padding: 0 !important;
    margin: 0 !important;
  }

  .no-print {
    display: none !important;
  }

  /* Los estilos generales de impresión ocultan todos los elementos header. */
  .label-header {
    display: flex !important;
  }

  .thermal-label {
    width: 100mm !important;
    min-height: 150mm !important;
    border: none !important;
    box-shadow: none !important;
    padding: 5mm !important;
    margin: 0 !important;
    page-break-after: avoid !important;
    page-break-inside: avoid !important;
  }
}
</style>
