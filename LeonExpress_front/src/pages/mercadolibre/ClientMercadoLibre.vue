<template>
  <div class="flex flex-col gap-6">
    <!-- Header -->
    <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="page-title">Mercado Libre</h1>
        <p class="page-subtitle">
          Vincula tus cuentas de Mercado Libre para sincronizar automáticamente tus envíos Flex y despacharlos con León
          Express.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <VaButton
          v-if="mlAccounts.length"
          color="#03323a"
          icon="refresh"
          :loading="isSyncing"
          :disabled="!!unlinkingAccountId || gatewayUnavailable"
          @click="syncAccount()"
        >
          Sincronizar todas
        </VaButton>
        <VaButton
          color="#ffe600"
          text-color="#2d3277"
          icon="link"
          :loading="isLinking"
          class="font-bold"
          :disabled="isLoading || isSyncing || !!unlinkingAccountId || gatewayUnavailable"
          @click="linkAccount"
        >
          {{ mlAccounts.length ? 'Vincular otra cuenta' : 'Vincular Mercado Libre' }}
        </VaButton>
      </div>
    </header>

    <VaAlert v-if="gatewayUnavailable" color="warning">
      No pudimos consultar la conexión con Mercado Libre. Intenta nuevamente en unos minutos.
    </VaAlert>

    <!-- Status Card -->
    <VaCard v-for="account in mlAccounts" :key="account.ml_account_id">
      <VaCardContent>
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
          <div class="flex items-center gap-4">
            <VaIcon name="check_circle" color="success" size="36px" />
            <div>
              <h3 class="text-base font-bold">{{ account.nickname || 'Cuenta ML' }}</h3>
              <p class="text-xs text-secondary mt-1">
                {{ account.created_at ? `Vinculada el ${formatDate(account.created_at)}.` : 'Cuenta vinculada.' }}
                Los envíos Flex del día se sincronizan con tu cliente.
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <VaButton
              preset="secondary"
              size="small"
              :disabled="isSyncing || !!unlinkingAccountId || gatewayUnavailable"
              :loading="syncingAccountId === account.ml_account_id"
              @click="syncAccount(account.ml_account_id)"
              >Sincronizar hoy</VaButton
            >
            <VaButton
              preset="secondary"
              color="danger"
              size="small"
              :disabled="isSyncing || !!unlinkingAccountId || gatewayUnavailable"
              :loading="unlinkingAccountId === account.ml_account_id"
              @click="unlinkAccount(account)"
            >
              Desvincular Cuenta
            </VaButton>
          </div>
        </div>
      </VaCardContent>
    </VaCard>

    <VaAlert v-if="!isLoading && !gatewayUnavailable && !mlAccounts.length" color="info">
      Todavía no tienes cuentas vinculadas. Puedes agregar más de una cuenta de Mercado Libre.
    </VaAlert>

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

interface MlAccount {
  ml_account_id: string
  ml_nickname?: string
  nickname?: string
  created_at?: string
}
const mlAccounts = ref<MlAccount[]>([])
const isLoading = ref(false)
const isSyncing = ref(false)
const isLinking = ref(false)
const unlinkingAccountId = ref<string | null>(null)
const syncingAccountId = ref<string | null>(null)
const gatewayUnavailable = ref(false)

const formatDate = (val: any) => {
  if (!val) return ''
  return new Date(val).toLocaleDateString('es-CL')
}

const loadAccount = async () => {
  isLoading.value = true
  try {
    const res = await api.getMyMlAccount()
    const accounts = res.data?.accounts || (res.data?.account ? [res.data.account] : [])
    mlAccounts.value = accounts.map((account: MlAccount) => ({
      ...account,
      nickname: account.ml_nickname || account.nickname,
    }))
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

const syncAccount = async (accountId?: string) => {
  isSyncing.value = true
  syncingAccountId.value = accountId || null
  try {
    const res = await api.syncMyMlAccount(accountId)
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
    syncingAccountId.value = null
  }
}

const unlinkAccount = async (account: MlAccount) => {
  const ok = await confirm({
    title: 'Desvincular cuenta',
    message: `¿Desvincular ${account.nickname || 'esta cuenta'}? Tus otras cuentas seguirán vinculadas.`,
    okText: 'Sí, desvincular',
    cancelText: 'Cancelar',
  })
  if (!ok) return

  unlinkingAccountId.value = account.ml_account_id
  try {
    await api.unlinkMyMlAccount(account.ml_account_id)
    notify({
      message: 'Cuenta desvinculada exitosamente.',
      color: 'success',
    })
    mlAccounts.value = mlAccounts.value.filter((item) => item.ml_account_id !== account.ml_account_id)
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'Error al desvincular la cuenta.',
      color: 'danger',
    })
  } finally {
    unlinkingAccountId.value = null
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
