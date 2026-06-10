<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from 'vuestic-ui'
import api from '@/services/api'

const props = defineProps<{
  payoutId: string
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
  payment_date: new Date().toISOString().slice(0, 10),
  payment_method: 'TRANSFERENCIA',
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
  if (payment.value.amount <= 0) {
    notify({ message: 'El monto debe ser mayor a 0', color: 'warning' })
    return
  }

  isSubmitting.value = true
  try {
    const payload = {
      ...payment.value,
      payment_method:
        typeof payment.value.payment_method === 'object' && payment.value.payment_method.value
          ? payment.value.payment_method.value
          : payment.value.payment_method,
    }
    await api.registerDriverPayment(props.payoutId, payload)
    notify({ message: 'Pago al conductor registrado exitosamente', color: 'success' })
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
  <VaModal
    :model-value="props.show"
    title="Registrar Pago a Conductor"
    hide-default-actions
    @update:modelValue="emit('close')"
  >
    <VaForm @submit.prevent="submit">
      <div class="grid grid-cols-1 gap-4">
        <VaInput v-model.number="payment.amount" label="Monto a Pagar" type="number" required />
        <VaInput v-model="payment.payment_date" label="Fecha de Pago" type="date" required />
        <VaSelect
          v-model="payment.payment_method"
          :options="methods"
          label="Método de Pago"
          value-by="value"
          track-by="value"
          required
        />
        <VaInput v-model="payment.transaction_reference" label="Referencia / Comprobante" />
        <VaInput v-model="payment.notes" label="Notas Adicionales" type="textarea" />
      </div>

      <div class="flex gap-2 mt-6 justify-end">
        <VaButton preset="secondary" @click="emit('close')">Cancelar</VaButton>
        <VaButton type="submit" :loading="isSubmitting" color="primary">Registrar Pago</VaButton>
      </div>
    </VaForm>
  </VaModal>
</template>
