'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, AlertCircle } from 'lucide-react';
import { ComparisonFilters } from '@/components/comparacion/ComparisonFilters';
import { ComparisonSummary } from '@/components/comparacion/ComparisonSummary';
import { ComparisonTable } from '@/components/comparacion/ComparisonTable';
import { usePermissions } from '@/lib/use-permissions';
import { supabase } from '@/lib/supabase';
import { filterCompaniesByCountries } from '@/lib/auth-constants';
import { budgetCountryCodesForCompanies } from '@/lib/comparison-companies';
import { getVentasCompanies } from '@/lib/ventas-data';
import { monthsFromRange } from "@/components/filters/MonthRangeFilter"
import { fetchPlProductCatalog } from '@/lib/pl-product-catalog';
import {
  buildCategoryByNameMap,
  filterProductNamesByBusinessGroup,
  resolveEffectiveProductNames,
  type ProductBusinessGroup,
} from '@/lib/product-categories';

export default function ComparacionPage() {
  const { allowedCountries, isAdmin, loading: permLoading } = usePermissions();
  const [selectedBudgetName, setSelectedBudgetName] = useState<string>('budget');
  const [budgetNames, setBudgetNames] = useState<string[]>(['budget']);
  const [monthFrom, setMonthFrom] = useState<number>(1);
  const [monthTo, setMonthTo] = useState<number>(12);
  const selectedMonths = monthsFromRange({ fromMonth: monthFrom, toMonth: monthTo });
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [businessGroup, setBusinessGroup] = useState<ProductBusinessGroup>('all');
  const [categoryByName, setCategoryByName] = useState<Record<string, string>>({});
  const [allProducts, setAllProducts] = useState<string[]>([]);

  const effectiveProducts = useMemo(
    () => resolveEffectiveProductNames(allProducts, selectedProducts, categoryByName, businessGroup),
    [allProducts, selectedProducts, categoryByName, businessGroup]
  );

  const productsInGroup = useMemo(
    () => filterProductNamesByBusinessGroup(allProducts, categoryByName, businessGroup),
    [allProducts, categoryByName, businessGroup]
  );

  useEffect(() => {
    fetchPlProductCatalog()
      .then((rows) => {
        const map = buildCategoryByNameMap(rows);
        for (const row of rows) {
          const alias = row.alias?.trim();
          if (alias) map[alias] = row.category;
        }
        setCategoryByName(map);
      })
      .catch((e) => console.error('Error loading product catalog:', e));
  }, []);

  useEffect(() => {
    setSelectedProducts((prev) => prev.filter((p) => productsInGroup.includes(p)));
  }, [businessGroup, productsInGroup]);

  useEffect(() => {
    if (permLoading || isAdmin) return;
    if (allowedCountries.length === 0) return;
    getVentasCompanies()
      .then((names) => setSelectedCompanies(filterCompaniesByCountries(names, allowedCountries)))
      .catch(() => setSelectedCompanies([]));
  }, [permLoading, isAdmin, allowedCountries]);

  useEffect(() => {
    const fetchBudgetNames = async () => {
      try {
        let q = supabase.from('budget').select('budget_name').eq('year', 2026)
        if (selectedCompanies.length > 0) {
          const countryCodes = budgetCountryCodesForCompanies(selectedCompanies)
          if (countryCodes.length > 0) q = q.in('country_code', countryCodes)
        }
        const { data } = await q
        const rows = (data ?? []) as any[]
        const names: string[] = [...new Set(
          rows
            .map((r) => String(r?.budget_name || '').trim())
            .filter((x) => Boolean(x))
        )].sort()
        const finalNames: string[] = names.length ? names : ['budget']
        setBudgetNames(finalNames)
        setSelectedBudgetName((prev) => (finalNames.includes(prev) ? prev : finalNames[0]))
      } catch (e) {
        console.error('Error fetching budget names:', e)
        setBudgetNames(['budget'])
        setSelectedBudgetName('budget')
      }
    }
    fetchBudgetNames()
  }, [selectedCompanies])

  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-900 via-blue-950 to-slate-900">
      <div className="container mx-auto p-6 space-y-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Comparación: Budget 2026 - Real 2026 - Real 2025
            </h1>
            <p className="text-sm text-white/80 mt-1">
              Proyecciones y deltas de crecimiento (Budget vs Real 2026, Real 2026 vs Real 2025). Datos reales desde ventas mensuales.
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={() => {
                // TODO: Implementar exportación
                alert('Exportar - Funcionalidad próximamente');
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Alerta informativa */}
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-white/80 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-white/90">
            <p className="font-medium">Comparación de períodos:</p>
            <p>
              <strong>Budget 2026:</strong> Proyecciones | 
              <strong className="ml-2">Real 2026:</strong> Ventas reales 2026 | 
              <strong className="ml-2">Real 2025:</strong> Ventas reales 2025. Deltas: Budget vs Real 2026 y Real 2026 vs Real 2025 (cantidad y %).
            </p>
          </div>
        </div>

      {/* Filtros */}
      <ComparisonFilters
        selectedBudgetName={selectedBudgetName}
        budgetNames={budgetNames}
        monthFrom={monthFrom}
        monthTo={monthTo}
        selectedCompanies={selectedCompanies}
        selectedProducts={selectedProducts}
        onBudgetNameChange={setSelectedBudgetName}
        onMonthRangeChange={({ fromMonth, toMonth }) => {
          setMonthFrom(fromMonth)
          setMonthTo(toMonth)
        }}
        onCompaniesChange={setSelectedCompanies}
        onProductsChange={setSelectedProducts}
        businessGroup={businessGroup}
        onBusinessGroupChange={setBusinessGroup}
        productsInGroup={productsInGroup}
        onAllProductsLoaded={setAllProducts}
        allowedCountries={allowedCountries}
        showAllCompanies={isAdmin}
      />

      <ComparisonSummary
        budgetName={selectedBudgetName}
        months={selectedMonths}
        companies={selectedCompanies}
        products={effectiveProducts}
        businessGroup={businessGroup}
        categoryByName={categoryByName}
      />

      <ComparisonTable
        budgetName={selectedBudgetName}
        months={selectedMonths}
        companies={selectedCompanies}
        products={effectiveProducts}
        businessGroup={businessGroup}
        categoryByName={categoryByName}
      />
      </div>
    </div>
  );
}



