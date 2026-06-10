<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'
import VaTimelineItem from '../../../../components/va-timeline-item.vue'

const props = defineProps({
  userId: {
    type: String,
    required: true,
    validator: (val: string) => !!val && val !== 'string',
  },
})
const packages = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  if (!props.userId || props.userId === 'string') {
    loading.value = false
    return
  }
  try {
    const { data } = await api.getPackages({
      userId: props.userId,
      status: 'ENTREGADO',
      perPage: 10,
      sortBy: 'delivered_datetime',
      sortOrder: 'DESC',
    })
    // Mostrar solo las entregas hechas por el driver logueado
    packages.value = data.packages
      .map((pkg) => {
        if (pkg.deliveries && Array.isArray(pkg.deliveries) && pkg.deliveries.length > 0) {
          // Tomar la entrega más reciente de este driver
          const delivery = pkg.deliveries.sort(
            (a, b) => new Date(b.attempted_at).getTime() - new Date(a.attempted_at).getTime(),
          )[0]
          return {
            package_id: pkg.package_id,
            recipient_name: pkg.recipient_name,
            tracking_code: pkg.tracking_code,
            external_tracking_code: pkg.external_tracking_code,
            delivery,
          }
        }
        return null
      })
      .filter((pkg) => pkg && pkg.delivery)
  } catch (error) {
    console.error('Error fetching delivered packages:', error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <VaCard>
    <VaCardTitle class="flex justify-between">
      <h1 class="card-title text-secondary font-bold uppercase">Últimas Entregas</h1>
    </VaCardTitle>
    <VaCardContent>
      <div v-if="loading" class="text-center py-8">Cargando...</div>
      <div v-else-if="!props.userId || props.userId === 'string'" class="text-center py-4 text-danger">
        Error: userId inválido
      </div>
      <div v-else-if="packages.length === 0" class="text-center py-4 text-secondary">No hay entregas recientes.</div>
      <div v-else class="mt-4 max-h-96 overflow-y-auto">
        <table>
          <tbody>
            <VaTimelineItem
              v-for="pkg in packages"
              :key="pkg.package_id"
              :date="new Date(pkg.delivery.attempted_at).toLocaleString()"
            >
              <span class="font-semibold">Paquete entregado</span>
              a <span class="font-bold">{{ pkg.recipient_name }}</span>
              <p class="text-xs text-secondary">
                Tracking: {{ pkg.tracking_code
                }}<span v-if="pkg.external_tracking_code"> | Externo: {{ pkg.external_tracking_code }}</span>
              </p>
            </VaTimelineItem>
          </tbody>
        </table>
      </div>
    </VaCardContent>
  </VaCard>
</template>
