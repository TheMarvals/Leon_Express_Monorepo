<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useToast } from 'vuestic-ui'
import api from '@/services/api'
import { useUserStore } from '@/stores/user-store'

const props = defineProps<{
  invoiceId: string
  show: boolean
  defaultAmount?: number
  invoiceNumber?: string | number
}>()

const emit = defineEmits(['close', 'success'])

const userStore = useUserStore()
const isClient = computed(() => userStore.isClient)
const { init: notify } = useToast()

const isSubmitting = ref(false)
const selectedFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const payment = ref({
  amount: props.defaultAmount || 0,
  payment_date: new Date().toISOString().slice(0, 10),
  payment_method: 'TRANSFERENCIA',
  transaction_reference: '',
  notes: '',
})

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      payment.value = {
        amount: props.defaultAmount || 0,
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: 'TRANSFERENCIA',
        transaction_reference: '',
        notes: '',
      }
      selectedFile.value = null
    }
  },
)

const methods = [
  { value: 'TRANSFERENCIA', text: 'Transferencia Bancaria' },
  { value: 'EFECTIVO', text: 'Efectivo' },
  { value: 'TARJETA', text: 'Tarjeta' },
]

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0]
  }
}

const removeFile = () => {
  selectedFile.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const submit = async () => {
  if (isClient.value && !selectedFile.value && !payment.value.transaction_reference) {
    notify({
      message: 'Debes adjuntar el comprobante o indicar el número de transferencia.',
      color: 'warning',
    })
    return
  }

  if (Number(payment.value.amount) <= 0) {
    notify({
      message: 'El monto debe ser mayor a 0.',
      color: 'warning',
    })
    return
  }

  isSubmitting.value = true
  try {
    const method =
      typeof payment.value.payment_method === 'object' && (payment.value.payment_method as any).value
        ? (payment.value.payment_method as any).value
        : payment.value.payment_method

    const formData = new FormData()
    formData.append('amount', String(payment.value.amount))
    if (payment.value.payment_date) {
      formData.append('payment_date', payment.value.payment_date)
    }
    if (method) {
      formData.append('payment_method', method)
    }
    if (payment.value.transaction_reference) {
      formData.append('transaction_reference', payment.value.transaction_reference)
    }
    if (payment.value.notes) {
      formData.append('notes', payment.value.notes)
    }
    if (selectedFile.value) {
      formData.append('receipt', selectedFile.value)
    }

    const { data } = await api.registerInvoicePayment(props.invoiceId, formData)
    notify({
      message: data.message || (isClient.value ? 'Comprobante enviado para revisión' : 'Pago registrado exitosamente'),
      color: 'success',
    })
    emit('success')
    emit('close')
  } catch (e: any) {
    notify({
      message: e.response?.data?.error || 'Error al procesar el pago',
      color: 'danger',
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <VaModal
    :model-value="props.show"
    :title="isClient ? 'Informar Pago de Factura' : 'Registrar Pago de Factura'"
    hide-default-actions
    size="medium"
    @update:modelValue="emit('close')"
  >
    <div class="mb-4 text-sm text-gray-600">
      <span v-if="isClient">
        Sube el comprobante de transferencia para que el equipo administrativo valide y concilie tu pago.
      </span>
      <span v-else>
        Registra el abono o pago total correspondiente a esta factura.
      </span>
    </div>

    <VaForm @submit.prevent="submit">
      <div class="space-y-4">
        <VaInput
          v-model="payment.amount"
          label="Monto Pagado"
          type="number"
          step="any"
          required
        />

        <VaInput
          v-model="payment.payment_date"
          label="Fecha de Pago"
          type="date"
          required
        />

        <VaSelect
          v-model="payment.payment_method"
          :options="methods"
          value-by="value"
          label="Método de Pago"
          required
        />

        <VaInput
          v-model="payment.transaction_reference"
          label="Nº de Referencia / Transferencia"
          :placeholder="isClient ? 'Ej: Transf. 9823412 Banco Estado' : 'Referencia o comprobante'"
        />

        <!-- Campo Comprobante -->
        <div>
          <label class="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Comprobante de Pago {{ isClient ? '(Recomendado)' : '(Opcional)' }}
          </label>
          <input
            ref="fileInputRef"
            type="file"
            accept=".pdf,image/png,image/jpeg,image/webp"
            class="hidden"
            @change="handleFileChange"
          />

          <div v-if="!selectedFile" class="flex items-center gap-2">
            <VaButton
              preset="secondary"
              size="small"
              icon="attach_file"
              @click="fileInputRef?.click()"
            >
              Seleccionar Archivo (PDF o Imagen)
            </VaButton>
            <span class="text-xs text-gray-400">Máx. 10MB</span>
          </div>

          <div v-else class="flex items-center justify-between p-2 rounded bg-gray-50 border border-gray-200">
            <div class="flex items-center gap-2 truncate">
              <VaIcon name="description" color="primary" size="small" />
              <span class="text-sm font-medium truncate">{{ selectedFile.name }}</span>
              <span class="text-xs text-gray-500">({{ (selectedFile.size / 1024).toFixed(1) }} KB)</span>
            </div>
            <VaButton
              preset="plain"
              icon="close"
              color="danger"
              size="small"
              @click="removeFile"
            />
          </div>
        </div>

        <VaInput
          v-model="payment.notes"
          label="Notas Adicionales"
          type="textarea"
          :rows="2"
        />
      </div>

      <div class="flex gap-2 mt-6 justify-end">
        <VaButton preset="secondary" @click="emit('close')">Cancelar</VaButton>
        <VaButton type="submit" :loading="isSubmitting" preset="primary">
          {{ isClient ? 'Enviar Comprobante' : 'Registrar Pago' }}
        </VaButton>
      </div>
    </VaForm>
  </VaModal>
</template>
