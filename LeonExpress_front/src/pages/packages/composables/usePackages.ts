// src/pages/packages/composables/usePackages.ts

import { ref, watch, unref, computed } from 'vue'
import type { Ref } from 'vue'
import { debounce } from 'lodash'
import { Package } from '../types'
import { usePackagesStore } from '../../../stores/packages'

type Pagination = { page: number; perPage: number; total: number }
type Sorting = { sortBy: string; sortOrder: 'asc' | 'desc' | 'no-sort' }
type Filters = { search: string; status: string | undefined; changeFilter: string | undefined }

const makePaginationRef = () => ref<Pagination>({ page: 1, perPage: 50, total: 0 })
const makeSortingRef = () => ref<Sorting>({ sortBy: 'created_at', sortOrder: 'desc' })
const makeFiltersRef = () => ref<Partial<Filters>>({ search: '', status: undefined, changeFilter: undefined })

export const usePackages = (options?: {
  pagination?: Ref<Pagination>
  sorting?: Ref<Sorting>
  filters?: Ref<Partial<Filters>>
}) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const packagesStore = usePackagesStore()
  const { filters = makeFiltersRef(), sorting = makeSortingRef(), pagination = makePaginationRef() } = options || {}

  const fetch = async () => {
    isLoading.value = true
    error.value = null
    try {
      await packagesStore.fetch({
        filters: unref(filters),
        sorting: unref(sorting),
        pagination: unref(pagination),
      })
      pagination.value.total = packagesStore.pagination.total
    } catch (e) {
      error.value = 'No se pudieron cargar los paquetes.'
    } finally {
      isLoading.value = false
    }
  }

  const debouncedFetch = debounce(fetch, 300)
  watch([filters, sorting, pagination], debouncedFetch, { deep: true })
  fetch()

  return {
    isLoading,
    error,
    filters,
    sorting,
    pagination,
    packages: computed(() => packagesStore.items),

    fetch, // Exponer fetch para recarga manual

    async add(pkg: Omit<Package, 'package_id'>) {
      await packagesStore.add(pkg)
      await fetch()
    },
    async update(pkg: Package) {
      await packagesStore.update(pkg)
      await fetch()
    },
    async remove(pkg: Package) {
      await packagesStore.remove(pkg)
      await fetch()
    },
  }
}
