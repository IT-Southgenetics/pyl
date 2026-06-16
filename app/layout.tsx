import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/layout/Header"
import { ProductCreateDialogProvider } from "@/components/products/ProductCreateDialogProvider"
import { PermissionsProvider } from "@/components/permissions/PermissionsProvider"
import { getCurrentUserPermissions } from "@/lib/auth-permissions"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "SouthGenetics - Profit & Loss",
  description: "Sistema de gestión de Profit & Loss para SouthGenetics",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const permissions = await getCurrentUserPermissions()

  return (
    <html lang="es">
      <body className={inter.className}>
        <PermissionsProvider initial={permissions}>
          <Header />
          <ProductCreateDialogProvider>{children}</ProductCreateDialogProvider>
        </PermissionsProvider>
      </body>
    </html>
  )
}

