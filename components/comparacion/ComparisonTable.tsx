'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  aggregateVentasByGroup,
  budgetLookupKeys,
  buildProductCatalog,
  fetchVentasForComparison,
  lookupSalesForBudget,
  normalizeProductKey,
  saleGroupMatchesProductFilter,
  salesGroupKey,
} from '@/lib/comparison-sales';
import Link from 'next/link';
import { ArrowUp, ArrowDown, Minus, ChevronDown } from 'lucide-react';
import { cn, displayProductLabelFromName, formatNumber, formatUSDNumber } from '@/lib/utils';

interface BudgetMonthItem {
  label: string;
  value: number;
}

interface ComparisonRow {
  country: string;
  country_code: string;
  product_name: string;
  product_id: string | null;
  budget2026: number;
  budgetAmountUSD: number;
  budgetByMonth?: BudgetMonthItem[];
  real2026: number;
  real2026AmountUSD: number;
  real2025: number;
  real2025AmountUSD: number;
  deltaBudgetVsReal2026: number;
  deltaBudgetVsReal2026Pct: number;
  deltaReal2026VsReal2025: number;
  deltaReal2026VsReal2025Pct: number;
}

interface ComparisonTableProps {
  budgetName: string;
  months: string[];
  countries: string[];
  /** Array vacío = todos. */
  products: string[];
}

const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
];

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const COUNTRIES = [
  { value: 'CL', label: 'Chile' },
  { value: 'UY', label: 'Uruguay' },
  { value: 'AR', label: 'Argentina' },
  { value: 'MX', label: 'México' },
  { value: 'CO', label: 'Colombia' },
  { value: 'VE', label: 'Venezuela' },
  { value: 'DO', label: 'República Dominicana' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'PY', label: 'Paraguay' },
  { value: 'JM', label: 'Jamaica' },
  { value: 'BO', label: 'Bolivia' },
  { value: 'TT', label: 'Trinidad y Tobago' },
  { value: 'BS', label: 'Bahamas' },
  { value: 'BB', label: 'Barbados' },
  { value: 'BM', label: 'Bermuda' },
  { value: 'KY', label: 'Cayman Islands' },
];

function budgetConsolidationKey(
  countryCode: string,
  productId: string | null,
  productName: string
): string {
  if (productId) return `${countryCode}|pid:${productId}`;
  return `${countryCode}|name:${normalizeProductKey(productName)}`;
}

const hasBudgetAndRealSales = (row: ComparisonRow): boolean =>
  row.budget2026 > 0 && row.real2026 > 0;

function sortComparisonRows(
  rows: ComparisonRow[],
  sortBy: 'deltaBudgetVsReal2026' | 'deltaReal2026VsReal2025',
  sortOrder: 'asc' | 'desc'
): ComparisonRow[] {
  return [...rows].sort((a, b) => {
    const aPriority = hasBudgetAndRealSales(a) ? 0 : 1;
    const bPriority = hasBudgetAndRealSales(b) ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;

    const aVal = a[sortBy];
    const bVal = b[sortBy];
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });
}

export function ComparisonTable({ budgetName, months, countries, products }: ComparisonTableProps) {
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [aliasByName, setAliasByName] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<'deltaBudgetVsReal2026' | 'deltaReal2026VsReal2025'>('deltaBudgetVsReal2026');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [openBudgetDropdownIdx, setOpenBudgetDropdownIdx] = useState<number | null>(null);
  const budgetDropdownRef = useRef<HTMLDivElement>(null);

  const data = useMemo(
    () => sortComparisonRows(rows, sortBy, sortOrder),
    [rows, sortBy, sortOrder]
  );

  const isAllMonths = months.length >= 12;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (budgetDropdownRef.current && !budgetDropdownRef.current.contains(e.target as Node)) {
        setOpenBudgetDropdownIdx(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchComparisonData();
  }, [budgetName, months, countries, products]);

  const fetchComparisonData = async () => {
    setLoading(true);
    try {
      const { data: prods } = await supabase.from('products').select('id, name, alias');
      const aliasMap: Record<string, string> = {};
      for (const p of (prods || []) as { name: string; alias: string | null }[]) {
        aliasMap[p.name] = p.alias || '';
      }
      setAliasByName(aliasMap);
      const catalog = buildProductCatalog((prods || []) as { id: string; name: string; alias: string | null }[]);

      // 1. Fetch Budget 2026
      let budgetQuery = supabase
        .from('budget')
        .select('*')
        .eq('year', 2026)
        .eq('budget_name', budgetName);

      if (countries.length > 0) {
        budgetQuery = budgetQuery.in('country_code', countries);
      }

      if (products.length > 0) {
        budgetQuery = budgetQuery.in('product_name', products);
      }

      const { data: budgetData, error: budgetError } = await budgetQuery;
      if (budgetError) {
        console.error('❌ Error fetching budget data:', budgetError);
        throw budgetError;
      }
      
      if (!budgetData || budgetData.length === 0) {
        console.warn('⚠️ No hay datos de budget para los filtros seleccionados');
        setRows([]);
        setLoading(false);
        return;
      }

      const isMonthFiltered = months.length > 0 && months.length < 12;
      const monthSet = new Set(months.map((m) => parseInt(m, 10)));
      const salesFilters = { countries, products, months, catalog };

      let ventasRows: Awaited<ReturnType<typeof fetchVentasForComparison>> = [];
      try {
        ventasRows = await fetchVentasForComparison(supabase, [2025, 2026]);
      } catch (salesError) {
        console.error('Error fetching real sales data:', salesError);
      }

      const groups2025 = aggregateVentasByGroup(ventasRows, 2025, salesFilters);
      const groups2026 = aggregateVentasByGroup(ventasRows, 2026, salesFilters);

      // Overrides para monto budget (cantidad * grossSalesUSD)
      const budgetProductIds = Array.from(
        new Set((budgetData as any[]).map((r: any) => r.product_id).filter(Boolean))
      );
      let overrideRows: any[] = [];
      if (budgetProductIds.length > 0) {
        let ovQuery = supabase
          .from('product_country_overrides')
          .select('product_id,country_code,channel,overrides')
          .in('product_id', budgetProductIds);
        if (countries.length > 0) ovQuery = ovQuery.in('country_code', countries);
        const { data: ovData } = await ovQuery;
        overrideRows = ovData || [];
      }

      const overrideMap = new Map<string, any>();
      for (const ov of overrideRows) {
        overrideMap.set(`${ov.product_id}|${ov.country_code}|${ov.channel || ''}`, ov.overrides || {});
      }

      const getGrossSalesUSDForRow = (row: any): number => {
        const pid = row.product_id;
        if (!pid) return 0;
        const cc = row.country_code || '';
        const rowChannel = row.channel || '';
        const exact = overrideMap.get(`${pid}|${cc}|${rowChannel}`);
        if (exact && typeof exact.grossSalesUSD === 'number') return exact.grossSalesUSD;
        const paciente = overrideMap.get(`${pid}|${cc}|Paciente`);
        if (paciente && typeof paciente.grossSalesUSD === 'number') return paciente.grossSalesUSD;
        // Fallback: primer override disponible para producto+país
        const fallback = overrideRows.find((ov) => ov.product_id === pid && ov.country_code === cc);
        return Number(fallback?.overrides?.grossSalesUSD || 0);
      };

      const consumedRealKeys = new Set<string>();

      const rawComparisonData: ComparisonRow[] = budgetData.map((budgetRow: any) => {
        const budget = isMonthFiltered
          ? MONTH_KEYS.reduce((sum, mk, idx) => {
              const monthNum = idx + 1;
              return monthSet.has(monthNum) ? sum + (budgetRow[mk] || 0) : sum;
            }, 0)
          : (budgetRow.total_units || 0);
        const grossSalesUSD = getGrossSalesUSDForRow(budgetRow);
        const budgetAmountUSD = budget * grossSalesUSD;

        const sales2025 = lookupSalesForBudget(budgetRow, groups2025);
        const sales2026 = lookupSalesForBudget(budgetRow, groups2026);
        for (const key of budgetLookupKeys(budgetRow)) {
          if (groups2025.has(key)) consumedRealKeys.add(key);
          if (groups2026.has(key)) consumedRealKeys.add(key);
        }

        const real2025 = sales2025?.cantidad ?? 0;
        const real2026 = sales2026?.cantidad ?? 0;

        const deltaBudgetVsReal2026 = real2026 - budget;
        const deltaBudgetVsReal2026Pct = budget > 0
          ? (deltaBudgetVsReal2026 / budget) * 100
          : (real2026 > 0 ? 100 : 0);
        const deltaReal2026VsReal2025 = real2026 - real2025;
        const deltaReal2026VsReal2025Pct = real2025 > 0
          ? (deltaReal2026VsReal2025 / real2025) * 100
          : (real2026 > 0 ? 100 : 0);

        const budgetByMonth: BudgetMonthItem[] | undefined = !isMonthFiltered
          ? MONTH_KEYS.map((key, i) => ({
              label: MONTH_LABELS[i],
              value: Number(budgetRow[key]) || 0,
            }))
          : undefined;

        return {
          country: budgetRow.country,
          country_code: budgetRow.country_code,
          product_name: budgetRow.product_name,
          product_id: budgetRow.product_id,
          budget2026: budget,
          budgetAmountUSD,
          budgetByMonth,
          real2026,
          real2026AmountUSD: real2026 * grossSalesUSD,
          real2025,
          real2025AmountUSD: real2025 * grossSalesUSD,
          deltaBudgetVsReal2026,
          deltaBudgetVsReal2026Pct,
          deltaReal2026VsReal2025,
          deltaReal2026VsReal2025Pct,
        };
      }) || [];

      // 6.b Consolidar filas duplicadas de budget (mismo país + mismo producto lógico).
      // Esto evita mostrar el mismo producto repetido cuando en budget existen múltiples
      // filas (por ejemplo, por canal) para el mismo producto.
      const consolidatedMap = new Map<string, ComparisonRow>();
      for (const row of rawComparisonData) {
        const key = budgetConsolidationKey(row.country_code, row.product_id, row.product_name);
        const existing = consolidatedMap.get(key);
        if (!existing) {
          consolidatedMap.set(key, { ...row });
          continue;
        }

        const mergedBudget = existing.budget2026 + row.budget2026;
        const mergedAmount = existing.budgetAmountUSD + row.budgetAmountUSD;
        const mergedByMonth = existing.budgetByMonth && row.budgetByMonth
          ? existing.budgetByMonth.map((m, i) => ({
              label: m.label,
              value: m.value + (row.budgetByMonth?.[i]?.value || 0),
            }))
          : existing.budgetByMonth || row.budgetByMonth;

        // Real 2025/2026 provienen de agrupaciones por país+producto y suelen ser iguales
        // entre duplicados; en caso de diferencia, mantenemos el mayor para evitar subestimar.
        const mergedReal2026 = Math.max(existing.real2026, row.real2026);
        const mergedReal2025 = Math.max(existing.real2025, row.real2025);
        const mergedReal2026AmountUSD = Math.max(existing.real2026AmountUSD, row.real2026AmountUSD);
        const mergedReal2025AmountUSD = Math.max(existing.real2025AmountUSD, row.real2025AmountUSD);
        const mergedDeltaBudgetVsReal2026 = mergedReal2026 - mergedBudget;
        const mergedDeltaBudgetVsReal2026Pct =
          mergedBudget > 0
            ? (mergedDeltaBudgetVsReal2026 / mergedBudget) * 100
            : (mergedReal2026 > 0 ? 100 : 0);
        const mergedDeltaReal2026VsReal2025 = mergedReal2026 - mergedReal2025;
        const mergedDeltaReal2026VsReal2025Pct =
          mergedReal2025 > 0 ? (mergedDeltaReal2026VsReal2025 / mergedReal2025) * 100 : (mergedReal2026 > 0 ? 100 : 0);

        consolidatedMap.set(key, {
          ...existing,
          budget2026: mergedBudget,
          budgetAmountUSD: mergedAmount,
          budgetByMonth: mergedByMonth,
          real2026: mergedReal2026,
          real2026AmountUSD: mergedReal2026AmountUSD,
          real2025: mergedReal2025,
          real2025AmountUSD: mergedReal2025AmountUSD,
          deltaBudgetVsReal2026: mergedDeltaBudgetVsReal2026,
          deltaBudgetVsReal2026Pct: mergedDeltaBudgetVsReal2026Pct,
          deltaReal2026VsReal2025: mergedDeltaReal2026VsReal2025,
          deltaReal2026VsReal2025Pct: mergedDeltaReal2026VsReal2025Pct,
        });
      }
      const comparisonData: ComparisonRow[] = Array.from(consolidatedMap.values());

      const budgetKeys = new Set(
        comparisonData.map((row) =>
          budgetConsolidationKey(row.country_code, row.product_id, row.product_name)
        )
      );

      const allRealKeys = new Set([...groups2025.keys(), ...groups2026.keys()]);

      for (const key of allRealKeys) {
        if (consumedRealKeys.has(key)) continue;

        const sales2025 = groups2025.get(key);
        const sales2026 = groups2026.get(key);
        const meta = sales2026 ?? sales2025;
        if (!meta) continue;

        const countryCode = meta.countryCode;
        const consolidationKey = salesGroupKey(countryCode, meta.productId, meta.productName);
        if (budgetKeys.has(consolidationKey)) continue;

        if (countries.length > 0 && !countries.includes(countryCode)) continue;
        if (!saleGroupMatchesProductFilter(meta, products, catalog)) continue;

        const real2025 = sales2025?.cantidad ?? 0;
        const real2026 = sales2026?.cantidad ?? 0;
        if (real2025 === 0 && real2026 === 0) continue;

        const deltaBudgetVsReal2026 = real2026;
        const deltaBudgetVsReal2026Pct = real2026 > 0 ? 100 : 0;
        const deltaReal2026VsReal2025 = real2026 - real2025;
        const deltaReal2026VsReal2025Pct = real2025 > 0
          ? (deltaReal2026VsReal2025 / real2025) * 100
          : (real2026 > 0 ? 100 : 0);

        comparisonData.push({
          country: COUNTRIES.find((c) => c.value === countryCode)?.label || countryCode,
          country_code: countryCode,
          product_name: meta.productName,
          product_id: meta.productId,
          budget2026: 0,
          budgetAmountUSD: 0,
          budgetByMonth: undefined,
          real2026,
          real2026AmountUSD: sales2026?.monto ?? 0,
          real2025,
          real2025AmountUSD: sales2025?.monto ?? 0,
          deltaBudgetVsReal2026,
          deltaBudgetVsReal2026Pct,
          deltaReal2026VsReal2025,
          deltaReal2026VsReal2025Pct,
        });

        budgetKeys.add(consolidationKey);
      }

      const filteredData = comparisonData.filter(
        (row) => !(row.budget2026 === 0 && row.real2026 === 0 && row.real2025 === 0)
      );

      setRows(filteredData);
    } catch (error) {
      console.error('❌ Error en fetchComparisonData:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: 'deltaBudgetVsReal2026' | 'deltaReal2026VsReal2025') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-white/80 text-sm">
        Cargando comparación...
      </div>
    );
  }

  return (
    <div className="border border-white/20 rounded-lg overflow-hidden bg-white/10 backdrop-blur-sm shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-white/10 border-b border-white/20">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-xs text-white">País</th>
            <th className="text-left px-4 py-3 font-medium text-xs text-white">Producto</th>
            <th className="text-right px-4 py-3 font-medium text-xs text-white">Budget 2026</th>
            <th className="text-right px-4 py-3 font-medium text-xs text-white">Monto (US$)</th>
            <th className="text-right px-4 py-3 font-medium text-xs text-white">Real 2026</th>
            <th className="text-right px-4 py-3 font-medium text-xs text-white">Monto Real 2026</th>
            <th className="text-right px-4 py-3 font-medium text-xs text-white">Real 2025</th>
            <th className="text-right px-4 py-3 font-medium text-xs text-white">Monto Real 2025</th>
            <th className="text-right px-4 py-3 font-medium text-xs text-white">Δ Real 2026 vs Budget</th>
            <th 
              className="text-right px-4 py-3 font-medium text-xs text-white cursor-pointer hover:bg-white/10 transition-colors"
              onClick={() => handleSort('deltaBudgetVsReal2026')}
            >
              <div className="flex items-center justify-end gap-1">
                Δ R26 vs Budget %
                {sortBy === 'deltaBudgetVsReal2026' && (
                  sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />
                )}
              </div>
            </th>
            <th className="text-right px-4 py-3 font-medium text-xs text-white">Δ Real 2026 vs Real 2025</th>
            <th 
              className="text-right px-4 py-3 font-medium text-xs text-white cursor-pointer hover:bg-white/10 transition-colors"
              onClick={() => handleSort('deltaReal2026VsReal2025')}
            >
              <div className="flex items-center justify-end gap-1">
                Δ R26 vs R25 %
                {sortBy === 'deltaReal2026VsReal2025' && (
                  sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />
                )}
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {data.map((row, idx) => {
            const isDeltaBudgetUp = row.deltaBudgetVsReal2026 > 0;
            const isDeltaBudgetDown = row.deltaBudgetVsReal2026 < 0;
            const isDeltaR26Up = row.deltaReal2026VsReal2025 > 0;
            const isDeltaR26Down = row.deltaReal2026VsReal2025 < 0;

            return (
              <tr key={idx} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-sm text-white/90">{row.country}</td>
                <td className="px-4 py-3">
                  {row.product_id ? (
                    <Link
                      href={`/productos/${row.product_id}`}
                      className="text-blue-300 hover:text-blue-200 hover:underline text-sm font-medium"
                    >
                      {displayProductLabelFromName(row.product_name, aliasByName)}
                    </Link>
                  ) : (
                    <span className="text-white/70 text-sm">{displayProductLabelFromName(row.product_name, aliasByName)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium text-sm text-blue-300">
                  {isAllMonths && row.budgetByMonth ? (
                    <div className="relative inline-block text-right">
                      <button
                        type="button"
                        onClick={() => setOpenBudgetDropdownIdx(openBudgetDropdownIdx === idx ? null : idx)}
                        className="flex items-center justify-end gap-1 w-full font-medium text-blue-300 hover:text-blue-200 focus:outline-none"
                      >
                        {formatNumber(row.budget2026, 'es-UY')}
                        <ChevronDown className={cn("h-4 w-4 transition-transform", openBudgetDropdownIdx === idx && "rotate-180")} />
                      </button>
                      {openBudgetDropdownIdx === idx && (
                        <div
                          ref={budgetDropdownRef}
                          className="absolute z-50 right-0 mt-1 min-w-[180px] rounded-md border border-white/20 bg-blue-950/95 backdrop-blur-sm py-2 shadow-lg"
                        >
                          <div className="px-3 py-1.5 text-xs font-semibold text-white/70 border-b border-white/10">
                            Budget 2026 por mes
                          </div>
                          <div className="max-h-56 overflow-y-auto">
                            {row.budgetByMonth.map((item, i) => (
                              <div key={i} className="flex justify-between items-center px-3 py-1.5 text-sm text-white/90">
                                <span>{item.label}</span>
                                <span className="font-medium tabular-nums">{formatNumber(item.value, 'es-UY')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    formatNumber(row.budget2026, 'es-UY')
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium text-sm text-emerald-300">
                  {formatUSDNumber(row.budgetAmountUSD)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-sm text-emerald-300">
                  {formatNumber(row.real2026, 'es-UY')}
                </td>
                <td className="px-4 py-3 text-right font-medium text-sm text-emerald-300">
                  {formatUSDNumber(row.real2026AmountUSD)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-sm text-purple-300">
                  {formatNumber(row.real2025, 'es-UY')}
                </td>
                <td className="px-4 py-3 text-right font-medium text-sm text-purple-300">
                  {formatUSDNumber(row.real2025AmountUSD)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-sm text-white/90">
                  {row.deltaBudgetVsReal2026 >= 0 ? '+' : ''}{formatNumber(row.deltaBudgetVsReal2026, 'es-UY')}
                </td>
                <td className={`px-4 py-3 text-right font-medium text-sm ${
                  isDeltaBudgetUp ? 'text-emerald-300' : 
                  isDeltaBudgetDown ? 'text-red-300' : 
                  'text-white/60'
                }`}>
                  <div className="flex items-center justify-end gap-1">
                    {isDeltaBudgetUp && <ArrowUp className="w-4 h-4" />}
                    {isDeltaBudgetDown && <ArrowDown className="w-4 h-4" />}
                    {row.deltaBudgetVsReal2026 === 0 && <Minus className="w-4 h-4" />}
                    {row.deltaBudgetVsReal2026Pct >= 0 ? '+' : ''}{row.deltaBudgetVsReal2026Pct.toFixed(1)}%
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium text-sm text-white/90">
                  {row.deltaReal2026VsReal2025 >= 0 ? '+' : ''}{formatNumber(row.deltaReal2026VsReal2025, 'es-UY')}
                </td>
                <td className={`px-4 py-3 text-right font-medium text-sm ${
                  isDeltaR26Up ? 'text-emerald-300' : 
                  isDeltaR26Down ? 'text-red-300' : 
                  'text-white/60'
                }`}>
                  <div className="flex items-center justify-end gap-1">
                    {isDeltaR26Up && <ArrowUp className="w-4 h-4" />}
                    {isDeltaR26Down && <ArrowDown className="w-4 h-4" />}
                    {row.deltaReal2026VsReal2025 === 0 && <Minus className="w-4 h-4" />}
                    {row.deltaReal2026VsReal2025Pct >= 0 ? '+' : ''}{row.deltaReal2026VsReal2025Pct.toFixed(1)}%
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {data.length === 0 && (
        <div className="text-center py-8 text-white/60 text-sm">
          No hay datos para comparar con los filtros seleccionados
        </div>
      )}
    </div>
  );
}

