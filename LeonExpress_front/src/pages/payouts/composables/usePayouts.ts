import { ref, watch, unref, computed } from 'vue'
import type { Ref } from 'vue'
import { debounce } from 'lodash'
import { usePayoutsStore } from '../../../stores/payouts'

type Pagination = { page: number; perPage: number; total: number }
type Sorting = { sortBy: string; sortOrder: 'asc' | 'desc' | 'no-sort' }
type Filters = { search: string; status?: string }

export const usePayouts = (options?: {
  pagination?: Ref<Pagination>
  sorting?: Ref<Sorting>
  filters?: Ref<Partial<Filters>>
}) => {
  const isLoading = ref(false)
  const payoutsStore = usePayoutsStore()

  const defaultFilters = ref<Partial<Filters>>({ search: '', status: undefined })
  const defaultPagination = ref<Pagination>({ page: 1, perPage: 10, total: 0 })

  const { filters = defaultFilters, pagination = defaultPagination } = options || {}

  const fetch = async () => {
    isLoading.value = true
    try {
      const { status, ...restFilters } = unref(filters)
      const normalizedStatus = status ? String(status) : undefined
      await payoutsStore.fetch({
        ...restFilters,
        status: normalizedStatus,
        page: unref(pagination).page,
        pageSize: unref(pagination).perPage,
      })
      pagination.value.total = payoutsStore.pagination.total
    } catch (e) {
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }

  const debouncedFetch = debounce(fetch, 300)

  watch(
    () => [filters.value.search, filters.value.status],
    () => {
      pagination.value.page = 1
      debouncedFetch()
    },
    { deep: false },
  )

  watch(() => [pagination.value.page, pagination.value.perPage], debouncedFetch, { deep: false })

  // Carga inicial
  fetch()

  return {
    isLoading,
    filters,
    pagination,
    payouts: computed(() => payoutsStore.items),

    async updateStatus(payout: any, newStatus: any) {
      await payoutsStore.updateStatus(payout, newStatus)
    },
  }
}
