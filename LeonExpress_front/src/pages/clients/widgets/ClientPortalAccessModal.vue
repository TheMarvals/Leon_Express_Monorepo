<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vuestic-ui'
import type { Client } from '../types'
import { validators } from '../../../services/utils'

const props = defineProps<{ modelValue: boolean; client: Client | null }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
const router = useRouter()
const portalUrl = new URL(router.resolve({ name: 'client-login' }).href, window.location.origin).href
const validEmail = computed(() => !!props.client?.email && validators.email(props.client.email) === true)
const { init: notify } = useToast()

const copyAccess = async () => {
  if (!validEmail.value) return
  try {
    await navigator.clipboard.writeText(
      `Accede a tu portal León Express: ${portalUrl}\nIngresa con tu correo registrado: ${props.client?.email}\nSolicita el código de acceso y revisa tu correo para iniciar sesión.`,
    )
    notify({ message: 'Instrucciones de acceso copiadas', color: 'success' })
  } catch {
    notify({
      message: 'No se pudo copiar. Puedes seleccionar el enlace y el correo para compartirlos.',
      color: 'danger',
    })
  }
}
</script>

<template>
  <VaModal v-model="isOpen" title="Acceso al portal" size="small" hide-default-actions>
    <div v-if="client" class="flex flex-col gap-4">
      <p>
        <strong>{{ client.client_name }}</strong> ya está registrado. No necesita una nueva invitación.
      </p>
      <VaAlert v-if="!validEmail" color="warning">
        Edita este cliente y registra un correo válido antes de compartir el acceso.
      </VaAlert>
      <VaInput :model-value="client.email || 'Sin correo registrado'" label="Correo de acceso" readonly />
      <VaInput :model-value="portalUrl" label="Portal Partners" readonly />
      <p class="text-sm">
        El cliente debe ingresar con este correo y solicitar su código de acceso. Al entrar por primera vez, su usuario
        se vincula a este mismo registro, conservando sus envíos, colectas y tarifas.
      </p>
      <div class="flex flex-wrap justify-end gap-2">
        <VaButton preset="secondary" @click="isOpen = false">Cerrar</VaButton>
        <VaButton icon="content_copy" :disabled="!validEmail" @click="copyAccess">Copiar acceso</VaButton>
      </div>
    </div>
  </VaModal>
</template>
