"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { usePermissions } from "@/lib/use-permissions"
import { getNavItems, resolveHomePath } from "@/lib/page-access"
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js"
import { LogIn, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const { isAdmin, allowedPages, permissionsReady } = usePermissions()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => setUser(data.user))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname?.startsWith("/reset-password")

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const navItems = permissionsReady ? getNavItems(isAdmin, allowedPages) : []
  const homeHref = resolveHomePath(isAdmin, allowedPages)

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b shadow-sm backdrop-blur-md",
        "bg-gradient-to-r from-blue-900 via-blue-950 to-slate-900 border-white/10"
      )}
    >
      <div className="container mx-auto max-w-7xl flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href={homeHref} className="flex items-center space-x-2 group">
            <div className="h-8 w-1 rounded-full bg-gradient-to-b from-blue-400 to-blue-500"></div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-300 to-blue-400 bg-clip-text text-transparent">
              SouthGenetics P&L
            </span>
          </Link>
          {user && !isAuthRoute && permissionsReady && (
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/")
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative",
                      isActive
                        ? "bg-white/10 text-white shadow-sm border border-white/20"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-white/80 max-w-[180px] truncate" title={user.email ?? undefined}>
                {user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-white/80 hover:text-white hover:bg-white/10"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Cerrar sesión
              </Button>
            </>
          ) : !isAuthRoute ? (
            <Link href="/login">
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <LogIn className="h-4 w-4 mr-1.5" />
                Iniciar sesión
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  )
}

