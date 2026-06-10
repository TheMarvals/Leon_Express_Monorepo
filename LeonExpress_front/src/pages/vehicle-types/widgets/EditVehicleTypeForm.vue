<script setup lang="ts">
import { ref, watch, computed, PropType } from 'vue'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../../services/utils'
import { VehicleType } from '../types'

const props = defineProps({
  vehicleType: { type: Object as PropType<VehicleType | null>, default: null },
  actionButtonLabel: { type: String, default: 'Crear' },
})

// --- CAMBIO 1: Define el nuevo evento 'save' ---
const emit = defineEmits<{
  (event: 'save', payload: Omit<VehicleType, 'type_id'>): void
  (event: 'close'): void
}>()

const form = useForm('edit-vehicle-type-form')
const type_name = ref('')
const base_delivery_cost = ref<number | undefined>()

const isEditing = computed(() => !!props.vehicleType)

watch(
  () => props.vehicleType,
  (newType) => {
    if (newType) {
      type_name.value = newType.type_name
      base_delivery_cost.value = newType.base_delivery_cost
    } else {
      form.reset()
      type_name.value = ''
      base_delivery_cost.value = undefined
    }
  },
  { immediate: true },
)

// --- CAMBIO 2: Simplifica handleSubmit para que solo emita el evento ---
const handleSubmit = () => {
  if (!form.validate()) return

  const payload = {
    type_name: type_name.value,
    base_delivery_cost: base_delivery_cost.value as number,
  }

  emit('save', payload)
}
</script>

<template>
  <VaForm ref="edit-vehicle-type-form" v-slot="{ isValid }" class="flex flex-col gap-4 max-w-xl mx-auto mt-6">
    <VaInput v-model="type_name" label="Nombre del Tipo" :rules="[validators.required]" />
    <VaInput
      v-model.number="base_delivery_cost"
      label="Costo Base de Entrega"
      type="number"
      :rules="[validators.required]"
    >
      <template #prependInner>$</template>
    </VaInput>

    <div class="flex justify-end gap-2">
      <VaButton preset="secondary" @click="$emit('close')">Cancelar</VaButton>
      <VaButton :disabled="!isValid" @click="handleSubmit">
        {{ actionButtonLabel }}
      </VaButton>
    </div>
  </VaForm>
</template>
