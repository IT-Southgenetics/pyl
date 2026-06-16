"use client"

import { useEffect, useState } from "react"
import { usePermissionsContext } from "@/components/permissions/PermissionsProvider"

export interface PermissionsState {
  userId: string
  email: string | null
  isAdmin: boolean
  canEdit: boolean
  allowedCountries: string[]
  /** null = todas las hojas (solo cuando está confirmado en servidor) */
  allowedPages: string[] | null
  loading: boolean
  /** false hasta tener permisos del servidor (evita mostrar todas las hojas) */
  permissionsReady: boolean
  error: string | null
}

export function usePermissions(): PermissionsState {
  const fromServer = usePermissionsContext()
  const [clientState, setClientState] = useState<PermissionsState>({
    userId: "",
    email: null,
    isAdmin: false,
    canEdit: false,
    allowedCountries: [],
    allowedPages: null,
    loading: true,
    permissionsReady: false,
    error: null,
  })

  useEffect(() => {
    if (fromServer) return
    let cancelled = false
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          setClientState({
            userId: "",
            email: null,
            isAdmin: false,
            canEdit: false,
            allowedCountries: [],
            allowedPages: null,
            loading: false,
            permissionsReady: true,
            error: res.status === 401 ? null : "Error al cargar permisos",
          })
          return
        }
        return res.json()
      })
      .then((data) => {
        if (cancelled || !data) return
        setClientState({
          userId: data.userId ?? "",
          email: data.email ?? null,
          isAdmin: data.isAdmin ?? false,
          canEdit: data.canEdit ?? false,
          allowedCountries: Array.isArray(data.allowedCountries) ? data.allowedCountries : [],
          allowedPages: Array.isArray(data.allowedPages) ? data.allowedPages : null,
          loading: false,
          permissionsReady: true,
          error: null,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setClientState((s) => ({
            ...s,
            loading: false,
            permissionsReady: true,
            error: "Error al cargar permisos",
          }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [fromServer])

  if (fromServer) return fromServer
  return clientState
}
