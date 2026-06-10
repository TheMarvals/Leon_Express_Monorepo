<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vuestic-ui'
import { axiosInstance } from '../../services/api'
import RoutePackageScanner from '../routes/widgets/RoutePackageScanner.vue'

const route = useRoute()
const router = useRouter()
const { init: notify } = useToast()

const pickupId = route.params.id as string
const isLoading = ref(false)

const stats = ref({
  total_expected: 0,
  confirmed_count: 0,
  pending_count: 0,
})

const pendingPackages = ref<any[]>([])
const confirmedPackages = ref<any[]>([])

const fetchProgress = async () => {
  try {
    const response = await axiosInstance.get(`/ml-confirm/pickups/${pickupId}/ml-progress`)
    stats.value = response.data
    pendingPackages.value = response.data.pending_packages || []
    confirmedPackages.value = response.data.confirmed_packages || []
  } catch (error) {
    notify({ message: 'Error cargando estado de MercadoLibre', color: 'danger' })
  }
}

onMounted(() => {
  fetchProgress()
})

let pendingRawQrData: string | null = null

const handleRawQrData = (qrData: string) => {
  console.log('📥 [ML-SCAN] raw-qr-data recibido:', qrData?.substring(0, 100))
  pendingRawQrData = qrData
}

const handleRawScan = async (code: string) => {
  if (!code) return

  isLoading.value = true
  try {
    console.log('📤 [ML-SCAN] Enviando al backend:', {
      pickup_id: pickupId,
      ml_code: code,
      raw_qr_data: pendingRawQrData ? pendingRawQrData.substring(0, 100) : 'NULL',
    })

    const res = await axiosInstance.post('/ml-confirm/packages/confirm-ml', {
      pickup_id: pickupId,
      ml_code: code,
      raw_qr_data: pendingRawQrData,
    })

    notify({ message: `Confirmado: ${res.data.package.address}`, color: 'success' })
    await fetchProgress()
  } catch (e: any) {
    notify({ message: e.response?.data?.error || 'Error escaneando el paquete de ML', color: 'danger' })
  } finally {
    isLoading.value = false
    pendingRawQrData = null
  }
}
</script>

<template>
  <div class="px-4 py-2">
    <div class="flex justify-between items-center mb-4">
      <h1 class="page-title">Validación Envíos MercadoLibre</h1>
      <VaButton preset="secondary" icon="arrow_back" @click="router.back()">Volver a Recolección</VaButton>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Módulos de Input de pistola / cámara -->
      <VaCard>
        <VaCardTitle>Escáner de Cámara / Pistola</VaCardTitle>
        <VaCardContent>
          <div class="flex flex-col gap-4">
            <p class="text-secondary">
              Usa la cámara del dispositivo o una pistola láser para escanear el tracking de ML.
            </p>
            <RoutePackageScanner emit-only @rawScan="handleRawScan" @rawQrData="handleRawQrData" />
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Panel Lateral de Resumen -->
      <VaCard>
        <VaCardTitle>Progreso ML (Escaneados: {{ stats.confirmed_count }})</VaCardTitle>
        <VaCardContent>
          <div class="text-secondary text-sm mb-4">
            Los paquetes escaneados se importan y confirman automáticamente.
          </div>

          <!-- Listado confirmados (resumen) -->
          <div class="max-h-60 overflow-y-auto border border-gray-100 rounded">
            <div
              v-for="pkg in confirmedPackages"
              :key="pkg.package_id"
              class="p-2 border-b flex justify-between bg-green-50"
            >
              <span class="text-sm"
                ><VaIcon name="check" size="small" color="success" /> {{ pkg.external_tracking_code }}</span
              >
              <span class="text-xs text-gray-500">{{ pkg.recipient_name }}</span>
            </div>
          </div>
        </VaCardContent>
      </VaCard>
    </div>
  </div>
</template>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
}
</style>
