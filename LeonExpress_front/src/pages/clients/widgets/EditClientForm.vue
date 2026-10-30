<script setup lang="ts">
import { ref, watch, computed, PropType } from 'vue'
import { useForm, useToast, useModal } from 'vuestic-ui'
import { validators } from '../../../services/utils'
import api from '../../../services/api'
import mercadolibreService, { MlAccount } from '../../../services/mercadolibreService'
import { useClientsStore } from '../../../stores/clients'

interface Client {
  client_id: string
  client_name: string
  email: string
  phone: string
  address: string
}

const props = defineProps({
  client: {
    type: Object as PropType<Client>,
    required: true,
  },
})

const emit = defineEmits<{
  (event: 'success'): void
  (event: 'error', message: string): void
}>()

const form = useForm('client-form')
const { init } = useToast()
const { confirm } = useModal()
const clientsStore = useClientsStore()

const client_name = ref('')
const email = ref('')
const phone = ref('')
const address = ref('')

// Estados para Mercado Libre
const allLinkedAccounts = ref<MlAccount[]>([])
const availableAccounts = ref<MlAccount[]>([])
const isLoadingMl = ref(false)
const isAssigning = ref(false)
const isUnlinking = ref<string | null>(null)
const selectedAccountToAssign = ref<string>('')

const loadMlAccounts = async () => {
  if (!props.client?.client_id) return
  isLoadingMl.value = true
  try {
    const [linked, available] = await Promise.all([
      mercadolibreService.getAccounts(),
      mercadolibreService.getAvailableAccounts(),
    ])
    allLinkedAccounts.value = linked || []
    availableAccounts.value = available || []
  } catch (err) {
    console.error('Error al cargar cuentas de Mercado Libre:', err)
  } finally {
    isLoadingMl.value = false
  }
}

const assignedAccounts = computed(() => {
  if (!props.client?.client_id) return []
  return allLinkedAccounts.value.filter(
    (acc) => String(acc.client_id) === String(props.client.client_id),
  )
})

const assignableOptions = computed(() => {
  const options: { value: string; text: string }[] = []

  // 1. Cuentas disponibles en el gateway (sin cliente asignado en Leon Express)
  availableAccounts.value.forEach((acc) => {
    options.push({
      value: acc.ml_account_id,
      text: `${acc.ml_nickname} (Disponible)`,
    })
  })

  // 2. Cuentas asignadas a otros clientes (permitir reasignación)
  allLinkedAccounts.value
    .filter((acc) => String(acc.client_id) !== String(props.client.client_id))
    .forEach((acc) => {
      const otherClient = clientsStore.items.find((c) => String(c.client_id) === String(acc.client_id))
      const clientLabel = otherClient?.client_name ? `Asignada a: ${otherClient.client_name}` : 'Asignada a otro cliente'
      options.push({
        value: acc.ml_account_id,
        text: `${acc.ml_nickname} (${clientLabel})`,
      })
    })

  return options
})

const handleAssignAccount = async () => {
  if (!selectedAccountToAssign.value || !props.client?.client_id) return
  isAssigning.value = true
  try {
    await mercadolibreService.linkExistingAccount(
      selectedAccountToAssign.value,
      props.client.client_id,
    )
    init({
      message: 'Cuenta de Mercado Libre asignada exitosamente',
      color: 'success',
    })
    selectedAccountToAssign.value = ''
    await loadMlAccounts()
  } catch (err: any) {
    const message = err.response?.data?.error || 'Error al asignar la cuenta de Mercado Libre'
    init({ message, color: 'danger' })
  } finally {
    isAssigning.value = false
  }
}

const handleUnlink = async (account: MlAccount) => {
  const agreed = await confirm({
    title: 'Desvincular cuenta de Mercado Libre',
    message: `¿Estás seguro de desvincular la cuenta "${account.ml_nickname}" de este cliente?`,
    okText: 'Desvincular',
    cancelText: 'Cancelar',
    size: 'small',
  })
  if (!agreed) return

  isUnlinking.value = account.ml_account_id
  try {
    await mercadolibreService.deleteAccount(account.ml_account_id)
    init({
      message: `Cuenta "${account.ml_nickname}" desvinculada exitosamente`,
      color: 'success',
    })
    await loadMlAccounts()
  } catch (err: any) {
    const message = err.response?.data?.error || 'Error al desvincular la cuenta'
    init({ message, color: 'danger' })
  } finally {
    isUnlinking.value = null
  }
}

const populateForm = (client: Client | null) => {
  if (client) {
    client_name.value = client.client_name || ''
    email.value = client.email || ''
    phone.value = client.phone || ''
    address.value = client.address || ''
  } else {
    client_name.value = ''
    email.value = ''
    phone.value = ''
    address.value = ''
  }
}

watch(
  () => props.client,
  (newClient) => {
    populateForm(newClient)
    selectedAccountToAssign.value = ''
    if (newClient?.client_id) {
      loadMlAccounts()
    }
  },
  { immediate: true },
)

const handleSubmit = async () => {
  if (!props.client?.client_id || !form.validate()) return

  try {
    const payload = {
      client_name: client_name.value,
      email: email.value,
      phone: phone.value,
      address: address.value,
    }

    await api.updateClient(props.client.client_id, payload)

    // Si había una cuenta seleccionada en el selector al hacer click en Guardar, asignarla
    if (selectedAccountToAssign.value) {
      await mercadolibreService.linkExistingAccount(
        selectedAccountToAssign.value,
        props.client.client_id,
      )
    }

    init({
      message: 'Cliente actualizado correctamente',
      color: 'success',
    })

    emit('success')
  } catch (err: any) {
    const message = err.response?.data?.error || 'Error al procesar el cliente'
    init({ message, color: 'danger' })
    emit('error', message)
  }
}
</script>

<template>
  <VaForm ref="client-form" v-slot="{ isValid }" class="flex flex-col gap-4 max-w-xl mx-auto mt-4">
    <VaInput v-model="client_name" label="Nombre del cliente" :rules="[validators.required]" />
    <VaInput v-model="email" label="Email" :rules="[validators.required, validators.email]" />
    <p class="text-sm text-secondary">Este correo también se usa para recibir los códigos de acceso al portal.</p>
    <VaInput v-model="phone" label="Teléfono" :rules="[validators.required]" />
    <VaInput v-model="address" label="Dirección" :rules="[validators.required]" />

    <VaDivider class="my-1" />

    <div class="ml-accounts-section flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <VaIcon name="storefront" color="primary" />
          <span class="font-semibold text-base">Cuentas de Mercado Libre vinculadas ({{ assignedAccounts.length }})</span>
        </div>
        <VaButton
          size="small"
          preset="plain"
          icon="refresh"
          :loading="isLoadingMl"
          title="Actualizar cuentas"
          @click="loadMlAccounts"
        />
      </div>

      <!-- Cuentas actualmente asignadas -->
      <div v-if="assignedAccounts.length > 0" class="flex flex-col gap-2">
        <div
          v-for="acc in assignedAccounts"
          :key="acc.ml_account_id"
          class="flex items-center justify-between p-2.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
        >
          <div class="flex items-center gap-2">
            <VaBadge
              :text="acc.last_sync_error ? 'Revisar' : 'Vinculada'"
              :color="acc.last_sync_error ? 'danger' : 'success'"
              size="small"
            />
            <div>
              <div class="font-medium text-sm leading-tight">{{ acc.ml_nickname }}</div>
              <div class="text-xs text-secondary leading-tight">ID: {{ acc.ml_account_id }}</div>
            </div>
          </div>
          <VaButton
            size="small"
            preset="plain"
            color="danger"
            icon="link_off"
            title="Desvincular cuenta de este cliente"
            :loading="isUnlinking === acc.ml_account_id"
            @click="handleUnlink(acc)"
          >
            Desvincular
          </VaButton>
        </div>
      </div>
      <div v-else-if="!isLoadingMl" class="text-sm text-secondary p-3 rounded border border-dashed text-center">
        Este cliente no tiene cuentas de Mercado Libre asignadas actualmente.
      </div>

      <!-- Asignar cuenta existente -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 mt-1">
        <div class="flex-1">
          <VaSelect
            v-model="selectedAccountToAssign"
            :options="assignableOptions"
            value-by="value"
            text-by="text"
            label="Asignar cuenta existente de Mercado Libre"
            placeholder="Seleccionar cuenta vinculada..."
            searchable
            clearable
            class="w-full"
            :loading="isLoadingMl"
            :no-options-text="isLoadingMl ? 'Cargando cuentas...' : 'No hay cuentas disponibles para asignar'"
          />
        </div>
        <VaButton
          preset="secondary"
          :disabled="!selectedAccountToAssign || isAssigning"
          :loading="isAssigning"
          icon="add_link"
          @click="handleAssignAccount"
        >
          Asignar
        </VaButton>
      </div>
    </div>

    <div class="flex justify-end gap-2 mt-3">
      <VaButton color="#03323A" preset="secondary" @click="$emit('success')">Cancelar</VaButton>
      <VaButton color="#03323A" :disabled="!isValid" @click="handleSubmit"> Guardar </VaButton>
    </div>
  </VaForm>
</template>
