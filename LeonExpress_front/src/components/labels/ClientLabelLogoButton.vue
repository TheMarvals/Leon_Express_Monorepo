<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import api from '@/services/api'
import LabelBranding from './LabelBranding.vue'

const open = ref(false)
const busy = ref(false)
const loaded = ref(false)
const error = ref('')
const savedLogo = ref<string | null>(null)
const candidate = ref<File | null>(null)
const preview = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
function clearCandidate() {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
  candidate.value = null
  if (fileInput.value) fileInput.value.value = ''
}
async function showSettings() {
  open.value = true
  error.value = ''
  loaded.value = false
  clearCandidate()
  busy.value = true
  try {
    savedLogo.value = (await api.getMyLabelLogo()).data.logo_data_url
    loaded.value = true
  } catch (err: any) {
    error.value = err.response?.data?.error || 'No se pudo cargar tu logo.'
  } finally {
    busy.value = false
  }
}
function chooseFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  clearCandidate()
  error.value = ''
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    error.value = 'Selecciona un archivo PNG, JPG o WebP de hasta 2 MB.'
    return
  }
  candidate.value = file
  preview.value = URL.createObjectURL(file)
}
async function save() {
  if (!candidate.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    savedLogo.value = (await api.uploadMyLabelLogo(candidate.value)).data.logo_data_url
    clearCandidate()
    open.value = false
  } catch (err: any) {
    error.value = err.response?.data?.error || 'No se pudo guardar tu logo.'
  } finally {
    busy.value = false
  }
}
async function remove() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await api.deleteMyLabelLogo()
    savedLogo.value = null
    clearCandidate()
  } catch (err: any) {
    error.value = err.response?.data?.error || 'No se pudo quitar tu logo.'
  } finally {
    busy.value = false
  }
}
onBeforeUnmount(clearCandidate)
</script>
<template>
  <VaButton preset="secondary" icon="image" @click="showSettings">Personalizar etiqueta</VaButton>
  <VaModal
    v-model="open"
    title="Logo de tu empresa"
    hide-default-actions
    size="small"
    :no-dismiss="busy"
    @close="clearCandidate"
  >
    <div class="logo-settings">
      <p>Tu logo aparecerá junto al de León Express en las etiquetas manuales de tus envíos.</p>
      <p v-if="busy && !loaded">Cargando configuración...</p>
      <template v-if="loaded">
        <div class="brand-preview"><LabelBranding :client-logo="preview || savedLogo" /></div>
        <label class="file-label">
          Seleccionar logo
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            :disabled="busy"
            @change="chooseFile"
          />
        </label>
        <p class="help">
          PNG, JPG o WebP, hasta 2 MB. Usa una imagen nítida y de alto contraste. Se imprimirá en escala de grises.
        </p>
        <VaButton v-if="savedLogo" preset="plain" :disabled="busy" @click="remove">Quitar mi logo</VaButton>
      </template>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <VaButton preset="secondary" :disabled="busy" @click="open = false">Cerrar</VaButton>
        <VaButton color="#03323a" :disabled="!candidate || busy" :loading="busy" @click="save">Guardar logo</VaButton>
      </div>
    </div>
  </VaModal>
</template>
<style scoped>
.logo-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
  font-size: 14px;
  line-height: 1.6;
}
.brand-preview {
  background: white;
  padding: 16px;
  border: 1px solid #dce3e3;
}
.brand-preview :deep(img) {
  max-width: 44%;
  filter: grayscale(1);
}
.file-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-weight: 600;
}
.file-label input {
  max-width: 100%;
  font-size: 13px;
}
.help {
  color: #607275;
  font-size: 12px;
}
.error {
  color: #a12c1a;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
