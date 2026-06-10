// src/pages/vehicles/composables/useVehicles.ts

import { ref, watch, unref, computed } from 'vue'
import type { Ref } from 'vue'
import { debounce } from 'lodash'
import { Vehicle } from '../types'
import { useVehiclesStore } from '../../../stores/vehicles'

type Pagination = { page: number; perPage: number; total: number }
type Sorting = { sortBy: string; sortOrder: 'asc' | 'desc' | 'no-sort' }
type Filters = { search: string }

const makePaginationRef = () => ref<Pagination>({ page: 1, perPage: 10, total: 0 })
const makeSortingRef = () => ref<Sorting>({ sortBy: 'license_plate', sortOrder: 'asc' })
const makeFiltersRef = () => ref<Partial<Filters>>({ search: '' })

export const useVehicles = (options?: {
  pagination?: Ref<Pagination>
  sorting?: Ref<Sorting>
  filters?: Ref<Partial<Filters>>
}) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const vehiclesStore = useVehiclesStore()
  const { filters = makeFiltersRef(), sorting = makeSortingRef(), pagination = makePaginationRef() } = options || {}

  const fetch = async () => {
    isLoading.value = true
    error.value = null
    try {
      await vehiclesStore.fetch({
        filters: unref(filters),
        sorting: unref(sorting),
        pagination: unref(pagination),
      })
      pagination.value.total = vehiclesStore.pagination.total
    } catch (e) {
      error.value = 'No se pudieron cargar los vehículos.'
    } finally {
      isLoading.value = false
    }
  }

  const debouncedFetch = debounce(fetch, 300)

  watch(
    [filters, sorting, pagination],
    () => {
      debouncedFetch()
    },
    { deep: true },
  )

  fetch()

  return {
    isLoading,
    error,
    filters,
    sorting,
    pagination,
    vehicles: computed(() => vehiclesStore.items),

    async add(vehicle: Omit<Vehicle, 'vehicle_id'>) {
      await vehiclesStore.add(vehicle)
      await fetch()
    },
    async update(vehicle: Vehicle) {
      await vehiclesStore.update(vehicle)
      await fetch()
    },
    async remove(vehicle: Vehicle) {
      await vehiclesStore.remove(vehicle)
      await fetch()
    },
  }
}
