'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  aggregateVentasByGroup,
  buildProductCatalog,
  fetchVentasForComparison,
} from '@/lib/comparison-sales';
import { budgetCountryCodesForCompanies } from '@/lib/comparison-companies';
import type { ProductBusinessGroup } from '@/lib/product-categories';
import { TrendingUp, TrendingDown, Equal } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface ComparisonSummaryProps {
  budgetName: string;
  months: string[];
  companies: string[];
  products?: string[];
  businessGroup: ProductBusinessGroup;
  categoryByName: Record<string, string | null | undefined>;
}

interface SummaryData {
  budget2026: number;
  real2026: number;
  real2025: number;
  deltaBudgetVsReal2026: number;
  deltaBudgetVsReal2026Pct: number;
  deltaReal2026VsReal2025: number;
  deltaReal2026VsReal2025Pct: number;
}

const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
];

export function ComparisonSummary({
  budgetName,
  months,
  companies,
  products,
  businessGroup,
  categoryByName,
}: ComparisonSummaryProps) {
  const [summary, setSummary] = useState<SummaryData>({
    budget2026: 0,
    real2026: 0,
    real2025: 0,
    deltaBudgetVsReal2026: 0,
    deltaBudgetVsReal2026Pct: 0,
    deltaReal2026VsReal2025: 0,
    deltaReal2026VsReal2025Pct: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, [budgetName, months, companies, products, businessGroup, categoryByName]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      if (products !== undefined && products.length === 0) {
        setSummary({
          budget2026: 0,
          real2026: 0,
          real2025: 0,
          deltaBudgetVsReal2026: 0,
          deltaBudgetVsReal2026Pct: 0,
          deltaReal2026VsReal2025: 0,
          deltaReal2026VsReal2025Pct: 0,
        });
        return;
      }

      let budgetQuery = supabase
        .from('budget')
        .select('*')
        .eq('year', 2026)
        .eq('budget_name', budgetName);

      if (companies.length > 0) {
        const countryCodes = budgetCountryCodesForCompanies(companies);
        if (countryCodes.length > 0) {
          budgetQuery = budgetQuery.in('country_code', countryCodes);
        }
      }

      if (products !== undefined && products.length > 0) {
        budgetQuery = budgetQuery.in('product_name', products);
      }

      const { data: budgetData, error: budgetError } = await budgetQuery;
      if (budgetError) throw budgetError;

      const { data: prods } = await supabase.from('products').select('id, name, alias');
      const catalog = buildProductCatalog((prods || []) as { id: string; name: string; alias: string | null }[]);

      const isMonthFiltered = months.length > 0 && months.length < 12;
      const monthSet = new Set(months.map((m) => parseInt(m, 10)));
      const salesFilters = {
        companies,
        products,
        businessGroup,
        categoryByName,
        months,
        catalog,
      };

      let ventasRows: Awaited<ReturnType<typeof fetchVentasForComparison>> = [];
      try {
        ventasRows = await fetchVentasForComparison(supabase, [2025, 2026]);
      } catch (salesError) {
        console.error('Error fetching real sales data:', salesError);
      }

      const groups2025 = aggregateVentasByGroup(ventasRows, 2025, salesFilters);
      const groups2026 = aggregateVentasByGroup(ventasRows, 2026, salesFilters);

      let budget2026 = 0;
      budgetData?.forEach((row: Record<string, unknown>) => {
        if (isMonthFiltered) {
          budget2026 += MONTH_KEYS.reduce((sum, mk, idx) => {
            const monthNum = idx + 1;
            return monthSet.has(monthNum) ? sum + (Number(row[mk]) || 0) : sum;
          }, 0);
        } else {
          budget2026 += Number(row.total_units) || 0;
        }
      });

      const real2025 = [...groups2025.values()].reduce((sum, g) => sum + g.cantidad, 0);
      const real2026 = [...groups2026.values()].reduce((sum, g) => sum + g.cantidad, 0);

      const deltaBudgetVsReal2026 = real2026 - budget2026;
      const deltaBudgetVsReal2026Pct = budget2026 > 0
        ? (deltaBudgetVsReal2026 / budget2026) * 100
        : (real2026 > 0 ? 100 : 0);
      const deltaReal2026VsReal2025 = real2026 - real2025;
      const deltaReal2026VsReal2025Pct = real2025 > 0
        ? (deltaReal2026VsReal2025 / real2025) * 100
        : (real2026 > 0 ? 100 : 0);

      setSummary({
        budget2026,
        real2026,
        real2025,
        deltaBudgetVsReal2026,
        deltaBudgetVsReal2026Pct,
        deltaReal2026VsReal2025,
        deltaReal2026VsReal2025Pct,
      });
    } catch (error) {
      console.error('Error fetching comparison summary:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-white/80 text-sm">
        Cargando resumen...
      </div>
    );
  }

  const isDeltaBudgetUp = summary.deltaBudgetVsReal2026 > 0;
  const isDeltaBudgetDown = summary.deltaBudgetVsReal2026 < 0;
  const isDeltaR26Up = summary.deltaReal2026VsReal2025 > 0;
  const isDeltaR26Down = summary.deltaReal2026VsReal2025 < 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
      <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Budget 2026</p>
            <p className="text-2xl font-bold mt-1 text-blue-300">
              {formatNumber(summary.budget2026, 'es-UY')}
            </p>
            <p className="text-xs text-white/60 mt-1">unidades proyectadas</p>
          </div>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Real 2026</p>
            <p className="text-2xl font-bold mt-1 text-emerald-300">
              {formatNumber(summary.real2026, 'es-UY')}
            </p>
            <p className="text-xs text-white/60 mt-1">unidades vendidas</p>
          </div>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Real 2025</p>
            <p className="text-2xl font-bold mt-1 text-purple-300">
              {formatNumber(summary.real2025, 'es-UY')}
            </p>
            <p className="text-xs text-white/60 mt-1">unidades vendidas</p>
          </div>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Δ Real 2026 vs Budget</p>
            <p className={`text-2xl font-bold mt-1 ${
              isDeltaBudgetUp ? 'text-emerald-300' :
              isDeltaBudgetDown ? 'text-red-300' :
              'text-white/60'
            }`}>
              {summary.deltaBudgetVsReal2026 >= 0 ? '+' : ''}{formatNumber(summary.deltaBudgetVsReal2026, 'es-UY')}
            </p>
            <p className="text-xs text-white/60 mt-1">unidades</p>
          </div>
          {isDeltaBudgetUp && <TrendingUp className="w-8 h-8 text-emerald-300" />}
          {isDeltaBudgetDown && <TrendingDown className="w-8 h-8 text-red-300" />}
          {summary.deltaBudgetVsReal2026 === 0 && <Equal className="w-8 h-8 text-white/40" />}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Δ Real 2026 vs Budget</p>
            <p className={`text-2xl font-bold mt-1 ${
              isDeltaBudgetUp ? 'text-emerald-300' :
              isDeltaBudgetDown ? 'text-red-300' :
              'text-white/60'
            }`}>
              {summary.deltaBudgetVsReal2026Pct >= 0 ? '+' : ''}{summary.deltaBudgetVsReal2026Pct.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Δ Real 2026 vs Real 2025</p>
            <p className={`text-2xl font-bold mt-1 ${
              isDeltaR26Up ? 'text-emerald-300' :
              isDeltaR26Down ? 'text-red-300' :
              'text-white/60'
            }`}>
              {summary.deltaReal2026VsReal2025 >= 0 ? '+' : ''}{formatNumber(summary.deltaReal2026VsReal2025, 'es-UY')}
            </p>
            <p className="text-xs text-white/60 mt-1">unidades</p>
          </div>
          {isDeltaR26Up && <TrendingUp className="w-8 h-8 text-emerald-300" />}
          {isDeltaR26Down && <TrendingDown className="w-8 h-8 text-red-300" />}
          {summary.deltaReal2026VsReal2025 === 0 && <Equal className="w-8 h-8 text-white/40" />}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Δ Real 2026 vs Real 2025</p>
            <p className={`text-2xl font-bold mt-1 ${
              isDeltaR26Up ? 'text-emerald-300' :
              isDeltaR26Down ? 'text-red-300' :
              'text-white/60'
            }`}>
              {summary.deltaReal2026VsReal2025Pct >= 0 ? '+' : ''}{summary.deltaReal2026VsReal2025Pct.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
