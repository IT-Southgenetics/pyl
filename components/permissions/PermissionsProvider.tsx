"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { PermissionsState } from "@/lib/use-permissions"

type ServerPermissions = {
  userId: string
  email: string | null
  isAdmin: boolean
  canEdit: boolean
  allowedCountries: string[]
  allowedPages: string[] | null
} | null

const PermissionsContext = createContext<PermissionsState | null>(null)

const EMPTY: PermissionsState = {
  userId: "",
  email: null,
  isAdmin: false,
  canEdit: false,
  allowedCountries: [],
  allowedPages: null,
  loading: true,
  permissionsReady: false,
  error: null,
}

function fromSnapshot(initial: ServerPermissions): PermissionsState {
  if (!initial?.userId) {
    return { ...EMPTY, loading: true, permissionsReady: false }
  }
  return {
    userId: initial.userId,
    email: initial.email,
    isAdmin: initial.isAdmin,
    canEdit: initial.canEdit,
    allowedCountries: initial.allowedCountries,
    allowedPages: initial.allowedPages,
    loading: false,
    permissionsReady: true,
    error: null,
  }
}

function fromApiData(data: Record<string, unknown>): PermissionsState {
  return {
    userId: String(data.userId ?? ""),
    email: (data.email as string | null) ?? null,
    isAdmin: Boolean(data.isAdmin),
    canEdit: Boolean(data.canEdit),
    allowedCountries: Array.isArray(data.allowedCountries) ? data.allowedCountries : [],
    allowedPages: Array.isArray(data.allowedPages) ? data.allowedPages : null,
    loading: false,
    permissionsReady: true,
    error: null,
  }
}

export function PermissionsProvider({
  initial,
  children,
}: {
  initial: ServerPermissions
  children: React.ReactNode
}) {
  const [state, setState] = useState<PermissionsState>(() => fromSnapshot(initial))

  useEffect(() => {
    if (initial?.userId) {
      setState(fromSnapshot(initial))
      return
    }

    let cancelled = false
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          setState({
            ...EMPTY,
            loading: false,
            permissionsReady: true,
            error: res.status === 401 ? null : "Error al cargar permisos",
          })
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (cancelled || !data) return
        setState(fromApiData(data))
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            ...EMPTY,
            loading: false,
            permissionsReady: true,
            error: "Error al cargar permisos",
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [initial?.userId])

  const value = useMemo(() => state, [state])

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissionsContext(): PermissionsState {
  const ctx = useContext(PermissionsContext)
  if (!ctx) {
    return { ...EMPTY, loading: false, permissionsReady: false, error: "Sin PermissionsProvider" }
  }
  return ctx
}
