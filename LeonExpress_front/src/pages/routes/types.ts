// src/pages/routes/types.ts

// Asegúrate de que las rutas a estos tipos sean correctas
import { User } from '../users/types'
import { Vehicle } from '../vehicles/types'
import { Warehouse } from '../warehouses/types'
import { Package } from '../packages/types'

export interface Route {
  route_id: string
  route_name?: string | null
  user_id: string
  vehicle_id: string
  warehouse_id: string
  start_date: string
  end_date?: string | null
  status: 'PENDIENTE' | 'EN_PROGRESO' | 'FINALIZADA' | 'CANCELADA'
  route_type: 'ENTREGA' | 'DEVOLUCION'
  loading_status?: 'NOT_STARTED' | 'LOADING' | 'LOADING_COMPLETED' | 'APPROVED'

  // Datos relacionales que vienen del backend
  user?: User
  vehicle?: Vehicle
  warehouse?: Warehouse
  routePackages?: {
    package: Package
    released_at?: string | null
    release_reason?: string | null
    status_at_release?: string | null
    transferred_to_route_id?: string | null
  }[]
  pending_returns_count?: number
}
