<template>
  <div v-if="isLoading"><VaProgressCircle indeterminate /></div>
  <div v-else-if="pickup">
    <h1 class="page-title">Registrar Paquetes para Recolección</h1>
    <p class="mb-4">
      Añadiendo paquetes para el cliente: <strong>{{ pickup.client?.client_name }}</strong>
    </p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <VaCard>
        <VaCardTitle>Nuevo Paquete</VaCardTitle>
        <VaCardContent>
          <EditPackageForm
            :pickup-id="pickup.pickup_id"
            :client-id="pickup.client_id"
            :client-name="pickup.client?.client_name"
            :prefill-pickup-data="true"
            @save="onPackageSaved"
          />
        </VaCardContent>
      </VaCard>

      <VaCard>
        <VaCardTitle>Paquetes Escaneados ({{ packagesInPickup.length }})</VaCardTitle>
        <VaCardContent>
          <div v-if="packagesInPickup.length === 0" v class="text-gray-500 text-center">
            Aún no se han añadido paquetes.
          </div>
          <ul v-else class="flex flex-col gap-2">
            <li v-for="pkg in packagesInPickup" :key="pkg.package_id" class="p-2 bg-gray-100 rounded">
              <div class="font-medium">
                {{ pkg.tracking_code || `ID: ${pkg.package_id.slice(0, 8)}` }}
                <span v-if="pkg.external_tracking_code" class="text-gray-500 font-normal text-sm ml-2">
                  (Externo: {{ pkg.external_tracking_code }})
                </span>
              </div>
            </li>
          </ul>
          <VaButton class="mt-4 w-full" :disabled="packagesInPickup.length === 0" @click="finishCollection">
            Finalizar Recolección
          </VaButton>
          <p v-if="packagesInPickup.length === 0" class="text-sm text-gray-500 mt-2 text-center">
            Debe añadir al menos un paquete para finalizar la recolección
          </p>
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Custom Modal for Verification Code -->
    <VaModal
      v-model="showVerificationModal"
      title="Confirmar Devolución de Paquete Duplicado"
      message="Para continuar, ingrese el código único del cliente para confirmar la devolución del paquete."
      :hide-default-actions="true"
      :no-dismiss="true"
      :no-outside-click="true"
      :no-esc="true"
      :mobile-fullscreen="false"
      :max-height="'calc(100% - 2rem)'"
    >
      <VaInput
        v-model="verificationCode"
        placeholder="Código único"
        :rules="[(value: string) => !!value || 'El código es requerido']"
        class="mb-4"
        :disabled="verificationLoading"
        @keyup.enter="handleVerificationSubmit"
      />

      <template #footer>
        <!-- Solo botón de confirmar, deshabilitado mientras carga -->
        <VaButton class="w-full" :disabled="verificationLoading" @click="handleVerificationSubmit">
          <span v-if="!verificationLoading">Confirmar Devolución</span>
          <span v-else>Verificando…</span>
        </VaButton>
      </template>
    </VaModal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vuestic-ui'
import { VaInput } from 'vuestic-ui'
import api from '../../services/api'
import { Package, Pickup } from './types'
import EditPackageForm from '../packages/widgets/EditPackageForm.vue'

const route = useRoute()
const router = useRouter()
const { init: notify } = useToast()

const pickup = ref<Pickup | null>(null)
const packagesInPickup = ref<Package[]>([])
const isLoading = ref(true)
const pickupId = route.params.id as string
const showVerificationModal = ref(false)
const verificationCode = ref('')
const verificationLoading = ref(false)
let currentClientId = ''

const loadData = async () => {
  isLoading.value = true
  try {
    const { data } = await api.getPickupById(pickupId)
    pickup.value = data
    packagesInPickup.value = data.packages || []
  } catch (error) {
    console.error('Error loading pickup data:', error)
    notify({ message: 'Error al cargar datos de la recolección', color: 'danger', duration: 5000 })
  } finally {
    isLoading.value = false
  }
}

onMounted(loadData)

const onPackageSaved = async (payload: any) => {
  try {
    await api.createPackage(payload)
    notify({ message: 'Paquete añadido exitosamente', color: 'success', duration: 5000 })
    await loadData()
  } catch (e: any) {
    console.log('Error in onPackageSaved:', e)
    if (e.response?.status === 409) {
      const errorData = e.response.data
      // Use the client_id from the pickup data, which is more reliable.
      if (pickup.value?.client_id) {
        currentClientId = pickup.value.client_id
      } else {
        notify({ message: 'No se pudo determinar el cliente para la verificación.', color: 'danger' })
      }
      console.log('Current client ID:', currentClientId)

      notify({
        message: errorData.error || 'Paquete duplicado detectado.',
        color: 'warning',
        duration: 10000,
      })

      console.log('Opening verification modal')
      showVerificationModal.value = true
    } else {
      const errorMessage = e.response?.data?.error || 'Error al añadir el paquete.'
      notify({ message: errorMessage, color: 'danger', duration: 5000 })
    }
  }
}

const handleVerificationSubmit = async () => {
  if (!verificationCode.value) {
    notify({ message: 'El código de verificación no puede estar vacío', color: 'warning', duration: 5000 })
    return
  }

  verificationLoading.value = true
  try {
    // Enviar tanto el código como el client_id
    const { data } = await api.verifyClientCode({
      verification_code: verificationCode.value,
      client_id: currentClientId,
    })

    notify({ message: `Código válido para ${data.client_name}`, color: 'success', duration: 3000 })

    // Cerrar modal sin crear paquete
    showVerificationModal.value = false
    verificationCode.value = ''
  } catch (verifyError: any) {
    console.error('Verification error:', verifyError)
    let errorMessage = 'Error al verificar el código. Intente nuevamente.'
    if (verifyError.response?.status === 403 || verifyError.response?.status === 404) {
      errorMessage = 'Código de verificación incorrecto.'
    } else if (verifyError.response?.data?.error) {
      errorMessage = verifyError.response.data.error
    }
    notify({ message: errorMessage, color: 'danger', duration: 5000 })
  } finally {
    verificationLoading.value = false
  }
}

const finishCollection = async () => {
  if (!pickup.value) return
  try {
    await api.updatePickupStatus(pickup.value.pickup_id, 'RECOLECCION_FINALIZADA_DRIVER')
    notify({ message: 'Recolección finalizada', color: 'success', duration: 5000 })
    router.push({ name: 'pickup-details', params: { id: pickup.value.pickup_id } })
  } catch (e) {
    console.error('Error finishing collection:', e)
    notify({ message: 'Error al finalizar la recolección', color: 'danger', duration: 5000 })
  }
}
</script>
