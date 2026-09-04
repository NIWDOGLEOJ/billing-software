import React from 'react';
import { Store, ShoppingBag, Search, Clock, MapPin, X } from 'lucide-react';
import { STORE_CONFIG } from '../config/storeConfig';
import { useCart } from '../context/CartContext';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenStoreInfo: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  searchQuery,
  onSearchChange,
  onOpenStoreInfo,
}) => {
  const { totalItems, subtotal, toggleCart } = useCart();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs transition-all">
      {/* Top micro-bar: store hours and location */}
      <div className="bg-slate-900 text-slate-300 text-xs py-1.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              {STORE_CONFIG.openingHours.statusText}
            </span>
            <span className="hidden md:inline-block text-slate-400">•</span>
            <span className="hidden md:flex items-center gap-1 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Weekdays: {STORE_CONFIG.openingHours.weekdays}
            </span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onOpenStoreInfo}
              className="flex items-center gap-1 hover:text-white transition-colors text-xs font-medium cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Store Location & Contact</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main navigation bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between gap-3 sm:gap-6">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl font-black tracking-tight text-slate-900">
                  {STORE_CONFIG.name}
                </h1>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wide">
                  Live Stock
                </span>
              </div>
              <p className="hidden sm:block text-xs text-slate-500 font-medium">
                {STORE_CONFIG.tagline}
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-xl mx-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search products by name, brand, or SKU..."
                className="w-full pl-10 pr-9 py-2 text-sm bg-slate-100/80 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-emerald-500 rounded-xl outline-hidden transition-all text-slate-800 placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Action buttons: Cart / WhatsApp reservation bag */}
          <div className="flex items-center gap-2.5 shrink-0">
            {STORE_CONFIG.features.enableWhatsAppOrder && (
              <button
                onClick={toggleCart}
                className="relative flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-3.5 py-2 rounded-xl font-semibold text-sm transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <div className="relative">
                  <ShoppingBag className="w-4 h-4" />
                  {totalItems > 0 && (
                    <span className="absolute -top-2 -right-2 bg-amber-400 text-slate-950 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                      {totalItems}
                    </span>
                  )}
                </div>
                <span className="hidden md:inline">
                  {totalItems > 0
                    ? `${STORE_CONFIG.features.currencySymbol}${subtotal}`
                    : 'Order List'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
