<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from '@/stores/user-store'
import AdminDashboard from '@/pages/admin/dashboard/Dashboard.vue'
import DriverDashboard from '@/pages/delivery/dashboard/DriverDashboard.vue'

const userStore = useUserStore()
const role = computed(() => userStore.user?.role)
const userId = computed(() => userStore.user?.user_id || userStore.user?.id)
console.log('DEBUG userStore.user:', userStore.user)
console.log('DEBUG userId:', userId.value)
console.log('DEBUG role:', role.value)
</script>

<template>
  <component
    :is="role === 'ADMIN' ? AdminDashboard : role === 'DRIVER' ? DriverDashboard : 'div'"
    v-if="userId && role"
    :user-id="userId"
  />
  <div v-if="!role || !userId" class="text-center text-gray-500 mt-10">Cargando dashboard...</div>
</template>

<style scoped>
.text-center {
  text-align: center;
}
</style>
