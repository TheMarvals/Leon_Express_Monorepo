import { comunasService } from '../services/comunasService'

// Función de compatibilidad que usa el nuevo servicio
export async function detectComunaFromAddress(address: string): Promise<string | null> {
  return await comunasService.detectComunaFromAddress(address)
}

// Función síncrona para compatibilidad con código existente
export function detectComunaFromAddressSync(address: string): string {
  // Esta es una implementación temporal/fallback para código que necesita ser síncrono
  // Idealmente, todo el código debería migrar a la versión async
  if (!address) {
    return ''
  }

  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  // Lista básica para fallback síncrono
  const basicComunas = [
    'Santiago',
    'Las Condes',
    'Providencia',
    'Ñuñoa',
    'La Reina',
    'Vitacura',
    'Lo Barnechea',
    'Macul',
    'Peñalolén',
    'La Florida',
    'Puente Alto',
    'San Miguel',
    'San Joaquín',
    'Maipú',
    'Pudahuel',
  ]

  const normalizedAddress = normalize(address)

  for (const comuna of basicComunas) {
    if (normalizedAddress.includes(normalize(comuna))) {
      return comuna
    }
  }

  return ''
}

// Función para obtener todas las comunas disponibles
export async function getAvailableComunas(): Promise<string[]> {
  return await comunasService.getAvailableComunas()
}

// Función para obtener comunas de una lista de direcciones
export async function getComunasFromAddresses(addresses: string[]): Promise<string[]> {
  return await comunasService.getComunasFromAddresses(addresses)
}

// Exportar también el servicio para uso directo
export { comunasService }

// Exportar lista de comunas para compatibilidad
export const SANTIAGO_COMUNAS = [
  'Alhué',
  'Buin',
  'Calera de Tango',
  'Cerrillos',
  'Cerro Navia',
  'Colina',
  'Conchalí',
  'Curacaví',
  'El Bosque',
  'El Monte',
  'Estación Central',
  'Huechuraba',
  'Independencia',
  'Isla de Maipo',
  'La Cisterna',
  'La Florida',
  'La Granja',
  'Lampa',
  'La Pintana',
  'La Reina',
  'Las Condes',
  'Lo Barnechea',
  'Lo Espejo',
  'Lo Prado',
  'Macul',
  'Maipú',
  'María Pinto',
  'Melipilla',
  'Ñuñoa',
  'Padre Hurtado',
  'Paine',
  'Pedro Aguirre Cerda',
  'Peñaflor',
  'Peñalolén',
  'Pirque',
  'Providencia',
  'Pudahuel',
  'Puente Alto',
  'Quilicura',
  'Quinta Normal',
  'Recoleta',
  'Renca',
  'San Bernardo',
  'San Joaquín',
  'San José de Maipo',
  'San Miguel',
  'San Pedro',
  'San Ramón',
  'Santiago',
  'Talagante',
  'Tiltil',
  'Vitacura',
]
