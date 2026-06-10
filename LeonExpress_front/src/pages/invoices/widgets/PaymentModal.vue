<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from 'vuestic-ui'
import api from '@/services/api'

const props = defineProps<{
  invoiceId: string
  show: boolean
}>()
const emit = defineEmits(['close', 'success'])

const isSubmitting = ref(false)
const payment = ref<{
  amount: number
  payment_date: string
  payment_method: any
  transaction_reference: string
  notes: string
}>({
  amount: 0,
  payment_date: '',
  payment_method: '',
  transaction_reference: '',
  notes: '',
})
const { init: notify } = useToast()

const methods = [
  { value: 'TRANSFERENCIA', text: 'Transferencia' },
  { value: 'EFECTIVO', text: 'Efectivo' },
  { value: 'TARJETA', text: 'Tarjeta' },
]

const submit = async () => {
  isSubmitting.value = true
  try {
    // Asegurar formato YYYY-MM-DD
    const payload = {
      ...payment.value,
      payment_date: payment.value.payment_date ? new Date(payment.value.payment_date).toISOString().slice(0, 10) : '',
      payment_method:
        typeof payment.value.payment_method === 'object' && payment.value.payment_method.value
          ? payment.value.payment_method.value
          : payment.value.payment_method,
    }
    await api.registerInvoicePayment(props.invoiceId, payload)
    notify({ message: 'Pago registrado exitosamente', color: 'success' })
    emit('success')
    emit('close')
  } catch (e: any) {
    notify({ message: e.response?.data?.error || 'Error al registrar pago', color: 'danger' })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <VaModal :model-value="props.show" title="Registrar Pago" hide-default-actions @update:modelValue="emit('close')">
    <VaForm @submit.prevent="submit">
      <VaInput v-model="payment.amount" label="Monto" type="number" required />
      <VaInput v-model="payment.payment_date" label="Fecha de Pago" type="date" required />
      <VaSelect v-model="payment.payment_method" :options="methods" label="Método de Pago" required />
      <VaInput v-model="payment.transaction_reference" label="Referencia" />
      <VaInput v-model="payment.notes" label="Notas" />
      <div class="flex gap-2 mt-4 justify-end">
        <VaButton preset="secondary" @click="emit('close')">Cancelar</VaButton>
        <VaButton type="submit" :loading="isSubmitting" preset="primary">Registrar</VaButton>
      </div>
    </VaForm>
  </VaModal>
</template>
