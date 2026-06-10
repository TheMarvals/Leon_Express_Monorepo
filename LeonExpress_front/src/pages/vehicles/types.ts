// src/pages/vehicles/types.ts

export interface Vehicle {
  vehicle_id: string
  license_plate: string
  user_id: string | null
  type_id: string
  // Propiedades de las relaciones que vienen del backend
  user?: {
    full_name: string
  }
  vehicleType?: {
    type_name: string
  }
}
