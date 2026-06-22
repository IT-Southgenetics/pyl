import { filterCompaniesByCountries } from "@/lib/auth-constants"

/** Ventas Odoo agregadas bajo una sola compañía (sin subdividir por `pais`). */
export const GENERAL_LLC_COMPANY = "SouthGenetics LLC"

/** Compañías con entidad propia en ventas (una por país principal). */
export const COUNTRY_CODE_TO_NATIONAL_COMPANY: Record<string, string> = {
  UY: "SouthGenetics LLC Uruguay",
  AR: "SouthGenetics LLC Argentina",
  CL: "Southgenetics LLC Chile",
  CO: "SouthGenetics LLC Colombia",
  MX: "SouthGenetics LLC México",
  VE: "SouthGenetics LLC Venezuela",
}

/** Países del budget que se consolidan bajo SouthGenetics LLC. */
export const LLC_BUDGET_COUNTRY_CODES = [
  "BB",
  "BM",
  "BO",
  "BS",
  "DO",
  "EC",
  "JM",
  "KY",
  "PY",
  "SV",
  "TT",
] as const

export const COMPARISON_COMPANIES: string[] = [
  GENERAL_LLC_COMPANY,
  ...Object.values(COUNTRY_CODE_TO_NATIONAL_COMPANY),
]

export function normalizeComparisonCompany(company: string): string {
  const trimmed = company.trim()
  if (!trimmed) return trimmed
  if (trimmed.toLowerCase() === GENERAL_LLC_COMPANY.toLowerCase()) {
    return GENERAL_LLC_COMPANY
  }
  const found = COMPARISON_COMPANIES.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase()
  )
  return found ?? trimmed
}

/** Budget (por country_code) → compañía de comparación. */
export function budgetCountryToCompany(countryCode: string): string {
  return COUNTRY_CODE_TO_NATIONAL_COMPANY[countryCode] ?? GENERAL_LLC_COMPANY
}

/** Compañía de comparación → country_codes del budget a incluir. */
export function companyToBudgetCountryCodes(company: string): string[] {
  const normalized = normalizeComparisonCompany(company)
  if (normalized === GENERAL_LLC_COMPANY) {
    return [...LLC_BUDGET_COUNTRY_CODES]
  }
  const entry = Object.entries(COUNTRY_CODE_TO_NATIONAL_COMPANY).find(
    ([, name]) => name === normalized
  )
  return entry ? [entry[0]] : []
}

export function budgetCountryCodesForCompanies(companies: string[]): string[] {
  if (!companies.length) return []
  return [...new Set(companies.flatMap(companyToBudgetCountryCodes))]
}

export function filterComparisonCompanies(
  companies: string[],
  allowedCountries: string[]
): string[] {
  const sorted = [...companies].sort((a, b) => a.localeCompare(b, "es"))
  if (!allowedCountries.length) return sorted
  return filterCompaniesByCountries(sorted, allowedCountries)
}
