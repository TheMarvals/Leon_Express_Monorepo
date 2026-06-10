// src/pages/routes/composables/useRoutes.ts
import { ref, watch, unref, computed } from 'vue'
import type { Ref } from 'vue'
import { debounce } from 'lodash'
import { Route } from '../types'
import { useRoutesStore } from '../../../stores/routes'

type Pagination = { page: number; perPage: number; total: number }
type Sorting = { sortBy: string; sortOrder: 'asc' | 'desc' | 'no-sort' }
type Filters = { search: string }

const makePaginationRef = () => ref<Pagination>({ page: 1, perPage: 10, total: 0 })
const makeSortingRef = () => ref<Sorting>({ sortBy: 'start_date', sortOrder: 'desc' })
const makeFiltersRef = () => ref<Partial<Filters>>({ search: '' })

export const useRoutes = (options?: {
  pagination?: Ref<Pagination>
  sorting?: Ref<Sorting>
  filters?: Ref<Partial<Filters>>
}) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const routesStore = useRoutesStore()
  const { filters = makeFiltersRef(), sorting = makeSortingRef(), pagination = makePaginationRef() } = options || {}

  const fetch = async () => {
    isLoading.value = true
    error.value = null
    try {
      await routesStore.fetch()
      pagination.value.total = routesStore.pagination.total
    } catch (e) {
      error.value = 'No se pudieron cargar las rutas.'
    } finally {
      isLoading.value = false
    }
  }

  fetch()

  const filteredRoutes = computed(() => {
    const search = unref(filters).search?.toLowerCase()
    if (!search) {
      return routesStore.items
    }
    return routesStore.items.filter(
      (route) =>
        route.user?.full_name?.toLowerCase().includes(search) ||
        route.vehicle?.license_plate?.toLowerCase().includes(search) ||
        route.warehouse?.warehouse_name?.toLowerCase().includes(search),
    )
  })

  return {
    isLoading,
    error,
    filters,
    sorting,
    pagination,
    routes: filteredRoutes,

    async add(route: Omit<Route, 'route_id'>) {
      await routesStore.add(route)
      await fetch()
    },
    async update(route: Route) {
      await routesStore.update(route)
      await fetch()
    },
    async remove(route: Route) {
      await routesStore.remove(route)
      await fetch()
    },
  }
}
