<template>
  <div class="flex flex-col gap-6">
    <!-- Header -->
    <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="page-title">Mercado Libre</h1>
        <p class="page-subtitle">
          Vincula tu tienda de Mercado Libre para sincronizar automáticamente tus envíos Flex y despacharlos con León
          Express.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <VaButton v-if="mlAccount?.is_linked" color="#03323a" icon="refresh" :loading="isSyncing" @click="syncAccount">
          Sincronizar Envíos de Hoy
        </VaButton>
        <VaButton
          v-else
          color="#ffe600"
          text-color="#2d3277"
          icon="link"
          :loading="isLinking"
          class="font-bold"
          @click="linkAccount"
        >
          Vincular Mercado Libre
        </VaButton>
      </div>
    </header>

    <VaAlert v-if="gatewayUnavailable" color="warning">
      No pudimos consultar la conexión con Mercado Libre. Intenta nuevamente en unos minutos.
    </VaAlert>

    <!-- Status Card -->
    <VaCard>
      <VaCardContent>
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
          <div class="flex items-center gap-4">
            <VaIcon
              :name="mlAccount?.is_linked ? 'check_circle' : 'info'"
              :color="mlAccount?.is_linked ? 'success' : 'warning'"
              size="36px"
            />
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-gray-800">
                  {{ mlAccount?.is_linked ? `Conectado: ${mlAccount.nickname || 'Cuenta ML'}` : 'Cuenta no vinculada' }}
                </h3>
                <VaBadge
                  :text="mlAccount?.is_linked ? 'ACTIVO' : 'PENDIENTE'"
                  :color="mlAccount?.is_linked ? 'success' : 'warning'"
                  class="text-[10px] font-bold"
                />
              </div>
              <p class="text-xs text-secondary mt-1">
                {{
                  mlAccount?.is_linked
                    ? `Vinculada el ${formatDate(
                        mlAccount.created_at || new Date(),
                      )}. Los envíos se sincronizan desde las 00:00:00 del día.`
                    : 'Haz clic en "Vincular Mercado Libre" para autorizar a León Express a recibir tus ventas Flex.'
                }}
              </p>
            </div>
          </div>

          <div v-if="mlAccount?.is_linked" class="flex items-center gap-3">
            <VaButton preset="secondary" color="danger" size="small" :loading="isUnlinking" @click="unlinkAccount">
              Desvincular Cuenta
            </VaButton>
          </div>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Información de Funcionamiento -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <VaCard>
        <VaCardTitle class="text-sm font-bold text-primary"> 1. Vinculación Rápida </VaCardTitle>
        <VaCardContent class="text-xs text-secondary">
          Autorizas tu cuenta de Mercado Libre de forma segura con un solo clic.
        </VaCardContent>
      </VaCard>
      <VaCard>
        <VaCardTitle class="text-sm font-bold text-primary"> 2. Sincronización Retroactiva </VaCardTitle>
        <VaCardContent class="text-xs text-secondary">
          Al vincular o sincronizar, se descargan todas las ventas con envío Flex del día desde las 00:00 hrs.
        </VaCardContent>
      </VaCard>
      <VaCard>
        <VaCardTitle class="text-sm font-bold text-primary"> 3. Escaneo y Colecta </VaCardTitle>
        <VaCardContent class="text-xs text-secondary">
          Solicitas la colecta y nuestros recolectores escanean las etiquetas directo desde tu local o almacén.
        </VaCardContent>
      </VaCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast, useModal } from 'vuestic-ui'
import api from '@/services/api'

const { init: notify } = useToast()
const { confirm } = useModal()

const mlAccount = ref<any>(null)
const isLoading = ref(false)
const isSyncing = ref(false)
const isLinking = ref(false)
const isUnlinking = ref(false)
const gatewayUnavailable = ref(false)

const formatDate = (val: any) => {
  if (!val) return ''
  return new Date(val).toLocaleDateString('es-CL')
}

const loadAccount = async () => {
  isLoading.value = true
  try {
    const res = await api.getMyMlAccount()
    const account = res.data?.account
    mlAccount.value = account
      ? { ...account, nickname: account.ml_nickname || account.nickname, is_linked: true }
      : null
    gatewayUnavailable.value = res.data?.gateway_status === 'UNAVAILABLE'
  } catch (error: any) {
    console.error('Error cargando cuenta ML:', error)
    gatewayUnavailable.value = true
  } finally {
    isLoading.value = false
  }
}

const linkAccount = async () => {
  isLinking.value = true
  try {
    const res = await api.linkMyMlAccount()
    const targetUrl = res.data?.url || res.data?.authUrl || res.data?.link?.url || res.data?.link
    if (typeof targetUrl === 'string' && /^https?:\/\//i.test(targetUrl)) {
      window.location.href = targetUrl
    } else {
      throw new Error('No se recibió la URL de autorización')
    }
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'No se pudo iniciar la autorización de Mercado Libre.',
      color: 'danger',
    })
  } finally {
    isLinking.value = false
  }
}

const syncAccount = async () => {
  isSyncing.value = true
  try {
    const res = await api.syncMyMlAccount()
    notify({
      message: res.data?.message || 'Envíos sincronizados exitosamente desde Mercado Libre.',
      color: 'success',
    })
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'Error al sincronizar con Mercado Libre.',
      color: 'danger',
    })
  } finally {
    isSyncing.value = false
  }
}

const unlinkAccount = async () => {
  const ok = await confirm({
    title: 'Desvincular cuenta',
    message:
      '¿Estás seguro de desvincular tu cuenta de Mercado Libre? Dejarás de recibir sincronización automática de envíos.',
    okText: 'Sí, desvincular',
    cancelText: 'Cancelar',
  })
  if (!ok) return

  isUnlinking.value = true
  try {
    await api.unlinkMyMlAccount()
    notify({
      message: 'Cuenta desvinculada exitosamente.',
      color: 'success',
    })
    mlAccount.value = null
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'Error al desvincular la cuenta.',
      color: 'danger',
    })
  } finally {
    isUnlinking.value = false
  }
}

onMounted(() => {
  loadAccount()
})
</script>

<style scoped>
.page-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0;
}

.page-subtitle {
  color: var(--va-on-background-secondary, #64748b);
  margin-top: 0.25rem;
  font-size: 0.875rem;
}
</style>
