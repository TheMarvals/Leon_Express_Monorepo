import { ref, watch, unref, computed } from 'vue'
import { debounce } from 'lodash'
import { useDeliveriesStore } from '../../../stores/deliveries'

export const useDeliveries = () => {
  const isLoading = ref(false)
  const deliveriesStore = useDeliveriesStore()

  const filters = ref({ search: '' })
  const sorting = ref({ sortBy: 'attempted_at', sortingOrder: 'desc' })
  const pagination = ref({ page: 1, perPage: 10, total: 0 })

  const fetch = async () => {
    isLoading.value = true
    try {
      await deliveriesStore.fetch({
        ...unref(filters),
        ...unref(sorting),
        page: unref(pagination).page,
        perPage: unref(pagination).perPage,
      })
      pagination.value.total = deliveriesStore.pagination.total
    } catch (e) {
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }

  const debouncedFetch = debounce(fetch, 300)
  watch([filters, sorting, pagination], debouncedFetch, { deep: true })

  fetch() // Carga inicial

  return {
    isLoading,
    filters,
    sorting,
    pagination,
    deliveries: computed(() => deliveriesStore.items),
  }
}
