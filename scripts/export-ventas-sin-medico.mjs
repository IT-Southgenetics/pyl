/**
 * Exporta ventas sin médico asignado a Excel (para corregir en Odoo).
 * Uso: node scripts/export-ventas-sin-medico.mjs
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"
import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "")
    }
  }
}

loadEnv()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const VENTAS_SELECT =
  "id, created_at, fecha, test, amount, company, id_producto, partner, quantity, move_id, move_nombre, medico, institucion, pais"

function isSinMedico(medico) {
  return medico == null || String(medico).trim() === ""
}

async function fetchProductOdooMap() {
  const map = new Map()
  const pageSize = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, alias, id_odoo")
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    const batch = data || []
    for (const p of batch) {
      map.set(p.id, {
        id_odoo: p.id_odoo ?? null,
        name: p.name ?? "",
        alias: p.alias ?? "",
      })
    }
    if (batch.length < pageSize) break
    offset += pageSize
  }
  return map
}

async function fetchVentasSinMedico() {
  const pageSize = 1000
  let offset = 0
  const all = []

  while (true) {
    const { data, error } = await supabase
      .from("ventas")
      .select(VENTAS_SELECT)
      .or("medico.is.null,medico.eq.")
      .order("fecha", { ascending: false })
      .order("company", { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    const batch = (data || []).filter((row) => isSinMedico(row.medico))
    all.push(...batch)
    if ((data || []).length < pageSize) break
    offset += pageSize
  }

  return all
}

function rowToSheet(row, productMap) {
  const prod = row.id_producto ? productMap.get(row.id_producto) : null
  return {
    Fecha: row.fecha ?? "",
    Compania: row.company ?? "",
    Move_ID_Odoo: row.move_id ?? "",
    Factura_move_nombre: row.move_nombre ?? "",
    Partner_cliente: row.partner ?? "",
    Producto: row.test ?? "",
    Producto_ID_Odoo: prod?.id_odoo ?? "",
    Producto_alias: prod?.alias ?? "",
    Cantidad: Number(row.quantity) || 0,
    Monto: Number(row.amount) || 0,
    Medico: row.medico ?? "",
    Institucion: row.institucion ?? "",
    Pais: row.pais ?? "",
    ID_venta_supabase: row.id ?? "",
    ID_producto_supabase: row.id_producto ?? "",
    Creado_en: row.created_at ?? "",
  }
}

function buildResumen(rows) {
  const byCompany = new Map()
  const byYear = new Map()
  let unidades = 0
  let monto = 0

  for (const r of rows) {
    const company = r.company || "(sin compañía)"
    const year = String(r.fecha || "").slice(0, 4) || "(sin fecha)"
    byCompany.set(company, (byCompany.get(company) || 0) + 1)
    byYear.set(year, (byYear.get(year) || 0) + 1)
    unidades += Number(r.quantity) || 0
    monto += Number(r.amount) || 0
  }

  const resumen = [
    { Metrica: "Total ventas sin médico", Valor: rows.length },
    { Metrica: "Unidades totales", Valor: unidades },
    { Metrica: "Monto total", Valor: Math.round(monto * 100) / 100 },
    {
      Metrica: "Generado",
      Valor: new Date().toISOString().slice(0, 19).replace("T", " "),
    },
  ]

  const porCompania = [...byCompany.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([Compania, Registros]) => ({ Compania, Registros }))

  const porAnio = [...byYear.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([Anio, Registros]) => ({ Anio, Registros }))

  return { resumen, porCompania, porAnio }
}

async function main() {
  console.log("Cargando productos (id_odoo)...")
  const productMap = await fetchProductOdooMap()

  console.log("Cargando ventas sin médico...")
  const rows = await fetchVentasSinMedico()
  console.log(`Total: ${rows.length} ventas`)

  const sheetVentas = rows.map((r) => rowToSheet(r, productMap))
  const { resumen, porCompania, porAnio } = buildResumen(rows)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porCompania), "Por_compania")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porAnio), "Por_anio")
  XLSX.utils.book_append_sheet(
    wb,
    sheetVentas.length
      ? XLSX.utils.json_to_sheet(sheetVentas)
      : XLSX.utils.aoa_to_sheet([["Sin ventas sin médico"]]),
    "Ventas_sin_medico"
  )

  const outPath = resolve(root, "exports", "ventas_sin_medico.xlsx")
  XLSX.writeFile(wb, outPath)
  console.log(`Excel guardado: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
