// src/stores/user-store.ts

import { defineStore } from 'pinia'
import api from '../services/api'
import { User } from '../pages/users/types'
import { isSessionExpiredError } from '../services/sessionExpiry'

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

let restorePromise: Promise<void> | null = null

export const useUserStore = defineStore('user', {
  state: () => ({
    user: getStoredUser(),
    sessionChecked: false,
  }),
  actions: {
    async restoreSession() {
      if (restorePromise) {
        return restorePromise
      }

      const token = localStorage.getItem('token')
      if (!token) {
        this.user = null
        this.sessionChecked = true
        return
      }

      restorePromise = (async () => {
        try {
          const { data } = await api.getMe()
          this.user = data
          try {
            localStorage.setItem('user', JSON.stringify(data))
          } catch (e) {
            console.warn('No se pudo guardar usuario en localStorage', e)
          }
        } catch (error: any) {
          if (isSessionExpiredError(error)) {
            console.warn('Sesión expirada o token inválido:', error)
            this.logout()
          } else {
            // Error de red, 502/503/timeout o servidor reiniciando: no destruir la sesión
            console.warn('Error de red/servidor al verificar sesión, conservando sesión local:', error?.message || error)
            if (!this.user) {
              this.user = getStoredUser()
            }
          }
        } finally {
          this.sessionChecked = true
          restorePromise = null
        }
      })()

      return restorePromise
    },
    setUser(userData: User) {
      this.user = userData
      try {
        localStorage.setItem('user', JSON.stringify(userData))
      } catch (e) {
        console.warn('No se pudo persistir usuario en localStorage', e)
      }
    },
    logout() {
      this.$reset()
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    },
  },
  getters: {
    isLoggedIn: (state) => !!state.user,
    isAdmin: (state) => state.user?.role === 'ADMIN',
    isDriver: (state) => state.user?.role === 'DRIVER',
    isWarehouseStaff: (state) => state.user?.role === 'WAREHOUSE_STAFF',
    isClient: (state) => state.user?.role === 'CLIENT',
  },
})

