import { useState } from 'react';
import { Search, Package } from 'lucide-react';
import { Product } from './pos-system';

interface ProductCatalogProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

export function ProductCatalog({ products, onAddToCart }: ProductCatalogProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category)))];

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">NexusFlow System</h1>
        
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredProducts.map((product) => (
          <button
            key={product.id}
            onClick={() => onAddToCart(product)}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow text-left"
          >
            <div className="flex items-center justify-center h-24 mb-3 bg-gray-100 rounded-lg">
              <Package size={32} className="text-gray-400" />
            </div>
            <h3 className="font-semibold text-sm mb-1">{product.name}</h3>
            <p className="text-blue-600 font-bold text-lg">${product.price.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">
              Stock: {product.stock} {product.stock < 10 && <span className="text-orange-500">Low</span>}
            </p>
          </button>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Package size={48} className="mx-auto mb-4 opacity-50" />
          <p>No products found</p>
        </div>
      )}
    </div>
  );
}
