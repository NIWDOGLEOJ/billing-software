import { useState, useEffect, useMemo, useCallback } from 'react';
import { Product, ProductFilters } from './types/product';
import { InventoryService } from './services/inventoryService';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { CategoryFilter } from './components/CategoryFilter';
import { StockFilterBar } from './components/StockFilterBar';
import { ProductCard } from './components/ProductCard';
import { ProductModal } from './components/ProductModal';
import { WhatsAppCart } from './components/WhatsAppCart';
import { StoreInfoModal } from './components/StoreInfoModal';
import { Footer } from './components/Footer';
import { PackageSearch, AlertCircle } from 'lucide-react';

const INITIAL_FILTERS: ProductFilters = {
  search: '',
  category: 'All',
  brand: 'All',
  inStockOnly: false,
  sortBy: 'featured',
};

export function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<ProductFilters>(INITIAL_FILTERS);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isStoreInfoOpen, setIsStoreInfoOpen] = useState(false);

  const loadProducts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await InventoryService.getProducts();
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Derived filtered products list
  const filteredProducts = useMemo(() => {
    return InventoryService.filterProducts(products, filters);
  }, [products, filters]);

  // Derived category list with counts
  const categories = useMemo(() => {
    return InventoryService.getCategories(products);
  }, [products]);

  // In-stock products count
  const inStockCount = useMemo(() => {
    return products.filter((p) => (Number(p.stock) || 0) > 0).length;
  }, [products]);

  const handleSearchChange = (query: string) => {
    setFilters((prev) => ({ ...prev, search: query }));
  };

  const handleSelectCategory = (category: string) => {
    setFilters((prev) => ({ ...prev, category }));
  };

  const handleFilterChange = (newFilters: Partial<ProductFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  return (
    <CartProvider>
      <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-emerald-500 selection:text-white">
        {/* Navigation Bar */}
        <Navbar
          searchQuery={filters.search}
          onSearchChange={handleSearchChange}
          onOpenStoreInfo={() => setIsStoreInfoOpen(true)}
        />

        {/* Hero Section */}
        <Hero
          totalProductsCount={products.length}
          inStockCount={inStockCount}
          onOpenStoreInfo={() => setIsStoreInfoOpen(true)}
          onSelectCategory={handleSelectCategory}
        />

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          {/* Category Bar */}
          <section aria-label="Product Categories">
            <CategoryFilter
              categories={categories}
              selectedCategory={filters.category}
              onSelectCategory={handleSelectCategory}
            />
          </section>

          {/* Filtering Toolbar */}
          <section aria-label="Catalog Filtering and Sorting">
            <StockFilterBar
              filters={filters}
              onFilterChange={handleFilterChange}
              onResetFilters={handleResetFilters}
              totalFiltered={filteredProducts.length}
            />
          </section>

          {/* Catalog Grid */}
          <section aria-label="Available Products">
            {loading ? (
              // Loading skeletons
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3 animate-pulse"
                  >
                    <div className="w-full h-44 bg-slate-200 rounded-xl" />
                    <div className="h-4 bg-slate-200 rounded-md w-3/4" />
                    <div className="h-3 bg-slate-200 rounded-md w-1/2" />
                    <div className="h-8 bg-slate-200 rounded-xl w-full mt-4" />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              // Empty search / filter results
              <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center max-w-md mx-auto my-8">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400 mb-4">
                  <PackageSearch className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-800">
                  No products found
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  We couldn’t find any items matching your filters. Try checking your spelling or clearing the "In Stock Only" toggle.
                </p>
                <button
                  onClick={handleResetFilters}
                  className="mt-5 inline-flex items-center gap-1.5 bg-slate-900 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              // Products Grid
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onQuickView={(p) => setSelectedProduct(p)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Quick Notice Banner on In-Store Pricing and Pickup */}
          <section className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 flex items-start sm:items-center gap-3">
            <AlertCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
            <div className="text-xs text-emerald-900 leading-relaxed">
              <span className="font-bold">Live Inventory Transparency:</span> Stock levels shown on this website are updated from our store checkout registers. For bulk orders or special batches, please contact our counter directly via WhatsApp.
            </div>
          </section>
        </main>

        {/* Footer */}
        <Footer
          onOpenStoreInfo={() => setIsStoreInfoOpen(true)}
          onRefreshCatalog={() => loadProducts(true)}
          isRefreshing={refreshing}
        />

        {/* Modals & Slide-over Drawers */}
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />

        <StoreInfoModal
          isOpen={isStoreInfoOpen}
          onClose={() => setIsStoreInfoOpen(false)}
        />

        <WhatsAppCart />
      </div>
    </CartProvider>
  );
}

export default App;
