<template>
  <VaAvatar size="large">
    <img src="/profile.png" alt="Profile" class="w-full h-full object-cover rounded-full" />
  </VaAvatar>
  <div class="flex flex-col justify-center">
    <h2 class="text-[28px] md:text-[32px] leading-10 font-bold">
      {{ store.user?.full_name || store.user?.fullname || 'Usuario' }}
    </h2>
    <div class="flex space-x-1 text-[13px] leading-4">
      <p>Miembro desde</p>
      <p>{{ new Date().getFullYear() }}</p>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { useUserStore } from '@stores/user-store'

const store = useUserStore()
</script>
