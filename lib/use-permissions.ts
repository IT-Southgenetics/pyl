"use client"

import { usePermissionsContext } from "@/components/permissions/PermissionsProvider"

export interface PermissionsState {
  userId: string
  email: string | null
  isAdmin: boolean
  canEdit: boolean
  allowedCountries: string[]
  /** null = todas las hojas (solo cuando está confirmado) */
  allowedPages: string[] | null
  loading: boolean
  /** false hasta confirmar permisos — evita flash de todas las hojas */
  permissionsReady: boolean
  error: string | null
}

export function usePermissions(): PermissionsState {
  return usePermissionsContext()
}
