// src/stores/vehicles.ts

import { defineStore } from 'pinia'
import api from '../services/api'
import { Vehicle } from '../pages/vehicles/types'

export const useVehiclesStore = defineStore('vehicles', {
  state: () => ({
    items: [] as Vehicle[],
    pagination: {
      page: 1,
      perPage: 10,
      total: 0,
    },
  }),

  actions: {
    async fetch(options: { filters: any; sorting: any; pagination: any }) {
      try {
        const { data } = await api.getVehicles({
          // Necesitarás este método en api.ts
          page: options.pagination.page,
          perPage: options.pagination.perPage,
          sortBy: options.sorting.sortBy,
          sortOrder: options.sorting.sortOrder,
          search: options.filters.search,
        })

        this.items = data.vehicles
        this.pagination.total = data.total
        this.pagination.page = options.pagination.page
        this.pagination.perPage = options.pagination.perPage
      } catch (error) {
        console.error('Error fetching vehicles:', error)
        throw error
      }
    },

    async add(vehicleData: Omit<Vehicle, 'vehicle_id'>) {
      return await api.createVehicle(vehicleData) // Necesitarás este método en api.ts
    },

    async update(vehicleData: Vehicle) {
      const { vehicle_id, ...dataToUpdate } = vehicleData
      return await api.updateVehicle(vehicle_id, dataToUpdate) // Necesitarás este método en api.ts
    },

    async remove(vehicle: Vehicle) {
      return await api.deleteVehicle(vehicle.vehicle_id) // Necesitarás este método en api.ts
    },
  },
})
