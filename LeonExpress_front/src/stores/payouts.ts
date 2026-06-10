import { defineStore } from 'pinia'
import api from '../services/api'
import type { Payout } from '../pages/payouts/types'

interface PayoutsState {
  items: Payout[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

export const usePayoutsStore = defineStore('payouts', {
  state: (): PayoutsState => ({
    items: [],
    pagination: {
      page: 1,
      pageSize: 10,
      total: 0,
    },
  }),

  actions: {
    async fetch(params: any) {
      try {
        const { data } = await api.getDriverPayouts(params)
        this.items = data.payouts
        this.pagination.total = data.total
      } catch (error) {
        console.error('Error fetching payouts:', error)
        throw new Error('No se pudieron cargar las liquidaciones.')
      }
    },

    async updateStatus(payout: Payout, newStatus: 'PAGADO' | 'CANCELADO') {
      try {
        await api.updatePayoutStatus(payout.payout_id, newStatus)
        // Actualiza el item localmente para reflejar el cambio al instante
        const index = this.items.findIndex((p) => p.payout_id === payout.payout_id)
        if (index !== -1) {
          this.items[index].status = newStatus
        }
      } catch (error) {
        console.error('Error updating payout status:', error)
        throw new Error('Error al actualizar el estado.')
      }
    },
  },
})
