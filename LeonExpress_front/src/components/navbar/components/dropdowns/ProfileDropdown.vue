<template>
  <div class="profile-dropdown-wrapper">
    <VaDropdown v-model="isShown" :offset="[9, 0]" class="profile-dropdown" stick-to-edges>
      <template #anchor>
        <VaButton preset="secondary" color="textPrimary">
          <span class="profile-dropdown__anchor min-w-max">
            <slot />
            <VaAvatar
              :size="32"
              src="/profile.png"
              :title="userStore.user?.fullname || userStore.user?.full_name || userStore.user?.username"
            />
          </span>
        </VaButton>
      </template>
      <VaDropdownContent
        class="profile-dropdown__content w-72 max-w-[calc(100vw-2rem)] px-0 py-3"
        :style="{ '--hover-color': hoverColor }"
      >
        <VaList v-for="group in options" :key="group.name">
          <header v-if="group.name" class="uppercase text-[var(--va-secondary)] opacity-80 font-bold text-xs px-4">
            {{ group.name }}
          </header>
          <VaListItem
            v-for="item in group.list"
            :key="item.name"
            class="menu-item px-4 py-2 text-sm cursor-pointer"
            :class="{ 'text-danger': item.name === 'logout' }"
            v-bind="resolveLinkAttribute(item)"
            @click="handleItemClick(item)"
          >
            <FontAwesomeIcon :icon="item.icon" class="pr-1" style="color: var(--va-secondary)" />
            {{ item.label }}
          </VaListItem>
          <VaListSeparator v-if="group.separator" class="mx-3 my-2" />
        </VaList>
      </VaDropdownContent>
    </VaDropdown>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import { useColors, useToast } from 'vuestic-ui'
import { useUserStore } from '@stores/user-store'
const { colors, setHSLAColor } = useColors()
const hoverColor = computed(() => setHSLAColor(colors.focus, { a: 0.1 }))

const { init } = useToast()
const userStore = useUserStore()

const isShown = ref(false)

import { faUserCircle, faFileInvoice, faSignOutAlt } from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

type ProfileListItem = {
  name: string
  label: string
  to?: string
  icon: IconDefinition
}

const options = computed(() => {
  const accountItems: ProfileListItem[] = []
  // Client access uses OTP; customer service has a restricted operational area.
  if (!userStore.isClient && userStore.user?.role !== 'CUSTOMER_SERVICE') {
    accountItems.push({ name: 'profile', label: 'Mi perfil', to: 'preferences', icon: faUserCircle })
  }
  if (userStore.isAdmin) {
    accountItems.push({ name: 'billing', label: 'Administración financiera', to: 'billing', icon: faFileInvoice })
  }

  return [
    ...(accountItems.length ? [{ name: 'Mi cuenta', separator: true, list: accountItems }] : []),
    {
      name: '',
      separator: false,
      list: [{ name: 'logout', label: 'Cerrar sesión', icon: faSignOutAlt }],
    },
  ]
})

const resolveLinkAttribute = (item: ProfileListItem) => (item.to ? { to: { name: item.to } } : {})

const handleItemClick = (item: ProfileListItem) => {
  isShown.value = false
  if (item.name === 'logout') {
    const loginPath = userStore.isClient ? '/portal/login' : '/auth/login'
    userStore.logout()
    init({
      message: 'Sesión cerrada con éxito',
      color: 'success',
    })
    // Forzar reload para limpiar cualquier estado residual
    window.location.href = loginPath
  }
}
</script>

<style lang="scss">
.profile-dropdown {
  cursor: pointer;

  &__content {
    .menu-item:hover {
      background: var(--hover-color);
    }
  }

  &__anchor {
    display: inline-block;
  }
}
</style>
