<script setup lang="ts">
import { ref, watch, computed, PropType } from 'vue'
import { useForm } from 'vuestic-ui'
import { validators } from '../../../services/utils'
import { Warehouse } from '../types'

const props = defineProps({
  warehouse: { type: Object as PropType<Warehouse | null>, default: null },
})

const emit = defineEmits<{
  (event: 'save', payload: Omit<Warehouse, 'warehouse_id'>): void
  (event: 'close'): void
}>()

interface WarehouseFormData {
  warehouse_name: string
  address: string
}

const { validate, reset } = useForm('warehouse-form')

const warehouse_name = ref('')
const address = ref('')

const isEditing = computed(() => !!props.warehouse)

watch(
  () => props.warehouse,
  (warehouseData) => {
    if (warehouseData) {
      warehouse_name.value = warehouseData.warehouse_name
      address.value = warehouseData.address
    } else {
      reset()
    }
  },
  { immediate: true },
)

const handleSubmit = () => {
  const payload: WarehouseFormData = {
    warehouse_name: warehouse_name.value,
    address: address.value,
  }
  emit('save', payload)
}
</script>

<template>
  <VaForm ref="warehouse-form" v-slot="{ isValid }" class="flex flex-col gap-4">
    <VaInput v-model="warehouse_name" label="Nombre del Almacén" :rules="[validators.required]" />
    <VaTextarea v-model="address" label="Dirección" :rules="[validators.required]" />

    <div class="flex justify-end gap-2 mt-4">
      <VaButton preset="secondary" @click="$emit('close')">Cancelar</VaButton>
      <VaButton :disabled="!isValid" @click="handleSubmit">{{
        isEditing ? 'Guardar Cambios' : 'Crear Almacén'
      }}</VaButton>
    </div>
  </VaForm>
</template>
