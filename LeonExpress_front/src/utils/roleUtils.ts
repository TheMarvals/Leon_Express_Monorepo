const ROLE_NORMALIZATION_MAP: Record<string, string> = {
  ADMIN: 'ADMIN',
  ADMINISTRADOR: 'ADMIN',
  'ADMINISTRADOR GENERAL': 'ADMIN',
  'ADMINISTRADOR/A': 'ADMIN',
  ADMINISTRADORA: 'ADMIN',
  SUBADMIN: 'ADMIN',
  'SUB-ADMIN': 'ADMIN',
  'SUB ADMIN': 'ADMIN',
  'OPERATIONS MANAGER': 'ADMIN',
  GERENTE: 'ADMIN',
  'GERENTE GENERAL': 'ADMIN',
  COORDINADOR: 'ADMIN',

  DRIVER: 'DRIVER',
  DRIVERS: 'DRIVER',
  CONDUCTOR: 'DRIVER',
  CONDUCTORA: 'DRIVER',
  REPARTIDOR: 'DRIVER',
  REPARTIDORA: 'DRIVER',
  MENSAJERO: 'DRIVER',
  MENSAJERA: 'DRIVER',
  'FIELD AGENT': 'DRIVER',

  WAREHOUSE_STAFF: 'WAREHOUSE_STAFF',
  ALMACENISTA: 'WAREHOUSE_STAFF',
  ALMACENISTAS: 'WAREHOUSE_STAFF',
  ALMACÉN: 'WAREHOUSE_STAFF',
  BODEGA: 'WAREHOUSE_STAFF',
  'BODEGA CENTRAL': 'WAREHOUSE_STAFF',
  ENCARGADO: 'WAREHOUSE_STAFF',
  ENCARGADA: 'WAREHOUSE_STAFF',
  WAREHOUSE: 'WAREHOUSE_STAFF',
  'WAREHOUSE STAFF': 'WAREHOUSE_STAFF',
  'WAREHOUSE-MAN': 'WAREHOUSE_STAFF',

  FINANCE: 'FINANCE',
  FINANZAS: 'FINANCE',
  CONTADOR: 'FINANCE',
  CONTADORA: 'FINANCE',
  ACCOUNTING: 'FINANCE',
  ACCOUNTANT: 'FINANCE',
  TESORERIA: 'FINANCE',
  TESORERÍA: 'FINANCE',
}

const ROLE_DISPLAY_NAME_MAP: Record<string, string> = {
  ADMIN: 'Administrador',
  DRIVER: 'Conductor',
  WAREHOUSE_STAFF: 'Personal de almacén',
  FINANCE: 'Finanzas',
}

export const normalizeRoleName = (role?: string | null): string => {
  if (!role) return ''

  const trimmed = role.trim()
  if (!trimmed) return ''

  const normalizedKey = trimmed.toUpperCase()
  return ROLE_NORMALIZATION_MAP[normalizedKey] ?? normalizedKey
}

export const getRoleDisplayName = (role?: string | null): string => {
  const normalized = normalizeRoleName(role)
  if (!normalized) {
    return role?.trim() ?? ''
  }

  return ROLE_DISPLAY_NAME_MAP[normalized] ?? normalized
}

export const getRoleMeta = (role?: string | null) => {
  const normalized = normalizeRoleName(role)

  return {
    normalized,
    displayName: normalized ? getRoleDisplayName(normalized) : role?.trim() ?? '',
  }
}
