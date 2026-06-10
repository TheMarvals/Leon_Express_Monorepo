// src/pages/pickups/composables/usePickups.ts

import { ref, watch, unref, computed } from 'vue'
import type { Ref } from 'vue'
import { debounce } from 'lodash'
import { Pickup } from '../types'
import { usePickupsStore } from '../../../stores/pickups'
import { useUserStore } from '../../../stores/user-store' // 1. Importa el userStore

type Pagination = { page: number; perPage: number; total: number }
type Sorting = { sortBy: string; sortOrder: 'asc' | 'desc' | 'no-sort' }
type Filters = { search: string; status: string | undefined; userId?: string } // Se añade userId a los filtros

const makePaginationRef = () => ref<Pagination>({ page: 1, perPage: 50, total: 0 })
const makeSortingRef = () => ref<Sorting>({ sortBy: 'pickup_scheduled_date', sortOrder: 'desc' })
const makeFiltersRef = () => ref<Partial<Filters>>({ search: '', status: undefined })

export const usePickups = (options?: {
  pagination?: Ref<Pagination>
  sorting?: Ref<Sorting>
  filters?: Ref<Partial<Filters>>
}) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const pickupsStore = usePickupsStore()
  const userStore = useUserStore() // 2. Obtén una instancia del userStore
  const { filters = makeFiltersRef(), sorting = makeSortingRef(), pagination = makePaginationRef() } = options || {}

  const fetch = async () => {
    isLoading.value = true
    error.value = null
    try {
      // --- 3. LÓGICA DE FILTRADO POR ROL ---
      const fetchFilters = { ...unref(filters) }

      // Si el usuario NO es admin, añade un filtro para ver solo sus propias recolecciones
      if (!userStore.isAdmin) {
        fetchFilters.userId = userStore.user?.user_id
      }
      // Si es admin, no se añade el filtro y verá todo.

      await pickupsStore.fetch({
        filters: fetchFilters, // Usa los filtros modificados
        sorting: unref(sorting),
        pagination: unref(pagination),
      })
      pagination.value.total = pickupsStore.pagination.total
    } catch (e) {
      error.value = 'No se pudieron cargar las recolecciones.'
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
    pickups: computed(() => pickupsStore.items),

    async add(pickup: Omit<Pickup, 'pickup_id' | 'status'>) {
      await pickupsStore.add(pickup)
      await fetch()
    },

    async update(pickup: Pickup) {
      isLoading.value = true
      try {
        await pickupsStore.update(pickup) // Asume que tienes esta acción en el store
        await fetch()
      } catch (e: any) {
        error.value = 'Error al actualizar la recolección.'
        throw e
      } finally {
        isLoading.value = false
      }
    },

    async remove(pickup: Pickup) {
      isLoading.value = true
      try {
        await pickupsStore.delete(pickup)
        await fetch()
      } catch (e: any) {
        error.value = 'Error al eliminar la recolección.'
        throw e
      } finally {
        isLoading.value = false
      }
    },

    async updateStatus(pickup: Pickup, newStatus: string) {
      await pickupsStore.updateStatus(pickup, newStatus)
      await fetch()
    },
  }
}
