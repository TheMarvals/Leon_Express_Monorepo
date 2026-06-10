import api from './api'

export interface OcrQueueItem {
  id: string
  batch_id: string
  filename: string
  image_path: string
  status: string
  created_at: string
  processed_at?: string
  ocr_raw_text?: string
  extracted_data: any
  confidence_scores: any
  overall_confidence: number
  parser_used: string
  fields_extracted: number
  is_duplicate: boolean
  duplicate_of_package_id?: string
  duplicate_reason?: string
  package?: {
    package_id: string
    tracking_code: string
    external_tracking_code?: string
    status: string
    duplicate_handling?: string
    duplicate_notes?: string
  }
  pickup: {
    pickup_id: string
    pickup_scheduled_date: string
    pickup_status: string
    client: {
      client_id: string
      client_name: string
      contact_name?: string
      contact_phone?: string
    }
    driver: {
      user_id: string
      name: string
      username: string
    }
  }
}

export interface DuplicatePackage {
  id: string // ID de la cola OCR (OcrProcessingQueue id)
  package_id?: string // Puede no existir si es pendiente
  tracking_code?: string
  external_tracking_code?: string
  recipient_name?: string
  destination_address?: string
  status: string
  duplicate_handling?: string
  duplicate_notes?: string
  created_at: string
  filename?: string
  extracted_data?: any
  duplicate_package?: {
    package_id: string
    tracking_code: string
    external_tracking_code?: string
    recipient_name: string
    destination_address: string
    status: string
    created_at: string
  }
  pickup?: {
    pickup_id: string
    client: {
      client_name: string
    }
  }
}

// Interfaces para grupos de tiempo
export interface HourlyGroup {
  hour: string
  label: string
  items: OcrQueueItem[]
}

export interface DailyGroup {
  date: string
  label: string
  items: OcrQueueItem[]
}

export interface TimeGroup {
  label: string
  date?: string
  dateRange?: { start: string; end: string }
  items: OcrQueueItem[]
  hourlyGroups?: HourlyGroup[]
  dailyGroups?: DailyGroup[]
}

export interface GroupedPendingResponse {
  groups: {
    today: TimeGroup
    yesterday: TimeGroup
    last7Days: TimeGroup
    older: TimeGroup
  }
  summary: {
    total: number
    today: number
    yesterday: number
    last7Days: number
    older: number
  }
  generated_at: string
}

class OcrReviewService {
  /**
   * Obtener paquetes pendientes de revisión OCR
   */
  async getPendingReview(
    params: {
      page?: number
      pageSize?: number
      type?: 'all' | 'duplicates' | 'low_confidence'
    } = {},
  ) {
    const response = await api.getOcrReviewPending(params)
    return response.data
  }

  /**
   * Obtener estadísticas de la cola de revisión
   */
  async getStats() {
    const response = await api.getOcrReviewStats()
    return response.data
  }

  /**
   * Obtener paquetes agrupados por día y hora
   */
  async getGroupedPending(params?: { include_duplicates?: boolean }): Promise<GroupedPendingResponse> {
    const response = await api.getOcrReviewGrouped(params)
    return response.data
  }

  /**
   * Aprobar y crear/actualizar paquete con datos corregidos
   */
  async approvePackage(queueId: string, correctedData: any, notes?: string) {
    const response = await api.approveOcrPackage(queueId, correctedData, notes)
    return response.data
  }

  /**
   * Rechazar paquete OCR
   */
  async rejectPackage(queueId: string, reason: string) {
    const response = await api.rejectOcrPackage(queueId, reason)
    return response.data
  }

  /**
   * Obtener duplicados pendientes (desde ocr_processing_queue)
   */
  async getPendingDuplicates() {
    const response = await api.getOcrPendingDuplicates()
    return response.data
  }

  /**
   * Resolver un duplicado confirmando qué hacer con él
   */
  async resolveDuplicate(queueId: string, action: 'create' | 'return' | 'discard', notes?: string) {
    const response = await api.resolveOcrDuplicate(queueId, action, notes)
    return response.data
  }

  /**
   * Obtener historial de revisión OCR (aprobados o rechazados)
   */
  async getOcrReviewHistory(params?: { search?: string; limit?: number }) {
    const response = await api.getOcrReviewHistory(params)
    return response.data
  }
}

export default new OcrReviewService()
