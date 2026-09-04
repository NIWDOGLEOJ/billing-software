import React from 'react';
import { Sparkles, CheckCircle2, MessageCircle, MapPin, Zap } from 'lucide-react';
import { STORE_CONFIG } from '../config/storeConfig';

interface HeroProps {
  totalProductsCount: number;
  inStockCount: number;
  onOpenStoreInfo: () => void;
  onSelectCategory: (cat: string) => void;
}

export const Hero: React.FC<HeroProps> = ({
  totalProductsCount,
  inStockCount,
  onOpenStoreInfo,
  onSelectCategory,
}) => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-emerald-900 via-slate-900 to-slate-950 text-white pt-10 pb-12 px-4 sm:px-6">
      {/* Subtle background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-64 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />

      <div className="relative max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
          {/* Left Column: Headline & Value Prop */}
          <div className="max-w-2xl text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Live In-Store Stock Lookup
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Check product availability{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300">
                before you step out.
              </span>
            </h2>

            <p className="mt-3.5 text-slate-300 text-sm sm:text-base leading-relaxed">
              Never make an empty trip. Our live online catalog connects with the store inventory so you always know what’s on our shelves, current prices, and instant in-store pickup options.
            </p>

            {/* CTAs */}
            <div className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-3">
              <a
                href={`https://wa.me/${STORE_CONFIG.whatsappNumber}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/25 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 fill-slate-950" />
                Chat on WhatsApp
              </a>

              <button
                onClick={onOpenStoreInfo}
                className="inline-flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-all cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-emerald-400" />
                Find Store & Timings
              </button>
            </div>

            {/* Quick popular category jump */}
            <div className="mt-5 flex flex-wrap items-center justify-center lg:justify-start gap-2 text-xs text-slate-400">
              <span className="font-medium text-slate-300">Quick browse:</span>
              {['Dairy & Eggs', 'Staples & Grains', 'Beverages', 'Snacks & Munchies'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => onSelectCategory(cat)}
                  className="bg-slate-800/60 hover:bg-slate-700 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700/60 transition-colors cursor-pointer"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Live Store Metric Cards */}
          <div className="w-full lg:w-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 max-w-md">
            {/* Card 1: Stock Counter */}
            <div className="bg-slate-800/60 backdrop-blur-md border border-slate-700/70 p-4 rounded-2xl flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-white">{inStockCount}</span>
                  <span className="text-xs text-emerald-400 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/50">
                    Ready on Shelves
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  of {totalProductsCount} catalog items currently in stock today
                </p>
              </div>
            </div>

            {/* Card 2: Pickup Promise */}
            <div className="bg-slate-800/60 backdrop-blur-md border border-slate-700/70 p-4 rounded-2xl flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <span className="text-sm font-bold text-white">
                  15-Minute Counter Pickup
                </span>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select items, reserve via WhatsApp, and pick up ready bags at our express counter.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
