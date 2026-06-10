import { ref, watch, unref, computed } from 'vue'
import type { Ref } from 'vue'
import { debounce } from 'lodash'
import { Warehouse } from '../types'
import { useWarehousesStore } from '../../../stores/warehouses'

type Pagination = { page: number; perPage: number; total: number }
type Sorting = { sortBy: string; sortOrder: 'asc' | 'desc' | 'no-sort' }
type Filters = { search: string }

const makePaginationRef = () => ref<Pagination>({ page: 1, perPage: 10, total: 0 })
const makeSortingRef = () => ref<Sorting>({ sortBy: 'created_at', sortOrder: 'desc' })
const makeFiltersRef = () => ref<Partial<Filters>>({ search: '' })

export const useWarehouses = (options?: {
  pagination?: Ref<Pagination>
  sorting?: Ref<Sorting>
  filters?: Ref<Partial<Filters>>
}) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const warehousesStore = useWarehousesStore()
  const { filters = makeFiltersRef(), sorting = makeSortingRef(), pagination = makePaginationRef() } = options || {}

  const fetch = async () => {
    isLoading.value = true
    error.value = null
    try {
      // Llamada a la API sin parámetros
      await warehousesStore.fetch()
      // La paginación total se basa en el total de items recibidos
      pagination.value.total = warehousesStore.pagination.total
    } catch (e) {
      error.value = 'No se pudieron cargar los almacenes.'
    } finally {
      isLoading.value = false
    }
  }

  // fetch() solo se llama una vez al inicio
  fetch()

  // El composable ahora filtrará los datos ya cargados en el store
  const filteredWarehouses = computed(() => {
    const search = unref(filters).search?.toLowerCase()
    if (!search) {
      return warehousesStore.items
    }
    return warehousesStore.items.filter(
      (w) => w.warehouse_name.toLowerCase().includes(search) || w.address.toLowerCase().includes(search),
    )
  })

  return {
    isLoading,
    error,
    filters,
    sorting,
    pagination,
    // La tabla usará la data filtrada
    warehouses: filteredWarehouses,

    async add(warehouse: Omit<Warehouse, 'warehouse_id'>) {
      await warehousesStore.add(warehouse)
      await fetch()
    },
    async update(warehouse: Warehouse) {
      await warehousesStore.update(warehouse)
      await fetch()
    },
    async remove(warehouse: Warehouse) {
      await warehousesStore.remove(warehouse)
      await fetch()
    },
  }
}
