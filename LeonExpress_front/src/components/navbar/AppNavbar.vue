<template>
  <VaNavbar class="app-layout-navbar py-2 px-0">
    <!-- Botón de retroceso -->
    <template #left>
      <div class="left">
        <Transition v-if="isMobile" name="icon-fade" mode="out-in">
          <FontAwesomeIcon
            :icon="isSidebarMinimized ? 'bars' : 'xmark'"
            style="font-size: 24px; margin-top: 3px; cursor: pointer; color: var(--va-primary)"
            @click="isSidebarMinimized = !isSidebarMinimized"
          />
        </Transition>
        <VaButton preset="secondary" icon="fa4-arrow-left" class="mr-2" aria-label="Volver" @click="goBack" />
        <RouterLink to="/" aria-label="Visit home page">
          <VuesticLogo context="navbar" />
        </RouterLink>
      </div>
    </template>
    <template #right>
      <AppNavbarActions class="app-navbar__actions" :is-mobile="isMobile" />
    </template>
  </VaNavbar>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useGlobalStore } from '../../stores/global-store'
import { useRouter } from 'vue-router'
import AppNavbarActions from './components/AppNavbarActions.vue'
import VuesticLogo from '../VuesticLogo.vue'

defineProps({
  isMobile: { type: Boolean, default: false },
})

const router = useRouter()
const GlobalStore = useGlobalStore()

const { isSidebarMinimized } = storeToRefs(GlobalStore)

const goBack = () => {
  router.back()
}
</script>

<style lang="scss" scoped>
.va-navbar {
  z-index: 2;

  @media screen and (max-width: 950px) {
    .left {
      width: 100%;
    }

    .app-navbar__actions {
      display: flex;
      justify-content: space-between;
    }
  }
}

.left {
  display: flex;
  align-items: center;
  margin-left: 1rem;

  & > * {
    margin-right: 1rem;
  }

  & > *:last-child {
    margin-right: 0;
  }
}

.icon-fade-enter-active,
.icon-fade-leave-active {
  transition: transform 0.5s ease;
}

.icon-fade-enter,
.icon-fade-leave-to {
  transform: scale(0.5);
}
</style>
