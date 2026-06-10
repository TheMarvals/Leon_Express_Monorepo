// src/pages/clients/types.ts

export interface ClientPricing {
  pricing_id: string
  client_id: string
  base_price: number
  valid_from: string
  valid_to?: string | null
}

export interface Client {
  client_id: string
  client_name: string
  email: string
  phone: string
  address: string
  is_active: boolean
  has_free_pickups?: boolean
  clientPricings?: ClientPricing[] // Relación con precios
}
