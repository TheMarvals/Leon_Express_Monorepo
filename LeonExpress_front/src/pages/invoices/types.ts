// Define la estructura para el módulo de facturación de clientes

export interface Invoice {
  invoice_id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  total_amount: number
  status: 'PENDIENTE' | 'PAGADA' | 'VENCIDA' | 'CANCELADA'
  client_id: string
  client: {
    client_id: string
    client_name: string
    address?: string
    email?: string
    phone?: string
    has_free_pickups?: boolean
  }
  invoiceItems?: InvoiceItem[]
  payments?: Payment[]
}

export interface InvoiceItem {
  item_id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  package?: {
    tracking_code: string
    external_tracking_code?: string
  }
}

export interface Payment {
  payment_id: string
  payment_date: string
  amount: number
  payment_method: string
  transaction_reference?: string
  notes?: string
}
