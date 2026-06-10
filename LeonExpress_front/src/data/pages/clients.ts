// src/data/pages/clients.ts
import api from '../../services/api'
import { Client } from '../../pages/clients/types' // Make sure this path is correct

// --- TIPOS (se mantienen igual) ---
export type Filters = { search: string }
export type Sorting = { sortBy: keyof Client; sortOrder: 'ASC' | 'DESC' }
export type Pagination = { page: number; perPage: number; total: number }
export type Params = Partial<Filters> & Partial<Sorting> & Partial<Pagination>

// --- FUNCIONES REFACTORIZADAS ---

export const getClients = async (params: Params) => {
  try {
    const { data } = await api.getClients(params)
    return {
      data: data.clients,
      pagination: {
        page: params.page || 1,
        perPage: params.perPage || 10,
        total: data.total,
      },
    }
  } catch (error) {
    console.error('Error fetching clients:', error)
    throw new Error('Failed to fetch clients.')
  }
}

export const addClient = async (client: Omit<Client, 'client_id'>) => {
  try {
    const { data } = await api.createClient(client)
    return [data] // Return in an array to match the old structure
  } catch (error) {
    console.error('Error adding client:', error)
    throw new Error('Failed to add client.')
  }
}

export const updateClient = async (client: Client) => {
  try {
    const { client_id, ...clientData } = client
    const { data } = await api.updateClient(client_id, clientData)
    return [data] // Return in an array to match the old structure
  } catch (error) {
    console.error('Error updating client:', error)
    throw new Error('Failed to update client.')
  }
}

export const removeClient = async (client: Client) => {
  try {
    await api.deleteClient(client.client_id)
    return true
  } catch (error) {
    console.error('Error deleting client:', error)
    throw new Error('Failed to delete client.')
  }
}
