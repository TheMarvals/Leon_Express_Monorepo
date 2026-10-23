<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getProspectSettings, saveProspectRecipient, type ProspectSettings } from '@/services/prospects'
const settings = ref<ProspectSettings | null>(null)
const recipient = ref('')
const savedRecipient = ref('')
const busy = ref(false)
const loading = ref(true)
const error = ref('')
const success = ref('')
async function load() {
  loading.value = true
  error.value = ''
  try {
    settings.value = (await getProspectSettings()).data
    recipient.value = settings.value.recipient_user_id
    savedRecipient.value = recipient.value
  } catch {
    error.value = 'No se pudo cargar la configuración de solicitudes.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
async function save() {
  if (busy.value || !recipient.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    await saveProspectRecipient(recipient.value)
    savedRecipient.value = recipient.value
    success.value = 'Receptor de avisos actualizado.'
  } catch (err: any) {
    error.value = err.response?.data?.error || 'No se pudo guardar el receptor.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <VaCard class="prospect-settings"
    ><VaCardContent>
      <div class="settings-top">
        <div>
          <h2>Solicitudes de nuevos clientes</h2>
          <p>Revisa las empresas que quieren trabajar con León Express y elige quién recibe los avisos por correo.</p>
        </div>
        <RouterLink to="/prospects" class="requests-link"
          >Ver solicitudes
          <span v-if="settings" class="pending-count">{{ settings.pending }} nuevas</span> ↗</RouterLink
        >
      </div>
      <p v-if="loading" role="status">Cargando configuración…</p>
      <template v-else-if="settings"
        ><form class="settings-form" @submit.prevent="save">
          <label for="prospect-recipient"
            >Administrador que recibe las notificaciones<select
              id="prospect-recipient"
              v-model="recipient"
              :disabled="busy"
            >
              <option disabled value="">Seleccionar administrador</option>
              <option
                v-for="admin in settings.admins.filter((a) => a.email)"
                :key="admin.user_id"
                :value="admin.user_id"
              >
                {{ admin.full_name }} — {{ admin.email }}
              </option>
            </select></label
          ><VaButton type="submit" :loading="busy" :disabled="!recipient || recipient === savedRecipient"
            >Guardar receptor</VaButton
          >
        </form>
        <p v-if="!settings.admins.some((a) => a.user_id === savedRecipient && a.email)" class="notice">
          Configura un administrador activo con correo para recibir los avisos. Las solicitudes se guardan en el panel
          de todas formas.
        </p></template
      >
      <p v-if="error" class="settings-error" role="alert">
        {{ error }} <button v-if="!settings" class="retry-link" @click="load">Reintentar</button>
      </p>
      <p v-if="success" class="settings-success" role="status">{{ success }}</p>
    </VaCardContent></VaCard
  >
</template>
<style scoped>
.settings-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 20px;
}
.settings-top h2 {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 7px;
}
.settings-top p {
  color: #64748b;
  font-size: 0.85rem;
  line-height: 1.6;
  max-width: 650px;
}
.requests-link {
  color: var(--va-primary);
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  display: flex;
  gap: 8px;
  align-items: center;
}
.pending-count {
  padding: 5px 8px;
  border-radius: 5px;
  background: #edf4ed;
  font-size: 0.7rem;
}
.settings-form {
  display: flex;
  align-items: flex-end;
  gap: 15px;
}
.settings-form label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 520px;
  width: 100%;
  font-size: 0.8rem;
  font-weight: 600;
}
.settings-form select {
  font: inherit;
  padding: 10px 12px;
  min-height: 40px;
  border: 1px solid #ccd9d9;
  border-radius: 5px;
  background: var(--va-background-element);
  color: var(--va-on-background-primary);
  width: 100%;
}
.notice {
  font-size: 0.78rem;
  color: #805c13;
  margin-top: 12px;
  line-height: 1.6;
}
.settings-error {
  color: #b52d29;
  font-size: 0.85rem;
  margin-top: 12px;
}
.settings-success {
  color: #206549;
  font-size: 0.85rem;
  margin-top: 12px;
}
.retry-link {
  text-decoration: underline;
  margin-left: 8px;
}
@media (max-width: 760px) {
  .settings-top,
  .settings-form {
    flex-direction: column;
    align-items: stretch;
  }
  .requests-link {
    white-space: normal;
    flex-wrap: wrap;
  }
  .settings-form label {
    max-width: none;
  }
}
</style>
