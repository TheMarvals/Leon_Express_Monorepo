<template>
  <VaDropdown :offset="[13, 0]" stick-to-edges>
    <template #anchor>
      <VaButton preset="secondary" color="textPrimary">
        <VaBadge
          :text="notificationsStore.unreadCount"
          :offset="[-4, -4]"
          :color="notificationsStore.unreadCount > 0 ? 'danger' : 'secondary'"
        >
          <FontAwesomeIcon icon="bell" />
        </VaBadge>
      </VaButton>
    </template>

    <VaDropdownContent class="w-80 p-2">
      <div class="flex flex-col gap-2 mb-3">
        <div class="flex items-center justify-between">
          <h3 class="va-h6 m-0">Notificaciones</h3>
        </div>
        <PushNotificationButton />
      </div>

      <VaDivider class="mb-3" />

      <div v-if="notificationsStore.isLoading" class="text-center py-4">
        <VaProgressCircle indeterminate size="small" />
        <p class="text-sm text-secondary mt-2">Cargando...</p>
      </div>
      <div v-else-if="notificationsStore.notifications.length === 0" class="p-4 text-center text-secondary">
        <FontAwesomeIcon icon="bell-slash" class="text-2xl mb-2" />
        <p>No tienes notificaciones.</p>
      </div>
      <div v-else class="max-h-60 overflow-y-auto">
        <div
          v-for="notification in notificationsStore.notifications"
          :key="notification.notification_id"
          class="p-3 rounded-lg cursor-pointer border-l-3 mb-2 transition-colors"
          :class="{
            'font-bold bg-blue-50 border-l-blue-500 hover:bg-blue-100': !notification.is_read,
            'border-l-gray-200 hover:bg-gray-50': notification.is_read,
          }"
          :title="notification.link ? 'Hacer clic para ir al enlace' : 'Notificación'"
          @click="handleNotificationClick(notification)"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium">{{ notification.title }}</p>
                <VaIcon
                  v-if="notification.link"
                  name="fa4-external-link-alt"
                  size="10px"
                  class="text-blue-500 flex-shrink-0"
                />
              </div>
              <p class="text-xs text-secondary mt-1">{{ notification.message }}</p>
              <p class="text-xs text-gray-400 mt-2">
                <FontAwesomeIcon icon="clock" class="mr-1" />
                {{ formatRelativeTime(notification.created_at) }}
              </p>
            </div>
            <div v-if="!notification.is_read" class="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1"></div>
          </div>
        </div>
      </div>

      <VaDivider class="my-3" />

      <div class="flex gap-2">
        <VaButton
          v-if="notificationsStore.unreadCount > 0"
          size="small"
          preset="primary"
          class="flex-1"
          @click="notificationsStore.markAllAsRead()"
        >
          Marcar todas como leídas
        </VaButton>
        <VaButton size="small" preset="secondary" class="flex-1" @click="router.push('/settings')">
          Ver todas
        </VaButton>
      </div>
    </VaDropdownContent>
  </VaDropdown>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationsStore, type Notification } from '@/stores/notifications-store'
import PushNotificationButton from '@/components/PushNotificationButton.vue'

const router = useRouter()
const notificationsStore = useNotificationsStore()

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'hace unos segundos'
  if (diffInSeconds < 3600) return `hace ${Math.floor(diffInSeconds / 60)} min`
  if (diffInSeconds < 86400) return `hace ${Math.floor(diffInSeconds / 3600)} h`
  return `hace ${Math.floor(diffInSeconds / 86400)} días`
}

onMounted(() => {
  notificationsStore.fetchNotifications()
  // Opcional: Refrescar notificaciones periódicamente
  setInterval(() => {
    notificationsStore.fetchNotifications()
  }, 60000) // cada 60 segundos
})

const handleNotificationClick = (notification: Notification) => {
  console.log('Clicked notification:', notification)
  console.log('Notification link:', notification.link)

  // Marcar esta notificación específica como leída
  if (!notification.is_read) {
    console.log('Marking notification as read:', notification.notification_id)
    notificationsStore.markAsRead(notification.notification_id)
  }

  // Navegar al link si existe
  if (notification.link) {
    // Convertir links del formato antiguo al nuevo
    let correctedLink = notification.link

    // Corregir formato de rutas: /routes/details/ID -> /routes/ID
    correctedLink = correctedLink.replace(/\/routes\/details\//, '/routes/')

    // Corregir formato de paquetes: /packages/details/ID -> /packages/ID
    correctedLink = correctedLink.replace(/\/packages\/details\//, '/packages/')

    // Corregir formato de pickups: /pickups/details/ID -> /pickups/ID
    correctedLink = correctedLink.replace(/\/pickups\/details\//, '/pickups/')

    console.log('Original link:', notification.link)
    console.log('Corrected link:', correctedLink)
    console.log('Navigating to:', correctedLink)

    try {
      router.push(correctedLink)
    } catch (error) {
      console.error('Error navigating:', error)
    }
  } else {
    console.log('No link in notification')
  }
}
</script>
