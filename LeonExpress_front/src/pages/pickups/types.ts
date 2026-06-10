// src/pages/pickups/types.ts

// Primero, define un tipo básico para Package aquí o impórtalo
export interface Package {
  package_id: string
  tracking_code: string
  recipient_name: string
  status: string
  external_tracking_code?: string
  client_id?: string
  pickup_id?: string
  is_cod?: boolean
  cod_amount?: number
  client_price?: number
  delivery_cost?: number
  destination_address?: string
  recipient_phone?: string
  scanned_at_origin_datetime?: string
  has_multiple_labels?: boolean
  sales_codes?: string
  client?: any
  pickup?: any
  packageCosts?: any[]
  is_ocr_pending?: boolean
}

export interface Pickup {
  pickup_id: string
  user_id: string
  client_id: string
  pickup_scheduled_date: string
  status:
    | 'ASIGNADO_A_RECOLECTOR'
    | 'EN_PROCESO_RECOLECCION'
    | 'RECOLECCION_FINALIZADA_DRIVER'
    | 'ENTREGADO_EN_ALMACEN'
    | 'VERIFICADO_EN_ALMACEN'
    | 'CANCELADO'
  notes?: string | null

  user?: { full_name: string }
  client?: { client_name: string }

  // --- AÑADE ESTA LÍNEA ---
  packages?: Package[]
  ocrQueue?: any[]
  activeBatch?: any
}
