import type { AxiosError } from 'axios'

export const SESSION_EXPIRED_MESSAGE = 'Tu sesión ha expirado. Vuelve a iniciar sesión para continuar.'

type SessionError = AxiosError<{ error?: string }>

export const isSessionExpiredError = (error: unknown): boolean => {
  const response = (error as SessionError | null)?.response
  return response?.status === 401 || (response?.status === 403 && response.data?.error === 'Token inválido')
}

export const createSessionExpiryHandler = ({
  storage,
  redirect,
  loginPath,
}: {
  storage: Pick<Storage, 'getItem' | 'removeItem'>
  redirect: (path: string) => void
  loginPath: string
}) => {
  let redirecting = false

  return (error: SessionError) => {
    if (!isSessionExpiredError(error) || /\/auth\/login(?:[?#]|$)/.test(error.config?.url || '')) return

    const token = storage.getItem('token')
    // Una respuesta tardía de una sesión anterior no debe cerrar una sesión nueva.
    if (!token || error.config?.headers?.Authorization !== `Bearer ${token}` || redirecting) return

    redirecting = true
    storage.removeItem('token')
    storage.removeItem('user')
    // Recargar también elimina el usuario anterior de los stores en memoria.
    redirect(`${loginPath}?reason=session-expired`)
  }
}
