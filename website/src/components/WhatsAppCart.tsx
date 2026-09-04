import React, { useState } from 'react';
import { X, Trash2, ShoppingBag, MessageCircle, Clock, User, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { STORE_CONFIG } from '../config/storeConfig';

export const WhatsAppCart: React.FC = () => {
  const {
    items,
    isOpen,
    closeCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    subtotal,
    savings,
    generateWhatsAppLink,
  } = useCart();

  const [customerName, setCustomerName] = useState('');
  const [pickupTime, setPickupTime] = useState('');

  if (!isOpen) return null;

  const currency = STORE_CONFIG.features.currencySymbol;

  const handleSendOrder = () => {
    const url = generateWhatsAppLink(customerName, pickupTime);
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity"
        onClick={closeCart}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold">Reserve & In-Store Order</h3>
                <p className="text-xs text-slate-400">
                  {items.length} {items.length === 1 ? 'item' : 'items'} in your list
                </p>
              </div>
            </div>

            <button
              onClick={closeCart}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Content */}
          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-800">Your reservation list is empty</h4>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                Browse our live in-store catalog and add items you'd like to reserve or check availability for.
              </p>
              <button
                onClick={closeCart}
                className="mt-5 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer"
              >
                Browse Catalog
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              {/* Scrollable list of items */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 divide-y divide-slate-100">
                {items.map(({ product, quantity }) => {
                  const lineTotal = product.price * quantity;
                  const maxAllowed = Math.max(1, product.stock);

                  return (
                    <div key={product.id} className="pt-3 first:pt-0 flex gap-3 items-center">
                      {/* Thumbnail */}
                      <div className="w-14 h-14 rounded-xl bg-slate-100 shrink-0 overflow-hidden relative">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-bold">
                            {product.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 truncate" title={product.name}>
                          {product.name}
                        </h4>
                        <div className="text-[11px] text-slate-500">
                          {currency}{product.price} {product.uom ? `• ${product.uom}` : ''}
                        </div>

                        {/* Quantity adjust */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                            <button
                              onClick={() => updateQuantity(product.id, quantity - 1)}
                              className="w-6 h-6 text-slate-600 hover:bg-slate-200 rounded-l-lg text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-xs font-bold text-slate-800">
                              {quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(product.id, quantity + 1)}
                              disabled={quantity >= maxAllowed}
                              className={`w-6 h-6 text-slate-600 rounded-r-lg text-xs font-bold flex items-center justify-center transition-colors ${
                                quantity >= maxAllowed
                                  ? 'opacity-40 cursor-not-allowed'
                                  : 'hover:bg-slate-200 cursor-pointer'
                              }`}
                            >
                              +
                            </button>
                          </div>

                          <span className="text-[10px] text-slate-400">
                            (max {maxAllowed})
                          </span>

                          <button
                            onClick={() => removeFromCart(product.id)}
                            className="ml-auto p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Line total */}
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-slate-900">
                          {currency}{lineTotal}
                        </span>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-3 text-right">
                  <button
                    onClick={clearCart}
                    className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                  >
                    Clear all items
                  </button>
                </div>
              </div>

              {/* Order Meta Inputs (Name & Expected pickup) */}
              <div className="p-4 bg-slate-50 border-t border-slate-200/80 space-y-2.5">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your Name (optional)"
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    placeholder="Estimated Pickup (e.g. Today 6:00 PM)"
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Drawer Footer & Checkout Action */}
              <div className="p-4 sm:p-5 bg-white border-t border-slate-200">
                <div className="space-y-1.5 mb-4 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Estimated Subtotal</span>
                    <span className="font-semibold text-slate-800">{currency}{subtotal}</span>
                  </div>
                  {savings > 0 && (
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Total Savings vs MRP</span>
                      <span>-{currency}{savings}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-baseline">
                    <span className="text-sm font-bold text-slate-900">Total Payable at Counter</span>
                    <span className="text-lg font-black text-emerald-700">
                      {currency}{subtotal}
                    </span>
                  </div>
                </div>

                {/* Primary Action Button */}
                <button
                  onClick={handleSendOrder}
                  className="w-full bg-[#25D366] hover:bg-[#20bd5a] active:bg-[#1caa51] text-slate-950 font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-[#25D366]/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5 fill-slate-950" />
                  Send Reservation on WhatsApp
                </button>

                <p className="mt-2 text-[10px] text-center text-slate-400">
                  No online payment needed. Collect and pay at our store counter.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
