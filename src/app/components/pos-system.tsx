import { useState } from 'react';
import { ProductCatalog } from './product-catalog';
import { Cart } from './cart';
import { PaymentModal } from './payment-modal';

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
}

export interface CartItem extends Product {
  quantity: number;
}

const SAMPLE_PRODUCTS: Product[] = [
  { id: '1', name: 'Milk', price: 3.99, category: 'Dairy', stock: 50 },
  { id: '2', name: 'Bread', price: 2.49, category: 'Bakery', stock: 30 },
  { id: '3', name: 'Eggs (12)', price: 4.99, category: 'Dairy', stock: 40 },
  { id: '4', name: 'Rice (5kg)', price: 12.99, category: 'Grains', stock: 25 },
  { id: '5', name: 'Chicken Breast', price: 8.99, category: 'Meat', stock: 20 },
  { id: '6', name: 'Tomatoes', price: 2.99, category: 'Produce', stock: 60 },
  { id: '7', name: 'Bananas', price: 1.99, category: 'Produce', stock: 70 },
  { id: '8', name: 'Coffee', price: 9.99, category: 'Beverages', stock: 15 },
  { id: '9', name: 'Butter', price: 5.49, category: 'Dairy', stock: 35 },
  { id: '10', name: 'Orange Juice', price: 4.49, category: 'Beverages', stock: 28 },
  { id: '11', name: 'Pasta', price: 2.79, category: 'Grains', stock: 45 },
  { id: '12', name: 'Cheese', price: 6.99, category: 'Dairy', stock: 30 },
];

export function POSSystem() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showPayment, setShowPayment] = useState(false);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity < product.stock) {
          return prev.map((item) =>
            item.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }
        return prev;
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.id !== id));
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, quantity } : item
        )
      );
    }
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
  };

  const handleCheckout = () => {
    if (cart.length > 0) {
      setShowPayment(true);
    }
  };

  const handlePaymentComplete = () => {
    setShowPayment(false);
    clearCart();
  };

  return (
    <div className="flex h-screen">
      {/* Product Catalog - Left Side */}
      <div className="flex-1 overflow-y-auto border-r">
        <ProductCatalog products={SAMPLE_PRODUCTS} onAddToCart={addToCart} />
      </div>

      {/* Cart - Right Side */}
      <div className="w-96 flex flex-col">
        <Cart
          items={cart}
          onUpdateQuantity={updateQuantity}
          onRemoveItem={removeFromCart}
          onClearCart={clearCart}
          onCheckout={handleCheckout}
        />
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          cart={cart}
          onClose={() => setShowPayment(false)}
          onComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
}
