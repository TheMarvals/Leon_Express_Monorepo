import { defineStore } from 'pinia'
import api from '../services/api'
import { User } from '../pages/users/types'

export const useUsersStore = defineStore('users', {
  state: () => ({
    items: [] as User[],
    pagination: { page: 1, perPage: 10, total: 0 },
  }),

  actions: {
    async getAll(options: { filters: any; sorting: any; pagination: any }) {
      try {
        const { data } = await api.allUsers({
          page: options.pagination.page,
          perPage: options.pagination.perPage,
          sortBy: options.sorting.sortBy,
          sortOrder: options.sorting.sortOrder,
          search: options.filters.search,
          isActive: options.filters.isActive,
        })

        this.items = data.users.map((user: any) => ({
          id: user.user_id,
          fullname: user.full_name,
          username: user.username,
          email: user.email,
          phone: user.phone,
          active: user.is_active,
          role_id: user.role_id,
          role_name: user.role_name,
          warehouse_id: user.warehouse_id,
          warehouse_name: user.warehouse_name,
          vehicles: user.vehicles || [],
        }))

        this.pagination = {
          total: data.total,
          page: options.pagination.page,
          perPage: options.pagination.perPage,
        }
      } catch (error) {
        console.error('Error fetching users:', error)
        throw error
      }
    },

    async add(userData: Omit<User, 'id'>) {
      try {
        const { fullname, ...rest } = userData
        const payload = { ...rest, full_name: fullname }
        return await api.createUser(payload)
      } catch (error) {
        console.error('Error adding user:', error)
        throw error
      }
    },

    async update(userData: User) {
      try {
        const { id, fullname, ...rest } = userData
        const payload = { ...rest, full_name: fullname }
        return await api.updateUser(id, payload)
      } catch (error) {
        console.error('Error updating user:', error)
        throw error
      }
    },

    async remove(user: User) {
      try {
        return await api.deleteUser(user.id)
      } catch (error) {
        console.error('Error deleting user:', error)
        throw error
      }
    },

    async reactivate(user: User) {
      try {
        return await api.reactivateUser(user.id)
      } catch (error) {
        console.error('Error reactivating user:', error)
        throw error
      }
    },
  },
})
