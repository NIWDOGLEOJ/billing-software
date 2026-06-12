import { useState, useRef, useEffect } from 'react';
import { Search, Trash2, Receipt, Settings, History, Scan, Check, CreditCard, Smartphone, Banknote, X, Edit2, Plus, Minus, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BillReceipt } from './bill-receipt';
import { SettingsModal } from './settings-modal';
import { BillHistoryModal } from './bill-history-modal';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';

interface Product {
  code: string;
  name: string;
  price: number;
  category: string;
  gstRate?: number;
}

interface BillItem {
  code: string;
  name: string;
  price: number;
  quantity: number;
  gstRate: number;
}

export interface ShopDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface SavedBill {
  billNumber: string;
  date: string;
  items: BillItem[];
  total: number;
  subtotal?: number;
  gstAmount?: number;
  cgst?: number;
  sgst?: number;
  gstRate?: number;
  gstEnabled?: boolean;
  cashierName: string;
  shopDetails: ShopDetails;
  customerName?: string;
  customerPhone?: string;
  paymentMode?: string;
  amountReceived?: number;
  changeAmount?: number;
}

const DEFAULT_PRODUCTS: Product[] = [
  { code: '1001', name: 'Milk 1L', price: 65, category: 'Dairy', gstRate: 5 },
  { code: '1002', name: 'Bread Loaf', price: 40, category: 'Bakery', gstRate: 5 },
  { code: '1003', name: 'Eggs (12 pack)', price: 80, category: 'Dairy', gstRate: 0 },
  { code: '1004', name: 'Rice 5kg', price: 250, category: 'Grains', gstRate: 5 },
  { code: '1005', name: 'Chicken Breast 1kg', price: 180, category: 'Meat', gstRate: 0 },
  { code: '1006', name: 'Tomatoes 1kg', price: 50, category: 'Produce', gstRate: 0 },
  { code: '1007', name: 'Bananas 1kg', price: 35, category: 'Produce', gstRate: 0 },
  { code: '1008', name: 'Coffee 500g', price: 200, category: 'Beverages', gstRate: 5 },
  { code: '1009', name: 'Butter 250g', price: 90, category: 'Dairy', gstRate: 12 },
  { code: '1010', name: 'Orange Juice 1L', price: 75, category: 'Beverages', gstRate: 12 },
  { code: '1011', name: 'Pasta 500g', price: 45, category: 'Grains', gstRate: 18 },
  { code: '1012', name: 'Cheese 200g', price: 120, category: 'Dairy', gstRate: 12 },
  { code: '1013', name: 'Yogurt 500g', price: 60, category: 'Dairy', gstRate: 5 },
  { code: '1014', name: 'Apples 1kg', price: 70, category: 'Produce', gstRate: 0 },
  { code: '1015', name: 'Potatoes 2kg', price: 80, category: 'Produce', gstRate: 0 },
  { code: '1016', name: 'Onions 1kg', price: 40, category: 'Produce', gstRate: 0 },
  { code: '1017', name: 'Cooking Oil 1L', price: 150, category: 'Pantry', gstRate: 5 },
  { code: '1018', name: 'Sugar 1kg', price: 50, category: 'Pantry', gstRate: 5 },
  { code: '1019', name: 'Salt 1kg', price: 25, category: 'Pantry', gstRate: 0 },
  { code: '1020', name: 'Tea Bags 100pk', price: 100, category: 'Beverages', gstRate: 5 },
];

export function CashierBilling() {
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('products');
    return saved ? JSON.parse(saved) : DEFAULT_PRODUCTS;
  });
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');
  const [recentlyAddedCode, setRecentlyAddedCode] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [tempQty, setTempQty] = useState('');
  const [currentBillNumber, setCurrentBillNumber] = useState('');
  const [gstEnabled, setGstEnabled] = useState(() => {
    const saved = localStorage.getItem('gstEnabled');
    return saved ? JSON.parse(saved) : true;
  });
  const [gstRate, setGstRate] = useState(() => {
    const saved = localStorage.getItem('gstRate');
    return saved ? parseFloat(saved) : 18;
  });
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'card'>('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [cashierName, setCashierName] = useState(() => {
    return localStorage.getItem('cashierName') || 'John Doe';
  });
  const [shopDetails, setShopDetails] = useState<ShopDetails>(() => {
    const saved = localStorage.getItem('shopDetails');
    return saved ? JSON.parse(saved) : {
      name: 'RETAIL SUPERMARKET',
      address: '123 Main Street, City, State 12345',
      phone: '(555) 123-4567',
      email: 'info@retailstore.com',
    };
  });
  const [billHistory, setBillHistory] = useState<SavedBill[]>(() => {
    const saved = localStorage.getItem('billHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter' && billItems.length > 0) {
        e.preventDefault();
        handlePrintBill();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [billItems, customerName, customerPhone, paymentMode, amountReceived]);

  // Save settings
  useEffect(() => {
    localStorage.setItem('products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('shopDetails', JSON.stringify(shopDetails));
  }, [shopDetails]);

  useEffect(() => {
    localStorage.setItem('cashierName', cashierName);
  }, [cashierName]);

  useEffect(() => {
    localStorage.setItem('gstEnabled', JSON.stringify(gstEnabled));
  }, [gstEnabled]);

  useEffect(() => {
    localStorage.setItem('gstRate', gstRate.toString());
  }, [gstRate]);

  useEffect(() => {
    localStorage.setItem('billHistory', JSON.stringify(billHistory));
  }, [billHistory]);

  const addItem = (product: Product) => {
    const itemGstRate = gstEnabled ? (product.gstRate || gstRate) : 0;
    
    setBillItems((prev) => {
      const existing = prev.find((item) => item.code === product.code);
      if (existing) {
        return prev.map((item) =>
          item.code === product.code
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1, gstRate: itemGstRate }];
    });
    setSearchQuery('');
    setError('');
    
    setRecentlyAddedCode(product.code);
    setTimeout(() => setRecentlyAddedCode(null), 1000);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    
    if (barcodeTimeoutRef.current) {
      clearTimeout(barcodeTimeoutRef.current);
    }

    barcodeTimeoutRef.current = setTimeout(() => {
      if (value && !value.includes(' ')) {
        const product = products.find((p) => p.code === value);
        if (product) {
          addItem(product);
        }
      }
    }, 100);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      const exactMatch = products.find((p) => p.code === searchQuery);
      if (exactMatch) {
        addItem(exactMatch);
        return;
      }

      if (filteredProducts.length === 1) {
        addItem(filteredProducts[0]);
      } else if (filteredProducts.length === 0) {
        setError(`No product found for "${searchQuery}"`);
        setTimeout(() => setError(''), 2000);
      }
    }
  };

  const updateQuantity = (code: string, quantity: number) => {
    if (quantity <= 0) {
      setBillItems((prev) => prev.filter((item) => item.code !== code));
    } else {
      setBillItems((prev) =>
        prev.map((item) => (item.code === code ? { ...item, quantity } : item))
      );
    }
  };

  const removeItem = (code: string) => {
    setBillItems((prev) => prev.filter((item) => item.code !== code));
  };

  const clearBill = () => {
    setBillItems([]);
    setSearchQuery('');
    setError('');
    setCurrentBillNumber('');
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const subtotal = billItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  
  let totalGst = 0;
  let cgst = 0;
  let sgst = 0;
  
  if (gstEnabled) {
    billItems.forEach(item => {
      const itemTotal = item.price * item.quantity;
      const itemGst = (itemTotal * item.gstRate) / 100;
      totalGst += itemGst;
    });
    cgst = totalGst / 2;
    sgst = totalGst / 2;
  }
  
  const total = subtotal + totalGst;
  
  const amountReceivedNum = parseFloat(amountReceived) || 0;
  const changeAmount = amountReceivedNum > total ? amountReceivedNum - total : 0;

  const generateBillNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const time = Date.now().toString().slice(-6);
    return `BILL-${year}${month}${day}-${time}`;
  };

  const handlePrintBill = () => {
    const billNumber = generateBillNumber();
    setCurrentBillNumber(billNumber);
    
    const newBill: SavedBill = {
      billNumber,
      date: new Date().toISOString(),
      items: billItems,
      total,
      subtotal,
      gstAmount: totalGst,
      cgst,
      sgst,
      gstRate,
      gstEnabled,
      cashierName,
      shopDetails,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      paymentMode,
      amountReceived: amountReceivedNum > 0 ? amountReceivedNum : undefined,
      changeAmount: changeAmount > 0 ? changeAmount : undefined,
    };
    
    setBillHistory((prev) => [newBill, ...prev]);
    setShowReceipt(true);
  };

  const handleNewBill = () => {
    setShowReceipt(false);
    clearBill();
    setCustomerName('');
    setCustomerPhone('');
    setAmountReceived('');
    setPaymentMode('cash');
  };

  const handleViewBill = (bill: SavedBill) => {
    setBillItems(bill.items);
    setCurrentBillNumber(bill.billNumber);
    setCustomerName(bill.customerName || '');
    setCustomerPhone(bill.customerPhone || '');
    setPaymentMode(bill.paymentMode as any || 'cash');
    setShowReceipt(true);
    setShowHistory(false);
  };

  const handleUpdateProducts = (newProducts: Product[]) => {
    setProducts(newProducts);
  };

  const handleUpdateShopDetails = (details: ShopDetails) => {
    setShopDetails(details);
  };

  const handleUpdateCashierName = (name: string) => {
    setCashierName(name);
  };

  const handleUpdateGstRate = (rate: number) => {
    setGstRate(rate);
  };

  const { user, isOnBreak } = useAuth();
  const { darkMode } = useTheme();

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-50 to-gray-100'} relative`}>
      {/* Break Overlay */}
      {user?.role === 'employee' && isOnBreak && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'} rounded-2xl shadow-2xl p-8 max-w-md mx-4 border`}
          >
            <div className="text-center">
              <div className={`inline-flex items-center justify-center w-16 h-16 ${darkMode ? 'bg-orange-900/30' : 'bg-orange-100'} rounded-full mb-4`}>
                <AlertCircle size={32} className="text-orange-500" />
              </div>
              <h3 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mb-2`}>
                Billing Disabled
              </h3>
              <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-6`}>
                You are currently on break. Please log back in to resume billing operations.
              </p>
              <div className={`${darkMode ? 'bg-orange-900/20 border-orange-800' : 'bg-orange-50 border-orange-200'} border rounded-lg p-4`}>
                <p className={`text-sm ${darkMode ? 'text-orange-400' : 'text-orange-700'}`}>
                  All billing functions are temporarily disabled during your break period.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Header */}
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b shadow-sm`}>
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{shopDetails.name}</h1>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>POS System • {cashierName}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* GST Toggle */}
              <button
                onClick={() => setGstEnabled(!gstEnabled)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  gstEnabled 
                    ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${gstEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="text-sm font-medium">GST {gstEnabled ? 'ON' : 'OFF'}</span>
              </button>
              
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg transition-colors"
              >
                <History size={18} />
                <span className="text-sm font-medium">History</span>
              </button>
              
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Settings size={18} />
                <span className="text-sm font-medium">Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Item Entry */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search Bar */}
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-50 rounded-lg">
                  <Scan size={20} className="text-green-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Quick Add Item</h3>
                  <p className="text-xs text-gray-500">Scan barcode or search by name/code</p>
                </div>
              </div>
              
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Scan or type to search..."
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white text-lg transition-all"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3"
                >
                  <p className="text-red-700 text-sm">{error}</p>
                </motion.div>
              )}

              {/* Search Results */}
              {searchQuery && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 border border-gray-200 rounded-lg max-h-64 overflow-y-auto"
                >
                  {filteredProducts.length > 0 ? (
                    filteredProducts.slice(0, 5).map((product) => (
                      <button
                        key={product.code}
                        onClick={() => addItem(product)}
                        className="w-full flex justify-between items-center p-3 hover:bg-blue-50 transition-colors border-b last:border-b-0 text-left"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-500">Code: {product.code}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-gray-900">₹{product.price.toFixed(2)}</p>
                          {gstEnabled && product.gstRate && product.gstRate > 0 && (
                            <p className="text-xs text-green-600">{product.gstRate}% GST</p>
                          )}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No results found
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>

            {/* Bill Items Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Current Bill</h3>
                  {billItems.length > 0 && (
                    <button
                      onClick={clearBill}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors text-sm"
                    >
                      <Trash2 size={14} />
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {billItems.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <Receipt size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500 font-medium mb-1">No items in cart</p>
                  <p className="text-sm text-gray-400">Search and add items to start billing</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Item Name</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">Quantity</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">Price</th>
                        {gstEnabled && (
                          <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">GST%</th>
                        )}
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider w-28">Line Total</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {billItems.map((item) => {
                          const lineTotal = item.price * item.quantity;
                          const lineGst = gstEnabled ? (lineTotal * item.gstRate) / 100 : 0;
                          const lineTotalWithGst = lineTotal + lineGst;
                          
                          return (
                            <motion.tr
                              key={item.code}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              className={`border-b hover:bg-gray-50 transition-colors ${
                                recentlyAddedCode === item.code ? 'bg-green-50' : ''
                              }`}
                            >
                              <td className="py-4 px-4">
                                <div>
                                  <p className="font-medium text-gray-900">{item.name}</p>
                                  <p className="text-xs text-gray-500">Code: {item.code}</p>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => updateQuantity(item.code, item.quantity - 1)}
                                    className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                  >
                                    <Minus size={14} />
                                  </button>
                                  
                                  {editingQty === item.code ? (
                                    <input
                                      type="number"
                                      value={tempQty}
                                      onChange={(e) => setTempQty(e.target.value)}
                                      onBlur={() => {
                                        const newQty = parseInt(tempQty) || 1;
                                        updateQuantity(item.code, newQty);
                                        setEditingQty(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const newQty = parseInt(tempQty) || 1;
                                          updateQuantity(item.code, newQty);
                                          setEditingQty(null);
                                        }
                                      }}
                                      className="w-14 text-center px-2 py-1 border-2 border-blue-500 rounded font-semibold"
                                      autoFocus
                                    />
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setEditingQty(item.code);
                                        setTempQty(item.quantity.toString());
                                      }}
                                      className="w-14 text-center px-2 py-1 font-semibold text-gray-900 hover:bg-gray-100 rounded"
                                    >
                                      {item.quantity}
                                    </button>
                                  )}
                                  
                                  <button
                                    onClick={() => updateQuantity(item.code, item.quantity + 1)}
                                    className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-right">
                                <span className="text-gray-900 font-medium">₹{item.price.toFixed(2)}</span>
                              </td>
                              {gstEnabled && (
                                <td className="py-4 px-4 text-center">
                                  <span className="inline-flex items-center px-2 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded">
                                    {item.gstRate}%
                                  </span>
                                </td>
                              )}
                              <td className="py-4 px-4 text-right">
                                <div>
                                  <p className="text-lg font-bold text-gray-900">₹{lineTotalWithGst.toFixed(2)}</p>
                                  {gstEnabled && lineGst > 0 && (
                                    <p className="text-xs text-gray-500">+₹{lineGst.toFixed(2)} GST</p>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center">
                                <button
                                  onClick={() => removeItem(item.code)}
                                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right: Bill Summary & Payment */}
          <div className="space-y-4">
            {/* Customer Details */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
            >
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Customer Details (Optional)</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer Name"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                />
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone Number"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
            </motion.div>

            {/* Bill Summary */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b">
                <h3 className="text-lg font-bold text-gray-900">Bill Summary</h3>
              </div>
              
              <div className="p-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Items</span>
                  <span className="font-medium text-gray-900">
                    {billItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-semibold text-gray-900">₹{subtotal.toFixed(2)}</span>
                </div>

                {gstEnabled && totalGst > 0 && (
                  <>
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">CGST</span>
                        <span className="font-medium text-green-600">₹{cgst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">SGST</span>
                        <span className="font-medium text-green-600">₹{sgst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span className="text-gray-700">Total GST</span>
                        <span className="text-green-600">₹{totalGst.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="border-t-2 border-gray-200 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">Grand Total</span>
                    <span className="text-3xl font-bold text-blue-600">₹{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Payment Section */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
            >
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment Mode</h3>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <button
                  onClick={() => setPaymentMode('cash')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                    paymentMode === 'cash'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Banknote size={20} />
                  <span className="text-xs font-medium">Cash</span>
                </button>
                <button
                  onClick={() => setPaymentMode('upi')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                    paymentMode === 'upi'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Smartphone size={20} />
                  <span className="text-xs font-medium">UPI</span>
                </button>
                <button
                  onClick={() => setPaymentMode('card')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                    paymentMode === 'card'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CreditCard size={20} />
                  <span className="text-xs font-medium">Card</span>
                </button>
              </div>

              {paymentMode === 'cash' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount Received</label>
                    <input
                      type="number"
                      step="0.01"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  
                  {amountReceivedNum >= total && changeAmount > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-green-50 border border-green-200 rounded-lg p-3"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-green-700">Change</span>
                        <span className="text-lg font-bold text-green-700">₹{changeAmount.toFixed(2)}</span>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </motion.div>

            {/* Generate Bill Button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={handlePrintBill}
              disabled={billItems.length === 0}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg disabled:shadow-none flex items-center justify-center gap-2 text-lg"
            >
              <Receipt size={22} />
              Generate Bill
              <span className="text-xs opacity-80">(Ctrl + Enter)</span>
            </motion.button>

            <p className="text-xs text-center text-gray-500">
              Press Ctrl + Enter to quickly generate bill
            </p>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showReceipt && (
        <BillReceipt
          items={billItems}
          total={total}
          subtotal={subtotal}
          gstAmount={totalGst}
          cgst={cgst}
          sgst={sgst}
          gstRate={gstRate}
          gstEnabled={gstEnabled}
          shopDetails={shopDetails}
          cashierName={cashierName}
          billNumber={currentBillNumber}
          customerName={customerName}
          customerPhone={customerPhone}
          paymentMode={paymentMode}
          amountReceived={amountReceivedNum}
          changeAmount={changeAmount}
          onClose={handleNewBill}
        />
      )}

      {showSettings && (
        <SettingsModal
          products={products}
          shopDetails={shopDetails}
          cashierName={cashierName}
          gstRate={gstRate}
          onUpdateProducts={handleUpdateProducts}
          onUpdateShopDetails={handleUpdateShopDetails}
          onUpdateCashierName={handleUpdateCashierName}
          onUpdateGstRate={handleUpdateGstRate}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showHistory && (
        <BillHistoryModal
          billHistory={billHistory}
          onViewBill={handleViewBill}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}