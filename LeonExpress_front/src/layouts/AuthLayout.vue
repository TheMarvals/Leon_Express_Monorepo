<template>
  <VaLayout v-if="breakpoint.lgUp" class="h-screen bg-white">
    <template #left>
      <div class="h-screen bg-[var(--va-leon-color)] h-full flex items-center justify-center" style="width: 35vw">
        <RouterLink to="/" aria-label="Visit homepage">
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

  <VaLayout v-else class="h-screen bg-[var(--va-leon-color)]">
    <template #content>
      <div class="p-4">
        <main class="h-full flex flex-row items-center justify-start mx-auto max-w-[420px]">
          <div class="flex flex-col items-start">
            <RouterLink class="py-4" to="/" aria-label="Visit homepage">
              <VuesticLogo context="navbar" />
            </RouterLink>
            <RouterView />
          </div>
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
