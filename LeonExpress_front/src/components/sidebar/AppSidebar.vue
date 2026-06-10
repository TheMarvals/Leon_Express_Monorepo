<template>
  <VaSidebar v-model="writableVisible" :width="sidebarWidth" :color="color" minimized-width="0">
    <VaAccordion v-model="value" multiple>
      <VaCollapse v-for="(route, index) in navigationRoutes.routes" :key="index">
        <template #header="{ value: isCollapsed }">
          <VaSidebarItem
            :to="route.children ? undefined : { name: route.name }"
            :active="routeHasActiveChild(route)"
            :active-color="activeColor"
            :text-color="textColor(route)"
            :aria-label="`${route.children ? 'Open category ' : 'Visit'} ${t(route.displayName)}`"
            role="button"
            hover-opacity="0.10"
          >
            <VaSidebarItemContent class="py-3 pr-2 pl-4">
              <FontAwesomeIcon
                v-if="route.meta.icon"
                :icon="faIcon(route.meta.icon)"
                :style="{ fontSize: '20px', color: iconColor(route) }"
                aria-hidden="true"
              />
              <VaSidebarItemTitle class="flex justify-between items-center leading-5 font-semibold">
                {{ t(route.displayName) }}
                <FontAwesomeIcon
                  v-if="route.children"
                  :icon="faArrowIcon(isCollapsed)"
                  style="font-size: 16px; color: #03323a"
                />
              </VaSidebarItemTitle>
            </VaSidebarItemContent>
          </VaSidebarItem>
        </template>
        <template #body>
          <div v-for="(childRoute, index2) in route.children" :key="index2">
            <VaSidebarItem
              :to="{ name: childRoute.name }"
              :active="isActiveChildRoute(childRoute)"
              :active-color="activeColor"
              :text-color="textColor(childRoute)"
              :aria-label="`Visit ${t(route.displayName)}`"
              hover-opacity="0.10"
            >
              <VaSidebarItemContent class="py-3 pr-2 pl-11">
                <VaSidebarItemTitle class="leading-5 font-semibold">
                  {{ t(childRoute.displayName) }}
                </VaSidebarItemTitle>
              </VaSidebarItemContent>
            </VaSidebarItem>
          </div>
        </template>
      </VaCollapse>
    </VaAccordion>
  </VaSidebar>
</template>
<script lang="ts">
import { defineComponent, watch, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useColors } from 'vuestic-ui'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faBox,
  faWarehouse,
  faRoute,
  faUsers,
  faHandshake,
  faCar,
  faMoneyBill,
  faArrowUp,
  faArrowDown,
  faCaretUp,
  faCaretDown,
  faCamera,
  faStore,
} from '@fortawesome/free-solid-svg-icons'
import navigationRoutes, { type INavigationRoute } from './NavigationRoutes'

export default defineComponent({
  name: 'Sidebar',
  props: {
    visible: { type: Boolean, default: true },
    mobile: { type: Boolean, default: false },
  },
  emits: ['update:visible'],

  setup: (props, { emit }) => {
    const { getColor, colorToRgba } = useColors()
    const route = useRoute()
    const { t } = useI18n()

    const value = ref<boolean[]>([])

    const writableVisible = computed({
      get: () => props.visible,
      set: (v: boolean) => emit('update:visible', v),
    })

    const isActiveChildRoute = (child: INavigationRoute) => route.name === child.name

    const routeHasActiveChild = (section: INavigationRoute) => {
      if (!section.children) {
        return route.path.endsWith(`${section.name}`)
      }

      return section.children.some(({ name }) => route.path.endsWith(`${name}`))
    }

    const setActiveExpand = () =>
      (value.value = navigationRoutes.routes.map((route: INavigationRoute) => routeHasActiveChild(route)))

    const sidebarWidth = computed(() => (props.mobile ? '100vw' : '280px'))
    const color = computed(() => getColor('background-secondary'))
    const activeColor = computed(() => colorToRgba(getColor('#03323a'), 0.1))

    const iconColor = (route: INavigationRoute) => (routeHasActiveChild(route) ? '#03323a' : 'secondary')
    const textColor = (route: INavigationRoute) => (routeHasActiveChild(route) ? '#03323a' : 'textPrimary')

    // Soporte para fa4-* y fa-* directamente desde FontAwesome
    const iconMap: Record<string, any> = {
      group: faUsers,
      handshake: faHandshake,
      directions_car: faCar,
      store: faStore,
    }

    const faIcon = (iconName: string) => {
      if (iconName.startsWith('fa4-')) {
        // fa4-warehouse -> faWarehouse
        const faName = iconName.replace('fa4-', '').replace(/-([a-z])/g, (g) => g[1].toUpperCase())
        switch (faName) {
          case 'box':
            return faBox
          case 'warehouse':
            return faWarehouse
          case 'route':
            return faRoute
          case 'moneyBill':
            return faMoneyBill
          case 'users':
            return faUsers
          case 'handshake':
            return faHandshake
          case 'car':
            return faCar
          case 'camera':
            return faCamera
          case 'caretUp':
            return faCaretUp
          case 'caretDown':
            return faCaretDown
          default:
            return faBox
        }
      }
      if (iconName.startsWith('fa-')) {
        // fa-users, fa-warehouse, etc. (si usas FontAwesome v5+)
        // Aquí podrías mapear si tienes una librería extendida
        return faBox
      }
      return iconMap[iconName] || faBox
    }

    // Arrow icon mapping
    const faArrowIcon = (isCollapsed: boolean) => (isCollapsed ? faCaretUp : faCaretDown)

    watch(() => route.fullPath, setActiveExpand, { immediate: true })

    return {
      writableVisible,
      sidebarWidth,
      value,
      color,
      activeColor,
      navigationRoutes,
      routeHasActiveChild,
      isActiveChildRoute,
      t,
      iconColor,
      textColor,
      faIcon,
      faArrowIcon,
    }
  },
})
</script>
