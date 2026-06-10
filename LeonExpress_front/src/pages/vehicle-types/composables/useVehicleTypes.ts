import { ref, watch, unref, computed } from 'vue'
import type { Ref } from 'vue'
import { debounce } from 'lodash'
import { VehicleType } from '../types'
import { useVehicleTypesStore } from '../../../stores/vehicle-types'

// Tipos para filtros, paginación y ordenamiento
type Pagination = { page: number; perPage: number; total: number }
type Sorting = { sortBy: string; sortOrder: 'asc' | 'desc' | 'no-sort' }
type Filters = { search: string }

const makePaginationRef = () => ref<Pagination>({ page: 1, perPage: 10, total: 0 })
const makeSortingRef = () => ref<Sorting>({ sortBy: 'type_name', sortOrder: 'asc' })
const makeFiltersRef = () => ref<Partial<Filters>>({ search: '' })

export const useVehicleTypes = (options?: {
  pagination?: Ref<Pagination>
  sorting?: Ref<Sorting>
  filters?: Ref<Partial<Filters>>
}) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const vehicleTypesStore = useVehicleTypesStore()

  const { filters = makeFiltersRef(), sorting = makeSortingRef(), pagination = makePaginationRef() } = options || {}

  const fetch = async () => {
    isLoading.value = true
    try {
      await vehicleTypesStore.fetch({
        filters: unref(filters),
        sorting: unref(sorting),
        pagination: unref(pagination),
      })
      // Sincroniza el total de la paginación desde el store
      pagination.value.total = vehicleTypesStore.pagination.total
    } catch (e: any) {
      error.value = 'No se pudieron cargar los tipos de vehículo.'
    } finally {
      isLoading.value = false
    }
  }

  const debouncedFetch = debounce(fetch, 300)

  // Observador que reacciona a cambios en filtros, ordenamiento y paginación
  watch(
    [filters, sorting, pagination],
    ([newFilters, newSorting], [oldFilters, oldSorting]) => {
      const filtersChanged = JSON.stringify(newFilters) !== JSON.stringify(oldFilters)
      const sortingChanged = JSON.stringify(newSorting) !== JSON.stringify(oldSorting)

      // Si el usuario cambia los filtros o el orden, vuelve a la página 1
      if (filtersChanged || sortingChanged) {
        pagination.value.page = 1
      }

      debouncedFetch()
    },
    { deep: true },
  )

  // Carga inicial de datos
  fetch()

  return {
    isLoading,
    error,
    filters,
    sorting,
    pagination,
    vehicleTypes: computed(() => vehicleTypesStore.items),
    fetch: debouncedFetch,

    async add(vehicleType: Omit<VehicleType, 'type_id'>) {
      isLoading.value = true
      try {
        await vehicleTypesStore.add(vehicleType)
        await fetch() // Vuelve a cargar los datos después de añadir
      } catch (e: any) {
        error.value = 'Error al añadir el tipo de vehículo.'
        throw e
      } finally {
        isLoading.value = false
      }
    },

    async update(vehicleType: VehicleType) {
      isLoading.value = true
      try {
        await vehicleTypesStore.update(vehicleType)
        await fetch() // Vuelve a cargar los datos después de actualizar
      } catch (e: any) {
        error.value = 'Error al actualizar el tipo de vehículo.'
        throw e
      } finally {
        isLoading.value = false
      }
    },

    async remove(vehicleType: VehicleType) {
      isLoading.value = true
      try {
        await vehicleTypesStore.remove(vehicleType)
        await fetch() // Vuelve a cargar los datos después de eliminar
      } catch (e: any) {
        error.value = e.message || 'Error al eliminar el tipo de vehículo.'
        throw e
      } finally {
        isLoading.value = false
      }
    },
  }
}
