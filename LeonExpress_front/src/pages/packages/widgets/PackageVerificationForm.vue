<script setup lang="ts">
import { ref, watch } from 'vue'
import { useForm, useToast } from 'vuestic-ui'
import { Package } from '../types'
import { validators } from '../../../services/utils'
import api from '../../../services/api'

const props = defineProps<{ pkg: Package }>()
const emit = defineEmits(['save', 'close'])

const { validate } = useForm('verification-form')
const { init: notify } = useToast()

const client_price = ref(0)
const delivery_cost = ref(0)
const initial_delivery_cost = ref(0) // Track initial value
const is_cod = ref(false)
const cod_amount = ref(0)
const is_change = ref(false)
const has_multiple_labels = ref(false)
const sales_codes = ref('')
const availableCosts = ref<{ cost_id: string; cost_name: string }[]>([])
const additionalCosts = ref<any[]>([])

watch(
  () => props.pkg,
  async (newPackage) => {
    if (newPackage) {
      try {
        console.log('Package data (newPackage):', newPackage)
        console.log('Props pkg:', props.pkg)

        // Intentar obtener client_id de todas las fuentes posibles
        let clientId = null

        if (typeof newPackage === 'object') {
          clientId = newPackage.client_id
          console.log('Client ID from newPackage:', clientId)
        }

        if (!clientId && props.pkg) {
          clientId = props.pkg.client_id
          console.log('Client ID from props.pkg:', clientId)
        }

        if (!clientId) {
          console.error('No se encontró client_id en ninguna fuente:', {
            newPackage: newPackage,
            propsPkg: props.pkg,
          })
          throw new Error('No client_id available')
        }

        console.log('Using client_id:', clientId)
        // Obtener el precio base del cliente
        const clientPricingRes = await api.getClientPricing(clientId)
        console.log('Client pricing response:', clientPricingRes)

        if (clientPricingRes?.data) {
          // Si el paquete no tiene precios, usar los del cliente
          client_price.value = newPackage.client_price
            ? parseFloat(newPackage.client_price as any)
            : clientPricingRes.data.base_price

          const defaultCost = newPackage.delivery_cost
            ? parseFloat(newPackage.delivery_cost as any)
            : Math.round(clientPricingRes.data.base_price * 0.72)

          delivery_cost.value = defaultCost
          initial_delivery_cost.value = defaultCost
        } else {
          throw new Error('No pricing data received from server')
        }

        is_cod.value = newPackage.is_cod || false
        cod_amount.value = parseFloat(newPackage.cod_amount as any) || 0
        is_change.value = newPackage.is_change || false
        has_multiple_labels.value = newPackage.has_multiple_labels || false
        sales_codes.value = newPackage.sales_codes || ''
        additionalCosts.value = newPackage.packageCosts || []
        availableCosts.value = []
      } catch (error: any) {
        console.error('Error loading client pricing:', error)
        notify({
          color: 'danger',
          message: `Error al cargar los precios del cliente: ${error.message || 'Error desconocido'}`,
        })
      }
    }
  },
  { immediate: true },
)

const onSave = () => {
  if (!validate()) return
  const payload = {
    client_price: client_price.value,
    delivery_cost: delivery_cost.value,
    is_delivery_cost_manual: delivery_cost.value !== initial_delivery_cost.value,
    is_cod: is_cod.value,
    cod_amount: is_cod.value ? cod_amount.value : 0,
    is_change: is_change.value,
    has_multiple_labels: has_multiple_labels.value,
    sales_codes: has_multiple_labels.value ? sales_codes.value : '',
    costs: additionalCosts.value,
  }
  emit('save', payload)
}

const addCostRow = () => {
  additionalCosts.value.push({ cost_id: '', applied_value: 0, cost_type: 'CLIENT_CHARGE' })
}
const removeCostRow = (index: number) => {
  additionalCosts.value.splice(index, 1)
}
</script>

<template>
  <VaForm ref="verification-form" class="flex flex-col gap-4">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <VaInput
        v-model.number="client_price"
        label="Precio al Cliente ($)"
        type="number"
        :rules="[validators.required]"
      />
      <VaInput
        v-model.number="delivery_cost"
        label="Costo de Entrega ($)"
        type="number"
        :rules="[validators.required]"
      />
    </div>

    <VaCheckbox v-model="is_cod" label="Requiere Cobro en Destino (COD)" />
    <VaInput
      v-if="is_cod"
      v-model.number="cod_amount"
      label="Monto a Cobrar ($)"
      type="number"
      :rules="[validators.required, (v) => Number(v) > 0 || 'Debe ser > 0']"
    />

    <VaCheckbox v-model="is_change" label="¿Es un Cambio? (Debe ser devuelto al conductor)" class="mb-2" />

    <VaCheckbox v-model="has_multiple_labels" label="¿Tiene más de una etiqueta este paquete?" class="mb-2" />
    <VaInput
      v-if="has_multiple_labels"
      v-model="sales_codes"
      label="Códigos de Venta (separados por coma)"
      type="text"
      placeholder="Ej: CV-1001, CV-1002"
      :rules="[validators.required]"
      class="mb-2"
    />

    <div class="mt-4 pt-4 border-t">
      <h3 class="va-h6 mb-2">Costos Adicionales</h3>
      <div v-for="(cost, index) in additionalCosts" :key="index" class="grid grid-cols-12 gap-2 mb-2 items-center">
        <VaSelect
          v-model="cost.cost_id"
          class="col-span-5"
          label="Tipo de Costo"
          :options="availableCosts"
          text-by="cost_name"
          value-by="cost_id"
        />
        <VaInput v-model.number="cost.applied_value" class="col-span-3" label="Valor ($)" type="number" />
        <VaSelect
          v-model="cost.cost_type"
          class="col-span-3"
          label="Aplicar a"
          :options="['CLIENT_CHARGE', 'DRIVER_CREDIT']"
        />
        <div class="col-span-1 flex items-end">
          <VaButton preset="primary" icon="fa4-trash" color="danger" @click="removeCostRow(index)" />
        </div>
      </div>
      <VaButton preset="secondary" icon-left="add" class="mt-2" @click="addCostRow">Añadir Costo</VaButton>
    </div>

    <div class="flex justify-end gap-2 mt-4">
      <VaButton preset="secondary" @click="$emit('close')">Cancelar</VaButton>
      <VaButton @click="onSave">Guardar Cambios</VaButton>
    </div>
  </VaForm>
</template>
