// Define la estructura de los objetos que usaremos
export interface Payout {
  payout_id: string
  payout_date: string
  total_amount: number
  status: 'PENDIENTE' | 'PAGADO' | 'CANCELADO' | 'PARCIALMENTE_PAGADO'
  user: {
    user_id: string
    full_name: string
    email?: string
    phone?: string
  }
  payoutItems?: PayoutItem[]
  payments?: any[]
}

export interface PayoutItem {
  payout_item_id: string
  item_description: string
  amount: number
  package?: {
    package_id: string
    tracking_code: string
    external_tracking_code?: string
    destination_address?: string
    delivered_datetime?: string
    cod_amount?: number
    routePackages?: any[]
  }
  pickup?: {
    pickup_id: string
    pickup_code?: string
    pickup_address?: string
    pickup_scheduled_date?: string
    client?: { client_name: string }
  }
  // Campos enriquecidos para la UI
  address?: string
  tracking_code?: string
  external_tracking_code?: string
  package_id?: string | null
  date?: string
  created_at?: string
}
