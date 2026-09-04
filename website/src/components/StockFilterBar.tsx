import React from 'react';
import { SlidersHorizontal, Check, RotateCcw } from 'lucide-react';
import { ProductFilters } from '../types/product';

interface StockFilterBarProps {
  filters: ProductFilters;
  onFilterChange: (newFilters: Partial<ProductFilters>) => void;
  onResetFilters: () => void;
  totalFiltered: number;
}

export const StockFilterBar: React.FC<StockFilterBarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  totalFiltered,
}) => {
  const hasActiveFilters =
    filters.search !== '' ||
    filters.category !== 'All' ||
    filters.brand !== 'All' ||
    filters.inStockOnly ||
    filters.sortBy !== 'featured';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
      {/* Left: Result count & active status */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-800">
          {totalFiltered} {totalFiltered === 1 ? 'Product' : 'Products'} found
        </span>

        {hasActiveFilters && (
          <button
            onClick={onResetFilters}
            className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium hover:underline cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset filters
          </button>
        )}
      </div>

      {/* Right: In-Stock Toggle and Sort dropdown */}
      <div className="flex flex-wrap items-center gap-3 ml-auto">
        {/* "In Stock Only" quick toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl transition-all">
          <div
            className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
              filters.inStockOnly
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'border-slate-300 bg-white'
            }`}
          >
            {filters.inStockOnly && <Check className="w-3 h-3 stroke-[3]" />}
          </div>
          <span className="text-xs font-semibold text-slate-700">In Stock Only</span>
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={(e) => onFilterChange({ inStockOnly: e.target.checked })}
            className="sr-only"
          />
        </label>

        {/* Sort selector */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline font-medium">Sort:</span>
          <select
            value={filters.sortBy}
            onChange={(e) =>
              onFilterChange({
                sortBy: e.target.value as ProductFilters['sortBy'],
              })
            }
            aria-label="Sort products by"
            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-hidden focus:border-emerald-500 cursor-pointer"
          >
            <option value="featured">Featured / Popular</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="name">Name (A – Z)</option>
            <option value="stock_desc">Highest Stock</option>
          </select>
        </div>
      </div>
    </div>
  );
};
