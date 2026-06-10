import { ref, watch, unref, computed } from 'vue'
import type { Ref } from 'vue'
import { debounce } from 'lodash'
import { useInvoicesStore } from '../../../stores/invoices' // <-- Deberás crear este store
import { Invoice } from '../types'

// Tipos para la paginación, ordenamiento y filtros
type Pagination = { page: number; perPage: number; total: number }
type Filters = { search: string; status?: string }

export const useInvoices = (options?: { pagination?: Ref<Pagination>; filters?: Ref<Partial<Filters>> }) => {
  const isLoading = ref(false)
  const invoicesStore = useInvoicesStore() // <-- Usando el nuevo store

  // Valores por defecto si no se proveen desde el componente
  const defaultFilters = ref<Partial<Filters>>({ search: '', status: undefined })
  const defaultPagination = ref<Pagination>({ page: 1, perPage: 10, total: 0 })

  const { filters = defaultFilters, pagination = defaultPagination } = options || {}

  const fetch = async () => {
    isLoading.value = true
    try {
      await invoicesStore.fetch({
        ...unref(filters),
        page: unref(pagination).page,
        pageSize: unref(pagination).perPage,
      })
      pagination.value.total = invoicesStore.pagination.total
    } catch (e) {
      console.error('Error fetching invoices:', e)
    } finally {
      isLoading.value = false
    }
  }

  // Lógica de debounce y watch para recargar automáticamente
  const debouncedFetch = debounce(fetch, 300)
  watch([filters, pagination], debouncedFetch, { deep: true })

  // Carga inicial de datos
  fetch()

  return {
    isLoading,
    filters,
    pagination,
    invoices: computed(() => invoicesStore.items),

    async updateStatus(invoice: Invoice, newStatus: string) {
      // Asume que el store tendrá un método para actualizar el estado
      await invoicesStore.updateStatus(invoice.invoice_id, newStatus)
    },
  }
}
