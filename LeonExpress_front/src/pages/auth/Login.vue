<template>
  <VaForm ref="form" @submit.prevent="submit">
    <h1 class="font-semibold text-4xl mb-4">Log in</h1>
    <!-- <p class="text-base mb-4 leading-5">
      New to our platform?
      <RouterLink :to="{ name: 'signup' }" class="font-semibold text-primary"
        >Sign up</RouterLink
      >
    </p> -->

    <VaInput v-model="formData.username" :rules="[validators.required]" class="mb-4" label="Username" autofocus />

    <VaValue v-slot="isPasswordVisible" :default-value="false">
      <VaInput
        v-model="formData.password"
        :rules="[validators.required]"
        :type="isPasswordVisible.value ? 'text' : 'password'"
        class="mb-4"
        label="Password"
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
      <VaButton class="w-full" color="#03323A" :loading="isLoading" @click="submit">Login</VaButton>
    </div>

    <div v-if="errorMessage" class="mt-4">
      <VaMessage color="danger">{{ errorMessage }}</VaMessage>
    </div>
  </VaForm>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../services/utils'
import { useUserStore } from '@stores/user-store'
import api from '../../services/api' // 1. Importa tu servicio de API centralizado

const userStore = useUserStore()
const { validate } = useForm('form')
const { push } = useRouter()
const { init } = useToast()

const formData = reactive({
  username: '',
  password: '',
})

const isLoading = ref(false)
const errorMessage = ref('')

const submit = async () => {
  if (!validate()) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    // 2. Llama al método de login desde tu servicio de API
    const response = await api.login({
      username: formData.username,
      password: formData.password,
    })

    if (!response.data.token || !response.data.user?.user_id) {
      throw new Error('Respuesta de login inválida desde el servidor')
    }

    const { token, user } = response.data
    // Mapea user_id a id para compatibilidad con el store y el dashboard
    const userWithId = { ...user, id: user.user_id }

    // 3. Guarda el token y actualiza el store con la nueva función
    localStorage.setItem('token', token)
    userStore.setUser(userWithId)

    // 4. (Opcional pero recomendado) Guarda el objeto de usuario completo en localStorage
    localStorage.setItem('user', JSON.stringify(userWithId))

    init({
      message: '¡Has iniciado sesión!',
      color: 'success',
    })

    push({ name: 'dashboard' })
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || 'Las credenciales son incorrectas.'
    init({
      message: errorMessage.value,
      color: 'danger',
    })
  } finally {
    isLoading.value = false
  }
}
</script>
