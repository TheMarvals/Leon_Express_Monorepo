<template>
  <div>
    <!-- Selector de Modo de Acceso -->
    <div class="flex border-b border-gray-200 mb-6">
      <button
        type="button"
        class="flex-1 py-3 text-center text-sm font-semibold transition-colors duration-200 border-b-2"
        :class="loginMode === 'client' ? 'border-[#03323a] text-[#03323a]' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="loginMode = 'client'"
      >
        Portal Clientes (OTP)
      </button>
      <button
        type="button"
        class="flex-1 py-3 text-center text-sm font-semibold transition-colors duration-200 border-b-2"
        :class="loginMode === 'staff' ? 'border-[#03323a] text-[#03323a]' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="loginMode = 'staff'"
      >
        Personal León Express
      </button>
    </div>

    <VaAlert v-if="route.query.reason === 'session-expired'" color="warning" class="mb-4" role="alert">
      {{ SESSION_EXPIRED_MESSAGE }}
    </VaAlert>

    <!-- FORMULARIO CLIENTE (OTP / PIN) -->
    <div v-if="loginMode === 'client'">
      <h2 class="font-bold text-2xl mb-1 text-gray-800">Acceso a Clientes</h2>
      <p class="text-sm text-gray-500 mb-5">Ingresa tu correo para recibir un código de acceso temporal o usa tu PIN.</p>

      <!-- PASO 1: Ingreso de Correo -->
      <VaForm ref="clientEmailForm" @submit.prevent="requestOtp">
        <VaInput
          v-model="clientData.email"
          :rules="[validators.required, validators.email]"
          class="mb-4"
          label="Correo Electrónico Registrado"
          placeholder="tu-correo@empresa.cl"
          :disabled="otpSent && !isEditingEmail"
          autofocus
        />

        <div v-if="!otpSent || isEditingEmail" class="flex justify-center mt-2">
          <VaButton
            class="w-full"
            color="#03323A"
            :loading="isLoading"
            @click="requestOtp"
          >
            Enviar Código de Acceso
          </VaButton>
        </div>
      </VaForm>

      <!-- PASO 2: Ingreso de Código OTP / PIN -->
      <div v-if="otpSent && !isEditingEmail" class="mt-4">
        <VaAlert color="success" class="mb-4 text-xs">
          Hemos enviado un código de 6 dígitos a <strong>{{ clientData.email }}</strong>. Revisa tu bandeja de entrada o spam.
        </VaAlert>

        <VaForm ref="clientOtpForm" @submit.prevent="verifyOtp">
          <VaInput
            v-model="clientData.code"
            :rules="[validators.required, (v: string) => (v && v.length === 6) || 'El código debe tener 6 dígitos']"
            class="mb-4"
            label="Código de 6 Dígitos / PIN"
            placeholder="Ej: 123456"
            maxlength="6"
            input-class="text-center font-mono text-xl tracking-widest font-bold"
            autofocus
          />

          <div class="flex justify-center mt-2">
            <VaButton
              class="w-full"
              color="#03323A"
              :loading="isLoading"
              @click="verifyOtp"
            >
              Ingresar al Portal
            </VaButton>
          </div>
        </VaForm>

        <div class="flex items-center justify-between mt-4 text-xs text-gray-600">
          <button
            type="button"
            class="text-[#03323a] hover:underline font-medium"
            @click="isEditingEmail = true"
          >
            Cambiar correo
          </button>

          <button
            type="button"
            class="text-[#03323a] hover:underline font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
            :disabled="resendCooldown > 0 || isLoading"
            @click="requestOtp"
          >
            {{ resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código' }}
          </button>
        </div>
      </div>
    </div>

    <!-- FORMULARIO PERSONAL (ADMIN / DRIVER / BODEGA) -->
    <VaForm v-else ref="form" @submit.prevent="submit">
      <h2 class="font-bold text-2xl mb-1 text-gray-800">Personal Interno</h2>
      <p class="text-sm text-gray-500 mb-5">Ingresa con tu usuario y contraseña institucional.</p>

      <VaInput v-model="formData.username" :rules="[validators.required]" class="mb-4" label="Usuario" autofocus />

      <VaValue v-slot="isPasswordVisible" :default-value="false">
        <VaInput
          v-model="formData.password"
          :rules="[validators.required]"
          :type="isPasswordVisible.value ? 'text' : 'password'"
          class="mb-4"
          label="Contraseña"
          @clickAppendInner.stop="isPasswordVisible.value = !isPasswordVisible.value"
        >
          <template #appendInner>
            <FontAwesomeIcon
              :icon="isPasswordVisible.value ? 'eye-slash' : 'eye'"
              class="cursor-pointer"
              style="color: #6c757d"
            />
          </template>
        </VaInput>
      </VaValue>

      <div class="flex justify-center mt-4">
        <VaButton class="w-full" color="#03323A" :loading="isLoading" @click="submit">Iniciar Sesión</VaButton>
      </div>
    </VaForm>

    <div v-if="errorMessage" class="mt-4">
      <VaAlert color="danger" outline>{{ errorMessage }}</VaAlert>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SESSION_EXPIRED_MESSAGE } from '../../services/sessionExpiry'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../services/utils'
import { useUserStore } from '@stores/user-store'
import api from '../../services/api'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

const route = useRoute()
const userStore = useUserStore()
const { validate: validateStaff } = useForm('form')
const { validate: validateClientEmail } = useForm('clientEmailForm')
const { validate: validateClientOtp } = useForm('clientOtpForm')
const { push } = useRouter()
const { init } = useToast()

const loginMode = ref<'client' | 'staff'>(route.query.mode === 'client' ? 'client' : 'staff')

const formData = reactive({
  username: '',
  password: '',
})

const clientData = reactive({
  email: '',
  code: '',
})

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

// Solicitar OTP para cliente
const requestOtp = async () => {
  if (!validateClientEmail()) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    const res = await api.requestOtp({ email: clientData.email })
    otpSent.value = true
    isEditingEmail.value = false
    startCooldown()

    init({
      message: res.data?.message || 'Código enviado a tu correo electrónico.',
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

// Verificar OTP para cliente
const verifyOtp = async () => {
  if (!validateClientOtp()) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await api.verifyOtp({
      email: clientData.email,
      code: clientData.code,
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

// Login tradicional de personal
const submit = async () => {
  if (!validateStaff()) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await api.login({
      username: formData.username,
      password: formData.password,
    })

    if (!response.data.token || !response.data.user?.user_id) {
      throw new Error('Respuesta de login inválida desde el servidor')
    }

    const { token, user } = response.data
    const userWithId = { ...user, id: user.user_id }

    localStorage.setItem('token', token)
    userStore.setUser(userWithId)
    localStorage.setItem('user', JSON.stringify(userWithId))

    init({
      message: '¡Has iniciado sesión!',
      color: 'success',
    })

    push({ name: 'dashboard' })
  } catch (error: any) {
    errorMessage.value =
      error.response?.data?.error ||
      (error.response?.status >= 500
        ? 'El servicio de acceso no está disponible. Intenta nuevamente en unos minutos.'
        : !error.response
          ? 'No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.'
          : 'No se pudo iniciar sesión. Intenta nuevamente.')
    init({
      message: errorMessage.value,
      color: 'danger',
    })
  } finally {
    isLoading.value = false
  }
}
</script>
