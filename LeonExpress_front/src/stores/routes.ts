// src/stores/routes.ts
import { defineStore } from 'pinia'
import api from '../services/api'
import { Route } from '../pages/routes/types'

interface RoutesState {
  items: Route[]
  pagination: {
    total: number
  }
}

export const useRoutesStore = defineStore('routes', {
  state: (): RoutesState => ({
    items: [],
    pagination: {
      total: 0,
    },
  }),
  actions: {
    async fetch() {
      try {
        const response = await api.getRoutes()
        // Correcto: Extraemos el array 'routes' de la respuesta
        this.items = response.data.routes
        // Correcto: Extraemos el 'total' de la respuesta
        this.pagination.total = response.data.total
      } catch (error) {
        console.error('Error al cargar las rutas:', error)
        this.items = []
        this.pagination.total = 0
      }
    },
    async add(route: Omit<Route, 'route_id'>) {
      await api.createRoute(route)
    },
    async update(route: Route) {
      await api.updateRoute(route.route_id, route)
    },
    async remove(route: Route) {
      await api.deleteRoute(route.route_id)
    },
  },
})
