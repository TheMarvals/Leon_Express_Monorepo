<script setup lang="ts">
import { ref } from 'vue'
import { useForm } from 'vuestic-ui'
import { validators } from '../../../services/utils'

interface PricingFormData {
  base_price: number | undefined
  valid_from: Date
}

const emit = defineEmits<{
  (event: 'save', payload: PricingFormData): void
  (event: 'close'): void
}>()

const { validate, reset } = useForm('pricing-form')

const base_price = ref<number | undefined>()
const valid_from = ref(new Date())

const handleSubmit = () => {
  if (!validate()) return
  const payload: PricingFormData = {
    base_price: base_price.value,
    valid_from: valid_from.value,
  }
  emit('save', payload)
}
</script>

<template>
  <VaForm ref="pricing-form" v-slot="{ isValid }" class="flex flex-col gap-4">
    <VaInput
      v-model.number="base_price"
      label="Nuevo Precio Base"
      type="number"
      :rules="[validators.required, (v) => v > 0 || 'El precio debe ser mayor a 0']"
    >
      <template #prependInner>$</template>
    </VaInput>
    <VaDateInput v-model="valid_from" label="Válido Desde" :rules="[validators.required]" />
    <div class="flex justify-end gap-2 mt-4">
      <VaButton preset="secondary" @click="$emit('close')">Cancelar</VaButton>
      <VaButton :disabled="!isValid" @click="handleSubmit">Guardar Precio</VaButton>
    </div>
  </VaForm>
</template>
