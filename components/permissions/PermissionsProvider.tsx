"use client"

import { createContext, useContext, useMemo } from "react"
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

function snapshotToState(initial: ServerPermissions): PermissionsState {
  if (!initial) {
    return {
      userId: "",
      email: null,
      isAdmin: false,
      canEdit: false,
      allowedCountries: [],
      allowedPages: null,
      loading: false,
      permissionsReady: true,
      error: null,
    }
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

export function PermissionsProvider({
  initial,
  children,
}: {
  initial: ServerPermissions
  children: React.ReactNode
}) {
  const value = useMemo(() => snapshotToState(initial), [initial])
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissionsContext(): PermissionsState | null {
  return useContext(PermissionsContext)
}
