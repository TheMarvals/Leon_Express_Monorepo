<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vuestic-ui'
import { useUserStore } from '@/stores/user-store'
import api from '@/services/api'
import QRCode from 'qrcode'

const emit = defineEmits<{ (event: 'created'): void }>()
const router = useRouter()
const userStore = useUserStore()
const { init: notify } = useToast()
const clientName = computed(() => userStore.user?.client?.client_name || userStore.user?.full_name || 'Cliente')
const qrCanvasRef = ref<HTMLCanvasElement | null>(null)

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
    createdPackageForLabel.value = {
      ...newPkg,
      commune: manualForm.commune,
      recipient_name: manualForm.recipient_name,
      recipient_phone: manualForm.recipient_phone,
      destination_address: addressWithNotes,
      is_cod: manualForm.is_cod,
      cod_amount: manualForm.cod_amount,
    }

    notify({
      message: 'Paquete creado con éxito.',
      color: 'success',
    })

    // Renderizar QR en canvas
    await nextTick()
    await renderQrCode(newPkg.tracking_code)

    emit('created')
  } catch (error: any) {
    console.error('Error al crear paquete:', error)
    notify({
      message: error.response?.data?.error || error.message || 'Error al crear el paquete.',
      color: 'danger',
    })
  } finally {
    isCreatingPackage.value = false
  }
}

const renderQrCode = async (text: string) => {
  const canvas = qrCanvasRef.value
  if (canvas) {
    await QRCode.toCanvas(canvas, text, {
      width: 432,
      margin: 4,
      color: { dark: '#000000', light: '#ffffff' },
    })
  }
}

const resetManualPackageModal = () => {
  showManualPackageModal.value = false
  createdPackageForLabel.value = null
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
          rows="2"
          class="w-full"
        />

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

        <!-- Etiqueta Térmica Renderizada -->
        <div
          id="thermal-label-container"
          class="border-2 border-dashed border-gray-400 p-4 rounded-xl bg-white max-w-sm mx-auto text-left shadow-sm"
        >
          <div class="flex justify-between items-center border-b-2 border-black pb-2 mb-2">
            <div>
              <h2 class="font-black text-xl tracking-tight text-black">LEÓN EXPRESS</h2>
              <span class="text-[10px] font-bold uppercase tracking-wider text-black">Envío Flex Express</span>
            </div>
            <span class="text-xs font-mono font-black border border-black px-1.5 py-0.5 rounded">
              {{ createdPackageForLabel.commune || 'SANTIAGO' }}
            </span>
          </div>

          <!-- QR Code Canvas -->
          <div class="flex justify-center my-3">
            <canvas ref="qrCanvasRef" class="w-36 h-36" />
          </div>

          <div class="text-center font-mono font-black text-lg tracking-widest border-b border-black pb-2">
            {{ createdPackageForLabel.tracking_code }}
          </div>

          <div class="py-2 text-xs space-y-1 text-black border-b border-black">
            <p><strong>Destinatario:</strong> {{ createdPackageForLabel.recipient_name }}</p>
            <p v-if="createdPackageForLabel.recipient_phone">
              <strong>Tel:</strong> {{ createdPackageForLabel.recipient_phone }}
            </p>
            <p><strong>Dirección:</strong> {{ createdPackageForLabel.destination_address }}</p>
            <p v-if="createdPackageForLabel.is_cod" class="text-sm font-bold text-red-600 mt-1">
              COBRAR AL ENTREGAR: ${{ Number(createdPackageForLabel.cod_amount).toLocaleString('es-CL') }}
            </p>
          </div>

          <div class="pt-2 flex justify-between items-center text-[10px] text-gray-600 font-mono">
            <span>Remitente: {{ clientName }}</span>
            <span>{{ new Date().toLocaleDateString('es-CL') }}</span>
          </div>
        </div>

        <div class="flex justify-center gap-3 pt-2">
          <VaButton preset="secondary" @click="resetManualPackageModal">Cerrar</VaButton>
          <VaButton color="#03323a" icon="print" class="font-bold" @click="printCurrentLabel">
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
}
</style>
