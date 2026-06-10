// src/stores/packages.ts

import { defineStore } from 'pinia'
import api from '../services/api'
import { Package } from '../pages/packages/types'

export const usePackagesStore = defineStore('packages', {
  state: () => ({
    items: [] as Package[],
    pagination: {
      page: 1,
      perPage: 10,
      total: 0,
    },
  }),

  actions: {
    async fetch(options: { filters: any; sorting: any; pagination: any }) {
      try {
        const { data } = await api.getPackages({
          page: options.pagination.page,
          perPage: options.pagination.perPage,
          sortBy: options.sorting.sortBy,
          sortOrder: options.sorting.sortOrder,
          search: options.filters.search,
          status: options.filters.status,
          // Mapear filtros personalizados a parámetros de API
          isChange: options.filters.changeFilter === 'pending_changes' ? true : undefined,
          changeReceived: options.filters.changeFilter === 'pending_changes' ? false : undefined,
        })

        this.items = data.packages
        this.pagination.total = data.total
        this.pagination.page = options.pagination.page
        this.pagination.perPage = options.pagination.perPage
      } catch (error) {
        console.error('Error fetching packages:', error)
        throw error
      }
    },

    async add(packageData: Omit<Package, 'package_id'>) {
      return await api.createPackage(packageData)
    },

    async update(packageData: Package) {
      const { package_id, ...dataToUpdate } = packageData
      return await api.updatePackage(package_id, dataToUpdate)
    },

    async remove(pkg: Package) {
      return await api.deletePackage(pkg.package_id)
    },
  },
})
