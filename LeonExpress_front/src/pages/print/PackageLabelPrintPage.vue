<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import PackageShippingLabel from '@/components/labels/PackageShippingLabel.vue'

const route = useRoute()
const trackingCode = computed(() => route.params.trackingCode as string)
const pkg = ref<any>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const isPrintReady = ref(false)
const labelRef = ref<InstanceType<typeof PackageShippingLabel> | null>(null)
let autoPrinted = false

function onLabelError(message: string) {
  isPrintReady.value = false
  errorMessage.value = message
}
async function printLabel() {
  if (!isPrintReady.value || !labelRef.value) return
  try {
    await labelRef.value.preparePrint()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    window.print()
  } catch (error) {
    onLabelError(error instanceof Error ? error.message : 'No se pudo preparar la etiqueta.')
  }
}
async function onLabelReady() {
  isPrintReady.value = true
  if (!autoPrinted) {
    autoPrinted = true
    await printLabel()
  }
}
const closeWindow = () => window.close()
onMounted(async () => {
  try {
    const { data } = await api.getPackageByTrackingCode(trackingCode.value)
    pkg.value = data
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || 'No se pudo cargar la información del paquete.'
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="label-print-page">
    <div class="no-print controls-bar">
      <span>Etiqueta 100 × 150 mm · {{ trackingCode }}</span>
      <div class="controls-actions">
        <button class="btn btn-primary" :disabled="!isPrintReady" @click="printLabel">Imprimir etiqueta</button>
        <button class="btn btn-secondary" @click="closeWindow">Cerrar</button>
      </div>
      <p>Imprime al 100 %, sin márgenes ni encabezados del navegador.</p>
    </div>
    <div v-if="isLoading" class="no-print loading-state">Preparando etiqueta...</div>
    <div v-else-if="errorMessage" class="no-print error-state" role="alert">{{ errorMessage }}</div>
    <PackageShippingLabel v-else-if="pkg" ref="labelRef" :pkg="pkg" @ready="onLabelReady" @error="onLabelError" />
  </div>
</template>

<style scoped>
@page package-label {
  size: 100mm 150mm;
  margin: 0;
}
.label-print-page {
  page: package-label;
  background: #e9edef;
  min-height: 100vh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.controls-bar {
  width: 100%;
  max-width: 100mm;
  background: white;
  border-radius: 6px;
  padding: 12px;
  font-size: 13px;
  color: #03323a;
}
.controls-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.controls-bar p {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.5;
}
.btn {
  border: 0;
  border-radius: 4px;
  padding: 8px 12px;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary {
  background: #03323a;
  color: white;
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
  background: white;
  padding: 24px;
}
.error-state {
  color: #a12c1a;
}
@media print {
  :global(html:has(.label-print-page)),
  :global(body:has(.label-print-page)) {
    background: white !important;
    padding: 0 !important;
    margin: 0 !important;
    min-width: 0 !important;
  }
  .label-print-page {
    display: block;
    min-height: 0;
    width: 100mm;
    height: 150mm;
    padding: 0 !important;
    margin: 0 !important;
    background: white;
  }
  .no-print {
    display: none !important;
  }
}
</style>
