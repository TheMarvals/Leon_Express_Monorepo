import { ref, watch, unref, computed } from 'vue'
import type { Ref } from 'vue'
import { debounce } from 'lodash'
import { User } from '../types'
import { useUsersStore } from '../../../stores/users'

type Pagination = { page: number; perPage: number; total: number }
type Sorting = { sortBy: string; sortOrder: 'asc' | 'desc' | 'no-sort' }
type Filters = { search: string; isActive?: boolean }

const makePaginationRef = () => ref<Pagination>({ page: 1, perPage: 10, total: 0 })
const makeSortingRef = () => ref<Sorting>({ sortBy: 'fullname', sortOrder: 'asc' })
const makeFiltersRef = () => ref<Partial<Filters>>({ search: '' })

export const useUsers = (options?: {
  pagination?: Ref<Pagination>
  sorting?: Ref<Sorting>
  filters?: Ref<Partial<Filters>>
}) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const usersStore = useUsersStore()

  const { filters = makeFiltersRef(), sorting = makeSortingRef(), pagination = makePaginationRef() } = options || {}

  const fetch = async () => {
    isLoading.value = true
    error.value = null
    try {
      await usersStore.getAll({
        filters: unref(filters),
        sorting: unref(sorting),
        pagination: unref(pagination),
      })
      pagination.value.total = usersStore.pagination.total
    } catch (e: any) {
      error.value = 'No se pudieron cargar los usuarios.'
    } finally {
      isLoading.value = false
    }
  }

  const debouncedFetch = debounce(fetch, 300)

  watch(
    [filters, sorting, pagination],
    ([newF, newS], [oldF, oldS]) => {
      if (JSON.stringify(newF) !== JSON.stringify(oldF) || JSON.stringify(newS) !== JSON.stringify(oldS)) {
        pagination.value.page = 1
      }
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
    users: computed(() => usersStore.items),

    async add(user: Omit<User, 'id'>) {
      await usersStore.add(user)
      await fetch()
    },
    async update(user: User) {
      await usersStore.update(user)
      await fetch()
    },
    async remove(user: User) {
      await usersStore.remove(user)
      await fetch()
    },

    async reactivate(user: User) {
      isLoading.value = true
      try {
        await usersStore.reactivate(user)
        await fetch() // Recarga la tabla para mostrar el nuevo estado
      } catch (e: any) {
        error.value = 'Error al reactivar el usuario.'
        throw e
      } finally {
        isLoading.value = false
      }
    },
  }
}
