import { Ref, ref, unref, watch, computed } from 'vue'
import type { Filters, Pagination, Sorting } from '../../../data/pages/clients'
import { Client } from '../types'
import { useClientsStore } from '../../../stores/clients'
import { debounce } from 'lodash'

const makePaginationRef = () => ref<Pagination>({ page: 1, perPage: 10, total: 0 })
const makeSortingRef = () => ref<Sorting>({ sortBy: 'client_name', sortOrder: 'ASC' })
const makeFiltersRef = () => ref<Partial<Filters>>({ search: '' })

export const useClients = (options?: {
  pagination?: Ref<Pagination>
  sorting?: Ref<Sorting>
  filters?: Ref<Partial<Filters>>
}) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const clientsStore = useClientsStore()

  const { filters = makeFiltersRef(), sorting = makeSortingRef(), pagination = makePaginationRef() } = options || {}

  const fetch = async () => {
    if (isLoading.value) return
    isLoading.value = true
    try {
      await clientsStore.getAll({
        filters: unref(filters),
        sorting: unref(sorting),
        pagination: unref(pagination),
      })

      // SOLUCIÓN: Comparar antes de actualizar
      const newPagination = clientsStore.pagination
      const oldPagination = pagination.value

      if (
        newPagination.page !== oldPagination.page ||
        newPagination.perPage !== oldPagination.perPage ||
        newPagination.total !== oldPagination.total
      ) {
        pagination.value = { ...newPagination }
      }
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch clients'
    } finally {
      isLoading.value = false
    }
  }

  const debouncedFetch = debounce(fetch, 300)

  let isUpdating = false
  watch(
    [filters, sorting, pagination],
    ([newFilters, newSorting, newPagination], [oldFilters, oldSorting, oldPagination]) => {
      if (isUpdating) return
      isUpdating = true

      try {
        // SOLUCIÓN MEJORADA: Comparación profunda de objetos
        const filtersChanged = JSON.stringify(newFilters) !== JSON.stringify(oldFilters)
        const sortingChanged = JSON.stringify(newSorting) !== JSON.stringify(oldSorting)

        if (filtersChanged || sortingChanged) {
          pagination.value = { ...pagination.value, page: 1 }
        }
        debouncedFetch()
      } finally {
        isUpdating = false
      }
    },
    { deep: true },
  )

  fetch()

  const clients = computed(() => clientsStore.items)

  return {
    error,
    isLoading,
    filters,
    sorting,
    pagination,
    clients,
    fetch: debouncedFetch,
    async add(client: Omit<Client, 'client_id'>) {
      isLoading.value = true
      try {
        await clientsStore.add(client)
      } catch (e: any) {
        error.value = 'Failed to add client'
        throw e
      } finally {
        isLoading.value = false
      }
    },
    async update(client: Client) {
      isLoading.value = true
      try {
        await clientsStore.update(client)
      } catch (e: any) {
        error.value = 'Failed to update client'
        throw e
      } finally {
        isLoading.value = false
      }
    },
    async remove(client: Client) {
      isLoading.value = true
      try {
        await clientsStore.remove(client)
      } catch (e: any) {
        error.value = e.message || 'Failed to remove client'
        throw e
      } finally {
        isLoading.value = false
      }
    },
  }
}
