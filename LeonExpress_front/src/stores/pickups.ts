// src/stores/pickups.ts

import { defineStore } from 'pinia'
import api from '../services/api'
import { Pickup } from '../pages/pickups/types'

export const usePickupsStore = defineStore('pickups', {
  state: () => ({
    items: [] as Pickup[],
    pagination: { page: 1, perPage: 10, total: 0 },
  }),

  actions: {
    async fetch(options: { filters: any; sorting: any; pagination: any }) {
      try {
        const { data } = await api.getPickups({
          page: options.pagination.page,
          perPage: options.pagination.perPage,
          sortBy: options.sorting.sortBy,
          sortOrder: options.sorting.sortOrder,
          status: options.filters.status, // Filtro por estado
          search: options.filters.search,
        })

        this.items = data.pickups
        this.pagination.total = data.total
        this.pagination.page = options.pagination.page
        this.pagination.perPage = options.pagination.perPage
      } catch (error) {
        console.error('Error fetching pickups:', error)
        throw error
      }
    },
    async add(pickupData: Omit<Pickup, 'pickup_id' | 'status'>) {
      return await api.createPickup(pickupData)
    },
    async updateStatus(pickup: Pickup, newStatus: string) {
      return await api.updatePickupStatus(pickup.pickup_id, newStatus)
    },
    async update(pickupData: Pickup) {
      const { pickup_id, ...dataToUpdate } = pickupData
      return await api.updatePickup(pickup_id, dataToUpdate)
    },
    async delete(pickup: Pickup) {
      return await api.deletePickup(pickup.pickup_id)
    },
  },
})
