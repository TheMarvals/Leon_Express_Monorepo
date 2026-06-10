import { defineStore } from 'pinia'
import api from '../services/api'
import { Warehouse } from '../pages/warehouses/types'

interface WarehousesState {
  items: Warehouse[]
  pagination: {
    total: number
  }
}

export const useWarehousesStore = defineStore('warehouses', {
  state: (): WarehousesState => ({
    items: [],
    pagination: {
      total: 0,
    },
  }),
  actions: {
    async fetch() {
      try {
        const response = await api.getWarehouses()
        // Asignamos la data (que es tu array) directamente a los items
        this.items = response.data
        // El total es la cantidad de items en el array
        this.pagination.total = response.data.length
      } catch (error) {
        console.error('Error al cargar los almacenes:', error)
        // Reseteamos en caso de error para no mostrar datos viejos
        this.items = []
        this.pagination.total = 0
      }
    },
    async add(warehouse: Omit<Warehouse, 'warehouse_id'>) {
      await api.createWarehouse(warehouse)
    },
    async update(warehouse: Warehouse) {
      await api.updateWarehouse(warehouse.warehouse_id, warehouse)
    },
    async remove(warehouse: Warehouse) {
      await api.deleteWarehouse(warehouse.warehouse_id)
    },
  },
})
