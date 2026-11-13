<template>
  <VaModal
    :model-value="modelValue"
    title="Invitar Nuevo Cliente (Enlace Privado)"
    close-button
    hide-default-actions
    size="medium"
    @update:model-value="handleModalValueUpdate"
    @close="handleClose"
  >
    <div v-if="!createdInvitation" class="space-y-4 py-2">
      <p class="text-xs text-gray-500">
        Crea un enlace único y privado para tu cliente con su tarifa base acordada. Podrás enviárselo por correo o
        copiar el enlace directo para WhatsApp.
      </p>

      <div class="space-y-3">
        <VaInput
          v-model="clientName"
          label="Nombre de la Empresa o Cliente *"
          placeholder="Ej: Tienda ABC SpA"
          class="w-full"
          clearable
          :error="!!errors.clientName"
          :error-messages="errors.clientName"
          @update:model-value="errors.clientName = ''"
        />

        <VaInput
          v-model="email"
          label="Correo Electronico del Cliente *"
          placeholder="contacto@tiendaabc.cl"
          class="w-full"
          clearable
          :error="!!errors.email"
          :error-messages="errors.email"
          @update:model-value="errors.email = ''"
        />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <VaInput
            v-model.number="basePrice"
            type="number"
            min="0"
            step="100"
            label="Tarifa Base Acordada ($) *"
            placeholder="Ej: 2800"
            class="w-full"
            :error="!!errors.basePrice"
            :error-messages="errors.basePrice"
            @update:model-value="errors.basePrice = ''"
          />

          <div class="flex items-center pt-5">
            <VaCheckbox v-model="hasFreePickups" label="Recolecciones Gratuitas (Free Pickups)" />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
          <VaButton type="button" preset="secondary" @click="handleClose">Cancelar</VaButton>
          <VaButton
            type="button"
            color="#03323a"
            class="font-bold"
            :loading="isSubmitting"
            @click="handleCreateInvite"
          >
            Generar y Enviar Invitacion
          </VaButton>
        </div>
      </div>
    </div>

    <!-- Exito: Enlace generado -->
    <div v-else class="space-y-4 py-2 text-center">
      <VaIcon name="check_circle" size="48px" color="success" class="mx-auto" />
      <h3 class="text-lg font-bold text-gray-800">Invitacion Creada Exitosamente</h3>
      <p class="text-xs text-gray-500">
        Se envio un correo de bienvenida automatico a <strong>{{ createdInvitation.email }}</strong> con su tarifa de
        <strong>${{ Number(createdInvitation.base_price).toLocaleString('es-CL') }}</strong>.
      </p>

      <div class="bg-gray-50 p-3 rounded-lg border border-gray-200 text-left">
        <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
          Enlace privado de un solo uso (Valido por 7 dias)
        </label>
        <div class="flex items-center gap-2">
          <input
            type="text"
            readonly
            :value="createdInvitation.invite_url"
            class="flex-1 bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs font-mono select-all text-gray-800"
          />
          <VaButton type="button" size="small" color="#03323a" icon="content_copy" @click="copyLink">
            {{ copied ? 'Copiado' : 'Copiar' }}
          </VaButton>
        </div>
      </div>

      <div class="flex justify-center gap-3 pt-3">
        <VaButton type="button" color="#25D366" icon="share" class="font-bold text-white shadow-sm" @click="shareOnWhatsApp">
          Enviar por WhatsApp
        </VaButton>
        <VaButton type="button" preset="secondary" @click="handleClose">Finalizar</VaButton>
      </div>
    </div>
  </VaModal>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useToast } from 'vuestic-ui'
import api from '../../../services/api'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'created'): void
}>()

const { init: notify } = useToast()

const isSubmitting = ref(false)
const copied = ref(false)
const createdInvitation = ref<any>(null)

const clientName = ref('')
const email = ref('')
const basePrice = ref<number>(2800)
const hasFreePickups = ref(false)

const errors = reactive({
  clientName: '',
  email: '',
  basePrice: '',
})

const resetForm = () => {
  clientName.value = ''
  email.value = ''
  basePrice.value = 2800
  hasFreePickups.value = false
  createdInvitation.value = null
  isSubmitting.value = false
  copied.value = false
  errors.clientName = ''
  errors.email = ''
  errors.basePrice = ''
}

const handleClose = () => {
  emit('update:modelValue', false)
  resetForm()
}

const handleModalValueUpdate = (val: boolean) => {
  if (!val) {
    handleClose()
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      resetForm()
    }
  },
)

const validate = (): boolean => {
  let valid = true
  errors.clientName = ''
  errors.email = ''
  errors.basePrice = ''

  const trimmedName = clientName.value?.trim() || ''
  const trimmedEmail = email.value?.trim() || ''
  const price = Number(basePrice.value)

  if (!trimmedName) {
    errors.clientName = 'El nombre de la empresa o cliente es obligatorio'
    valid = false
  }
  if (!trimmedEmail) {
    errors.email = 'El correo electronico es obligatorio'
    valid = false
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = 'Ingrese un correo electronico valido'
    valid = false
  }
  if (isNaN(price) || price <= 0) {
    errors.basePrice = 'La tarifa debe ser mayor a 0'
    valid = false
  }

  return valid
}

const handleCreateInvite = async () => {
  if (!validate()) return

  const trimmedName = clientName.value.trim()
  const trimmedEmail = email.value.trim()
  const price = Number(basePrice.value)

  isSubmitting.value = true
  try {
    const res = await api.createClientInvitation({
      client_name: trimmedName,
      email: trimmedEmail,
      base_price: price,
      has_free_pickups: hasFreePickups.value,
    })

    createdInvitation.value = res.data?.invitation
    notify({
      message: 'Invitacion generada y enviada por correo exitosamente.',
      color: 'success',
    })
    emit('created')
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'Error al crear la invitacion.',
      color: 'danger',
    })
  } finally {
    isSubmitting.value = false
  }
}

const copyLink = async () => {
  if (createdInvitation.value?.invite_url) {
    await navigator.clipboard.writeText(createdInvitation.value.invite_url)
    copied.value = true
    notify({ message: 'Enlace copiado al portapapeles', color: 'success' })
    setTimeout(() => {
      copied.value = false
    }, 2500)
  }
}

const shareOnWhatsApp = () => {
  if (!createdInvitation.value) return
  const msg = encodeURIComponent(
    `Hola ${createdInvitation.value.client_name}. Te damos la bienvenida a Leon Express. Activa tu portal de cliente completando tus datos de retiro en el siguiente enlace:\n\n${createdInvitation.value.invite_url}`,
  )
  window.open(`https://wa.me/?text=${msg}`, '_blank')
}
</script>
