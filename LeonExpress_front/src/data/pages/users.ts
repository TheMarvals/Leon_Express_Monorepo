import { User } from '../../pages/users/types'
import api from '../../services/api'

interface User {
  id: string
  fullname?: string
  active: boolean
  username?: string
  email?: string
  phone?: string
  role_name?: string
}

interface Filters {
  isActive?: boolean
  search?: string
}

interface Pagination {
  page?: number
  perPage?: number
}

interface Sorting {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export const getUsers = async (filters: Partial<Filters & Pagination & Sorting>) => {
  const { isActive, search, page = 1, perPage = 10, sortBy = 'full_name', sortOrder = 'ASC' } = filters

  try {
    const response = await api.allUsers({
      page,
      perPage,
      search,
      isActive: isActive !== undefined ? isActive : undefined,
      sortBy,
      sortOrder,
    })

    if (!response.headers['content-type']?.includes('application/json')) {
      throw new Error('Expected JSON response, but received HTML or other content')
    }

    if (response.data.error) {
      throw new Error(response.data.message || 'API error')
    }

    const rawUsers = response.data.users || []
    if (!Array.isArray(rawUsers)) {
      throw new Error('API response.users is not an array')
    }

    const filteredUsers: User[] = rawUsers.map((user: any) => ({
      id: user.user_id,
      fullname: user.full_name,
      active: user.is_active,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role_name: user.role_name,
      almacen: user.warehouse_name,
      vehicle: user.vehicle_type_name,
    }))

    console.log(filteredUsers)

    return {
      data: filteredUsers,
      pagination: {
        page,
        perPage,
        total: response.data.total || filteredUsers.length,
      },
    }
  } catch (error) {
    console.error('Error fetching users:', error)
    throw error
  }
}

export const addUser = async (user: User) => {
  const headers = new Headers()
  headers.append('Content-Type', 'application/json')

  const result = await fetch(api.allUsers(), { method: 'POST', body: JSON.stringify(user), headers }).then((r) =>
    r.json(),
  )

  if (!result.error) {
    return result
  }

  throw new Error(result.error)
}

export const updateUser = async (user: User) => {
  const headers = new Headers()
  headers.append('Content-Type', 'application/json')

  const result = await fetch(api.user(user.id), { method: 'PUT', body: JSON.stringify(user), headers }).then((r) =>
    r.json(),
  )

  if (!result.error) {
    return result
  }

  throw new Error(result.error)
}

export const removeUser = async (user: User) => {
  try {
    await api.user(user.id)
    return true
  } catch (error: any) {
    console.error('Error deleting user:', error)
    throw error
  }
}

export const uploadAvatar = async (body: FormData) => {
  return fetch(api.avatars(), { method: 'POST', body, redirect: 'follow' }).then((r) => r.json())
}
