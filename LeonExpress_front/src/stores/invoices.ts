import { defineStore } from 'pinia'
import api from '../services/api' // Tu servicio de API centralizado
import type { Invoice } from '../pages/invoices/types' // Importamos la interfaz de Factura

// Interfaz para definir la forma del estado de este store
interface InvoicesState {
  items: Invoice[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

export const useInvoicesStore = defineStore('invoices', {
  // El estado inicial, similar al de payouts
  state: (): InvoicesState => ({
    items: [],
    pagination: {
      page: 1,
      pageSize: 10,
      total: 0,
    },
  }),

  // Las acciones para interactuar con la API y mutar el estado
  actions: {
    /**
     * Obtiene una lista paginada y filtrada de facturas desde la API.
     * @param params - Objeto con filtros y paginación (ej: { page: 1, pageSize: 10, search: 'cliente' })
     */
    async fetch(params: any) {
      try {
        // NOTA: Deberás crear un método 'getClientInvoices' en tu servicio 'api.ts'
        const { data } = await api.getClientInvoices(params)
        this.items = data.invoices // La respuesta de la API debe contener un array 'invoices'
        this.pagination.total = data.total
      } catch (error) {
        console.error('Error fetching invoices:', error)
        // Propagamos el error para que el componente pueda mostrar una notificación
        throw new Error('No se pudieron cargar las facturas de clientes.')
      }
    },

    /**
     * Actualiza el estado de una factura específica.
     * @param invoiceId - El ID de la factura a actualizar
     * @param newStatus - El nuevo estado (ej: 'PAGADA', 'CANCELADA')
     */
    async updateStatus(invoiceId: string, newStatus: string) {
      try {
        // NOTA: Deberás crear un método 'updateInvoiceStatus' en tu servicio 'api.ts'
        await api.updateInvoiceStatus(invoiceId, newStatus)

        // Actualiza el item localmente para que la UI reaccione al instante
        const index = this.items.findIndex((i) => i.invoice_id === invoiceId)
        if (index !== -1) {
          // TypeScript necesita que nos aseguremos de que el estado es válido para el tipo
          const validStatus = newStatus as 'PENDIENTE' | 'PAGADA' | 'VENCIDA' | 'CANCELADA'
          this.items[index].status = validStatus
        }
      } catch (error) {
        console.error('Error updating invoice status:', error)
        throw new Error('Error al actualizar el estado de la factura.')
      }
    },
  },
})
