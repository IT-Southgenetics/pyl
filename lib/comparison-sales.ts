import type { SupabaseClient } from "@supabase/supabase-js"
import { getCountryForCompany } from "@/lib/auth-constants"

/** Compañía LLC general: el país real viene en `ventas.pais`, no en el nombre de compañía. */
export const GENERAL_LLC_COMPANY = "SouthGenetics LLC"

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
  countryCode: string
  productId: string | null
  productName: string
  cantidad: number
  monto: number
}

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  Chile: "CL",
  Uruguay: "UY",
  Argentina: "AR",
  México: "MX",
  Mexico: "MX",
  Colombia: "CO",
  Venezuela: "VE",
  Perú: "PE",
  Peru: "PE",
  Bolivia: "BO",
  "Trinidad y Tobago": "TT",
  "Trinidad and Tobago": "TT",
  Bahamas: "BS",
  Barbados: "BB",
  Bermuda: "BM",
  "Cayman Islands": "KY",
  Ecuador: "EC",
  Paraguay: "PY",
  Jamaica: "JM",
  "República Dominicana": "DO",
  "Dominican Republic": "DO",
  "El Salvador": "SV",
  Guatemala: "GT",
  Honduras: "HN",
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

function countryNameToCode(pais: string): string | null {
  const trimmed = pais.trim()
  if (!trimmed) return null
  if (trimmed.length === 2 && trimmed === trimmed.toUpperCase()) return trimmed
  const direct = COUNTRY_NAME_TO_CODE[trimmed]
  if (direct) return direct
  const upper = trimmed.toUpperCase()
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (upper.includes(name.toUpperCase())) return code
  }
  return null
}

/** País de una venta: LLC usa `pais`; compañías país-usan mapeo de compañía. */
export function resolveVentaCountryCode(
  company: string | null | undefined,
  pais: string | null | undefined
): string {
  const trimmedCompany = (company ?? "").trim()
  if (trimmedCompany === GENERAL_LLC_COMPANY) {
    const fromPais = countryNameToCode((pais ?? "").trim())
    return fromPais ?? "XX"
  }
  const fromCompany = getCountryForCompany(trimmedCompany)
  if (fromCompany) return fromCompany
  const upper = trimmedCompany.toUpperCase()
  const fallback: Record<string, string> = {
    CHILE: "CL",
    URUGUAY: "UY",
    ARGENTINA: "AR",
    ARGE: "AR",
    MÉXICO: "MX",
    MEXICO: "MX",
    COLOMBIA: "CO",
    VENEZUELA: "VE",
    DOMINICANA: "DO",
    ECUADOR: "EC",
    PARAGUAY: "PY",
    JAMAICA: "JM",
    BOLIVIA: "BO",
    TRINIDAD: "TT",
    BAHAMAS: "BS",
    BARBADOS: "BB",
    BERMUDA: "BM",
    CAYMAN: "KY",
    PERÚ: "PE",
    PERU: "PE",
  }
  for (const [key, code] of Object.entries(fallback)) {
    if (upper.includes(key)) return code
  }
  return "XX"
}

export function salesGroupKey(
  countryCode: string,
  productId: string | null | undefined,
  productName: string
): string {
  if (productId) return `${countryCode}|pid:${productId}`
  return `${countryCode}|name:${normalizeProductKey(productName)}`
}

/** Claves de grupo de ventas que corresponden a una fila de budget. */
export function budgetLookupKeys(
  budget: { country_code: string; product_id: string | null; product_name: string }
): string[] {
  const { country_code, product_id, product_name } = budget
  if (product_id) {
    return [salesGroupKey(country_code, product_id, product_name)]
  }
  return [salesGroupKey(country_code, null, product_name)]
}

export function aggregateVentasByGroup(
  rows: VentaComparisonRow[],
  year: number,
  filters: {
    countries: string[]
    products: string[]
    months: string[]
    catalog: Map<string, ProductCatalogRow>
  }
): Map<string, SalesGroup> {
  const isMonthFiltered = filters.months.length > 0 && filters.months.length < 12
  const monthSet = new Set(filters.months.map((m) => parseInt(m, 10)))
  const productFilter = filters.products.length > 0 ? new Set(filters.products) : null
  const groups = new Map<string, SalesGroup>()

  for (const row of rows) {
    const rowYear = parseInt(String(row.fecha).slice(0, 4), 10)
    if (rowYear !== year) continue

    const month = parseInt(String(row.fecha).slice(5, 7), 10)
    if (isMonthFiltered && !monthSet.has(month)) continue

    const countryCode = resolveVentaCountryCode(row.company, row.pais)
    if (filters.countries.length > 0 && !filters.countries.includes(countryCode)) continue

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

    const key = salesGroupKey(countryCode, row.id_producto, row.test)
    const qty = Number(row.quantity) || 0
    const amount = Number(row.amount) || 0
    const existing = groups.get(key)
    if (existing) {
      existing.cantidad += qty
      existing.monto += amount
    } else {
      groups.set(key, {
        countryCode,
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
  budget: { country_code: string; product_id: string | null; product_name: string },
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
