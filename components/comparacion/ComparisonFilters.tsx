'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getDistinctVentasProducts } from '@/lib/ventas-data';
import { getVentasCompanies } from '@/lib/ventas-data';
import { filterComparisonCompanies } from '@/lib/comparison-companies';
import { capitalizeFirstLetter, cn } from '@/lib/utils';
import { ProductMultiSearchFilter } from '@/components/dashboard/ProductMultiSearchFilter';
import { MonthRangeFilter } from "@/components/filters/MonthRangeFilter"
import { MultiCheckboxDropdown, type MultiSelectOption } from "@/components/filters/MultiCheckboxDropdown"
import { BusinessGroupFilter } from '@/components/filters/BusinessGroupFilter';
import type { ProductBusinessGroup } from '@/lib/product-categories';

interface ComparisonFiltersProps {
  selectedBudgetName: string;
  budgetNames: string[];
  monthFrom: number;
  monthTo: number;
  selectedCompanies: string[];
  /** Array vacío = todos. */
  selectedProducts: string[];
  businessGroup: ProductBusinessGroup;
  productsInGroup: string[];
  onBudgetNameChange: (budgetName: string) => void;
  onMonthRangeChange: (range: { fromMonth: number; toMonth: number }) => void;
  onCompaniesChange: (companies: string[]) => void;
  onProductsChange: (products: string[]) => void;
  onBusinessGroupChange: (group: ProductBusinessGroup) => void;
  onAllProductsLoaded: (products: string[]) => void;
  allowedCountries?: string[];
  showAllCompanies?: boolean;
}

export function ComparisonFilters({
  selectedBudgetName,
  budgetNames,
  monthFrom,
  monthTo,
  selectedCompanies,
  selectedProducts,
  businessGroup,
  productsInGroup,
  onBudgetNameChange,
  onMonthRangeChange,
  onCompaniesChange,
  onProductsChange,
  onBusinessGroupChange,
  onAllProductsLoaded,
  allowedCountries,
  showAllCompanies = true,
}: ComparisonFiltersProps) {
  const [companyOptions, setCompanyOptions] = useState<MultiSelectOption[]>([]);

  useEffect(() => {
    getVentasCompanies()
      .then((names) => {
        const filtered = filterComparisonCompanies(names, allowedCountries ?? []);
        setCompanyOptions(
          filtered.map((name) => ({ value: name, label: name }))
        );
      })
      .catch((error) => console.error('Error fetching companies:', error));
  }, [allowedCountries]);

  useEffect(() => {
    fetchProducts();
  }, [selectedBudgetName]);

  const fetchProducts = async () => {
    try {
      const [budgetData, salesProducts] = await Promise.all([
        supabase
          .from('budget')
          .select('product_name')
          .eq('year', 2026)
          .eq('budget_name', selectedBudgetName),
        getDistinctVentasProducts([2025, 2026]),
      ]);

      const budgetProducts = budgetData.data?.map((b: { product_name: string }) => b.product_name) || [];
      const uniqueProducts = [...new Set([...budgetProducts, ...salesProducts])].sort();
      onAllProductsLoaded(uniqueProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-white/90">Budget</label>
        <select
          value={selectedBudgetName}
          onChange={(e) => onBudgetNameChange(e.target.value)}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm",
            "bg-white/10 border-white/20 text-white focus:border-white/30 focus:ring-2 focus:ring-white/30 focus:ring-offset-0 focus:ring-offset-transparent"
          )}
        >
          {budgetNames.map((n) => (
            <option key={n} value={n} className="bg-blue-900 text-white">
              {capitalizeFirstLetter(n)}
            </option>
          ))}
        </select>
      </div>

      <MonthRangeFilter label="Mes" fromMonth={monthFrom} toMonth={monthTo} onChange={onMonthRangeChange} />

      <BusinessGroupFilter value={businessGroup} onChange={onBusinessGroupChange} />

      <MultiCheckboxDropdown
        label="Compañía"
        options={companyOptions}
        selectedValues={
          selectedCompanies.length
            ? selectedCompanies
            : companyOptions.map((c) => c.value)
        }
        onSelectedValuesChange={onCompaniesChange}
        allLabel={showAllCompanies ? "Todas las compañías" : "Todas (mis compañías)"}
      />

      <div className="flex flex-col gap-2 lg:col-span-2">
        <ProductMultiSearchFilter
          products={productsInGroup}
          selectedProducts={selectedProducts}
          onSelectedProductsChange={onProductsChange}
          allLabel="Todos los productos"
        />
      </div>
    </div>
  );
}
