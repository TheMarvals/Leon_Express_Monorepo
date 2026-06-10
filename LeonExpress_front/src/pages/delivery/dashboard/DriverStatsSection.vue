<script setup lang="ts">
import { ref, watch, defineProps, onMounted } from 'vue'
import api from '@/services/api'

const totalGanancias = ref(0)
const paquetesEntregados = ref(0)
const recoleccionesRealizadas = ref(0)
const cargando = ref(true)

const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
})

const fetchSummary = async () => {
  if (!props.userId) return
  cargando.value = true
  try {
    const { data } = await api.getDriverSummary({ userId: props.userId })
    totalGanancias.value = data.total_earnings || 0
    paquetesEntregados.value = data.packages_delivered || 0
    recoleccionesRealizadas.value = data.pickups || 0
  } catch (error) {
    console.error('Error al obtener resumen del driver:', error)
  }
  cargando.value = false
}

watch(() => props.userId, fetchSummary, { immediate: true })
</script>
