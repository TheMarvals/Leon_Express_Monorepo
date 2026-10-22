<template>
  <VaLayout v-if="breakpoint.lgUp" class="h-screen bg-white">
    <template #left>
      <div class="h-screen flex items-center justify-center" style="width: 35vw; background-color: #03323a">
        <RouterLink to="/" aria-label="Visit homepage" class="flex items-center justify-center w-full">
          <VuesticLogo context="login" />
        </RouterLink>
      </div>
    </template>
    <template #content>
      <main class="h-full flex items-center justify-center mx-auto max-w-[420px] bg-white">
        <RouterView />
      </main>
    </template>
  </VaLayout>

  <VaLayout v-else class="min-h-screen" style="background-color: #03323a">
    <template #content>
      <div class="p-4 py-8 min-h-screen flex flex-col justify-center items-center">
        <div class="mb-6 flex justify-center">
          <RouterLink to="/" aria-label="Visit homepage" class="flex justify-center">
            <VuesticLogo context="login" />
          </RouterLink>
        </div>
        <main class="w-full max-w-[420px] bg-white p-6 sm:p-8 rounded-2xl shadow-2xl">
          <RouterView />
        </main>
      </div>
    </template>
  </VaLayout>
</template>

<script lang="ts" setup>
import { useBreakpoint } from 'vuestic-ui'
import VuesticLogo from '../components/VuesticLogo.vue'

const breakpoint = useBreakpoint()
</script>
