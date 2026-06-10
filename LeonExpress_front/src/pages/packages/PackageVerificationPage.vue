<script setup lang="ts">
import { ref } from 'vue'
import { useToast, useModal } from 'vuestic-ui'
import api from '../../services/api'
import { Package } from './types'
import { validators } from '../../services/utils'
import { useForm } from 'vuestic-ui'

const { init: notify } = useToast()
const { validate, reset } = useForm('verification-form')

const trackingCodeSearch = ref('')
const isLoading = ref(false)
const foundPackage = ref<Package | null>(null)

// Form fields for verification
const client_price = ref(0)
const delivery_cost = ref(0)
const is_cod = ref(false)
const cod_amount = ref(0)
const availableCosts = ref<{ cost_id: string; cost_name: string }[]>([])
const additionalCosts = ref<{ cost_id: string; applied_value: number; cost_type: 'DRIVER_CREDIT' | 'CLIENT_CHARGE' }[]>(
  [],
)

const findPackage = async () => {
  if (!trackingCodeSearch.value) return
  isLoading.value = true
  foundPackage.value = null
  reset()
  try {
    const { data: pkg } = await api.getPackageByTrackingCode(trackingCodeSearch.value)
    foundPackage.value = pkg

    // Pre-rellenar formulario
    client_price.value = parseFloat(pkg.client_price) || 0
    delivery_cost.value = parseFloat(pkg.delivery_cost) || 0
    is_cod.value = pkg.is_cod || false
    cod_amount.value = parseFloat(pkg.cod_amount) || 0
    additionalCosts.value = pkg.packageCosts || []

    // Cargar costos disponibles si no se han cargado
    if (availableCosts.value.length === 0) {
      const costsRes = await api.getCosts()
      availableCosts.value = costsRes.data
    }
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al buscar el paquete.'
    notify({ message: errorMessage, color: 'danger' })
  } finally {
    isLoading.value = false
  }
}

const onSaveVerification = async () => {
  if (!foundPackage.value || !validate()) return

  const payload = {
    client_price: client_price.value,
    delivery_cost: delivery_cost.value,
    is_cod: is_cod.value,
    cod_amount: is_cod.value ? cod_amount.value : 0,
    costs: additionalCosts.value,
  }

  try {
    await api.verifyPackage(foundPackage.value.package_id, payload)
    notify({ message: 'Paquete verificado y actualizado exitosamente.', color: 'success' })
    // Limpiar para la siguiente búsqueda
    foundPackage.value = null
    trackingCodeSearch.value = ''
    reset()
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al guardar la verificación.'
    notify({ message: errorMessage, color: 'danger' })
  }
}

// Lógica para la tabla de costos adicionales
const addCostRow = () => {
  additionalCosts.value.push({ cost_id: '', applied_value: 0, cost_type: 'CLIENT_CHARGE' })
}
const removeCostRow = (index: number) => {
  additionalCosts.value.splice(index, 1)
}
</script>

<template>
  <h1 class="page-title">Verificación de Paquetes en Almacén</h1>

  <VaCard class="mb-6">
    <VaCardContent class="flex gap-2 items-end">
      <VaInput
        v-model="trackingCodeSearch"
        class="flex-grow"
        label="Buscar por Código de Seguimiento"
        placeholder="Escanee o ingrese el código..."
        @keyup.enter="findPackage"
      />
      <VaButton :loading="isLoading" @click="findPackage">Buscar Paquete</VaButton>
    </VaCardContent>
  </VaCard>

  <div v-if="foundPackage">
    <h2 class="va-h4 mb-4">Verificando Paquete: {{ foundPackage.tracking_code }}</h2>

    <VaForm ref="verification-form" class="flex flex-col gap-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VaInput
          v-model.number="client_price"
          label="Precio al Cliente ($)"
          type="number"
          :rules="[validators.required, (v) => v >= 0 || 'Debe ser >= 0']"
        />
        <VaInput
          v-model.number="delivery_cost"
          label="Costo de Entrega ($)"
          type="number"
          :rules="[validators.required, (v) => v >= 0 || 'Debe ser >= 0']"
        />
      </div>

      <VaCheckbox v-model="is_cod" label="Requiere Cobro en Destino (COD)" />
      <VaInput
        v-if="is_cod"
        v-model.number="cod_amount"
        label="Monto a Cobrar ($)"
        type="number"
        :rules="[validators.required, (v) => v > 0 || 'Debe ser > 0']"
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
            :rules="[validators.required]"
          />
          <VaInput
            v-model.number="cost.applied_value"
            class="col-span-3"
            label="Valor ($)"
            type="number"
            :rules="[validators.required, (v) => v > 0 || 'Valor > 0']"
          />
          <VaSelect
            v-model="cost.cost_type"
            class="col-span-3"
            label="Aplicar a"
            :options="['CLIENT_CHARGE', 'DRIVER_CREDIT']"
            :rules="[validators.required]"
          />
          <div class="col-span-1 flex items-end">
            <VaButton preset="primary" icon="fa4-trash" color="danger" @click="removeCostRow(index)" />
          </div>
        </div>
        <VaButton preset="secondary" icon-left="add" class="mt-2" @click="addCostRow">Añadir Costo</VaButton>
      </div>

      <div class="flex justify-end mt-4">
        <VaButton color="success" @click="onSaveVerification">Guardar y Verificar Paquete</VaButton>
      </div>
    </VaForm>
  </div>
</template>
