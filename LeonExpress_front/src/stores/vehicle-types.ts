// src/stores/vehicle-types.ts

import { defineStore } from 'pinia'
import api from '../services/api'
import { VehicleType } from '../pages/vehicle-types/types' // Asegúrate de que esta ruta sea correcta

export const useVehicleTypesStore = defineStore('vehicle-types', {
  state: () => ({
    items: [] as VehicleType[],
    pagination: {
      page: 1,
      perPage: 10,
      total: 0,
    },
  }),

  actions: {
    async fetch(options: { filters: any; sorting: any; pagination: any }) {
      try {
        const { data } = await api.getVehicleTypes({
          page: options.pagination.page,
          perPage: options.pagination.perPage,
          sortBy: options.sorting.sortBy,
          sortOrder: options.sorting.sortOrder,
          search: options.filters.search,
        })

        // Tu console.log confirma que 'data' tiene la propiedad 'vehicleTypes'
        console.log('Datos recibidos de la API: ' + JSON.stringify(data))

        // --- CORRECCIÓN ---
        // Asegúrate de que aquí se esté leyendo 'data.vehicleTypes'
        this.items = data.vehicleTypes

        this.pagination.total = data.total
        this.pagination.page = options.pagination.page
        this.pagination.perPage = options.pagination.perPage
      } catch (error) {
        console.error('Error fetching vehicle types:', error)
        throw error
      }
    },

    async add(vehicleTypeData: Omit<VehicleType, 'type_id'>) {
      try {
        const { data } = await api.createVehicleType(vehicleTypeData)
        return data
      } catch (error) {
        console.error('Error adding vehicle type:', error)
        throw error
      }
    },

    async update(vehicleTypeData: VehicleType) {
      try {
        const { type_id, ...dataToUpdate } = vehicleTypeData
        const { data } = await api.updateVehicleType(type_id, dataToUpdate)
        return data
      } catch (error) {
        console.error('Error updating vehicle type:', error)
        throw error
      }
    },

    async remove(vehicleType: VehicleType) {
      try {
        await api.removeVehicleType(vehicleType.type_id)
      } catch (error) {
        console.error('Error removing vehicle type:', error)
        throw error
      }
    },
  },
})
