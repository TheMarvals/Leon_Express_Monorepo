<template>
  <VaModal
    v-model="isOpen"
    title="Invitar Nuevo Cliente (Enlace Privado)"
    close-button
    hide-default-actions
    size="medium"
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
          :rules="rules.clientName"
          label="Nombre de la Empresa o Cliente *"
          placeholder="Ej: Tienda ABC SpA"
          class="w-full"
          clearable
        />

        <VaInput
          v-model="email"
          :rules="rules.email"
          label="Correo Electrónico del Cliente *"
          placeholder="contacto@tiendaabc.cl"
          class="w-full"
          clearable
        />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <VaInput
            v-model.number="basePrice"
            type="number"
            min="0"
            step="100"
            :rules="rules.basePrice"
            label="Tarifa Base Acordada ($) *"
            placeholder="Ej: 2800"
            class="w-full"
          />

          <div class="flex items-center pt-5">
            <VaCheckbox v-model="hasFreePickups" label="Recolecciones Gratuitas (Free Pickups)" />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
          <VaButton preset="secondary" @click="handleClose">Cancelar</VaButton>
          <VaButton
            color="#03323a"
            class="font-bold"
            :loading="isSubmitting"
            @click="handleCreateInvite"
          >
            Generar y Enviar Invitación
          </VaButton>
        </div>
      </div>
    </div>

    <!-- Éxito: Enlace generado -->
    <div v-else class="space-y-4 py-2 text-center">
      <VaIcon name="check_circle" size="48px" color="success" class="mx-auto" />
      <h3 class="text-lg font-bold text-gray-800">Invitación Creada con Éxito</h3>
      <p class="text-xs text-gray-500">
        Se envió un correo de bienvenida automático a <strong>{{ createdInvitation.email }}</strong> con su tarifa de
        <strong>${{ Number(createdInvitation.base_price).toLocaleString('es-CL') }}</strong
        >.
      </p>

      <div class="bg-gray-50 p-3 rounded-lg border border-gray-200 text-left">
        <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
          Enlace privado de un solo uso (Válido por 7 días)
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
        <VaButton type="button" preset="secondary" @click="handleClose"> Finalizar </VaButton>
      </div>
    </div>
  </VaModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useToast } from 'vuestic-ui'
import api from '../../../services/api'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'created'): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

const { init: notify } = useToast()

const isSubmitting = ref(false)
const copied = ref(false)
const createdInvitation = ref<any>(null)

const clientName = ref('')
const email = ref('')
const basePrice = ref<number>(2800)
const hasFreePickups = ref(false)

const rules = {
  clientName: [(v: string) => (!!v && v.trim().length > 0) || 'El nombre de la empresa o cliente es obligatorio'],
  email: [
    (v: string) => (!!v && v.trim().length > 0) || 'El correo electrónico es obligatorio',
    (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v?.trim() || '') || 'Ingrese un correo electrónico válido',
  ],
  basePrice: [
    (v: any) => (v !== null && v !== undefined && v !== '' && Number(v) > 0) || 'La tarifa debe ser mayor a 0',
  ],
}

const resetForm = () => {
  clientName.value = ''
  email.value = ''
  basePrice.value = 2800
  hasFreePickups.value = false
  createdInvitation.value = null
  isSubmitting.value = false
  copied.value = false
}

const handleClose = () => {
  isOpen.value = false
  resetForm()
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      resetForm()
    }
  },
)

const handleCreateInvite = async () => {
  const trimmedName = clientName.value?.trim() || ''
  const trimmedEmail = email.value?.trim() || ''
  const price = Number(basePrice.value)

  if (!trimmedName) {
    notify({ message: 'El nombre de la empresa o cliente es obligatorio.', color: 'warning' })
    return
  }
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    notify({ message: 'Ingrese un correo electrónico válido.', color: 'warning' })
    return
  }
  if (isNaN(price) || price <= 0) {
    notify({ message: 'La tarifa debe ser mayor a 0.', color: 'warning' })
    return
  }

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
      message: 'Invitación generada y enviada por correo exitosamente.',
      color: 'success',
    })
    emit('created')
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'Error al crear la invitación.',
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
