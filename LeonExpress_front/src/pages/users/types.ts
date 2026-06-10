// src/pages/users/types.ts

export interface Vehicle {
  vehicle_id: string
  license_plate: string
  vehicle_type_name?: string
}

export interface User {
  id?: string // Corresponde a user_id (opcional para compatibilidad)
  user_id?: string // Campo directo del backend
  username: string
  fullname?: string // Para compatibilidad con código existente
  full_name?: string // Campo directo del backend
  email: string
  phone: string
  active?: boolean // Corresponde a is_active (opcional para compatibilidad)
  is_active?: boolean // Campo directo del backend
  role_id?: string
  role_name?: string
  role?: string // Campo directo del backend /auth/me
  warehouse_id?: string
  warehouse_name?: string
  vehicles?: Vehicle[] // Es un array de objetos Vehicle
}
