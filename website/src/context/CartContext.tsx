import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Product } from '../types/product';
import { STORE_CONFIG } from '../config/storeConfig';

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addToCart: (product: Product, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  totalMrp: number;
  savings: number;
  generateWhatsAppLink: (customerName?: string, pickupTime?: string) => string;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = 'nexusmart_customer_cart_v1';

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);
  const toggleCart = () => setIsOpen((prev) => !prev);

  const addToCart = (product: Product, quantity: number = 1) => {
    if (product.stock <= 0) return;

    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.id === product.id);
      if (existingIndex > -1) {
        const currentQty = prev[existingIndex].quantity;
        const newQty = Math.min(product.stock, currentQty + quantity);
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], quantity: newQty };
        return updated;
      } else {
        const initialQty = Math.min(product.stock, quantity);
        return [...prev, { product, quantity: initialQty }];
      }
    });

    setIsOpen(true);
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setItems((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          const maxAllowed = Math.max(1, item.product.stock || 1);
          return { ...item, quantity: Math.min(quantity, maxAllowed) };
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const totalMrp = items.reduce((sum, item) => sum + (item.product.mrp || item.product.price) * item.quantity, 0);
  const savings = Math.max(0, totalMrp - subtotal);

  const generateWhatsAppLink = (customerName?: string, pickupTime?: string): string => {
    const lines: string[] = [];
    lines.push(`👋 *Hello ${STORE_CONFIG.name}!*`);
    lines.push(`I would like to check stock availability and reserve the following items:`);
    lines.push(``);

    items.forEach((item, index) => {
      const p = item.product;
      const unit = p.uom ? ` (${p.uom})` : '';
      lines.push(`${index + 1}. *${p.name}* x ${item.quantity}${unit} — ${STORE_CONFIG.features.currencySymbol}${p.price * item.quantity}`);
    });

    lines.push(``);
    lines.push(`*Estimated Total:* ${STORE_CONFIG.features.currencySymbol}${subtotal}`);
    if (savings > 0) {
      lines.push(`*Savings:* ${STORE_CONFIG.features.currencySymbol}${savings}`);
    }

    if (customerName?.trim()) {
      lines.push(`*Customer Name:* ${customerName.trim()}`);
    }
    if (pickupTime?.trim()) {
      lines.push(`*Estimated In-Store Pickup:* ${pickupTime.trim()}`);
    }

    lines.push(``);
    lines.push(`Please let me know if these are packed and ready for pickup. Thank you!`);

    const encoded = encodeURIComponent(lines.join('\n'));
    return `https://wa.me/${STORE_CONFIG.whatsappNumber}?text=${encoded}`;
  };

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        openCart,
        closeCart,
        toggleCart,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        totalItems,
        subtotal,
        totalMrp,
        savings,
        generateWhatsAppLink,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
