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
        class="profile-dropdown__content md:w-60 px-0 py-4 w-full"
        :style="{ '--hover-color': hoverColor }"
      >
        <VaList v-for="group in options" :key="group.name">
          <header v-if="group.name" class="uppercase text-[var(--va-secondary)] opacity-80 font-bold text-xs px-4">
            {{ t(`user.${group.name}`) }}
          </header>
          <VaListItem
            v-for="item in group.list"
            :key="item.name"
            class="menu-item px-4 text-base cursor-pointer h-8"
            :class="{ 'text-danger': item.name === 'logout' }"
            v-bind="resolveLinkAttribute(item)"
            @click="handleItemClick(item)"
          >
            <FontAwesomeIcon :icon="item.icon" class="pr-1" style="color: var(--va-secondary)" />
            {{ t(`user.${item.name}`) }}
          </VaListItem>
          <VaListSeparator v-if="group.separator" class="mx-3 my-2" />
        </VaList>
      </VaDropdownContent>
    </VaDropdown>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useColors, useToast } from 'vuestic-ui'
import { useUserStore } from '@stores/user-store'
const { colors, setHSLAColor } = useColors()
const hoverColor = computed(() => setHSLAColor(colors.focus, { a: 0.1 }))

const { t } = useI18n()
const router = useRouter()
const { init } = useToast()
const userStore = useUserStore()

const isShown = ref(false)

import {
  faUserCircle,
  faFileInvoice,
  faQuestionCircle,
  faLifeRing,
  faSignOutAlt,
} from '@fortawesome/free-solid-svg-icons'

type ProfileListItem = {
  name: string
  to?: string
  href?: string
  icon: any
}

type ProfileOptions = {
  name: string
  separator: boolean
  list: ProfileListItem[]
}

withDefaults(
  defineProps<{
    options?: ProfileOptions[]
  }>(),
  {
    options: () => [
      {
        name: 'account',
        separator: true,
        list: [
          {
            name: 'profile',
            to: 'preferences',
            icon: faUserCircle,
          },
          {
            name: 'billing',
            to: 'billing',
            icon: faFileInvoice,
          },
        ],
      },
      {
        name: 'explore',
        separator: true,
        list: [
          {
            name: 'faq',
            to: 'faq',
            icon: faQuestionCircle,
          },
          {
            name: 'helpAndSupport',
            href: 'https://discord.gg/u7fQdqQt8c',
            icon: faLifeRing,
          },
        ],
      },
      {
        name: '',
        separator: false,
        list: [
          {
            name: 'logout',
            icon: faSignOutAlt,
          },
        ],
      },
    ],
  },
)

const resolveLinkAttribute = (item: ProfileListItem) => {
  if (item.name === 'logout') {
    return {}
  }
  return item.to ? { to: { name: item.to } } : item.href ? { href: item.href, target: '_blank' } : {}
}

const handleItemClick = (item: ProfileListItem) => {
  if (item.name === 'logout') {
    userStore.logout()
    init({
      message: 'Sesión cerrada con éxito',
      color: 'success',
    })
    // Forzar reload para limpiar cualquier estado residual
    window.location.href = '/login'
    isShown.value = false
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
