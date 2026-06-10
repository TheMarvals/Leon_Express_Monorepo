// Servicio para manejar las comunas de Chile
interface Provincia {
  nombre: string
  comunas: string[]
}

interface RegionData {
  region: string
  provincias: Provincia[]
}

class ComunasService {
  private comunasList: string[] = []
  private isLoaded = false

  // Cargar las comunas desde el archivo JSON
  async loadComunas(): Promise<string[]> {
    if (this.isLoaded) {
      return this.comunasList
    }

    try {
      const response = await fetch('/data/chile_comunas.json')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: RegionData = await response.json()

      // Extraer todas las comunas de todas las provincias
      this.comunasList = data.provincias.flatMap((provincia) => provincia.comunas)
      this.isLoaded = true

      console.log('Comunas cargadas:', this.comunasList.length, 'comunas')
      return this.comunasList
    } catch (error) {
      console.error('Error cargando comunas:', error)
      // Fallback a lista básica en caso de error
      this.comunasList = [
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
        'Cerrillos',
        'Estación Central',
        'Quinta Normal',
        'Recoleta',
        'Independencia',
        'Conchalí',
        'Huechuraba',
        'Quilicura',
        'Renca',
      ]
      this.isLoaded = true
      return this.comunasList
    }
  }

  // Normalizar texto para comparación
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/[^a-z0-9\s]/g, '') // Solo letras, números y espacios
      .trim()
  }

  // Detectar comuna desde una dirección
  async detectComunaFromAddress(address: string): Promise<string | null> {
    if (!address || typeof address !== 'string') {
      return null
    }

    // Asegurarse de que las comunas estén cargadas
    await this.loadComunas()

    const normalizedAddress = this.normalize(address)
    console.log('Detectando comuna en:', address, '→ normalizada:', normalizedAddress)

    // Buscar coincidencia exacta primero
    for (const comuna of this.comunasList) {
      const normalizedComuna = this.normalize(comuna)

      // Coincidencia exacta
      if (normalizedAddress.includes(normalizedComuna)) {
        console.log('Comuna detectada (exacta):', comuna)
        return comuna
      }
    }

    // Buscar coincidencias parciales para comunas con múltiples palabras
    for (const comuna of this.comunasList) {
      const normalizedComuna = this.normalize(comuna)
      const comunaWords = normalizedComuna.split(' ')

      // Si la comuna tiene múltiples palabras, verificar si todas están presentes
      if (comunaWords.length > 1) {
        const allWordsFound = comunaWords.every((word) => word.length > 2 && normalizedAddress.includes(word))

        if (allWordsFound) {
          console.log('Comuna detectada (múltiples palabras):', comuna)
          return comuna
        }
      }
    }

    // Buscar palabras clave específicas
    const keywordMapping: { [key: string]: string } = {
      maipu: 'Maipú',
      nunoa: 'Ñuñoa',
      penalolen: 'Peñalolén',
      stgo: 'Santiago',
      'santiago centro': 'Santiago',
      centro: 'Santiago',
      vitacura: 'Vitacura',
      'las condes': 'Las Condes',
      providencia: 'Providencia',
      'la reina': 'La Reina',
    }

    for (const [keyword, comuna] of Object.entries(keywordMapping)) {
      if (normalizedAddress.includes(keyword)) {
        console.log('Comuna detectada (keyword):', comuna, 'por keyword:', keyword)
        return comuna
      }
    }

    console.log('No se pudo detectar comuna para:', address)
    return null
  }

  // Obtener lista de comunas disponibles
  async getAvailableComunas(): Promise<string[]> {
    await this.loadComunas()
    return [...this.comunasList].sort()
  }

  // Obtener comunas únicas de una lista de direcciones
  async getComunasFromAddresses(addresses: string[]): Promise<string[]> {
    const comunasSet = new Set<string>()

    for (const address of addresses) {
      const comuna = await this.detectComunaFromAddress(address)
      if (comuna) {
        comunasSet.add(comuna)
      }
    }

    return Array.from(comunasSet).sort()
  }
}

// Exportar instancia singleton
export const comunasService = new ComunasService()
export default comunasService
