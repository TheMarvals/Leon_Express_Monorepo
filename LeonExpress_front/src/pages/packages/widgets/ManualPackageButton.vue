<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vuestic-ui'
import { useUserStore } from '@/stores/user-store'
import api from '@/services/api'
import PackageShippingLabel from '@/components/labels/PackageShippingLabel.vue'
import ClientLabelLogoButton from '@/components/labels/ClientLabelLogoButton.vue'
import { MAX_LABEL_NOTES } from '@/components/labels/labelNotes'

const emit = defineEmits<{ (event: 'created'): void }>()
const router = useRouter()
const userStore = useUserStore()
const { init: notify } = useToast()
const labelReady = ref(false)
const labelError = ref('')
const loadingLabel = ref(false)
const labelData = ref<any>(null)

async function loadLabelPreview() {
  if (!createdPackageForLabel.value?.tracking_code) return
  loadingLabel.value = true
  labelReady.value = false
  labelError.value = ''
  try {
    labelData.value = (await api.getPackageByTrackingCode(createdPackageForLabel.value.tracking_code)).data
  } catch (error: any) {
    labelError.value = error.response?.data?.error || 'El envío está guardado, pero no se pudo cargar la etiqueta.'
  } finally {
    loadingLabel.value = false
  }
}
function onLabelError(message: string) {
  labelReady.value = false
  labelError.value = message
}

// Modal Paquete Manual
const showManualPackageModal = ref(false)
const isCreatingPackage = ref(false)
const createdPackageForLabel = ref<any>(null)
const manualForm = reactive({
  recipient_name: '',
  recipient_phone: '',
  destination_address: '',
  commune: '',
  is_cod: false,
  cod_amount: 0,
  notes: '',
})

// Crear Paquete Manual
const handleCreateManualPackage = async () => {
  if (isCreatingPackage.value || createdPackageForLabel.value) return
  if (manualForm.notes.length > MAX_LABEL_NOTES) {
    notify({ message: `Las observaciones admiten hasta ${MAX_LABEL_NOTES} caracteres.`, color: 'danger' })
    return
  }
  isCreatingPackage.value = true
  try {
    const fullAddress = manualForm.commune
      ? `${manualForm.destination_address}, ${manualForm.commune}`
      : manualForm.destination_address

    const addressWithNotes = manualForm.notes?.trim() ? `${fullAddress} (Obs: ${manualForm.notes.trim()})` : fullAddress

    const res = await api.createManualPackage({
      recipient_name: manualForm.recipient_name,
      recipient_phone: manualForm.recipient_phone,
      destination_address: addressWithNotes,
      is_cod: manualForm.is_cod,
      cod_amount: manualForm.is_cod ? Number(manualForm.cod_amount) : 0,
    })

    const newPkg = res.data?.package || res.data
    createdPackageForLabel.value = newPkg

    notify({
      message: 'Paquete creado con éxito.',
      color: 'success',
    })

    emit('created')
    await loadLabelPreview()
  } catch (error: any) {
    console.error('Error al crear paquete:', error)
    notify({
      message:
        error.response?.data?.error ||
        error.response?.data?.errors?.[0]?.msg ||
        error.message ||
        'Error al crear el paquete.',
      color: 'danger',
    })
  } finally {
    isCreatingPackage.value = false
  }
}

const resetManualPackageModal = () => {
  showManualPackageModal.value = false
  createdPackageForLabel.value = null
  labelData.value = null
  labelReady.value = false
  labelError.value = ''
  manualForm.recipient_name = ''
  manualForm.recipient_phone = ''
  manualForm.destination_address = ''
  manualForm.commune = ''
  manualForm.is_cod = false
  manualForm.cod_amount = 0
  manualForm.notes = ''
}

const printCurrentLabel = () => {
  if (!createdPackageForLabel.value?.tracking_code) return
  const routeResolved = router.resolve({
    name: 'print-package-label',
    params: { trackingCode: createdPackageForLabel.value.tracking_code },
  })
  window.open(routeResolved.href, '_blank')
}
</script>

<template>
  <div class="manual-package-action">
    <ClientLabelLogoButton v-if="userStore.isClient" />
    <VaButton color="#03323a" icon="add" @click="showManualPackageModal = true">Agregar envío manual</VaButton>
    <!-- MODAL CREAR ENVÍO MANUAL (CON ETIQUETA QR) -->
    <VaModal
      v-model="showManualPackageModal"
      title="Crear Envío Manual con Etiqueta QR"
      hide-default-actions
      size="medium"
      :no-dismiss="isCreatingPackage"
      @close="resetManualPackageModal"
    >
      <div v-if="!createdPackageForLabel" class="space-y-4 py-2">
        <p class="text-xs text-gray-500">
          Genera un paquete manual con su propio código de seguimiento QR listo para escanear en recolecciones y rutas.
        </p>

        <VaInput
          v-model="manualForm.recipient_name"
          label="Nombre del Destinatario *"
          placeholder="Juan Pérez"
          class="w-full"
        />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <VaInput
            v-model="manualForm.recipient_phone"
            label="Teléfono Destinatario"
            placeholder="+56 9 1234 5678"
            class="w-full"
          />
          <VaInput
            v-model="manualForm.commune"
            label="Comuna de Destino *"
            placeholder="Santiago Centro, Las Condes..."
            class="w-full"
          />
        </div>

        <VaInput
          v-model="manualForm.destination_address"
          label="Dirección Completa de Destino *"
          placeholder="Av. Providencia 1234, Depto 501"
          class="w-full"
        />

        <div class="flex items-center gap-4 pt-2">
          <VaCheckbox v-model="manualForm.is_cod" label="Cobro Contra Entrega (COD)" />
          <VaInput
            v-if="manualForm.is_cod"
            v-model.number="manualForm.cod_amount"
            type="number"
            label="Monto a Cobrar ($)"
            class="w-40"
          />
        </div>

        <VaTextarea
          v-model="manualForm.notes"
          label="Notas del Envío (Opcional)"
          placeholder="Dejar en conserjería..."
          :maxlength="MAX_LABEL_NOTES"
          rows="2"
          class="w-full"
        />
        <p class="text-xs text-gray-500 text-right" aria-live="polite">
          {{ manualForm.notes.length }}/{{ MAX_LABEL_NOTES }} caracteres
        </p>

        <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
          <VaButton preset="secondary" :disabled="isCreatingPackage" @click="showManualPackageModal = false"
            >Cancelar</VaButton
          >
          <VaButton
            color="#03323a"
            class="font-bold"
            :loading="isCreatingPackage"
            :disabled="isCreatingPackage || !manualForm.recipient_name.trim() || !manualForm.destination_address.trim()"
            @click="handleCreateManualPackage"
          >
            Generar Etiqueta y Guardar
          </VaButton>
        </div>
      </div>

      <!-- VISTA PREVIA DE ETIQUETA QR RECIÉN CREADA -->
      <div v-else class="text-center py-2 space-y-4">
        <VaAlert color="success" class="text-xs">
          ¡Paquete registrado exitosamente! Ya puedes imprimir la etiqueta térmica.
        </VaAlert>

        <p class="text-xs text-gray-500">Vista previa de impresión · 100 × 150 mm</p>
        <p v-if="loadingLabel">Cargando etiqueta...</p>
        <div v-else-if="labelError" role="alert">
          <p class="text-danger">{{ labelError }}</p>
          <VaButton preset="secondary" @click="loadLabelPreview">Volver a cargar etiqueta</VaButton>
        </div>
        <PackageShippingLabel v-else-if="labelData" :pkg="labelData" @ready="labelReady = true" @error="onLabelError" />

        <div class="flex justify-center gap-3 pt-2">
          <VaButton preset="secondary" @click="resetManualPackageModal">Cerrar</VaButton>
          <VaButton color="#03323a" icon="print" class="font-bold" :disabled="!labelReady" @click="printCurrentLabel">
            Imprimir Etiqueta (100x150mm)
          </VaButton>
        </div>
      </div>
    </VaModal>
  </div>
</template>

<style scoped>
.manual-package-action {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
