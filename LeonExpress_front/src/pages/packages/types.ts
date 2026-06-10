// src/pages/packages/types.ts

export interface PackageCost {
  cost_id: string
  applied_value: number
}

export interface DeliveryPhoto {
  photo_id: string
  photo_url: string
}

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
  receiver_rut?: string
  observation?: string
  attempted_at: string
  gps_latitude?: number | string | null
  gps_longitude?: number | string | null
  deliveryPhotos?: DeliveryPhoto[]
  // Información del conductor que realizó la entrega
  user?: {
    user_id: string
    full_name: string
  }
}

export interface Package {
  package_id: string
  tracking_code: string
  external_tracking_code?: string | null
  client_id: string
  pickup_id: string
  status:
    | 'RECOLECTADO_EN_ORIGEN'
    | 'RECIBIDO_EN_ALMACEN'
    | 'ASIGNADO_A_RUTA'
    | 'EN_RUTA_ENTREGA'
    | 'ENTREGADO'
    | 'INCIDENCIA_ENTREGA'
    | 'REPROGRAMADO'
    | 'DEVUELTO_ALMACEN'
    | 'EN_RUTA_DEVOLUCION'
    | 'DEVUELTO_A_CLIENTE'
    | 'CANCELADO'
  is_cod: boolean
  cod_amount?: number
  is_change?: boolean
  change_received?: boolean
  change_received_at?: string | null
  change_received_by?: string | null
  change_notes?: string | null
  has_multiple_labels?: boolean
  sales_codes?: string | null
  client_price: number
  delivery_cost: number
  destination_address: string
  recipient_name: string
  recipient_phone?: string
  scanned_at_origin_datetime: string
  // Datos de relaciones que vienen del backend
  client?: {
    client_name: string
  }
  changeReceivedByUser?: {
    user_id: string
    full_name: string
  }
  packageCosts?: PackageCost[]
  label_image?: {
    image_path: string
    filename: string
    parser_used: string
    confidence: number
    scanned_at: string
  } | null
  deliveries?: Delivery[]
  pending_return_user_id?: string | null
  pendingReturnDriver?: {
    user_id: string
    full_name: string
  }
}
