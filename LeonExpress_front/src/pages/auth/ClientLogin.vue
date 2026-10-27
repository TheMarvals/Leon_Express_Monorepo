<template>
  <div>
    <!-- Encabezado exclusivo para Partners -->
    <div class="mb-6">
      <h1 class="text-3xl font-extrabold text-gray-900 tracking-tight">Portal Partners</h1>
      <p class="text-sm text-gray-500 mt-1">
        Gestiona tus envíos, solicita colectas y sincroniza Mercado Libre con León Express.
      </p>
    </div>

    <VaAlert v-if="route.query.reason === 'session-expired'" color="warning" class="mb-4" role="alert">
      {{ SESSION_EXPIRED_MESSAGE }}
    </VaAlert>

    <!-- PASO 1: Ingreso de Correo Electrónico -->
    <VaForm ref="clientEmailForm" @submit.prevent="requestOtp">
      <VaInput
        v-model="email"
        :rules="[validators.required, validators.email]"
        class="mb-4"
        label="Correo Electrónico Registrado"
        placeholder="ejemplo@tuempresa.cl"
        :disabled="otpSent && !isEditingEmail"
        autofocus
      />

      <div v-if="!otpSent || isEditingEmail" class="flex justify-center mt-2">
        <VaButton class="w-full font-bold py-2.5 shadow-sm" color="#03323A" :loading="isLoading" @click="requestOtp">
          Enviar Código de Acceso
        </VaButton>
      </div>
    </VaForm>

    <!-- PASO 2: Ingreso de Código OTP -->
    <div v-if="otpSent && !isEditingEmail" class="mt-4">
      <VaAlert color="success" class="mb-4 text-xs">
        Hemos enviado un código temporal a <strong>{{ email }}</strong
        >. Revisa tu bandeja de entrada o spam.
      </VaAlert>

      <VaForm ref="clientOtpForm" @submit.prevent="verifyOtp">
        <VaInput
          v-model="code"
          :rules="[validators.required, (v: string) => (v && v.length === 6) || 'El código debe tener 6 dígitos']"
          class="mb-4"
          label="Código de Seguridad de 6 Dígitos"
          placeholder="123456"
          maxlength="6"
          input-class="text-center font-mono text-2xl tracking-widest font-black"
          autofocus
        />

        <div class="flex justify-center mt-2">
          <VaButton class="w-full font-bold py-2.5 shadow-md" color="#03323A" :loading="isLoading" @click="verifyOtp">
            Ingresar al Portal
          </VaButton>
        </div>
      </VaForm>

      <div class="flex items-center justify-between mt-4 text-xs text-gray-600">
        <button type="button" class="text-[#03323a] hover:underline font-semibold" @click="isEditingEmail = true">
          ← Cambiar correo
        </button>

        <button
          type="button"
          class="text-[#03323a] hover:underline font-semibold disabled:text-gray-400 disabled:cursor-not-allowed"
          :disabled="resendCooldown > 0 || isLoading"
          @click="requestOtp"
        >
          {{ resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código' }}
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="mt-4">
      <VaAlert color="danger" outline>{{ errorMessage }}</VaAlert>
    </div>

    <div class="mt-6 text-center text-xs text-gray-500">
      ¿Aún no tienes cuenta?
      <RouterLink
        :to="{ name: 'home', hash: '#trabaja-con-nosotros' }"
        class="font-semibold text-[#03323a] hover:underline"
        >Cuéntanos sobre tu negocio</RouterLink
      >
    </div>

    <p class="mt-4 text-center text-xs text-gray-500">
      <RouterLink :to="{ name: 'home' }" class="font-semibold text-[#03323a] hover:underline"
        >← Volver a León Express</RouterLink
      >
    </p>
  </div>
</template>

<script lang="ts" setup>
import { ref, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SESSION_EXPIRED_MESSAGE } from '../../services/sessionExpiry'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../services/utils'
import { useUserStore } from '@stores/user-store'
import api from '../../services/api'

const route = useRoute()
const userStore = useUserStore()
const { validate: validateEmail } = useForm('clientEmailForm')
const { validate: validateOtp } = useForm('clientOtpForm')
const { push } = useRouter()
const { init } = useToast()

const email = ref('')
const code = ref('')
const otpSent = ref(false)
const isEditingEmail = ref(false)
const resendCooldown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const isLoading = ref(false)
const errorMessage = ref('')

const startCooldown = () => {
  resendCooldown.value = 60
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    if (resendCooldown.value > 0) {
      resendCooldown.value--
    } else {
      if (timer) clearInterval(timer)
    }
  }, 1000)
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const requestOtp = async () => {
  if (!validateEmail()) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    const res = await api.requestOtp({ email: email.value })
    otpSent.value = true
    isEditingEmail.value = false
    startCooldown()

    init({
      message: res.data?.message || 'Código de acceso enviado a tu correo.',
      color: 'success',
    })
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || 'No se pudo enviar el código de acceso.'
    init({
      message: errorMessage.value,
      color: 'danger',
    })
  } finally {
    isLoading.value = false
  }
}

const verifyOtp = async () => {
  if (!validateOtp()) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await api.verifyOtp({
      email: email.value,
      code: code.value,
    })

    if (!response.data.token || !response.data.user?.user_id) {
      throw new Error('Respuesta de autenticación inválida')
    }

    const { token, user } = response.data
    const userWithId = { ...user, id: user.user_id }

    localStorage.setItem('token', token)
    userStore.setUser(userWithId)
    localStorage.setItem('user', JSON.stringify(userWithId))

    init({
      message: `¡Bienvenido al Portal, ${user.client?.client_name || user.full_name || 'Cliente'}!`,
      color: 'success',
    })

    push({ name: 'dashboard' })
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || 'Código incorrecto o expirado.'
    init({
      message: errorMessage.value,
      color: 'danger',
    })
  } finally {
    isLoading.value = false
  }
}
</script>
