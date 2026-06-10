<script setup lang="ts">
import { ref } from 'vue'
import { Package } from '../types'
import api from '../../../services/api'
import { useToast } from 'vuestic-ui'

const props = defineProps<{
  pkg: Package | null
  visible: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'updated'): void
}>()

const { init: notify } = useToast()
const notes = ref('')
const isSubmitting = ref(false)

const handleMarkAsReceived = async () => {
  if (!props.pkg) return

  try {
    isSubmitting.value = true
    await api.markChangeReceived(props.pkg.package_id, notes.value || undefined)

    notify({
      message: '✅ Cambio marcado como recibido exitosamente',
      color: 'success',
    })

    notes.value = ''
    emit('updated')
    emit('close')
  } catch (error: any) {
    console.error('Error al marcar cambio como recibido:', error)
    notify({
      message: error.response?.data?.error || 'Error al marcar el cambio como recibido',
      color: 'danger',
    })
  } finally {
    isSubmitting.value = false
  }
}

const handleClose = () => {
  notes.value = ''
  emit('close')
}
</script>

<template>
  <VaModal :model-value="visible" size="medium" @update:modelValue="handleClose">
    <template #header>
      <h2 class="va-h5">
        <VaIcon name="sync_alt" class="mr-2" />
        Gestión de Cambio
      </h2>
    </template>

    <div v-if="pkg" class="flex flex-col gap-4">
      <!-- Información del Paquete -->
      <VaCard stripe stripe-color="warning">
        <VaCardContent>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="va-text-secondary text-sm">Código de Seguimiento</p>
              <p class="font-semibold">{{ pkg.tracking_code }}</p>
            </div>
            <div>
              <p class="va-text-secondary text-sm">Código Externo</p>
              <p class="font-semibold">{{ pkg.external_tracking_code || 'N/A' }}</p>
            </div>
            <div>
              <p class="va-text-secondary text-sm">Destinatario</p>
              <p class="font-semibold">{{ pkg.recipient_name }}</p>
            </div>
            <div>
              <p class="va-text-secondary text-sm">Estado</p>
              <VaBadge :text="pkg.status.replace(/_/g, ' ')" color="primary" />
            </div>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Estado del Cambio -->
      <VaCard>
        <VaCardContent>
          <div class="flex items-center gap-3 mb-4">
            <VaIcon
              :name="pkg.change_received ? 'check_circle' : 'pending'"
              :color="pkg.change_received ? 'success' : 'warning'"
              size="large"
            />
            <div>
              <p class="font-semibold text-lg">
                {{ pkg.change_received ? 'Cambio Recibido' : 'Cambio Pendiente de Recibir' }}
              </p>
              <p class="va-text-secondary text-sm">
                {{
                  pkg.change_received
                    ? `Recibido por ${pkg.changeReceivedByUser?.full_name || 'N/A'}`
                    : 'Este cambio debe ser devuelto por el conductor'
                }}
              </p>
            </div>
          </div>

          <!-- Información de recepción si ya fue recibido -->
          <div v-if="pkg.change_received && pkg.change_received_at" class="bg-green-50 p-3 rounded">
            <p class="text-sm text-green-800">
              <strong>Fecha de recepción:</strong> {{ new Date(pkg.change_received_at).toLocaleString('es-ES') }}
            </p>
            <p v-if="pkg.change_notes" class="text-sm text-green-800 mt-2">
              <strong>Notas:</strong> {{ pkg.change_notes }}
            </p>
          </div>

          <!-- Formulario para marcar como recibido -->
          <div v-if="!pkg.change_received" class="mt-4">
            <VaTextarea
              v-model="notes"
              label="Notas (opcional)"
              placeholder="Ej: Recibido en buen estado, conductor Juan Pérez"
              :min-rows="3"
              class="mb-4"
            />

            <VaButton
              :loading="isSubmitting"
              :disabled="isSubmitting"
              color="success"
              class="w-full"
              @click="handleMarkAsReceived"
            >
              <VaIcon name="check" class="mr-2" />
              Marcar como Recibido
            </VaButton>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Información adicional -->
      <VaAlert color="info" border="left">
        <template #title>ℹ️ Información</template>
        Los cambios son paquetes que deben ser devueltos al conductor luego de la entrega. Cuando el conductor entrega
        el cambio en el almacén, debe ser marcado como recibido.
      </VaAlert>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <VaButton preset="secondary" @click="handleClose"> Cerrar </VaButton>
      </div>
    </template>
  </VaModal>
</template>

<style scoped>
.photo-card {
  border: 1px solid #e0e0e0;
}
</style>
