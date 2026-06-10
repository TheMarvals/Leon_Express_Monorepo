import { defineStore } from 'pinia'
import api from '../services/api'
import { Delivery } from '../pages/deliveries/types'

export const useDeliveriesStore = defineStore('deliveries', {
  state: () => ({
    items: [] as Delivery[],
    pagination: { total: 0 },
  }),
  actions: {
    async fetch(params: any) {
      const { data } = await api.getDeliveries(params)
      this.items = data.deliveries
      this.pagination.total = data.total
    },
  },
})
