<template>
  <div>
    <VaAlert v-if="route.query.reason === 'session-expired'" color="warning" class="mb-4" role="alert">
      {{ SESSION_EXPIRED_MESSAGE }}
    </VaAlert>

    <!-- FORMULARIO PERSONAL (ADMIN / DRIVER / BODEGA) -->
    <VaForm ref="form" @submit.prevent="submit">
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

    <p class="mt-6 text-center text-xs text-gray-500">
      <RouterLink :to="{ name: 'home' }" class="font-semibold text-[#03323a] hover:underline"
        >← Volver a León Express</RouterLink
      >
    </p>
    <div v-if="errorMessage" class="mt-4">
      <VaAlert color="danger" outline>{{ errorMessage }}</VaAlert>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue'
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
const { push } = useRouter()
const { init } = useToast()

const formData = reactive({
  username: '',
  password: '',
})

const isLoading = ref(false)
const errorMessage = ref('')

// Login tradicional de personal
const submit = async () => {
  if (isLoading.value || !validateStaff()) return

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
