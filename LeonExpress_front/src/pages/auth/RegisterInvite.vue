<template>
  <div>
    <!-- Estado de carga -->
    <div v-if="isLoading" class="text-center py-10">
      <VaProgressCircle indeterminate size="large" color="#03323a" />
      <p class="text-sm text-gray-500 mt-4">Validando enlace de invitación...</p>
    </div>

    <!-- Error / Invitación inválida o expirada -->
    <div v-else-if="errorMessage" class="py-4 space-y-4 text-center">
      <VaIcon name="cancel" size="48px" color="danger" class="mx-auto" />
      <h2 class="text-xl font-bold text-gray-900">Enlace no disponible</h2>
      <p class="text-sm text-gray-600 leading-relaxed max-w-sm mx-auto">
        {{ errorMessage }}
      </p>
      <div class="pt-4 flex justify-center gap-3">
        <RouterLink :to="{ name: 'client-login' }">
          <VaButton color="#03323a">Ir al Portal de Clientes</VaButton>
        </RouterLink>
      </div>
    </div>

    <!-- Formulario de Activación de Cuenta -->
    <div v-else-if="invitation" class="space-y-4">
      <div>
        <h1 class="text-2xl font-black text-gray-900 tracking-tight">
          ¡Hola, {{ invitation.client_name }}!
        </h1>
        <p class="text-xs text-gray-500 mt-1">
          Completa los datos de retiro para activar de inmediato tu portal y comenzar tus envíos.
        </p>
      </div>

      <!-- Resumen de Condiciones Acordadas -->
      <div class="bg-gradient-to-br from-gray-50 to-emerald-50/30 border border-emerald-100 rounded-xl p-3.5 text-xs text-gray-700 space-y-1.5 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-gray-500">Correo registrado:</span>
          <span class="font-bold text-gray-800 font-mono">{{ invitation.email }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-gray-500">Tarifa acordada:</span>
          <span class="font-extrabold text-[#03323a] text-sm">
            ${{ Number(invitation.base_price).toLocaleString('es-CL') }}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-gray-500">Recolecciones:</span>
          <span class="font-semibold text-emerald-700">
            {{ invitation.has_free_pickups ? 'Colectas sin costo' : 'Según volumen' }}
          </span>
        </div>
      </div>

      <!-- Formulario de Activación -->
      <VaForm ref="activationForm" @submit.prevent="submitActivation" class="space-y-3 pt-1">
        <VaInput
          v-model="formData.phone"
          :rules="[validators.required]"
          label="Teléfono Móvil o WhatsApp *"
          placeholder="+56 9 1234 5678"
          class="w-full"
        />

        <VaInput
          v-model="formData.commune"
          :rules="[validators.required]"
          label="Comuna de Retiro *"
          placeholder="Santiago Centro, Providencia, Pudahuel..."
          class="w-full"
        />

        <VaInput
          v-model="formData.address"
          :rules="[validators.required]"
          label="Dirección de Retiro *"
          placeholder="Calle, número, oficina o bodega..."
          class="w-full"
        />

        <div class="pt-3">
          <VaButton
            class="w-full font-bold py-2.5 shadow-md"
            color="#03323a"
            :loading="isSubmitting"
            @click="submitActivation"
          >
            Activar Cuenta y Entrar al Portal
          </VaButton>
        </div>
      </VaForm>

      <p class="text-[11px] text-gray-400 text-center pt-2">
        Al activar tu cuenta podrás sincronizar tus ventas con Mercado Libre o generar etiquetas de envío inmediatas.
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../services/utils'
import { useUserStore } from '@stores/user-store'
import api from '../../services/api'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const { validate } = useForm('activationForm')
const { init: notify } = useToast()

const token = ref(String(route.query.token || route.params.token || '').trim())
const isLoading = ref(true)
const isSubmitting = ref(false)
const errorMessage = ref('')
const invitation = ref<any>(null)

const formData = reactive({
  phone: '',
  commune: '',
  address: '',
})

onMounted(async () => {
  if (!token.value) {
    errorMessage.value = 'El enlace de invitación no contiene un token válido.'
    isLoading.value = false
    return
  }

  try {
    const res = await api.getInvitationByToken(token.value)
    invitation.value = res.data?.invitation
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || 'El enlace de invitación no es válido o ha expirado.'
  } finally {
    isLoading.value = false
  }
})

const submitActivation = async () => {
  if (isSubmitting.value || !validate()) return

  isSubmitting.value = true
  try {
    const res = await api.acceptInvitation({
      token: token.value,
      phone: formData.phone,
      address: formData.address,
      commune: formData.commune,
    })

    const { token: jwtToken, user } = res.data
    const userWithId = { ...user, id: user.user_id }

    localStorage.setItem('token', jwtToken)
    userStore.setUser(userWithId)
    localStorage.setItem('user', JSON.stringify(userWithId))

    notify({
      message: `¡Bienvenido a León Express, ${user.client?.client_name || user.full_name}! Tu cuenta ya está activa.`,
      color: 'success',
    })

    router.push({ name: 'dashboard' })
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'Error al completar el registro. Intenta nuevamente.',
      color: 'danger',
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>
