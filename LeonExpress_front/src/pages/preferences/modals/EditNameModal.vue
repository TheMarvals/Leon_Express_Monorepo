<template>
  <VaModal
    :mobile-fullscreen="false"
    size="small"
    hide-default-actions
    max-width="380px"
    model-value
    close-button
    @update:modelValue="emits('cancel')"
  >
    <h1 class="va-h5 mb-4">Edit Name</h1>
    <VaForm ref="form" @submit.prevent="submit">
      <VaInput v-model="Name" class="mb-4" label="Name" placeholder="Name" />
      <div class="flex flex-col-reverse md:flex-row md:items-center md:justify-end md:space-x-4">
        <VaButton :style="buttonStyles" preset="secondary" color="secondary" @click="emits('cancel')"> Cancel</VaButton>
        <VaButton :style="buttonStyles" class="mb-4 md:mb-0" type="submit" @click="submit"> Save</VaButton>
      </div>
    </VaForm>
  </VaModal>
</template>
<script lang="ts" setup>
import { ref } from 'vue'
import { useUserStore } from '../../../stores/user-store'

import { buttonStyles } from '../styles'
import { useToast } from 'vuestic-ui'

const store = useUserStore()

const { init } = useToast()

const emits = defineEmits(['cancel'])

const Name = ref<string>(store.user?.full_name || store.user?.fullname || '')

const submit = async () => {
  if (!Name.value || Name.value === (store.user?.full_name || store.user?.fullname)) {
    return emits('cancel')
  }

  try {
    // Aquí deberías llamar a una API para actualizar el nombre
    // await api.updateUserProfile({ fullname: Name.value })

    // Simulamos la actualización por ahora
    console.log('Updating user name to:', Name.value)

    init({ message: "You've successfully changed your name", color: 'success' })
    emits('cancel')
  } catch (error) {
    init({ message: 'Failed to update name', color: 'danger' })
  }
}
</script>

<style lang="scss">
// TODO temporary before https://github.com/epicmaxco/vuestic-ui/issues/4020 fix
.va-modal__inner {
  min-width: 326px;
}
</style>
