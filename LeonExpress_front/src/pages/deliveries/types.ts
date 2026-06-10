import { Package } from '../packages/types'
import { User } from '../users/types'

export interface Delivery {
  delivery_id: string
  package_id: string
  user_id: string
  status_at_delivery:
    | 'ENTREGADO'
    | 'NO_HAY_NADIE'
    | 'DIRECCION_INCORRECTA'
    | 'RECHAZADO_POR_CLIENTE'
    | 'REPROGRAMADO_POR_CLIENTE'
    | 'OTRA_INCIDENCIA'
  receiver_name?: string
  observation?: string
  attempted_at: string
  gps_latitude?: number | string | null
  gps_longitude?: number | string | null

  // Datos de relaciones
  package?: Partial<Package>
  user?: Partial<User>
}
