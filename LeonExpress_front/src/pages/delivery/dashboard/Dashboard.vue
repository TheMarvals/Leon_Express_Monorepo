<script lang="ts" setup>
import AdminDashboard from '@/pages/admin/dashboard/Dashboard.vue'
import { computed } from 'vue'
import { useUserStore } from '@/stores/user-store'

const userStore = useUserStore()
const userId = computed(() => userStore.user?.id)
</script>

<template>
  <AdminDashboard :user-id="userId" />
</template>
