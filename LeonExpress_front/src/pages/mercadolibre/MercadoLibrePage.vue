<script setup lang="ts">
import { useUserStore } from '@/stores/user-store'
import AdminMercadoLibre from './AdminMercadoLibre.vue'
import ClientMercadoLibre from './ClientMercadoLibre.vue'

const userStore = useUserStore()
</script>

<template>
  <ClientMercadoLibre v-if="userStore.isClient" />
  <AdminMercadoLibre v-else-if="userStore.isAdmin" />
</template>
