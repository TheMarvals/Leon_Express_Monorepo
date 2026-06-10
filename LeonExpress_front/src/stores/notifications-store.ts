import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

export interface Notification {
  notification_id: string
  title: string
  message: string
  link: string | null
  is_read: boolean
  created_at: string
}

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([])
  const unreadCount = ref(0)
  const isLoading = ref(false)

  async function fetchNotifications() {
    isLoading.value = true
    try {
      const { data } = await api.getNotifications({ limit: 20 })
      notifications.value = data.notifications
      unreadCount.value = data.unreadCount
    } catch (error) {
      console.error('Failed to fetch notifications', error)
    } finally {
      isLoading.value = false
    }
  }

  async function markAllAsRead() {
    try {
      await api.markAllNotificationsAsRead()
      // Actualiza el estado localmente para una respuesta instantánea
      notifications.value.forEach((n) => (n.is_read = true))
      unreadCount.value = 0
    } catch (error) {
      console.error('Failed to mark notifications as read', error)
    }
  }

  async function markAsRead(notificationId: string) {
    try {
      await api.markNotificationAsRead(notificationId)
      // Actualiza el estado localmente
      const notification = notifications.value.find((n) => n.notification_id === notificationId)
      if (notification && !notification.is_read) {
        notification.is_read = true
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
    } catch (error) {
      console.error('Failed to mark notification as read', error)
    }
  }

  return {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAllAsRead,
    markAsRead,
  }
})
