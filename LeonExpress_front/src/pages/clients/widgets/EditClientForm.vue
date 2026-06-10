<script setup lang="ts">
import { ref, watch, computed, PropType } from 'vue' // Importar computed y PropType
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../../services/utils'
import api from '../../../services/api'

interface Client {
  client_id?: string
  client_name: string
  email: string
  phone: string
  address: string
}

const props = defineProps({
  client: {
    type: Object as PropType<Client | null>,
    default: null,
  },
  actionButtonLabel: {
    type: String,
    default: 'Registrar',
  },
})

const emit = defineEmits<{
  (event: 'success'): void
  (event: 'error', message: string): void
}>()

const form = useForm('client-form')
const { init } = useToast()

const client_name = ref('')
const email = ref('')
const phone = ref('')
const address = ref('')

const isEditing = computed(() => !!props.client && !!props.client.client_id)

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
  },
  { immediate: true },
)

const handleSubmit = async () => {
  if (!form.validate()) return

  try {
    const payload = {
      client_name: client_name.value,
      email: email.value,
      phone: phone.value,
      address: address.value,
    }

    if (isEditing.value && props.client?.client_id) {
      await api.updateClient(props.client.client_id, payload)
    } else {
      await api.createClient(payload)
    }

    init({
      message: isEditing.value ? 'Cliente actualizado correctamente' : 'Cliente registrado correctamente',
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
  <VaForm ref="client-form" v-slot="{ isValid }" class="flex flex-col gap-4 max-w-xl mx-auto mt-6">
    <VaInput v-model="client_name" label="Nombre del cliente" :rules="[validators.required]" />
    <VaInput v-model="email" label="Email" :rules="[validators.required, validators.email]" />
    <VaInput v-model="phone" label="Teléfono" :rules="[validators.required]" />
    <VaInput v-model="address" label="Dirección" :rules="[validators.required]" />

    <div class="flex justify-end gap-2">
      <VaButton color="#03323A" preset="secondary" @click="$emit('success')">Cancelar</VaButton>
      <VaButton color="#03323A" :disabled="!isValid" @click="handleSubmit">
        {{ actionButtonLabel }}
      </VaButton>
    </div>
  </VaForm>
</template>
