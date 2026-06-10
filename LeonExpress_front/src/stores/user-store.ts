// src/stores/user-store.ts

import { defineStore } from 'pinia'
import api from '../services/api'
import { User } from '../pages/users/types'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null as User | null,
    // --- AÑADE ESTA LÍNEA ---
    sessionChecked: false, // Para saber si ya intentamos restaurar la sesión
  }),
  actions: {
    async restoreSession() {
      const token = localStorage.getItem('token')
      if (!token) {
        this.sessionChecked = true
        return // No hay token, no hay nada que hacer
      }
      try {
        const { data } = await api.getMe()
        this.user = data // La respuesta de /auth/me viene directamente
        console.log('Usuario cargado:', this.user)
      } catch (error) {
        // Si el token es inválido, limpiamos todo
        this.logout()
      } finally {
        this.sessionChecked = true
      }
    },
    setUser(userData: User) {
      this.user = userData
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
  },
})
