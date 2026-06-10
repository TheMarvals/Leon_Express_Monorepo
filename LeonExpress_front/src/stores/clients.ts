import { defineStore } from 'pinia'
import {
  addClient,
  type Filters,
  getClients,
  Pagination,
  removeClient,
  Sorting,
  updateClient,
} from '../data/pages/clients'
import { Client } from '../pages/clients/types'

export const useClientsStore = defineStore('clients', {
  state: () => ({
    items: [] as Client[],
    pagination: { page: 1, perPage: 10, total: 0 } as Pagination,
  }),

  actions: {
    async getAll({
      filters,
      sorting,
      pagination,
    }: {
      filters?: Partial<Filters>
      sorting?: Sorting
      pagination?: Pagination
    }) {
      try {
        const response = await getClients({ ...filters, ...sorting, ...pagination })
        this.items = response.data
        this.pagination = response.pagination
      } catch (error) {
        console.error('Store getAll error:', error)
        throw error
      }
    },

    async add(client: Omit<Client, 'client_id'>) {
      const [newClient] = await addClient(client)
      this.items.unshift(newClient)
      return newClient
    },

    async update(client: Client) {
      const [updatedClient] = await updateClient(client)
      const index = this.items.findIndex(({ client_id }) => client_id === client.client_id)
      this.items.splice(index, 1, updatedClient)
      return updatedClient
    },

    async remove(client: Client) {
      const isRemoved = await removeClient(client)

      if (isRemoved) {
        const index = this.items.findIndex(({ client_id }) => client_id === client.client_id)
        this.items.splice(index, 1)
      }
    },
  },
})
