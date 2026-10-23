import axios from 'axios'
import { axiosInstance } from './api'

export type ProspectStatus = 'NEW' | 'CONTACTED' | 'CLOSED'
export interface Prospect {
  prospect_id: string
  company: string
  contact_name: string
  email: string
  phone: string
  commune: string
  volume: string
  message: string
  status: ProspectStatus
  email_status: 'PENDING' | 'SENT' | 'FAILED' | 'NOT_CONFIGURED'
  created_at: string
}
export interface ProspectSettings {
  recipient_user_id: string
  admins: { user_id: string; full_name: string; email: string }[]
  pending: number
}
// Público: no adjunta JWT ni altera una sesión existente al enviar el formulario.
const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL?.trim() || '/api', timeout: 30000 })
export const submitProspect = (data: Record<string, unknown>) => publicApi.post('/prospects', data)
export const getProspectSettings = () => axiosInstance.get<ProspectSettings>('/prospects/settings')
export const saveProspectRecipient = (recipient_user_id: string) =>
  axiosInstance.put('/prospects/settings', { recipient_user_id })
export const getProspects = (params: { status?: string; search?: string; page: number }) =>
  axiosInstance.get<{ items: Prospect[]; total: number; page_size: number }>('/prospects', { params })
export const updateProspect = (id: string, status: ProspectStatus) =>
  axiosInstance.patch<Prospect>(`/prospects/${id}`, { status })
