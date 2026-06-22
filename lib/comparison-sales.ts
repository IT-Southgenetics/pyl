import type { SupabaseClient } from "@supabase/supabase-js"
import {
  GENERAL_LLC_COMPANY,
  normalizeComparisonCompany,
} from "@/lib/comparison-companies"

export { GENERAL_LLC_COMPANY }

export type VentaComparisonRow = {
  fecha: string
  test: string
  quantity: number
  amount: number
  company: string
  pais: string | null
  id_producto: string | null
}

export type ProductCatalogRow = {
  id: string
  name: string
  alias: string
}

export type SalesGroup = {
  company: string
  productId: string | null
  productName: string
  cantidad: number
  monto: number
}

/** Normaliza nombre de producto para comparación exacta (sin match parcial). */
export function normalizeProductKey(productName: string): string {
  if (!productName) return ""
  return productName
    .trim()
    .toUpperCase()
    .replace(/\[.*?\]/g, "")
    .replace(/[^\w]/g, "")
    .replace(/\s+/g, "")
}

/** Compañía de agrupación: LLC es una sola entidad (no se usa `pais`). */
export function resolveVentaCompany(company: string | null | undefined): string {
  return normalizeComparisonCompany((company ?? "").trim())
}

export function salesGroupKey(
  company: string,
  productId: string | null | undefined,
  productName: string
): string {
  const normalizedCompany = normalizeComparisonCompany(company)
  if (productId) return `${normalizedCompany}|pid:${productId}`
  return `${normalizedCompany}|name:${normalizeProductKey(productName)}`
}

export type BudgetMatchRow = {
  comparisonCompany: string
  product_id: string | null
  product_name: string
}

/** Claves de grupo de ventas que corresponden a una fila de budget. */
export function budgetLookupKeys(budget: BudgetMatchRow): string[] {
  const { comparisonCompany, product_id, product_name } = budget
  if (product_id) {
    return [salesGroupKey(comparisonCompany, product_id, product_name)]
  }
  return [salesGroupKey(comparisonCompany, null, product_name)]
}

export function aggregateVentasByGroup(
  rows: VentaComparisonRow[],
  year: number,
  filters: {
    companies: string[]
    products: string[]
    months: string[]
    catalog: Map<string, ProductCatalogRow>
  }
): Map<string, SalesGroup> {
  const isMonthFiltered = filters.months.length > 0 && filters.months.length < 12
  const monthSet = new Set(filters.months.map((m) => parseInt(m, 10)))
  const productFilter = filters.products.length > 0 ? new Set(filters.products) : null
  const companyFilter =
    filters.companies.length > 0
      ? new Set(filters.companies.map(normalizeComparisonCompany))
      : null
  const groups = new Map<string, SalesGroup>()

  for (const row of rows) {
    const rowYear = parseInt(String(row.fecha).slice(0, 4), 10)
    if (rowYear !== year) continue

    const month = parseInt(String(row.fecha).slice(5, 7), 10)
    if (isMonthFiltered && !monthSet.has(month)) continue

    const company = resolveVentaCompany(row.company)
    if (companyFilter && !companyFilter.has(company)) continue

    if (productFilter) {
      const names = new Set<string>([row.test])
      if (row.id_producto) {
        const prod = filters.catalog.get(row.id_producto)
        if (prod) {
          names.add(prod.name)
          if (prod.alias) names.add(prod.alias)
        }
      }
      const matches = [...names].some((n) => productFilter.has(n))
      if (!matches) continue
    }

    const key = salesGroupKey(company, row.id_producto, row.test)
    const qty = Number(row.quantity) || 0
    const amount = Number(row.amount) || 0
    const existing = groups.get(key)
    if (existing) {
      existing.cantidad += qty
      existing.monto += amount
    } else {
      groups.set(key, {
        company,
        productId: row.id_producto,
        productName: row.test,
        cantidad: qty,
        monto: amount,
      })
    }
  }

  return groups
}

export function lookupSalesForBudget(
  budget: BudgetMatchRow,
  groups: Map<string, SalesGroup>
): SalesGroup | null {
  for (const key of budgetLookupKeys(budget)) {
    const group = groups.get(key)
    if (group) return group
  }
  return null
}

export function saleGroupMatchesProductFilter(
  group: SalesGroup,
  products: string[],
  catalog: Map<string, ProductCatalogRow>
): boolean {
  if (products.length === 0) return true
  const names = new Set<string>([group.productName])
  if (group.productId) {
    const prod = catalog.get(group.productId)
    if (prod) {
      names.add(prod.name)
      if (prod.alias) names.add(prod.alias)
    }
  }
  return products.some((p) => names.has(p))
}

export async function fetchVentasForComparison(
  client: SupabaseClient,
  years: number[]
): Promise<VentaComparisonRow[]> {
  if (!years.length) return []
  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  const fechaStart = `${minYear}-01-01`
  const fechaEnd = `${maxYear}-12-31`
  const pageSize = 1000
  let offset = 0
  const all: VentaComparisonRow[] = []

  while (true) {
    const { data, error } = await client
      .from("ventas")
      .select("fecha, test, quantity, amount, company, pais, id_producto")
      .gte("fecha", fechaStart)
      .lte("fecha", fechaEnd)
      .order("fecha", { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    const batch = (data || []) as VentaComparisonRow[]
    all.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return all
}

export function buildProductCatalog(
  rows: { id: string; name: string; alias: string | null }[]
): Map<string, ProductCatalogRow> {
  const map = new Map<string, ProductCatalogRow>()
  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      alias: row.alias || "",
    })
  }
  return map
}
