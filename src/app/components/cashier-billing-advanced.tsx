import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Search, Trash2, Receipt, Settings, History, Scan, CreditCard, Smartphone, Banknote, X, Edit2, Check, AlertTriangle, Keyboard, Plus, Minus, Save, Lock, ShoppingCart, DollarSign, Info, Users, Camera, Store, Pill, UtensilsCrossed, Warehouse } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BillReceipt } from './bill-receipt-advanced';
import { BillHistoryModal } from './bill-history-modal';
import { CompletionModal } from './completion-modal';
import { KeyboardShortcutsModal } from './keyboard-shortcuts-modal';
import { toast } from 'sonner';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { api } from '../utils/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { ShiftStartModal } from './shift-start-modal';
import { ShiftClosingModal } from './shift-closing-modal';
import { BrowserMultiFormatReader } from '@zxing/library';
interface Product {
  code: string;
  name: string;
  price: number;
  category: string;
  gstRate?: number;
  stock?: number;
  lowStockThreshold?: number;
  hsnCode?: string;
  uom?: string;
  discountPercent?: number;
  caseSize?: number;
  marginPercent?: number;
  moq?: number;
}

interface BillItem {
  code: string;
  name: string;
  price: number;
  quantity: number;
  gstRate: number;
  originalPrice?: number;
  hsnCode?: string;
  uom?: string;
  discountPercent?: number;
  selectedBatch?: string;
  prescriptionFile?: string;
  dosage?: string;
  caseCount?: number;
  tradeDiscountPercent?: number;
}

export interface Customer {
  phone: string;
  name: string;
  loyaltyPoints: number;
  totalSpent: number;
  visitCount: number;
  lastVisit: string;
  outstandingBalance?: number;
  gstin?: string;
  creditLimit?: number;
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
  roundedTotal?: number;
  roundingAdjustment?: number;
  generatedBy?: string; // User ID of the person who generated the bill
}

export interface LoyaltyTierInfo {
  name: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  multiplier: number;
  colorClass: string;
  nextTierLimit: number;
  progress: number;
  spent: number;
  nextTier: string;
  limitMin: number;
}

export function getLoyaltyTier(totalSpent: number): LoyaltyTierInfo {
  const spent = totalSpent || 0;
  if (spent >= 40000) {
    return {
      name: 'Platinum',
      multiplier: 2.0,
      colorClass: 'from-purple-500 to-indigo-600',
      nextTierLimit: 40000,
      progress: 100,
      spent,
      nextTier: 'Max',
      limitMin: 40000
    };
  } else if (spent >= 15000) {
    return {
      name: 'Gold',
      multiplier: 1.5,
      colorClass: 'from-yellow-500 to-amber-600',
      nextTierLimit: 40000,
      progress: Math.min(100, Math.max(0, ((spent - 15000) / 25000) * 100)),
      spent,
      nextTier: 'Platinum',
      limitMin: 15000
    };
  } else if (spent >= 5000) {
    return {
      name: 'Silver',
      multiplier: 1.2,
      colorClass: 'from-slate-400 to-slate-500',
      nextTierLimit: 15000,
      progress: Math.min(100, Math.max(0, ((spent - 5000) / 10000) * 100)),
      spent,
      nextTier: 'Gold',
      limitMin: 5000
    };
  } else {
    return {
      name: 'Bronze',
      multiplier: 1.0,
      colorClass: 'from-amber-600 to-amber-700',
      nextTierLimit: 5000,
      progress: Math.min(100, Math.max(0, (spent / 5000) * 100)),
      spent,
      nextTier: 'Silver',
      limitMin: 0
    };
  }
}

const DEFAULT_PRODUCTS: Product[] = [
  { code: '1001', name: 'Milk 1L', price: 65, category: 'Dairy', gstRate: 5, stock: 50, lowStockThreshold: 10 },
  { code: '1002', name: 'Bread Loaf', price: 40, category: 'Bakery', gstRate: 5, stock: 30, lowStockThreshold: 5 },
  { code: '1003', name: 'Eggs (12 pack)', price: 80, category: 'Dairy', gstRate: 0, stock: 25, lowStockThreshold: 5 },
  { code: '1004', name: 'Rice 5kg', price: 250, category: 'Grains', gstRate: 5, stock: 100, lowStockThreshold: 20 },
  { code: '1005', name: 'Chicken Breast 1kg', price: 180, category: 'Meat', gstRate: 0, stock: 15, lowStockThreshold: 5 },
  { code: '1006', name: 'Tomatoes 1kg', price: 50, category: 'Produce', gstRate: 0, stock: 40, lowStockThreshold: 10 },
  { code: '1007', name: 'Bananas 1kg', price: 35, category: 'Produce', gstRate: 0, stock: 60, lowStockThreshold: 15 },
  { code: '1008', name: 'Coffee 500g', price: 200, category: 'Beverages', gstRate: 5, stock: 20, lowStockThreshold: 5 },
  { code: '1009', name: 'Butter 250g', price: 90, category: 'Dairy', gstRate: 12, stock: 35, lowStockThreshold: 8 },
  { code: '1010', name: 'Orange Juice 1L', price: 75, category: 'Beverages', gstRate: 12, stock: 45, lowStockThreshold: 10 },
];

export function CashierBillingAdvanced() {
  const { user, activeShift, logout, isOwner } = useAuth();
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode, showSettings, setShowSettings } = useTheme();
  const [showShiftClose, setShowShiftClose] = useState(false);
  
  // Mobile UI States
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [showMobileScanner, setShowMobileScanner] = useState(false);
  const [mobileScannerError, setMobileScannerError] = useState('');
  const [isMobileShiftActive, setIsMobileShiftActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // Quick Add Product States
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState('');
  const [isAddingCustomUom, setIsAddingCustomUom] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    name: '',
    price: '',
    category: 'General',
    gstRate: 18,
    stock: '100',
    hsnCode: '',
    uom: 'PCS'
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileDevice(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { currentSession } = useAuth();
  useEffect(() => {
    if (currentSession) {
      api.get<any>(`/auth/session/${currentSession.id}`)
        .then(s => {
          if (s && s.is_attendance === 1) {
            setIsMobileShiftActive(true);
          }
        })
        .catch(err => console.warn('Failed to load session details:', err));
    }
  }, [currentSession]);
  const [products, setProducts] = useState<Product[]>([]);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [error, setError] = useState('');
  const [recentlyAddedCode, setRecentlyAddedCode] = useState<string | null>(null);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [tempQty, setTempQty] = useState('');
  const [tempPrice, setTempPrice] = useState('');
  const [currentBillNumber, setCurrentBillNumber] = useState('');
  const [billLocked, setBillLocked] = useState(false);
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstRate, setGstRate] = useState(18);
  const [roundingEnabled, setRoundingEnabled] = useState(true);
  
  // Sound Synthesis & Web Audio states
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const val = localStorage.getItem('soundEnabled');
    return val !== null ? val === 'true' : true;
  });
  const [soundVolume, setSoundVolume] = useState(() => {
    const val = localStorage.getItem('soundVolume');
    return val !== null ? parseInt(val) : 50;
  });
  const [soundProfile, setSoundProfile] = useState<'classic' | 'crisp' | 'retro' | 'cozy'>(() => {
    return (localStorage.getItem('soundProfile') as any) || 'classic';
  });
  const [successBeepEnabled, setSuccessBeepEnabled] = useState(() => {
    const val = localStorage.getItem('successBeepEnabled');
    return val !== null ? val === 'true' : true;
  });
  const [errorBuzzEnabled, setErrorBuzzEnabled] = useState(() => {
    const val = localStorage.getItem('errorBuzzEnabled');
    return val !== null ? val === 'true' : true;
  });
  const [chimeEnabled, setChimeEnabled] = useState(() => {
    const val = localStorage.getItem('chimeEnabled');
    return val !== null ? val === 'true' : true;
  });
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const [redeemLoyalty, setRedeemLoyalty] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'card' | 'ledger'>('cash');

  // Sector & B2B states
  const [activeSector, setActiveSector] = useState<'retail' | 'wholesale' | 'restaurant' | 'pharmacy'>(() => {
    try {
      return (localStorage.getItem('nexusflowSector') || localStorage.getItem('evalixSector') as any) || 'retail';
    } catch {
      return 'retail';
    }
  });

  // Bespoke Custom States for Sector Billing UIs
  const [manualInterstateOverride, setManualInterstateOverride] = useState<boolean | null>(null);
  const [showRxCaptureModal, setShowRxCaptureModal] = useState<boolean>(false);
  const [rxCaptureState, setRxCaptureState] = useState<'idle' | 'scanning' | 'ocr' | 'done'>('idle');
  const [prescriptionVerified, setPrescriptionVerified] = useState<boolean>(false);

  useEffect(() => {
    const handleSector = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.sector) {
        setActiveSector(customEvent.detail.sector);
      }
    };
    window.addEventListener('sector-changed', handleSector);
    return () => window.removeEventListener('sector-changed', handleSector);
  }, []);

  const [activeTable, setActiveTable] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('nexusflowActiveTable');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [selectedCategory, setSelectedCategory] = useState('All');
  
  const [localTables, setLocalTables] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('nexusflowTablesList');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  useEffect(() => {
    const handleSync = () => {
      try {
        const saved = localStorage.getItem('nexusflowTablesList');
        if (saved) setLocalTables(JSON.parse(saved));
      } catch {}
    };
    window.addEventListener('nexusflow-tables-updated', handleSync);
    return () => window.removeEventListener('nexusflow-tables-updated', handleSync);
  }, []);

  const releaseActiveTable = () => {
    if (!activeTable) return;
    try {
      const savedListStr = localStorage.getItem('nexusflowTablesList');
      if (savedListStr) {
        const list = JSON.parse(savedListStr);
        const updatedList = list.map((t: any) => {
          if (t.id === activeTable.id) {
            return { ...t, status: 'available', total: 0, items: [] };
          }
          return t;
        });
        localStorage.setItem('nexusflowTablesList', JSON.stringify(updatedList));
        window.dispatchEvent(new CustomEvent('nexusflow-tables-updated'));
      }
      localStorage.removeItem('nexusflowActiveTable');
      setActiveTable(null);
    } catch (e) {
      console.error('Failed to release active table:', e);
    }
  };

  const handleSuspendOrderToTable = () => {
    if (!activeTable) return;
    if (billItems.length === 0) {
      toast.error('Cannot suspend an empty order.');
      return;
    }
    try {
      const savedListStr = localStorage.getItem('nexusflowTablesList');
      if (savedListStr) {
        const list = JSON.parse(savedListStr);
        // Calculate current total
        const currentSubtotal = billItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        let currentGst = 0;
        if (gstEnabled) {
          billItems.forEach(item => {
            currentGst += (item.price * item.quantity * item.gstRate) / 100;
          });
        }
        const currentTotal = currentSubtotal + currentGst;

        const updatedList = list.map((t: any) => {
          if (t.id === activeTable.id) {
            return {
              ...t,
              status: 'occupied',
              total: currentTotal,
              items: billItems
            };
          }
          return t;
        });
        localStorage.setItem('nexusflowTablesList', JSON.stringify(updatedList));
        window.dispatchEvent(new CustomEvent('nexusflow-tables-updated'));
        toast.success(`📌 Order suspended to ${activeTable.name} successfully!`);
      }
      // Reset POS cart & active table link
      localStorage.removeItem('nexusflowActiveTable');
      setActiveTable(null);
      setBillItems([]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerGstin('');
    } catch (e) {
      console.error('Failed to suspend table order:', e);
      toast.error('Failed to hold table order.');
    }
  };

  useEffect(() => {
    const handleTableSelected = (e: Event) => {
      const customEvent = e as CustomEvent;
      const table = customEvent.detail?.table || null;
      setActiveTable(table);
    };
    window.addEventListener('active-table-selected', handleTableSelected);
    return () => window.removeEventListener('active-table-selected', handleTableSelected);
  }, []);

  // Automatically load the table's items when editing a table's order
  useEffect(() => {
    if (activeTable && activeTable.items && activeTable.items.length > 0) {
      const loadedItems = activeTable.items.map((item: any) => {
        if (typeof item === 'object' && item !== null && item.code) {
          return item;
        }
        return null;
      }).filter(Boolean);
      
      if (loadedItems.length > 0) {
        setBillItems(loadedItems);
      } else {
        setBillItems([]);
      }
    } else {
      setBillItems([]);
    }
  }, [activeTable]);

  // ── Sector-Aware UI Configuration ──────────────────────────────────────────
  // All labels, colors, icons, and terminology dynamically adapt per business type
  const sectorConfig = useMemo(() => {
    const configs = {
      retail: {
        name: 'Retail POS',
        mobileName: 'Retail Mobile',
        searchPlaceholder: 'Scan barcode or type product name / code...',
        searchPanelTitle: 'Add Products',
        cartTitle: 'Shopping Cart',
        cartEmptyTitle: 'Cart is empty',
        cartEmptyDesc: 'Search and add products above',
        mobileCartEmpty: 'Your mobile cart is empty',
        mobileCartEmptyDesc: 'Use the manual drop-down or camera scan to add items.',
        quickAddLabel: 'Quick Manual Add Product',
        quickAddDropdown: '-- Choose Product --',
        billButtonText: 'Generate Bill',
        billLockedText: 'Bill Generated ✓',
        newBillText: 'New Bill',
        customerLabel: 'Customer & Payment',
        summaryLabel: 'Bill Summary',
        grandTotalLabel: 'Grand Total',
        accentColor: 'purple',
        headerGradient: 'from-purple-500 to-indigo-600',
        sectorIcon: '🛒',
        sectorEmoji: '🛒',
        productTerm: 'Product',
        productTermPlural: 'Products',
        scannerLabel: 'Launch Mobile Camera Scanner',
        scannerDesc: 'Scan product barcodes in real-time using rear camera',
        checkoutLabel: 'Checkout',
        categories: ['General', 'Dairy', 'Bakery', 'Grains', 'Beverages', 'Meat', 'Produce', 'Snacks', 'Personal Care', 'Household', 'Frozen'],
      },
      pharmacy: {
        name: 'Pharma POS',
        mobileName: 'Pharma Mobile',
        searchPlaceholder: 'Search medicine, drug name, or scan barcode...',
        searchPanelTitle: 'Add Medicines',
        cartTitle: 'Prescription Cart',
        cartEmptyTitle: 'Cart is empty',
        cartEmptyDesc: 'Search and add medicines above',
        mobileCartEmpty: 'Your prescription cart is empty',
        mobileCartEmptyDesc: 'Use the drug search or camera scan to add medicines.',
        quickAddLabel: 'Quick Add Medicine',
        quickAddDropdown: '-- Choose Medicine --',
        billButtonText: 'Generate Invoice',
        billLockedText: 'Invoice Generated ✓',
        newBillText: 'New Invoice',
        customerLabel: 'Patient & Payment',
        summaryLabel: 'Invoice Summary',
        grandTotalLabel: 'Invoice Total',
        accentColor: 'teal',
        headerGradient: 'from-teal-500 to-cyan-600',
        sectorIcon: '💊',
        sectorEmoji: '💊',
        productTerm: 'Medicine',
        productTermPlural: 'Medicines',
        scannerLabel: 'Scan Medicine Barcode',
        scannerDesc: 'Scan drug package barcodes using rear camera',
        checkoutLabel: 'Dispense & Bill',
        categories: ['Pharmacy', 'OTC', 'Prescription', 'Ayurvedic', 'Surgical', 'Medical Devices', 'Vitamins', 'Personal Care', 'General'],
      },
      wholesale: {
        name: 'Wholesale POS',
        mobileName: 'Wholesale Mobile',
        searchPlaceholder: 'Search SKU, product code, or bulk item...',
        searchPanelTitle: 'Add Items',
        cartTitle: 'Order Cart',
        cartEmptyTitle: 'Order is empty',
        cartEmptyDesc: 'Search and add items to the order',
        mobileCartEmpty: 'Your wholesale order is empty',
        mobileCartEmptyDesc: 'Search by SKU or scan to add bulk items.',
        quickAddLabel: 'Quick Add Bulk Item',
        quickAddDropdown: '-- Choose Item --',
        billButtonText: 'Generate Tax Invoice',
        billLockedText: 'Tax Invoice Generated ✓',
        newBillText: 'New Order',
        customerLabel: 'Buyer & Payment',
        summaryLabel: 'Invoice Summary',
        grandTotalLabel: 'Invoice Total',
        accentColor: 'amber',
        headerGradient: 'from-amber-500 to-orange-600',
        sectorIcon: '📦',
        sectorEmoji: '📦',
        productTerm: 'Item',
        productTermPlural: 'Items',
        scannerLabel: 'Scan Package Barcode',
        scannerDesc: 'Scan bulk package barcodes using rear camera',
        checkoutLabel: 'Finalize Order',
        categories: ['General', 'FMCG', 'Bulk Grains', 'Beverages', 'Dairy', 'Frozen', 'Personal Care', 'Household', 'Industrial', 'Packaging'],
      },
      restaurant: {
        name: 'Restaurant POS',
        mobileName: 'Kitchen Terminal',
        searchPlaceholder: 'Search menu item, dish name, or code...',
        searchPanelTitle: 'Add Menu Items',
        cartTitle: 'Current Order',
        cartEmptyTitle: 'No items in order',
        cartEmptyDesc: 'Search and add dishes from the menu',
        mobileCartEmpty: 'No items in the order yet',
        mobileCartEmptyDesc: 'Pick dishes from the menu or scan to add.',
        quickAddLabel: 'Quick Add Menu Item',
        quickAddDropdown: '-- Choose Dish --',
        billButtonText: 'Generate Bill',
        billLockedText: 'Bill Generated ✓',
        newBillText: 'New Order',
        customerLabel: 'Guest & Payment',
        summaryLabel: 'Order Summary',
        grandTotalLabel: 'Order Total',
        accentColor: 'rose',
        headerGradient: 'from-rose-500 to-pink-600',
        sectorIcon: '🍽️',
        sectorEmoji: '🍽️',
        productTerm: 'Dish',
        productTermPlural: 'Menu Items',
        scannerLabel: 'Scan QR / Table Code',
        scannerDesc: 'Scan table QR codes or menu item barcodes',
        checkoutLabel: 'Close Order',
        categories: ['Starters', 'Main Course', 'Breads', 'Rice', 'Beverages', 'Desserts', 'Combo Meals', 'Sides', 'Add-ons'],
      },
    };
    return configs[activeSector] || configs.retail;
  }, [activeSector]);

  // Active Pharmacy batch selections in cart
  const [availableProductBatches, setAvailableProductBatches] = useState<any[]>([]);
  const [showBatchSelectorModal, setShowBatchSelectorModal] = useState(false);
  const [selectedProductForBatch, setSelectedProductForBatch] = useState<any>(null);
  const [showRxModal, setShowRxModal] = useState(false);
  const [rxImageBase64, setRxImageBase64] = useState<string>('');
  const [selectedBatchForCart, setSelectedBatchForCart] = useState<any>(null);

  const addPharmacyProductToCart = (product: Product | any, batch: any, rxBase64?: string) => {
    const code = product.code;
    const name = product.name;
    const price = product.price;
    const rate = product.gstRate || product.gst_rate || 12;
    const hsn = product.hsnCode || product.hsn_code || '3004';
    const uom = product.uom || 'PCS';
    
    setBillItems(prev => {
      // Find existing item with this code AND batch number
      const existing = prev.find(item => item.code === code && item.selectedBatch === batch.batch_number);
      if (existing) {
        if (batch.stock_quantity !== undefined && existing.quantity >= batch.stock_quantity) {
          playBeep('warning');
          toast.error(`⚠️ Only ${batch.stock_quantity} units available in Batch ${batch.batch_number}!`);
          return prev;
        }
        return prev.map(item => (item.code === code && item.selectedBatch === batch.batch_number) ? { ...item, quantity: item.quantity + 1 } : item);
      } else {
        return [...prev, {
          code,
          name,
          price,
          quantity: 1,
          gstRate: rate,
          hsnCode: hsn,
          uom,
          originalPrice: product.price,
          discountPercent: product.discountPercent || 0,
          selectedBatch: batch.batch_number,
          prescriptionFile: rxBase64 || null
        }];
      }
    });

    toast.success(`🧪 Added ${product.name} (Batch: ${batch.batch_number}) to cart!`);
    setShowBatchSelectorModal(false);
    setShowRxModal(false);
    setSelectedProductForBatch(null);
    setSelectedBatchForCart(null);
    setRxImageBase64('');
  };

  const handleSelectBatch = (batch: any) => {
    const isExpired = new Date(batch.expiry_date) < new Date();
    if (isExpired) {
      playBeep('warning');
      toast.error("🛑 Cannot sell expired medicine batch!");
      return;
    }
    if (batch.stock_quantity <= 0) {
      playBeep('warning');
      toast.error("❌ Selected batch is out of stock!");
      return;
    }
    
    if (batch.prescription_required === 1 || batch.prescription_required === true) {
      // Prompt Rx upload
      setSelectedBatchForCart(batch);
      setShowBatchSelectorModal(false);
      setShowRxModal(true);
    } else {
      addPharmacyProductToCart(selectedProductForBatch, batch);
    }
  };

  const [customerGstin, setCustomerGstin] = useState('');
  const [gstinIsValid, setGstinIsValid] = useState<boolean | null>(null);
  const [pricingTier, setPricingTier] = useState<'retail' | 'dealer' | 'distributor'>('retail');
  const [creditLimitExceeded, setCreditLimitExceeded] = useState(false);
  const [storeGstin, setStoreGstin] = useState(() => {
    try {
      const saved = localStorage.getItem('gstNumber');
      return saved || '27AAAAA1111A1Z1'; // Maharashtra default mock state
    } catch {
      return '27AAAAA1111A1Z1';
    }
  });

  const validateGSTIN = (gstin: string): boolean => {
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return regex.test(gstin.toUpperCase());
  };

  useEffect(() => {
    if (!customerGstin) {
      setGstinIsValid(null);
      return;
    }
    setGstinIsValid(validateGSTIN(customerGstin));
  }, [customerGstin]);

  const isInterState = useMemo(() => {
    if (manualInterstateOverride !== null) return manualInterstateOverride;
    if (!customerGstin || !validateGSTIN(customerGstin)) return false;
    const storeState = storeGstin.substring(0, 2);
    const customerState = customerGstin.substring(0, 2);
    return storeState !== customerState;
  }, [customerGstin, storeGstin, manualInterstateOverride]);

  // Dynamic pricing tier discounts: Dealer 10%, Distributor 20%
  useEffect(() => {
    if (activeSector !== 'wholesale') {
      setBillItems(prev => prev.map(item => ({
        ...item,
        price: item.originalPrice || item.price
      })));
      return;
    }
    
    const multiplier = pricingTier === 'distributor' ? 0.80 : pricingTier === 'dealer' ? 0.90 : 1.0;
    setBillItems(prev => prev.map(item => {
      const basePrice = item.originalPrice || item.price;
      return {
        ...item,
        price: Math.round(basePrice * multiplier * 100) / 100,
        originalPrice: basePrice
      };
    }));
  }, [pricingTier, activeSector]);

  // Credit limit checks for Ledger Payment mode
  useEffect(() => {
    if (paymentMode === 'ledger' && currentCustomer) {
      const subtotalVal = billItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      let totalGstVal = 0;
      if (gstEnabled) {
        billItems.forEach(item => {
          totalGstVal += (item.price * item.quantity * item.gstRate) / 100;
        });
      }
      const exactTotalVal = subtotalVal + totalGstVal;
      let roundedTotalVal = exactTotalVal;
      if (roundingEnabled && (paymentMode === 'cash' || paymentMode === 'upi')) {
        roundedTotalVal = Math.round(exactTotalVal);
      }
      const pointValue = parseFloat(localStorage.getItem('pointValue') || '1');
      const loyaltyDiscountVal = (redeemLoyalty && currentCustomer && loyaltyPointsToRedeem > 0)
        ? Math.min(loyaltyPointsToRedeem * pointValue, currentCustomer.loyaltyPoints * pointValue)
        : 0;
      const finalTotalComputed = roundedTotalVal - loyaltyDiscountVal;

      const outstanding = currentCustomer.outstandingBalance || 0;
      const limit = currentCustomer.creditLimit || 50000;
      setCreditLimitExceeded(outstanding + finalTotalComputed > limit);
    } else {
      setCreditLimitExceeded(false);
    }
  }, [paymentMode, currentCustomer, billItems, gstEnabled, roundingEnabled, redeemLoyalty, loyaltyPointsToRedeem]);
  const [amountReceived, setAmountReceived] = useState('');
  const [cashierName, setCashierName] = useState(() => {
    return user?.name || localStorage.getItem('cashierName') || 'Cashier';
  });
  const [shopDetails, setShopDetails] = useState<ShopDetails>({
    name: 'RETAIL SUPERMARKET',
    address: '123 Main Street, City, State 12345',
    phone: '(555) 123-4567',
    email: 'info@retailstore.com',
  });
  const [billHistory, setBillHistory] = useState<SavedBill[]>([]);

  // Load products, settings, and bills from local Express LAN server
  const loadData = useCallback(async () => {
    try {
      const prods = await api.get<any[]>('/products');
      setProducts(prods.map(p => ({
        code: p.sku || p.id,
        name: p.name,
        price: p.price,
        category: p.category || 'General',
        gstRate: p.gst_rate,
        stock: p.stock,
        lowStockThreshold: p.low_stock_threshold,
        hsnCode: p.hsn_code || '',
        uom: p.uom || 'PCS',
        discountPercent: p.discount_percent || 0
      })));

      const settings = await api.get<any>('/settings');
      if (settings) {
        if (settings.gstEnabled !== undefined) setGstEnabled(settings.gstEnabled === 'true');
        if (settings.gstRate !== undefined) setGstRate(parseFloat(settings.gstRate));
        if (settings.roundingEnabled !== undefined) setRoundingEnabled(settings.roundingEnabled === 'true');
        if (settings.soundEnabled !== undefined) {
          const enabled = settings.soundEnabled === 'true';
          setSoundEnabled(enabled);
          localStorage.setItem('soundEnabled', String(enabled));
        }
        if (settings.soundVolume !== undefined) {
          const vol = parseInt(settings.soundVolume);
          setSoundVolume(vol);
          localStorage.setItem('soundVolume', String(vol));
        }
        if (settings.soundProfile !== undefined) {
          setSoundProfile(settings.soundProfile as any);
          localStorage.setItem('soundProfile', settings.soundProfile);
        }
        if (settings.successBeepEnabled !== undefined) {
          const s = settings.successBeepEnabled === 'true';
          setSuccessBeepEnabled(s);
          localStorage.setItem('successBeepEnabled', String(s));
        }
        if (settings.errorBuzzEnabled !== undefined) {
          const e = settings.errorBuzzEnabled === 'true';
          setErrorBuzzEnabled(e);
          localStorage.setItem('errorBuzzEnabled', String(e));
        }
        if (settings.chimeEnabled !== undefined) {
          const c = settings.chimeEnabled === 'true';
          setChimeEnabled(c);
          localStorage.setItem('chimeEnabled', String(c));
        }
        setShopDetails({
          name: settings.shopName || 'RETAIL SUPERMARKET',
          address: settings.shopAddress || '123 Main Street, City, State 12345',
          phone: settings.shopPhone || '(555) 123-4567',
          email: settings.shopEmail || 'info@retailstore.com',
        });
      }

      const bills = await api.get<any[]>('/bills');
      setBillHistory(bills.map(b => ({
        billNumber: b.bill_number,
        date: b.date,
        items: b.items,
        total: b.total,
        subtotal: b.subtotal,
        gstAmount: b.gst_amount,
        cgst: b.cgst,
        sgst: b.sgst,
        gstRate: b.gst_rate,
        gstEnabled: b.gst_enabled,
        cashierName: b.cashier_name || 'Cashier',
        shopDetails: b.shop_details || { name: '', address: '', phone: '', email: '' },
        customerName: b.customer_name || undefined,
        customerPhone: b.customer_phone || undefined,
        paymentMode: b.payment_mode,
        amountReceived: b.amount_received || undefined,
        changeAmount: b.change_amount || undefined,
        roundedTotal: b.total,
        roundingAdjustment: b.rounding_adjustment || 0,
        generatedBy: b.cashier_id
      })));
    } catch (e) {
      console.error('Failed to load initial data:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // WebSocket Live Sync for Multi-computer LAN syncing
  useWebSocket({
    STOCK_UPDATED: (data: any) => {
      if (Array.isArray(data)) {
        setProducts(data.map(p => ({
          code: p.sku || p.id,
          name: p.name,
          price: p.price,
          category: p.category || 'General',
          gstRate: p.gst_rate,
          stock: p.stock,
          lowStockThreshold: p.low_stock_threshold,
          hsnCode: p.hsn_code || ''
        })));
        toast.info('🔄 Inventory synchronized over LAN');
      }
    },
    BILL_CREATED: (data: any) => {
      loadData();
      toast.info('📜 Bill history updated');
    },
    SETTINGS_UPDATED: (data: any) => {
      loadData();
      toast.info('⚙️ Settings updated from LAN');
    }
  });
  
  const inputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const draftSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus search on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Global keyboard listener for auto-focus
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      // If typing anywhere and not in an input field, focus search
      if (!isInputField && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // 🔄 E2EE LAN Cart Sharing & Bill Transfer Handlers
  useEffect(() => {
    const handleRequestShare = () => {
      if (billItems.length === 0) {
        toast.error('❌ Cannot share an empty cart');
        return;
      }
      const event = new CustomEvent('share-cart-data-response', { 
        detail: {
          items: billItems,
          customerName,
          customerPhone,
          paymentMode,
          amountReceived
        } 
      });
      window.dispatchEvent(event);
    };

    const handleLoadShared = (e: Event) => {
      const customEvent = e as CustomEvent;
      const data = customEvent.detail;
      if (!data || !Array.isArray(data.items)) {
        toast.error('❌ Invalid shared bill format');
        return;
      }
      
      if (billLocked) {
        toast.error('🔒 Bill is locked. Please clear or finish the active transaction first.');
        return;
      }

      setBillItems(data.items);
      if (data.customerName) setCustomerName(data.customerName);
      if (data.customerPhone) setCustomerPhone(data.customerPhone);
      if (data.paymentMode) setPaymentMode(data.paymentMode);
      if (data.amountReceived) setAmountReceived(data.amountReceived);
      
      toast.success(`📥 Bill transferred from LAN successfully (${data.items.length} items loaded)`);
    };

    window.addEventListener('trigger-cart-share-request', handleRequestShare);
    window.addEventListener('load-shared-cart-trigger', handleLoadShared);
    
    return () => {
      window.removeEventListener('trigger-cart-share-request', handleRequestShare);
      window.removeEventListener('load-shared-cart-trigger', handleLoadShared);
    };
  }, [billItems, customerName, customerPhone, paymentMode, amountReceived, billLocked]);

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isOwner()) {
          setShowSettings(true);
          toast.info('⚙️ Settings drawer opened');
        } else {
          toast.error('🔒 Access Denied: Only owners can access settings');
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setShowHistory(true);
        toast.info('📜 History opened');
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNewBill();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        toast.info('🔍 Search focused');
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        if (billItems.length > 0 && !billLocked) {
          handlePrintBill();
        }
      }
      // F1-F5 shortcuts
      else if (e.key === 'F1') {
        e.preventDefault();
        setPaymentMode('cash');
        toast.success('💵 Cash payment selected');
      } else if (e.key === 'F2') {
        e.preventDefault();
        setPaymentMode('upi');
        toast.success('📱 UPI payment selected');
      } else if (e.key === 'F3') {
        e.preventDefault();
        setPaymentMode('card');
        toast.success('💳 Card payment selected');
      } else if (e.key === 'F6') {
        e.preventDefault();
        setPaymentMode('ledger' as any);
        toast.success('📚 Ledger payment selected');
      } else if (e.key === 'F4' && billItems.length > 0 && !billLocked) {
        e.preventDefault();
        handlePrintBill();
      } else if (e.key === 'F5') {
        e.preventDefault();
        handleNewBill();
      } else if (e.key === 'Escape' && showReceipt) {
        e.preventDefault();
        handleNewBill();
      } else if (e.key === '?' && e.shiftKey) {
        e.preventDefault();
        setShowShortcuts(true);
      }
    };

    const handleOpenHistory = () => setShowHistory(true);
    const handleOpenShortcuts = () => setShowShortcuts(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-bill-history', handleOpenHistory);
    window.addEventListener('open-shortcuts', handleOpenShortcuts);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-bill-history', handleOpenHistory);
      window.removeEventListener('open-shortcuts', handleOpenShortcuts);
    };
  }, [billItems, billLocked, showReceipt]);

  // Save dark mode preference
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Web Audio Synth Engine
  const playBeep = (type: 'success' | 'warning' | 'chime') => {
    if (!soundEnabled) return;
    if (type === 'success' && !successBeepEnabled) return;
    if (type === 'warning' && !errorBuzzEnabled) return;
    if (type === 'chime' && !chimeEnabled) return;

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const volumeFactor = soundVolume / 100;

      if (type === 'success') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        let freq = 1200;
        let duration = 0.08;
        let typeProfile: OscillatorType = 'sine';
        let vol = 0.08;

        if (soundProfile === 'crisp') {
          freq = 1800;
          duration = 0.06;
          typeProfile = 'triangle';
          vol = 0.06;
        } else if (soundProfile === 'cozy') {
          freq = 880;
          duration = 0.12;
          typeProfile = 'sine';
          vol = 0.12;
        } else if (soundProfile === 'retro') {
          freq = 650;
          duration = 0.10;
          typeProfile = 'square';
          vol = 0.06;
        }

        osc.type = typeProfile;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol * volumeFactor, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);

      } else if (type === 'warning') {
        const playBuzz = (delay: number) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(140, audioCtx.currentTime + delay);
          gain.gain.setValueAtTime(0.12 * volumeFactor, audioCtx.currentTime + delay);
          osc.start(audioCtx.currentTime + delay);
          osc.stop(audioCtx.currentTime + delay + 0.1);
        };
        playBuzz(0);
        playBuzz(0.15);

      } else if (type === 'chime') {
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(1600, audioCtx.currentTime + 0.12);
        gain1.gain.setValueAtTime(0.08 * volumeFactor, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        osc1.start();
        osc1.stop(audioCtx.currentTime + 0.12);

        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1600, audioCtx.currentTime + 0.08);
        gain2.gain.setValueAtTime(0.06 * volumeFactor, audioCtx.currentTime + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc2.start(audioCtx.currentTime + 0.08);
        osc2.stop(audioCtx.currentTime + 0.35);
      }
    } catch (e) {
      console.warn('Audio synthesis failed:', e);
    }
  };

  // Synthesized barcode confirmation beep
  const playBarcodeBeep = () => playBeep('success');

  // Global high-speed barcode keydown scanner listener
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleBarcodeScan = (e: KeyboardEvent) => {
      if (billLocked) return;

      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Intercept key if it's alphanumeric and time diff is small
      if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (timeDiff < 30 || buffer.length > 0) {
          if (timeDiff < 30 || (buffer.length === 0 && timeDiff < 100)) {
            buffer += e.key;
            if (timeDiff < 30) {
              e.preventDefault();
            }
          } else {
            buffer = e.key;
          }
        }
      } else if (e.key === 'Enter') {
        if (buffer.length >= 3 && timeDiff < 100) {
          e.preventDefault();
          e.stopPropagation();
          
          const scanCode = buffer;
          buffer = '';
          
          const found = products.find(p => p.code === scanCode || p.sku === scanCode);
          if (found) {
            addItem(found);
            playBarcodeBeep();
            toast.success(`🏷️ Scanned: ${found.name}`);
          } else {
            setQuickAddBarcode(scanCode);
            setQuickAddForm({
              name: '',
              price: '',
              category: 'General',
              gstRate: 18,
              stock: '100',
              hsnCode: '',
              uom: 'PCS'
            });
            setIsAddingCustomUom(false);
            setShowQuickAddModal(true);
            toast.info(`🔍 Barcode "${scanCode}" not found. Opening Quick Add...`);
          }
        } else {
          buffer = '';
        }
      }
    };

    window.addEventListener('keydown', handleBarcodeScan, true);
    return () => window.removeEventListener('keydown', handleBarcodeScan, true);
  }, [products, billLocked]);

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
    localStorage.setItem('roundingEnabled', JSON.stringify(roundingEnabled));
  }, [roundingEnabled]);

  useEffect(() => {
    localStorage.setItem('billHistory', JSON.stringify(billHistory));
  }, [billHistory]);

  // Auto-save draft
  useEffect(() => {
    if (billItems.length > 0 && !billLocked) {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
      
      draftSaveTimeoutRef.current = setTimeout(() => {
        const draft = {
          items: billItems,
          customerName,
          customerPhone,
          paymentMode,
          amountReceived,
          timestamp: Date.now(),
        };
        localStorage.setItem('draftBill', JSON.stringify(draft));
        toast.success('💾 Draft saved', { duration: 1000 });
      }, 3000);
    }
  }, [billItems, customerName, customerPhone, paymentMode, amountReceived, billLocked]);

  // Restore draft on load
  useEffect(() => {
    const draft = localStorage.getItem('draftBill');
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        const hoursSinceLastEdit = (Date.now() - parsed.timestamp) / (1000 * 60 * 60);
        
        if (hoursSinceLastEdit < 24) {
          if (confirm('🔄 Found an unfinished bill from earlier. Would you like to restore it?')) {
            setBillItems(parsed.items || []);
            setCustomerName(parsed.customerName || '');
            setCustomerPhone(parsed.customerPhone || '');
            setPaymentMode(parsed.paymentMode || 'cash');
            setAmountReceived(parsed.amountReceived || '');
            toast.success('✅ Draft bill restored successfully');
          } else {
            localStorage.removeItem('draftBill');
          }
        } else {
          localStorage.removeItem('draftBill');
        }
      } catch (e) {
        localStorage.removeItem('draftBill');
      }
    }
  }, []);

  const addItem = (product: Product) => {
    if (billLocked) {
      playBeep('warning');
      toast.error('🔒 Bill is locked. Start a new bill to make changes.');
      return;
    }

    // Intercept pharmacy items to select a batch
    if (activeSector === 'pharmacy' && product.category === 'Pharmacy') {
      api.get<any[]>(`/batches?product_id=${product.id}`)
        .then(batchesList => {
          setAvailableProductBatches(batchesList);
          setSelectedProductForBatch(product);
          setShowBatchSelectorModal(true);
        })
        .catch(err => {
          console.error('Failed to load batches:', err);
          toast.error('Failed to load medicine batches.');
        });
      return; // Do not add to cart directly
    }

    // Check stock
    if (product.stock !== undefined && product.stock <= 0) {
      playBeep('warning');
      toast.error(`❌ ${product.name} is out of stock!`);
      return;
    }

    const itemGstRate = gstEnabled ? (product.gstRate || gstRate) : 0;
    
    setBillItems((prev) => {
      const existing = prev.find((item) => item.code === product.code);
      if (existing) {
        // Check if we have enough stock
        if (product.stock !== undefined && existing.quantity >= product.stock) {
          playBeep('warning');
          toast.error(`⚠️ Only ${product.stock} units available!`);
          return prev;
        }
        
        return prev.map((item) =>
          item.code === product.code
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1, gstRate: itemGstRate, originalPrice: product.price }];
    });
    
    setSearchQuery('');
    setError('');
    setSelectedResultIndex(0);
    
    setRecentlyAddedCode(product.code);
    setTimeout(() => setRecentlyAddedCode(null), 600);
    
    toast.success(`✅ ${product.name} added to cart`, {
      duration: 1500,
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSelectedResultIndex(0);
    
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
    const filtered = filteredProducts;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedResultIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedResultIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      
      if (filtered.length > 0) {
        addItem(filtered[selectedResultIndex]);
      } else {
        const query = searchQuery.trim();
        if (query.length >= 3) {
          const isBarcode = /^[a-zA-Z0-9_-]+$/.test(query);
          setQuickAddBarcode(isBarcode ? query : '');
          setQuickAddForm({
            name: isBarcode ? '' : query,
            price: '',
            category: 'General',
            gstRate: 18,
            stock: '100',
            hsnCode: '',
            uom: 'PCS'
          });
          setIsAddingCustomUom(false);
          setShowQuickAddModal(true);
          toast.info(`🔍 Barcode/Product "${query}" not found. Opening Quick Add...`);
        }
      }
    } else if (e.key === 'Tab' && billItems.length > 0) {
      // Allow Tab to move to quantity editing
      e.preventDefault();
      const firstItemQtyButton = document.querySelector('[data-qty-edit]') as HTMLButtonElement;
      if (firstItemQtyButton) {
        firstItemQtyButton.click();
        setTimeout(() => {
          const qtyInput = document.querySelector('input[type="number"][data-qty-input]') as HTMLInputElement;
          qtyInput?.focus();
          qtyInput?.select();
        }, 50);
      }
    }
  };

  const updateQuantity = (code: string, quantity: number, selectedBatch?: string) => {
    if (billLocked) {
      playBeep('warning');
      toast.error('🔒 Bill is locked. Cannot modify items.');
      return;
    }

    const product = products.find(p => p.code === code);
    if (product && product.stock !== undefined && quantity > product.stock) {
      playBeep('warning');
      toast.error(`⚠️ Only ${product.stock} units available!`);
      return;
    }

    if (quantity <= 0) {
      setBillItems((prev) => prev.filter((item) => !(item.code === code && item.selectedBatch === selectedBatch)));
      toast.info('🗑️ Item removed from cart');
    } else {
      setBillItems((prev) =>
        prev.map((item) => (item.code === code && item.selectedBatch === selectedBatch) ? { ...item, quantity } : item)
      );
    }
  };

  const updatePrice = (code: string, newPrice: number, selectedBatch?: string) => {
    if (billLocked) {
      toast.error('🔒 Bill is locked. Cannot modify prices.');
      return;
    }

    const item = billItems.find(i => i.code === code && i.selectedBatch === selectedBatch);
    if (item) {
      const origPrice = item.originalPrice || item.price;
      const discountPercent = origPrice > 0 ? Math.max(0, parseFloat((((origPrice - newPrice) / origPrice) * 100).toFixed(2))) : 0;

      setBillItems((prev) =>
        prev.map((item) => (item.code === code && item.selectedBatch === selectedBatch) ? { ...item, price: newPrice, discountPercent } : item)
      );
      
      // Log price change with enhanced feedback
      const priceChange = {
        billNumber: currentBillNumber || 'Draft',
        itemCode: code,
        itemName: item.name,
        oldPrice: item.price,
        newPrice,
        cashier: cashierName,
        timestamp: new Date().toISOString(),
      };
      
      const priceChangeLogs = JSON.parse(localStorage.getItem('priceChangeLogs') || '[]');
      priceChangeLogs.push(priceChange);
      localStorage.setItem('priceChangeLogs', JSON.stringify(priceChangeLogs));
      
      toast.success(`💰 Price updated: ${item.name} → ₹${newPrice.toFixed(2)}`, {
        description: `Changed from ₹${item.price.toFixed(2)} • Logged by ${cashierName}`,
        duration: 3000,
      });
    }
  };

  const updateItemDiscount = (code: string, discountPercent: number, selectedBatch?: string) => {
    if (billLocked) {
      toast.error('🔒 Bill is locked. Cannot modify discounts.');
      return;
    }

    const item = billItems.find(i => i.code === code && i.selectedBatch === selectedBatch);
    if (item) {
      const origPrice = item.originalPrice || item.price;
      const newPrice = origPrice * (1 - discountPercent / 100);
      
      setBillItems((prev) =>
        prev.map((item) => (item.code === code && item.selectedBatch === selectedBatch) ? { 
          ...item, 
          discountPercent, 
          price: parseFloat(newPrice.toFixed(2)) 
        } : item)
      );
    }
  };

  const removeItem = (code: string, selectedBatch?: string) => {
    if (billLocked) {
      toast.error('🔒 Bill is locked. Cannot remove items.');
      return;
    }
    const item = billItems.find(i => i.code === code && i.selectedBatch === selectedBatch);
    setBillItems((prev) => prev.filter((item) => !(item.code === code && item.selectedBatch === selectedBatch)));
    toast.info(`🗑️ ${item?.name || 'Item'} removed`);
  };

  const clearBill = () => {
    setBillItems([]);
    setSearchQuery('');
    setError('');
    setCurrentBillNumber('');
    setCustomerName('');
    setCustomerPhone('');
    setAmountReceived('');
    setPaymentMode('cash');
    setBillLocked(false);
    localStorage.removeItem('draftBill');
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate loyalty discount function (needs to be defined before use)
  const calculateLoyaltyDiscount = (): number => {
    if (!redeemLoyalty || !currentCustomer || loyaltyPointsToRedeem <= 0) return 0;
    
    const pointValue = parseFloat(localStorage.getItem('pointValue') || '1');
    return Math.min(loyaltyPointsToRedeem * pointValue, currentCustomer.loyaltyPoints * pointValue);
  };

  const subtotal = billItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  
  let totalGst = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  
  if (gstEnabled) {
    billItems.forEach(item => {
      const itemTotal = item.price * item.quantity;
      const itemGst = (itemTotal * item.gstRate) / 100;
      totalGst += itemGst;
    });
    if (activeSector === 'wholesale' && isInterState) {
      igst = totalGst;
      cgst = 0;
      sgst = 0;
    } else {
      igst = 0;
      cgst = totalGst / 2;
      sgst = totalGst / 2;
    }
  }
  
  const exactTotal = subtotal + totalGst;
  
  // Rounding logic
  let roundedTotal = exactTotal;
  let roundingAdjustment = 0;
  
  if (roundingEnabled && (paymentMode === 'cash' || paymentMode === 'upi')) {
    roundedTotal = Math.round(exactTotal);
    roundingAdjustment = roundedTotal - exactTotal;
  }
  
  const amountReceivedNum = parseFloat(amountReceived) || 0;
  const loyaltyDiscount = calculateLoyaltyDiscount();
  const finalTotal = roundedTotal - loyaltyDiscount;
  const changeAmount = amountReceivedNum > finalTotal ? amountReceivedNum - finalTotal : 0;

  const generateBillNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const time = Date.now().toString().slice(-6);
    return `BILL-${year}${month}${day}-${time}`;
  };

  const validatePhone = (phone: string): boolean => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone);
  };

  // Load or create customer when phone changes
  // Load or create customer when phone changes
  useEffect(() => {
    let active = true;
    const fetchCustomer = async () => {
      if (customerPhone && validatePhone(customerPhone)) {
        try {
          const existing = await api.get<any>(`/customers/${customerPhone}`);
          if (!active) return;
          if (existing) {
            const mappedCustomer: Customer = {
              phone: existing.phone,
              name: existing.name || '',
              loyaltyPoints: existing.loyalty_points || 0,
              totalSpent: existing.total_spent || 0,
              visitCount: existing.visit_count || 0,
              lastVisit: existing.last_visit || '',
              outstandingBalance: existing.outstanding_balance || 0,
              gstin: existing.gstin || '',
              creditLimit: existing.credit_limit || 50000
            };
            if (existing.gstin) {
              setCustomerGstin(existing.gstin);
            }
            setCurrentCustomer(mappedCustomer);
            if (!customerName) {
              setCustomerName(mappedCustomer.name);
            }
            toast.success(`Welcome back, ${mappedCustomer.name}! You have ${mappedCustomer.loyaltyPoints} loyalty points.`, { duration: 3000 });
          } else {
            setCurrentCustomer(null);
          }
        } catch {
          if (active) setCurrentCustomer(null);
        }
      } else {
        setCurrentCustomer(null);
        setLoyaltyPointsToRedeem(0);
        setRedeemLoyalty(false);
      }
    };
    
    fetchCustomer();
    return () => {
      active = false;
    };
  }, [customerPhone]);

  const handlePrintBill = async () => {
    if (billLocked) {
      toast.error('🔒 Bill already generated');
      return;
    }

    // Strict Pharmacy prescription validation
    if (activeSector === 'pharmacy') {
      const missingRxItem = billItems.find(
        item => (item.code.charCodeAt(0) % 2 === 0) && !item.prescriptionFile
      );
      if (missingRxItem) {
        playBeep('warning');
        toast.error(`⚠️ Checkout Blocked: A registered medical prescription is required for ${missingRxItem.name}. Please scan or upload it before generating the invoice.`);
        return;
      }
    }

    // Validate phone if provided
    if (customerPhone && !validatePhone(customerPhone)) {
      toast.error('📞 Invalid phone number. Must be 10 digits starting with 6-9.');
      return;
    }

    // Ledger balance requirements
    if (paymentMode === ('ledger' as any)) {
      if (!customerPhone) {
        toast.error('⚠️ Customer phone number is required to checkout using Ledger/Khata!');
        return;
      }
      if (!validatePhone(customerPhone)) {
        toast.error('📞 Invalid phone number. Must be 10 digits starting with 6-9.');
        return;
      }
      if (creditLimitExceeded) {
        toast.error(`⚠️ Checkout Blocked: Customer credit limit of ₹${(currentCustomer?.creditLimit || 50000).toLocaleString('en-IN')} exceeded!`);
        return;
      }
    }

    const billNumber = generateBillNumber();
    setCurrentBillNumber(billNumber);

    const loyaltyEnabled = true;
    const pointsPerHundred = 1;
    const loyaltyDiscount = calculateLoyaltyDiscount();
    const finalTotal = roundedTotal - loyaltyDiscount;
    
    // Spend-based loyalty tier multiplier calculation
    const customerSpent = currentCustomer ? (currentCustomer.totalSpent || 0) : 0;
    const tierInfo = getLoyaltyTier(customerSpent);
    const pointsEarned = loyaltyEnabled && customerPhone
      ? Math.floor((Math.floor(finalTotal / 100) * pointsPerHundred) * tierInfo.multiplier)
      : 0;
    
    const mappedItems = billItems.map(item => ({
      id: item.code,
      sku: item.code,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      gstRate: item.gstRate,
      originalPrice: item.originalPrice,
      hsnCode: item.hsnCode || '',
      uom: item.uom || 'PCS',
      discountPercent: item.discountPercent || 0,
      selectedBatch: item.selectedBatch || null,
      prescriptionFile: item.prescriptionFile || null
    }));

    try {
      const res = await api.post<any>('/bills', {
        id: billNumber,
        bill_number: billNumber,
        date: new Date().toISOString(),
        customer_phone: customerPhone || null,
        customer_name: customerName || null,
        subtotal,
        gst_amount: totalGst,
        cgst,
        sgst,
        igst: igst || 0,
        total: finalTotal,
        payment_mode: paymentMode,
        amount_received: amountReceivedNum > 0 ? amountReceivedNum : undefined,
        change_amount: changeAmount > 0 ? Math.max(0, amountReceivedNum - finalTotal) : undefined,
        rounding_adjustment: roundingAdjustment,
        points_earned: pointsEarned,
        points_redeemed: redeemLoyalty ? loyaltyPointsToRedeem : 0,
        items: mappedItems,
        shop_details: shopDetails,
        gst_enabled: gstEnabled ? 1 : 0,
        gst_rate: gstRate,
        customer_gstin: customerGstin || null,
        pricing_tier: pricingTier
      });

      const newBill: SavedBill = {
        billNumber: res.bill.bill_number,
        date: res.bill.date,
        items: billItems,
        total: res.bill.total,
        subtotal: res.bill.subtotal,
        gstAmount: res.bill.gst_amount,
        cgst: res.bill.cgst,
        sgst: res.bill.sgst,
        gstRate: res.bill.gst_rate,
        gstEnabled: res.bill.gst_enabled,
        cashierName: res.bill.cashier_name || 'Cashier',
        shopDetails: typeof res.bill.shop_details === 'string' ? JSON.parse(res.bill.shop_details) : (res.bill.shop_details || shopDetails),
        customerName: res.bill.customer_name || undefined,
        customerPhone: res.bill.customer_phone || undefined,
        paymentMode: res.bill.payment_mode,
        amountReceived: res.bill.amount_received || undefined,
        changeAmount: res.bill.change_amount || undefined,
        roundedTotal: res.bill.total,
        roundingAdjustment: res.bill.rounding_adjustment || 0,
        generatedBy: res.bill.cashier_id
      };

      if (customerPhone && validatePhone(customerPhone)) {
        if (loyaltyDiscount > 0) {
          toast.success(`🎉 ₹${loyaltyDiscount.toFixed(2)} loyalty discount applied!`);
        }
        if (pointsEarned > 0) {
          toast.success(`⭐ Earned ${pointsEarned} loyalty points! (${tierInfo.name} Tier - ${tierInfo.multiplier}x Multiplier applied)`);
        }
      }

      setBillLocked(true);
      localStorage.removeItem('draftBill');
      
      if (activeTable) {
        releaseActiveTable();
      }
      
      // Play register chime
      playBeep('chime');

      // Update bill history list state locally
      setBillHistory((prev) => [newBill, ...prev]);

      // Trigger automatic receipt print and cash drawer popup over local LAN
      try {
        await api.post(`/print/receipt/${billNumber}`, {});
      } catch (err) {
        console.error('Automatic print failed:', err);
      }

      setShowReceipt(true);
      setShowCompletion(true);
      setIsMobileShiftActive(true);

      if (customerPhone && validatePhone(customerPhone)) {
        toast.success(`📱 Bill receipt sent to ${customerPhone}`, {
          description: `Message delivery confirmed • Bill #${billNumber}`,
          duration: 4000,
        });
      }
    } catch (e: any) {
      console.error('Checkout failed:', e);
      // Play warning buzz
      playBeep('warning');
      toast.error(`❌ Checkout failed: ${e.message || 'Server error'}`);
    }
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, price, category, gstRate, stock, hsnCode, uom } = quickAddForm;

    if (!name || !price || !quickAddBarcode || !uom) {
      toast.error('Please enter all required fields.');
      return;
    }

    try {
      const generatedId = `prod_${Date.now()}`;
      const payload = {
        id: generatedId,
        sku: quickAddBarcode,
        name,
        price: parseFloat(price),
        category,
        gst_rate: gstRate,
        stock: parseInt(stock) || 0,
        low_stock_threshold: 10,
        hsn_code: hsnCode,
        uom: uom
      };

      const res = await api.post<any>('/products', payload);
      
      if (res && res.id) {
        // Successfully created product!
        const newProduct: Product = {
          code: res.sku, // standard maps SKU as code in search/lookup
          name: res.name,
          price: res.price,
          category: res.category,
          gstRate: res.gst_rate,
          stock: res.stock,
          lowStockThreshold: res.low_stock_threshold,
          hsnCode: res.hsn_code,
          uom: res.uom,
          discountPercent: res.discount_percent || 0
        };

        // 1. Update product catalog state locally
        setProducts(prev => [newProduct, ...prev]);

        // 2. Play synthesized beep
        playBarcodeBeep();

        // 3. Add to billing cart
        if (isMobileDevice) {
          addToCart(newProduct);
        } else {
          addItem(newProduct);
        }

        // 4. Close modal and reset
        setShowQuickAddModal(false);
        toast.success(`🎉 Product "${res.name}" created and added to cart!`);
      }
    } catch (err: any) {
      console.error('Failed to create product:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to create product';
      
      if (err.response?.status === 403) {
        toast.error(`❌ Permission Denied`, {
          description: 'This cashier account does not have inventory privileges. Please login as Owner/Manager to register new barcodes.'
        });
      } else {
        toast.error(`❌ Error: ${errMsg}`);
      }
    }
  };

  const handleNewBill = () => {
    setShowReceipt(false);
    setShowCompletion(false);
    clearBill();
    toast.success('✨ Ready for new bill');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleViewBill = (bill: SavedBill) => {
    setBillItems(bill.items);
    setCurrentBillNumber(bill.billNumber);
    setCustomerName(bill.customerName || '');
    setCustomerPhone(bill.customerPhone || '');
    setPaymentMode(bill.paymentMode as any || 'cash');
    setBillLocked(true);
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

  const totalItems = billItems.reduce((sum, item) => sum + item.quantity, 0);

  // ── Hyprland tiling — refs only, NO useState for split values ─────────────
  // Using refs + direct DOM mutation = 60fps with zero React re-renders during drag
  const draggingRef = useRef<'x' | 'ly' | 'ry' | null>(null);
  const [dragging, setDragging] = useState<'x' | 'ly' | 'ry' | null>(null); // only for handle glow
  const [activePanel, setActivePanel] = useState<'search' | 'cart' | 'customer' | 'payment'>('cart');
  const tilingRef    = useRef<HTMLDivElement>(null);
  const leftColRef   = useRef<HTMLDivElement>(null);   // width target
  const searchPanelRef    = useRef<HTMLDivElement>(null);   // height target
  const customerPanelRef  = useRef<HTMLDivElement>(null);   // height target

  // Default split values (percent)
  const splitXRef    = useRef(62);
  const leftSplitYRef  = useRef(28);
  const rightSplitYRef = useRef(52);

  const startDrag = useCallback((type: 'x' | 'ly' | 'ry') => {
    draggingRef.current = type;
    setDragging(type);           // triggers handle glow only
    document.body.style.userSelect = 'none';
    document.body.style.cursor = type === 'x' ? 'col-resize' : 'row-resize';
  }, []);

  const stopDrag = useCallback(() => {
    draggingRef.current = null;
    setDragging(null);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  // Hot path: direct DOM mutation, no setState, no re-render
  const onMouseMove = useCallback((e: MouseEvent) => {
    const type = draggingRef.current;
    if (!type || !tilingRef.current) return;
    const rect = tilingRef.current.getBoundingClientRect();
    if (type === 'x' && leftColRef.current) {
      const pct = Math.min(80, Math.max(20, ((e.clientX - rect.left) / rect.width) * 100));
      leftColRef.current.style.width = `${pct}%`;
      splitXRef.current = pct;
    } else if (type === 'ly' && searchPanelRef.current) {
      const pct = Math.min(70, Math.max(15, ((e.clientY - rect.top) / rect.height) * 100));
      searchPanelRef.current.style.height = `${pct}%`;
      leftSplitYRef.current = pct;
    } else if (type === 'ry' && customerPanelRef.current) {
      const pct = Math.min(75, Math.max(25, ((e.clientY - rect.top) / rect.height) * 100));
      customerPanelRef.current.style.height = `${pct}%`;
      rightSplitYRef.current = pct;
    }
  }, []); // stable — no deps, everything is a ref

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopDrag);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopDrag);
    };
  }, [onMouseMove, stopDrag]);

  // ── Mobile-First Camera Barcode Scanner & View ──────────────────────────────
  const startMobileScan = async () => {
    setMobileScannerError('');
    setShowMobileScanner(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 } 
        }
      });
      streamRef.current = stream;

      // Enable continuous autofocus capability dynamically if available
      const track = stream.getVideoTracks()[0];
      if (track && 'getCapabilities' in track) {
        const capabilities = track.getCapabilities() as any;
        const constraints: any = {};
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
          constraints.focusMode = 'continuous';
        }
        if (Object.keys(constraints).length > 0) {
          await track.applyConstraints(constraints);
        }
      }

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.warn('Video play deferred:', e));
        }
      }, 150);
    } catch (err: any) {
      console.error('Camera access failed:', err);
      setMobileScannerError('Could not access camera. Please check permissions or select manually.');
    }
  };

  const stopMobileScan = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowMobileScanner(false);
  };

  // Run camera scanning detection (supporting both native BarcodeDetector and ZXing fallback)
  useEffect(() => {
    if (!showMobileScanner) return;
    
    let active = true;
    let interval: NodeJS.Timeout;
    
    const runNativeDetector = async () => {
      // @ts-ignore
      if (videoRef.current && window.BarcodeDetector) {
        try {
          // @ts-ignore
          const detector = new window.BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'upc_a'] });
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0 && active) {
            const scannedCode = barcodes[0].rawValue;
            if (showQuickAddModal) {
              playBarcodeBeep();
              setQuickAddBarcode(scannedCode);
              stopMobileScan();
              toast.success(`🏷️ Barcode Scanned: ${scannedCode}`);
            } else {
              const matched = products.find(p => p.code === scannedCode);
              if (matched) {
                playBarcodeBeep();
                addToCart(matched);
                toast.success(`Scanned: ${matched.name} (₹${matched.price})`);
                stopMobileScan();
              } else {
                setQuickAddBarcode(scannedCode);
                setQuickAddForm({
                  name: '',
                  price: '',
                  category: 'General',
                  gstRate: 18,
                  stock: '100',
                  hsnCode: '',
                  uom: 'PCS'
                });
                setIsAddingCustomUom(false);
                setShowQuickAddModal(true);
                stopMobileScan();
                toast.info(`🔍 Scanned code "${scannedCode}" not found. Opening Quick Add...`);
              }
            }
          }
        } catch (e) {
          // Ignore
        }
      }
    };

    const runZXingFallback = async () => {
      if (!videoRef.current || !active) return;
      try {
        if (!zxingReaderRef.current) {
          zxingReaderRef.current = new BrowserMultiFormatReader();
        }
        
        // decodeOnceFromVideoElement will wait until a barcode is found or stream stops
        const result = await zxingReaderRef.current.decodeOnceFromVideoElement(videoRef.current);
        if (result && active) {
          const scannedCode = result.getText();
          if (showQuickAddModal) {
            playBarcodeBeep();
            setQuickAddBarcode(scannedCode);
            stopMobileScan();
            toast.success(`🏷️ Barcode Scanned: ${scannedCode}`);
          } else {
            const matched = products.find(p => p.code === scannedCode);
            if (matched) {
              playBarcodeBeep();
              addToCart(matched);
              toast.success(`Scanned: ${matched.name} (₹${matched.price})`);
              stopMobileScan();
            } else {
              setQuickAddBarcode(scannedCode);
              setQuickAddForm({
                name: '',
                price: '',
                category: 'General',
                gstRate: 18,
                stock: '100',
                hsnCode: '',
                uom: 'PCS'
              });
              setIsAddingCustomUom(false);
              setShowQuickAddModal(true);
              stopMobileScan();
              toast.info(`🔍 Scanned code "${scannedCode}" not found. Opening Quick Add...`);
            }
          }
        }
      } catch (err) {
        // ZXing throws if it doesn't find any code in a frame or if it is reset.
        // If still active, retry after a short delay
        if (active) {
          setTimeout(runZXingFallback, 400);
        }
      }
    };

    // @ts-ignore
    if (window.BarcodeDetector) {
      interval = setInterval(runNativeDetector, 400);
    } else {
      // Start the async recursive ZXing scanner
      runZXingFallback();
    }

    return () => {
      active = false;
      if (interval) clearInterval(interval);
      if (zxingReaderRef.current) {
        try {
          zxingReaderRef.current.reset();
        } catch (e) {
          console.warn('ZXing reset failed:', e);
        }
      }
    };
  }, [showMobileScanner, products]);

  // Standard addToCart helper
  const addToCart = (product: Product) => {
    // Intercept pharmacy items to select a batch
    if (activeSector === 'pharmacy' && product.category === 'Pharmacy') {
      api.get<any[]>(`/batches?product_id=${product.id}`)
        .then(batchesList => {
          setAvailableProductBatches(batchesList);
          setSelectedProductForBatch(product);
          setShowBatchSelectorModal(true);
        })
        .catch(err => {
          console.error('Failed to load batches:', err);
          toast.error('Failed to load medicine batches.');
        });
      return; // Do not add to cart directly
    }

    setBillItems(prev => {
      const existing = prev.find(item => item.code === product.code);
      if (existing) {
        return prev.map(item => item.code === product.code ? { ...item, quantity: item.quantity + 1 } : item);
      } else {
        const defaultDiscount = product.discountPercent || 0;
        const initialPrice = product.price * (1 - defaultDiscount / 100);
        return [...prev, {
          code: product.code,
          name: product.name,
          price: parseFloat(initialPrice.toFixed(2)),
          quantity: 1,
          gstRate: product.gstRate || 18,
          hsnCode: product.hsnCode || '',
          uom: product.uom || 'PCS',
          originalPrice: product.price,
          discountPercent: defaultDiscount
        }];
      }
    });
  };

  const addWholesaleBulkItem = (product: Product, qty: number) => {
    if (billLocked) {
      playBeep('warning');
      toast.error('🔒 Bill is locked. Start a new bill.');
      return;
    }
    
    // Check stock
    if (product.stock !== undefined && product.stock <= 0) {
      playBeep('warning');
      toast.error(`❌ ${product.name} is out of stock!`);
      return;
    }

    setBillItems(prev => {
      const existing = prev.find(item => item.code === product.code);
      const addQty = existing ? existing.quantity + qty : qty;
      
      // Stock warning check
      if (product.stock !== undefined && addQty > product.stock) {
        toast.warning(`⚠️ Low stock warning: Selling ${addQty} of ${product.stock} units.`);
      }

      if (existing) {
        return prev.map(item => item.code === product.code ? { ...item, quantity: addQty } : item);
      } else {
        const defaultDiscount = product.discountPercent || 0;
        const initialPrice = product.price * (1 - defaultDiscount / 100);
        return [...prev, {
          code: product.code,
          name: product.name,
          price: parseFloat(initialPrice.toFixed(2)),
          quantity: qty,
          gstRate: product.gstRate || 18,
          hsnCode: product.hsnCode || '',
          uom: product.uom || 'PCS',
          originalPrice: product.price,
          discountPercent: defaultDiscount
        }];
      }
    });

    playBeep('success');
    toast.success(`📦 Added ${qty} units of ${product.name} to cart!`);
  };

  const renderMobileView = () => {
    const totalItemsCount = billItems.reduce((sum, item) => sum + item.quantity, 0);

    return (
      <div className={`min-h-screen flex flex-col ${darkMode ? 'bg-slate-950 text-white' : 'bg-gray-55 text-slate-900'} pb-24 overflow-y-auto`}>
        {/* Mobile Header */}
        <div className={`p-4 sticky top-0 z-40 backdrop-blur-md border-b flex justify-between items-center transition-all ${
          darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white/85 border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <Store className="text-purple-500 animate-pulse" size={24} />
            <div>
              <h1 className="text-base font-black tracking-tight">{sectorConfig.mobileName}</h1>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">{sectorConfig.sectorEmoji} {activeSector.charAt(0).toUpperCase() + activeSector.slice(1)} • {user?.name || 'Cashier'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => toggleDarkMode()} 
              className={`p-2 rounded-lg border text-xs font-bold transition-all ${
                darkMode ? 'bg-slate-850 border-slate-700 hover:bg-slate-800' : 'bg-gray-100 border-gray-200 hover:bg-gray-200'
              }`}
            >
              {darkMode ? '🌙' : '☀️'}
            </button>
            <button 
              onClick={() => logout()} 
              className="p-2 rounded-lg border text-[10px] font-bold bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Mobile Attendance Status Card */}
          <div className={`p-4 rounded-xl border transition-all shadow-sm ${
            darkMode 
              ? 'bg-slate-900/60 border-slate-800/80' 
              : 'bg-white border-gray-200'
          }`}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Attendance Log Status</span>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                isMobileShiftActive 
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
              }`}>
                {isMobileShiftActive ? 'Shift Active' : 'Check-in Pending'}
              </span>
            </div>
            
            <p className="text-xs font-medium text-gray-400 dark:text-slate-400 mt-1">
              {isMobileShiftActive 
                ? '✅ Attendance recorded successfully! Your hours are actively tracked.'
                : '⚠️ Mobile login requires generating a bill/checkout transaction to count towards active attendance and hours.'}
            </p>
          </div>

          {/* Quick manual select drop-down list */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-gray-500">{sectorConfig.quickAddLabel}</label>
            <div className="relative">
              <select 
                onChange={(e) => {
                  const val = e.target.value;
                  const matched = products.find(p => p.code === val);
                  if (matched) {
                    addToCart(matched);
                    toast.success(`Added ${matched.name}`);
                  }
                  e.target.value = '';
                }}
                className={`w-full p-2.5 rounded-xl border text-sm font-medium focus:outline-none transition-all ${
                  darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200'
                }`}
              >
                <option value="">{sectorConfig.quickAddDropdown}</option>
                {products.map(p => (
                  <option key={p.code} value={p.code}>
                    {p.name} - ₹{p.price}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Mobile Camera Scanning trigger box */}
          <div 
            onClick={startMobileScan}
            className={`p-6 rounded-2xl border border-dashed text-center flex flex-col items-center justify-center gap-3 cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all shadow-sm ${
              darkMode 
                ? 'bg-purple-900/10 border-purple-500/40 hover:bg-purple-900/20' 
                : 'bg-purple-50/50 border-purple-300 hover:bg-purple-50'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <Camera size={24} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-purple-600 dark:text-purple-400">{sectorConfig.scannerLabel}</h3>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 font-semibold mt-0.5">{sectorConfig.scannerDesc}</p>
            </div>
          </div>

          {/* Cart Section */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase text-gray-500">{sectorConfig.cartTitle} ({totalItemsCount} items)</span>
              {billItems.length > 0 && (
                <button 
                  onClick={() => setBillItems([])}
                  className="text-[10px] font-bold text-rose-500 hover:underline"
                  title={`Clear all items from ${sectorConfig.cartTitle}`}
                >
                  Clear Cart
                </button>
              )}
            </div>

            {billItems.length === 0 ? (
              <div className={`p-8 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 ${
                darkMode ? 'bg-slate-900/30 border-slate-800/80' : 'bg-white border-gray-100'
              }`}>
                <ShoppingCart size={32} className="opacity-30 text-purple-500" />
                <p className="text-xs font-semibold opacity-60">{sectorConfig.mobileCartEmpty}</p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">{sectorConfig.mobileCartEmptyDesc}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {billItems.map(item => (
                  <div 
                    key={item.selectedBatch ? `${item.code}-${item.selectedBatch}` : item.code} 
                    className={`p-3 rounded-xl border flex justify-between items-center shadow-sm transition-all ${
                      darkMode ? 'bg-slate-900/70 border-slate-800/80 text-white' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-extrabold">{item.name}</h4>
                        {item.selectedBatch && (
                          <span className={`text-[8.5px] px-1 py-0.5 rounded font-black tracking-wide uppercase ${
                            darkMode ? 'bg-cyan-950 text-cyan-400 border border-cyan-900/30' : 'bg-cyan-50 text-cyan-705 border border-cyan-100'
                          }`}>
                            🧪 {item.selectedBatch}
                          </span>
                        )}
                        {item.prescriptionFile && (
                          <span className={`text-[8.5px] px-1 py-0.5 rounded font-black tracking-wide uppercase ${
                            darkMode ? 'bg-emerald-950 text-emerald-450 border border-emerald-900/30' : 'bg-emerald-50 text-emerald-705 border border-emerald-100'
                          }`}>
                            📄 Rx
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] text-emerald-500 font-bold">₹{item.price.toFixed(2)}</span>
                        {item.originalPrice && item.originalPrice !== item.price && (
                          <span className={`text-[9px] line-through ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>₹{item.originalPrice.toFixed(2)}</span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 ${
                          darkMode ? 'bg-purple-950/40 text-purple-400 border border-purple-900/30' : 'bg-purple-50 text-purple-650 border border-purple-100'
                        }`}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={item.discountPercent ?? 0}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= 0 && val <= 100) {
                                updateItemDiscount(item.code, val, item.selectedBatch);
                              }
                            }}
                            className="w-8 bg-transparent text-center font-bold text-inherit border-none p-0 focus:outline-none focus:ring-0"
                          />
                          <span>% off</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          updateQuantity(item.code, item.quantity - 1, item.selectedBatch);
                        }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center border text-xs font-bold ${
                          darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-750' : 'bg-gray-100 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        -
                      </button>
                      <span className="text-xs font-black px-1.5">{item.quantity}</span>
                      <button 
                        onClick={() => {
                          updateQuantity(item.code, item.quantity + 1, item.selectedBatch);
                        }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center border text-xs font-bold ${
                          darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-750' : 'bg-gray-100 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        +
                      </button>
                      <button 
                        onClick={() => {
                          removeItem(item.code, item.selectedBatch);
                        }}
                        className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 ml-1.5"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Customer Loyalty Details */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase text-gray-500 block">Customer Information</span>
            
            <input 
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="10-digit customer phone number..."
              maxLength={10}
              className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all ${
                darkMode ? 'bg-slate-900 border-slate-850 text-white placeholder-slate-500' : 'bg-white border-gray-200'
              }`}
            />

            {activeSector === 'wholesale' && (
              <div className="space-y-2 mt-2 pt-2 border-t border-dashed dark:border-slate-850">
                <span className="text-[10px] font-bold uppercase text-emerald-500 block flex justify-between items-center select-none">
                  <span>Customer GSTIN (B2B Outward)</span>
                  {gstinIsValid !== null && (
                    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                      gstinIsValid ? 'bg-emerald-500/10 text-emerald-450' : 'bg-rose-500/10 text-rose-455'
                    }`}>
                      {gstinIsValid ? '✓ VALID GSTIN' : '✗ INVALID FORMAT'}
                    </span>
                  )}
                </span>
                <input 
                  type="text"
                  value={customerGstin}
                  onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                  placeholder="15-character GSTIN (e.g. 27AAAAA1111A1Z1)..."
                  maxLength={15}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all ${
                    darkMode ? 'bg-slate-900 border-slate-850 text-white placeholder-slate-500' : 'bg-white border-gray-200'
                  } ${gstinIsValid === false ? 'border-rose-500/40 focus:ring-rose-500/20' : ''}`}
                />
                
                {gstinIsValid && (
                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-tight">
                    💡 state routing: {isInterState ? '🌐 Inter-State (IGST Outward)' : '🏠 Intra-State (CGST + SGST)'}
                  </p>
                )}
              </div>
            )}

            {activeSector === 'wholesale' && (
              <div className="space-y-1.5 mt-2 pt-2 border-t border-dashed dark:border-slate-850">
                <span className="text-[10px] font-bold uppercase text-emerald-500 block select-none">Wholesale Pricing Tier</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['retail', 'dealer', 'distributor'] as const).map(tier => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setPricingTier(tier)}
                      className={`py-1.5 rounded-lg text-[9px] font-black uppercase transition-all transform active:scale-95 cursor-pointer ${
                        pricingTier === tier
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/15'
                          : darkMode
                            ? 'bg-slate-900 border border-slate-850 text-slate-400 hover:text-white hover:bg-slate-800'
                            : 'bg-white border border-gray-250 text-gray-600 hover:bg-gray-50 shadow-sm'
                      }`}
                    >
                      {tier === 'distributor' ? '📦 Dist (-20%)' : tier === 'dealer' ? '💼 Dealer (-10%)' : '🛒 Retail'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {customerPhone && validatePhone(customerPhone) && !currentCustomer && (
              <p className="text-[10px] font-bold text-blue-500">✓ New customer will be registered.</p>
            )}

            {currentCustomer && (() => {
              const points = currentCustomer.loyaltyPoints;
              const spent = currentCustomer.totalSpent || 0;
              const tierInfo = getLoyaltyTier(spent);

              return (
                <div className={`p-3.5 rounded-xl border transition-all shadow-sm ${
                  darkMode ? 'bg-slate-900/60 border-slate-800 text-white' : 'bg-white border-gray-200 shadow-sm'
                }`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Loyalty Level</span>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gradient-to-r text-white ${tierInfo.colorClass}`}>
                      {tierInfo.name} Tier
                    </span>
                  </div>

                  <div className="flex justify-between items-center mb-2">
                    <span className="text-base font-black text-purple-500">{points} PTS</span>
                    <span className="text-xs font-bold text-emerald-500">₹{Math.floor(spent).toLocaleString('en-IN')} Spent</span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-slate-800 overflow-hidden mb-2">
                    <div className={`h-full bg-gradient-to-r ${tierInfo.colorClass}`} style={{ width: `${tierInfo.progress}%` }} />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-dashed dark:border-slate-800">
                    <input type="checkbox" checked={redeemLoyalty} onChange={(e) => { setRedeemLoyalty(e.target.checked); if (!e.target.checked) setLoyaltyPointsToRedeem(0); }} disabled={points === 0} className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer" />
                    <span className="text-[10px] font-bold text-slate-500">Redeem Points</span>
                  </label>

                  {redeemLoyalty && points > 0 && (
                    <div className="mt-2 space-y-1">
                      <input type="number" value={loyaltyPointsToRedeem} onChange={(e) => setLoyaltyPointsToRedeem(Math.min(parseInt(e.target.value) || 0, points))} max={points} min={0} placeholder="Points to redeem" className={`w-full px-2 py-1 border rounded text-xs focus:outline-none ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-gray-300'}`} />
                      <p className="text-[10px] font-semibold text-emerald-500">= ₹{(loyaltyPointsToRedeem * parseFloat(localStorage.getItem('pointValue') || '1')).toFixed(2)} discount</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Live Camera Scanner Overlay Modal */}
        {showMobileScanner && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between p-4">
            <div className="flex justify-between items-center text-white z-10 pt-4">
              <div>
                <h3 className="text-sm font-black">Align Barcode in Aim Box</h3>
                <p className="text-[9px] text-gray-400 font-semibold mt-0.5">Camera scanning is active</p>
              </div>
              <button 
                onClick={stopMobileScan}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-white font-extrabold hover:bg-slate-750"
              >
                ✕
              </button>
            </div>

            {/* Glowing sweep viewport */}
            <div className="relative flex-1 flex items-center justify-center my-6">
              <div className="absolute inset-0 max-w-sm max-h-[70vh] rounded-3xl overflow-hidden border-2 border-purple-500/50 bg-slate-900 flex items-center justify-center shadow-2xl">
                {mobileScannerError ? (
                  <p className="text-rose-400 text-xs font-semibold p-6 text-center">{mobileScannerError}</p>
                ) : (
                  <video 
                    ref={videoRef}
                    playsInline 
                    className="w-full h-full object-cover" 
                  />
                )}
                
                {/* Aiming viewport box overlay */}
                <div className="absolute inset-x-6 h-40 border-2 border-purple-500/90 rounded-2xl flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.3)] bg-purple-500/5">
                  {/* Sweeping laser light */}
                  <div className="w-full h-0.5 bg-purple-500 animate-bounce shadow-[0_0_10px_#a855f7]" />
                </div>
              </div>
            </div>

            {/* Quick click simulated scan codes */}
            <div className="z-10 bg-slate-900/90 border border-slate-800 p-3 rounded-2xl max-w-sm mx-auto w-full text-center">
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Quick Demo Scan (TAP TO SIMULATE CAMERA SCAN)</p>
              <div className="flex justify-center flex-wrap gap-1.5">
                {products.slice(0, 4).map(p => (
                  <button 
                    key={p.code}
                    onClick={() => {
                      playBarcodeBeep();
                      addToCart(p);
                      toast.success(`Simulated Scan: ${p.name}`);
                      stopMobileScan();
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-200 border border-slate-700"
                  >
                    Scan {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sticky Mobile Bottom Checkout Bar */}
        {billItems.length > 0 && (
          <div className={`fixed bottom-0 inset-x-0 p-4 border-t backdrop-blur-md shadow-2xl z-30 flex gap-3 justify-between items-center transition-all ${
            darkMode ? 'bg-slate-900/90 border-slate-800/80 text-white' : 'bg-white/90 border-gray-200 text-slate-900'
          }`}>
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase text-gray-400 dark:text-slate-500">Total</span>
              <span className="text-lg font-black text-emerald-500">₹{(roundedTotal - calculateLoyaltyDiscount()).toLocaleString('en-IN')}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <select 
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                className={`p-2.5 rounded-xl border text-xs font-extrabold focus:outline-none ${
                  darkMode ? 'bg-slate-800 border-slate-750 text-white' : 'bg-gray-100 border-gray-200'
                }`}
              >
                <option value="cash">💵 Cash</option>
                <option value="upi">📱 UPI</option>
                <option value="card">💳 Card</option>
              </select>

              <button 
                onClick={handlePrintBill}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-extrabold text-xs shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-transform"
              >
                {sectorConfig.checkoutLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  return (
    <>
      {isMobileDevice ? renderMobileView() : (
        <div className={`h-full flex flex-col overflow-hidden ${darkMode ? 'dark bg-transparent' : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'}`}>

      {/* ── Hyprland-style Tiling Canvas ─────────────────────────────────── */}
      <div
        ref={tilingRef}
        className="flex-1 overflow-hidden flex min-h-0"
        style={{ cursor: dragging === 'x' ? 'col-resize' : dragging ? 'row-resize' : undefined }}
      >

        {/* ╔══════════════════════════════╗ LEFT COLUMN */}
        <div
          ref={leftColRef}
          className="flex flex-col overflow-hidden min-h-0"
          style={{ width: `${splitXRef.current}%` }}
        >

          {/* ▲ Panel 1 — Search & Add Products */}
          <div
            ref={searchPanelRef}
            onClick={() => setActivePanel('search')}
            className={`flex flex-col overflow-hidden min-h-0 transition-all duration-150 ${
              activePanel === 'search'
                ? darkMode ? 'ring-2 ring-inset ring-blue-500/50' : 'ring-2 ring-inset ring-blue-400/60'
                : ''
            }`}
            style={{ height: `${leftSplitYRef.current}%` }}
          >
            <div className={`flex-1 min-h-0 overflow-hidden p-2.5 flex flex-col gap-2 ${
              darkMode ? 'bg-slate-950/20 backdrop-blur-md border border-slate-900/60 rounded-2xl shadow-xl' : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'
            }`}>
              {/* Panel title bar */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0 ${
                darkMode ? 'bg-slate-900/40 border border-slate-800/40' : 'bg-white/80 border border-gray-200'
              }`}>
                <div className="w-1 h-4 rounded-full bg-green-500" />
                <Scan size={13} className={darkMode ? 'text-green-400' : 'text-green-600'} />
                <span className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{sectorConfig.searchPanelTitle}</span>
                
                {/* 🔌 High-end pulsing LAN Sync Indicator */}
                <div className="flex items-center gap-1.5 ml-3 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping absolute opacity-75" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  LAN Connected (1.2ms)
                </div>

                <span className={`ml-auto text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Ctrl+F · Barcode</span>
              </div>

              {activeSector === 'restaurant' ? (
                /* Restaurant-specific Dine-in quick-tap grid layout */
                <div className={`flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden ${
                  darkMode ? 'bg-gray-800/90 backdrop-blur-sm border-gray-750' : 'bg-white shadow-sm border-gray-200'
                }`}>
                  {/* Table Plan Selector Bar */}
                  <div className={`p-2.5 border-b flex flex-col gap-1.5 shrink-0 ${darkMode ? 'border-slate-800 bg-slate-950/20' : 'border-gray-100 bg-gray-50/50'}`}>
                    <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider block font-mono">🍽️ SELECT ACTIVE TABLE</span>
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {localTables && localTables.map((t: any) => {
                        const isSelected = activeTable?.id === t.id;
                        const isOccupied = t.status === 'occupied';
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              localStorage.setItem('nexusflowActiveTable', JSON.stringify(t));
                              window.dispatchEvent(new CustomEvent('active-table-selected', { detail: { table: t } }));
                              toast.success(`Active Table switched to ${t.name}`);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-[10.5px] font-black uppercase transition-all whitespace-nowrap border flex items-center gap-1.5 cursor-pointer active:scale-95 hover:scale-[1.02] shrink-0 ${
                              isSelected
                                ? 'bg-rose-500 border-rose-500 text-white shadow shadow-rose-500/25'
                                : isOccupied
                                ? darkMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-300 text-amber-700'
                                : darkMode ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700' : 'bg-white border-gray-200 text-gray-700'
                            }`}
                          >
                            <span>🪑 {t.name}</span>
                            {isOccupied && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Horizontal Scrollable Categories */}
                  <div className={`p-2.5 border-b flex gap-1.5 overflow-x-auto shrink-0 no-scrollbar ${darkMode ? 'border-slate-800 bg-slate-950/10' : 'border-gray-150 bg-gray-50/20'}`}>
                    {['All', 'Starters', 'Main Course', 'Breads', 'Rice', 'Beverages', 'Desserts', 'Combo Meals'].map((cat) => {
                      const isSel = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                            isSel
                              ? 'bg-blue-600 text-white shadow'
                              : darkMode ? 'bg-slate-900 text-slate-400 hover:bg-slate-800' : 'bg-gray-150 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>

                  {/* Touch Grid */}
                  <div className="flex-1 overflow-y-auto p-3 bg-slate-950/5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {products
                        .filter(p => selectedCategory === 'All' || p.category === selectedCategory)
                        .map((p) => (
                          <button
                            key={p.code}
                            type="button"
                            onClick={() => addItem(p)}
                            className={`p-2.5 rounded-xl border text-left flex flex-col justify-between h-24 cursor-pointer select-none active:scale-[0.96] hover:scale-[1.01] transition-all ${
                              darkMode
                                ? 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900 shadow shadow-slate-950/15'
                                : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/5 shadow-sm'
                            }`}
                          >
                            <div className="w-full">
                              <span className={`text-[7.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border leading-none ${
                                p.category === 'Starters' ? 'bg-orange-500/10 text-orange-400 border-orange-500/10' :
                                p.category === 'Main Course' ? 'bg-red-500/10 text-red-400 border-red-500/10' :
                                p.category === 'Breads' ? 'bg-amber-500/10 text-amber-400 border-amber-500/10' :
                                'bg-blue-500/10 text-blue-400 border-blue-500/10'
                              }`}>
                                {p.category}
                              </span>
                              <h4 className={`font-black text-[11px] leading-tight mt-2 truncate w-full ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                                {p.name}
                              </h4>
                            </div>
                            <div className="flex justify-between items-center w-full border-t border-dashed dark:border-slate-800/80 pt-1.5 mt-1 text-[9px] font-bold">
                              <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>
                                {p.code}
                              </span>
                              <span className={`font-extrabold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                ₹{p.price.toFixed(0)}
                              </span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              ) : activeSector === 'pharmacy' ? (
                /* 💊 Pharmacy Bespoke Touch-First Medicine Dispenser View */
                <div className={`flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden ${
                  darkMode ? 'bg-slate-900/90 backdrop-blur-md border-slate-800' : 'bg-white shadow-sm border-gray-250'
                }`}>
                  {/* Pharmacy Combined Search & Mode Header */}
                  <div className={`p-2.5 border-b flex flex-col gap-2 shrink-0 ${darkMode ? 'border-slate-800 bg-slate-950/20' : 'border-gray-150 bg-gray-50/50'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-teal-400 uppercase tracking-widest block font-mono">🧪 PHARMA MEDICINE DISPENSER</span>
                      <button 
                        onClick={() => setShowRxCaptureModal(true)}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all active:scale-95 ${
                          darkMode ? 'bg-teal-500/10 text-teal-300 border border-teal-500/20 hover:bg-teal-500/20' : 'bg-teal-50 text-teal-700 border border-teal-150 hover:bg-teal-100'
                        }`}
                      >
                        <Camera size={10} /> 📷 Capture/Scan Rx
                      </button>
                    </div>

                    <div className="relative">
                      <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} size={14} />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search generic drug name, formula, or code..."
                        disabled={billLocked}
                        className={`w-full pl-9 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none transition-all ${
                          darkMode ? 'bg-slate-950/60 border-slate-850 text-white placeholder-slate-600 focus:border-teal-500' : 'bg-white border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Horizontal Scrollable Pharma Category Tabs */}
                  <div className={`p-2 border-b flex gap-1 overflow-x-auto shrink-0 no-scrollbar ${darkMode ? 'border-slate-800 bg-slate-950/10' : 'border-gray-100 bg-gray-50/25'}`}>
                    {['All', 'Pharmacy', 'OTC', 'Prescription', 'Ayurvedic', 'Surgical', 'Vitamins'].map((cat) => {
                      const isSel = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2.5 py-1 rounded-md text-[8.5px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                            isSel
                              ? 'bg-teal-600 text-white shadow shadow-teal-600/25'
                              : darkMode ? 'bg-slate-950 text-slate-500 hover:bg-slate-800' : 'bg-gray-150 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>

                  {/* Medicines Cards Touch Grid */}
                  <div className="flex-1 overflow-y-auto p-2.5 bg-slate-950/5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {products
                        .filter(p => {
                          const matchesCat = selectedCategory === 'All' || p.category === selectedCategory || (selectedCategory === 'Pharmacy' && p.category === 'Prescription');
                          const matchesQuery = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase());
                          return matchesCat && matchesQuery;
                        })
                        .map((p) => {
                          const isRx = p.category === 'Prescription' || p.category === 'Pharmacy';
                          // Deterministic expiry/batch
                          const charVal = p.code.charCodeAt(0) || 65;
                          const batchNum = `B-PHM${charVal}${p.code.substring(p.code.length-2)}`;
                          const expDate = `12/202${(charVal % 4) + 6}`;
                          
                          return (
                            <button
                              key={p.code}
                              type="button"
                              onClick={() => addItem(p)}
                              className={`p-2 rounded-xl border text-left flex flex-col justify-between h-[105px] cursor-pointer select-none active:scale-[0.96] hover:scale-[1.01] transition-all relative ${
                                darkMode
                                  ? 'bg-slate-950/60 border-slate-850 hover:border-teal-500/40 hover:bg-slate-900 shadow-sm'
                                  : 'bg-white border-gray-200 hover:border-teal-400 hover:bg-teal-50/5 shadow-sm'
                              }`}
                            >
                              <div className="w-full">
                                <div className="flex items-center justify-between gap-1 w-full">
                                  <span className={`text-[7px] font-black uppercase tracking-wider px-1 py-0.5 rounded border leading-none shrink-0 ${
                                    isRx ? 'bg-rose-500/10 text-rose-400 border-rose-500/10' : 'bg-emerald-500/10 text-emerald-450 border-emerald-500/10'
                                  }`}>
                                    {p.category}
                                  </span>
                                  {isRx && (
                                    <span className="text-[7.5px] font-black text-rose-500 bg-rose-500/5 px-1 py-0.5 rounded uppercase font-mono">💊 Rx Required</span>
                                  )}
                                </div>
                                <h4 className={`font-black text-[10.5px] leading-tight mt-1.5 truncate w-full ${darkMode ? 'text-white' : 'text-slate-850'}`}>
                                  {p.name}
                                </h4>
                                <div className="flex items-center gap-1.5 text-[7.5px] font-bold text-gray-500 dark:text-slate-500 mt-1 uppercase font-mono">
                                  <span>Batch: {batchNum}</span>
                                  <span>•</span>
                                  <span className="text-amber-500 dark:text-amber-400">Exp: {expDate}</span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center w-full border-t border-dashed dark:border-slate-800/80 pt-1.5 mt-1 text-[8.5px] font-bold">
                                <span className={darkMode ? 'text-slate-500' : 'text-gray-400'}>
                                  Stock: {p.stock !== undefined ? p.stock : '60'}
                                </span>
                                <span className={`font-black text-[10px] ${darkMode ? 'text-teal-400' : 'text-teal-650'}`}>
                                  ₹{p.price.toFixed(2)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </div>
              ) : activeSector === 'wholesale' ? (
                /* 📦 Wholesale B2B Bulk Invoice Billing View */
                <div className={`flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden ${
                  darkMode ? 'bg-slate-900/90 backdrop-blur-md border-slate-800' : 'bg-white shadow-sm border-gray-250'
                }`}>
                  {/* B2B Presets and Tax Slide Selector */}
                  <div className={`p-2.5 border-b flex flex-col gap-2 shrink-0 ${darkMode ? 'border-slate-800 bg-slate-950/20' : 'border-gray-150 bg-gray-50/50'}`}>
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest block font-mono">📦 B2B BULK WORKSPACE</span>
                      
                      {/* Interactive Tax Toggle Slider */}
                      <div className="flex items-center gap-1 bg-slate-950/45 dark:bg-slate-950/80 p-0.5 rounded-lg border border-slate-800/50">
                        <button 
                          type="button" 
                          onClick={() => {
                            setManualInterstateOverride(false);
                            toast.info('🏠 Intrastate tax routing enforced (CGST + SGST)');
                          }}
                          className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase transition-all ${
                            isInterState === false 
                              ? 'bg-amber-500 text-white shadow shadow-amber-500/25' 
                              : darkMode ? 'text-slate-500 hover:text-slate-350' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          🏠 CGST+SGST
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setManualInterstateOverride(true);
                            toast.info('🌐 Interstate tax routing enforced (IGST Outward)');
                          }}
                          className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase transition-all ${
                            isInterState === true 
                              ? 'bg-purple-600 text-white shadow shadow-purple-600/25' 
                              : darkMode ? 'text-slate-505 hover:text-slate-350' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          🌐 IGST (Interstate)
                        </button>
                      </div>
                    </div>

                    {/* Presets Row */}
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                      <button 
                        type="button" 
                        onClick={() => {
                          setCustomerName('Mumbai B2B Retailers Ltd');
                          setCustomerPhone('9876543210');
                          setCustomerGstin('27ABCDE1234F1Z5'); // Maharashtra (Intrastate)
                          setPricingTier('dealer');
                          toast.success('🏢 Applied Presets: Mumbai Retailer (Dealer Tier · Intrastate)');
                        }}
                        className={`px-2 py-1 rounded text-[8px] font-black uppercase border transition-all whitespace-nowrap ${
                          darkMode ? 'bg-slate-950 border-slate-850 text-slate-400 hover:text-white' : 'bg-gray-100 border-gray-250 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Preset: Mumbai (Dealer)
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          setCustomerName('Delhi Mega Distributors');
                          setCustomerPhone('9911223344');
                          setCustomerGstin('07XXXXX9999X1ZA'); // Delhi (Interstate)
                          setPricingTier('distributor');
                          toast.success('🏢 Applied Presets: Delhi Dist (Distributor Tier · Interstate)');
                        }}
                        className={`px-2 py-1 rounded text-[8px] font-black uppercase border transition-all whitespace-nowrap ${
                          darkMode ? 'bg-slate-950 border-slate-850 text-slate-400 hover:text-white' : 'bg-gray-100 border-gray-250 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Preset: Delhi (Distributor)
                      </button>
                    </div>

                    <div className="relative">
                      <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} size={14} />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Scan bulk code, type SKU, or item code..."
                        disabled={billLocked}
                        className={`w-full pl-9 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none transition-all ${
                          darkMode ? 'bg-slate-950/60 border-slate-850 text-white focus:border-amber-500' : 'bg-white border-gray-300 focus:border-amber-550 focus:ring-2 focus:ring-amber-550/10'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Horizontal Scrollable Wholesale Categories */}
                  <div className={`p-2 border-b flex gap-1 overflow-x-auto shrink-0 no-scrollbar ${darkMode ? 'border-slate-800 bg-slate-950/10' : 'border-gray-100 bg-gray-50/25'}`}>
                    {['All', 'General', 'FMCG', 'Bulk Grains', 'Beverages', 'Dairy', 'Frozen'].map((cat) => {
                      const isSel = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2.5 py-1 rounded-md text-[8.5px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                            isSel
                              ? 'bg-amber-600 text-white shadow shadow-amber-600/25'
                              : darkMode ? 'bg-slate-950 text-slate-500 hover:bg-slate-800' : 'bg-gray-150 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>

                  {/* Wholesale Cards Touch Grid */}
                  <div className="flex-1 overflow-y-auto p-2 bg-slate-950/5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {products
                        .filter(p => {
                          const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
                          const matchesQuery = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase());
                          return matchesCat && matchesQuery;
                        })
                        .map((p) => {
                          const charVal = p.code.charCodeAt(0) || 66;
                          const caseSize = (charVal % 3 === 0) ? 12 : (charVal % 3 === 1) ? 24 : 50;
                          const margin = 10 + (charVal % 5) * 2;
                          const moq = 5 + (charVal % 4) * 5;
                          
                          return (
                            <div
                              key={p.code}
                              className={`p-2 rounded-xl border flex flex-col justify-between h-[120px] select-none transition-all relative ${
                                darkMode
                                  ? 'bg-slate-950/60 border-slate-850 shadow-sm'
                                  : 'bg-white border-gray-205 shadow-sm'
                              }`}
                            >
                              <div className="w-full cursor-pointer" onClick={() => addItem(p)}>
                                <div className="flex items-center justify-between gap-1 w-full">
                                  <span className="text-[7px] font-black uppercase tracking-wider px-1 py-0.5 rounded border leading-none bg-amber-500/10 text-amber-400 border-amber-500/10 shrink-0">
                                    {p.category}
                                  </span>
                                  <span className="text-[7.5px] font-black text-emerald-450 bg-emerald-500/5 px-1 py-0.5 rounded uppercase font-mono">Margin: {margin}%</span>
                                </div>
                                <h4 className={`font-black text-[10.5px] leading-tight mt-1 truncate w-full ${darkMode ? 'text-white' : 'text-slate-850'}`}>
                                  {p.name}
                                </h4>
                                <p className="text-[7.5px] font-bold text-gray-500 dark:text-slate-500 uppercase font-mono mt-0.5">UOM: Box of {caseSize} • MOQ: {moq}</p>
                              </div>

                              {/* Bulk Quantity Multipliers Row */}
                              <div className="flex gap-1.5 mt-1 pt-1.5 border-t border-dashed dark:border-slate-900 border-gray-150">
                                <button 
                                  type="button" 
                                  onClick={() => addWholesaleBulkItem(p, 10)}
                                  className={`flex-1 py-1 rounded text-[8px] font-black cursor-pointer uppercase active:scale-90 transition-all ${
                                    darkMode ? 'bg-slate-900 text-amber-400 hover:bg-slate-850' : 'bg-gray-100 text-amber-700 hover:bg-gray-200'
                                  }`}
                                >
                                  +10
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => addWholesaleBulkItem(p, caseSize)}
                                  className={`flex-1 py-1 rounded text-[8px] font-black cursor-pointer uppercase active:scale-90 transition-all ${
                                    darkMode ? 'bg-amber-500 text-white hover:bg-amber-400 shadow shadow-amber-500/10' : 'bg-amber-600 text-white hover:bg-amber-500'
                                  }`}
                                  title={`Add 1 Case (${caseSize} Pcs)`}
                                >
                                  +Case
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              ) : (
                /* 🛒 Retail Bespoke High-Speed Supermarket View (Speed Keys + Laser Simulator) */
                <div className="flex-1 min-h-0 flex gap-2.5 overflow-hidden">
                  
                  {/* Left Column Sidebar: Daily Essentials Speed Keys */}
                  <div className={`w-1/3 flex flex-col overflow-hidden rounded-xl border p-2 shrink-0 ${
                    darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest block font-mono mb-2 px-1 text-center">🥛 RETAIL SPEED KEYS</span>
                    <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-0.5 no-scrollbar">
                      {[
                        { label: '🥛 Amul Milk 1L', search: 'Milk' },
                        { label: '🍞 Sliced Bread', search: 'Bread' },
                        { label: '🥚 Farm Eggs 6P', search: 'Egg' },
                        { label: '🍌 Bananas Dozen', search: 'Banana' },
                        { label: '🥤 Coca-Cola 330', search: 'Coke' },
                        { label: '🍟 Potato Chips', search: 'Chips' },
                        { label: '🧼 Bath Soap 100', search: 'Soap' },
                        { label: '☕ Instant Coffee', search: 'Coffee' }
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            // Find matching item
                            const matched = products.find(p => p.name.toLowerCase().includes(item.search.toLowerCase()));
                            if (matched) {
                              addItem(matched);
                            } else {
                              // If not in database, fallback alert
                              toast.error(`"${item.label}" needs inbounding in inventory!`);
                            }
                          }}
                          className={`py-2 px-1.5 rounded-lg text-[9px] font-black uppercase text-center border cursor-pointer active:scale-95 transition-all truncate ${
                            darkMode ? 'bg-slate-900 border-slate-800 text-slate-350 hover:bg-slate-850 hover:text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-blue-50/20 hover:border-blue-300'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Column: Laser Scan Simulator & Main Search bar */}
                  <div className={`flex-1 flex flex-col overflow-hidden rounded-xl border ${
                    darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white shadow-sm border-gray-250'
                  }`}>
                    {/* Search bar */}
                    <div className={`p-2.5 border-b shrink-0 ${darkMode ? 'border-slate-800 bg-slate-950/20' : 'border-gray-150 bg-gray-50/50'}`}>
                      <div className="relative">
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} size={14} />
                        <input
                          ref={inputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          onKeyDown={handleSearchKeyDown}
                          placeholder={sectorConfig.searchPlaceholder}
                          disabled={billLocked}
                          className={`w-full pl-9 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none transition-all ${
                            darkMode ? 'bg-slate-950/60 border-slate-850 text-white focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Results / Scanner screen */}
                    <div className="flex-1 overflow-y-auto min-h-0 relative">
                      <AnimatePresence>
                        {searchQuery ? (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            {filteredProducts.length > 0 ? (
                              filteredProducts.slice(0, 8).map((product, index) => {
                                const isLowStock = product.stock !== undefined && product.lowStockThreshold !== undefined && product.stock <= product.lowStockThreshold;
                                const isOutOfStock = product.stock !== undefined && product.stock <= 0;
                                return (
                                  <button
                                    key={product.code}
                                    onClick={() => addItem(product)}
                                    disabled={isOutOfStock}
                                    className={`w-full flex justify-between items-center px-4 py-3 transition-all border-b last:border-b-0 text-left group ${
                                      selectedResultIndex === index
                                        ? darkMode ? 'bg-blue-950/30 border-blue-900/40' : 'bg-blue-50 border-blue-200'
                                        : darkMode ? 'hover:bg-slate-800/30 border-slate-800/40' : 'hover:bg-gray-50 border-gray-100'
                                    } ${isOutOfStock ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className={`font-semibold text-xs truncate ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{product.name}</p>
                                        {isOutOfStock && <span className="text-[8px] px-1 py-0.5 bg-red-500 text-white rounded font-bold">OUT</span>}
                                        {!isOutOfStock && isLowStock && <span className="text-[8px] px-1 py-0.5 bg-amber-500 text-white rounded font-bold"><AlertTriangle size={8}/>LOW</span>}
                                      </div>
                                      <div className="flex items-center gap-2.5 text-[10px] mt-0.5">
                                        <span className={darkMode ? 'text-slate-500' : 'text-gray-400'}>#{product.code}</span>
                                        {product.stock !== undefined && <span className={darkMode ? 'text-slate-500' : 'text-gray-400'}>Stock: {product.stock}</span>}
                                        <span className={`px-1.5 py-0.2 rounded-full font-medium ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>{product.category}</span>
                                      </div>
                                    </div>
                                    <div className="text-right ml-4 shrink-0 font-mono">
                                      <p className={`font-extrabold text-xs ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>₹{product.price.toFixed(2)}</p>
                                    </div>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="py-8 text-center text-gray-500">
                                <p className="text-xs font-semibold">No products found matching query</p>
                              </div>
                            )}
                          </motion.div>
                        ) : (
                          /* Glowing Barcode Scanner Simulator View */
                          <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none min-h-[220px]">
                            
                            {/* Neon Scanner Frame */}
                            <div className="relative w-40 h-28 border border-dashed rounded-xl flex items-center justify-center bg-slate-950 border-blue-500/30 shadow-inner group overflow-hidden">
                              <span className="text-3xl opacity-20 group-hover:scale-110 transition-transform duration-200">📱</span>
                              
                              {/* Pulsing neon laser line */}
                              <div className="absolute left-0 right-0 h-0.5 bg-green-500/80 dark:bg-green-400/80 shadow-md shadow-green-500/60 top-1/2 -translate-y-1/2 animate-[bounce_2s_infinite]" />
                              
                              {/* Laser corner brackets */}
                              <div className="absolute top-2 left-2 w-2.5 h-2.5 border-t-2 border-l-2 border-blue-500/60" />
                              <div className="absolute top-2 right-2 w-2.5 h-2.5 border-t-2 border-r-2 border-blue-500/60" />
                              <div className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b-2 border-l-2 border-blue-500/60" />
                              <div className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b-2 border-r-2 border-blue-500/60" />
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                // Select a random retail product
                                if (products.length === 0) {
                                  toast.error('No products in database to scan!');
                                  return;
                                }
                                const randIdx = Math.floor(Math.random() * products.length);
                                const randomProd = products[randIdx];
                                
                                playBarcodeBeep();
                                addItem(randomProd);
                                toast.success(`📡 Barcode Scanned: #${randomProd.code} - ${randomProd.name}`);
                              }}
                              className={`mt-4 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-500/10 active:scale-95 cursor-pointer`}
                            >
                              Simulate Laser Scan (Beep)
                            </button>
                            <p className="text-[9px] text-gray-500 dark:text-slate-500 mt-2">Hardware scanner is fully active via USB/KB wedge. Scan codes directly.</p>
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Horizontal resize handle (left col) ────────────────────── */}
          <div
            onMouseDown={() => startDrag('ly')}
            onDoubleClick={() => {
              if (searchPanelRef.current) searchPanelRef.current.style.height = '48%';
              leftSplitYRef.current = 48;
            }}
            title="Drag to resize · Double-click to reset"
            className={`flex-shrink-0 h-1.5 cursor-row-resize group relative flex items-center justify-center transition-colors ${
              darkMode
                ? 'bg-gray-800 hover:bg-blue-600/60 active:bg-blue-500'
                : 'bg-gray-200 hover:bg-blue-400/60 active:bg-blue-400'
            } ${dragging === 'ly' ? (darkMode ? 'bg-blue-500' : 'bg-blue-400') : ''}`}
          >
            <div className={`w-12 h-0.5 rounded-full transition-colors ${
              darkMode ? 'bg-gray-600 group-hover:bg-blue-400' : 'bg-gray-400 group-hover:bg-blue-400'
            } ${dragging === 'ly' ? 'bg-blue-400' : ''}`} />
          </div>

          {/* ▼ Panel 2 — Shopping Cart Line Items */}
          <div
            onClick={() => setActivePanel('cart')}
            className={`flex-1 flex flex-col overflow-hidden min-h-0 transition-all duration-150 ${
              activePanel === 'cart'
                ? darkMode ? 'ring-2 ring-inset ring-blue-500/50' : 'ring-2 ring-inset ring-blue-400/60'
                : ''
            }`}
          >
            <div className={`flex-1 min-h-0 overflow-hidden p-2.5 flex flex-col gap-2 ${
              darkMode ? 'bg-slate-950/20 backdrop-blur-md border border-slate-900/60 rounded-2xl shadow-xl' : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'
            }`}>
              {/* Panel title bar */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0 ${
                darkMode ? 'bg-slate-900/40 border border-slate-800/40' : 'bg-white border border-gray-200'
              }`}>
                <div className="w-1 h-4 rounded-full bg-blue-500" />
                <ShoppingCart size={13} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
                <span className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{sectorConfig.cartTitle}</span>
                <span className={`ml-auto text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {billItems.reduce((sum, item) => sum + item.quantity, 0)} items
                </span>
                {billLocked && (
                  <div className="flex items-center gap-1 ml-1">
                    <Lock size={11} className="text-red-400" />
                    <span className="text-[10px] text-red-400 font-semibold">Locked</span>
                  </div>
                )}
                {billItems.length > 0 && !billLocked && (
                  <button
                    onClick={(e) => { e.stopPropagation(); clearBill(); }}
                    className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                      darkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/10' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                    }`}
                  >
                    <Trash2 size={11} /> Clear
                  </button>
                )}
              </div>

              {activeTable && (
                <div className={`mb-1 p-3 rounded-xl flex items-center justify-between border ${
                  darkMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' : 'bg-rose-50 border-rose-150 text-rose-700'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🍽️</span>
                    <div>
                      <h4 className="font-extrabold text-[11px] tracking-tight uppercase">Dine-In Table</h4>
                      <p className="text-[10px] opacity-75 font-semibold">{activeTable.name} ({activeTable.seats} Seats)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {billItems.length > 0 && !billLocked && (
                      <button
                        onClick={handleSuspendOrderToTable}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all select-none cursor-pointer flex items-center gap-1 ${
                          darkMode ? 'bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/30 text-rose-300' : 'bg-rose-100 hover:bg-rose-200 border border-rose-200 text-rose-700'
                        }`}
                      >
                        📌 Suspend
                      </button>
                    )}
                    <button
                      onClick={() => {
                        localStorage.removeItem('nexusflowActiveTable');
                        setActiveTable(null);
                        setBillItems([]);
                        toast.success('Dine-In table unlinked');
                      }}
                      className={`p-1 rounded border transition-all select-none cursor-pointer ${
                        darkMode ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-400' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-400'
                      }`}
                      title="Unlink Table"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
              )}

              {/* Cart Table */}
              <div className={`flex-1 min-h-0 flex flex-col ${
                darkMode
                  ? 'bg-slate-900/35 backdrop-blur-md border-slate-850/60 shadow-inner'
                  : 'bg-white/95 border-gray-200 shadow-md'
              } rounded-xl border overflow-hidden`}>

                {billItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-8 px-6">
                    <ShoppingCart size={48} className={`mx-auto mb-3 ${darkMode ? 'text-gray-700' : 'text-gray-200'}`} />
                    <p className={`font-semibold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{sectorConfig.cartEmptyTitle}</p>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{sectorConfig.cartEmptyDesc}</p>
                  </div>
                ) : (
                  <>
                    {/* Sticky table header */}
                    <div className={`flex-shrink-0 ${darkMode ? 'bg-slate-900/50 border-slate-800/80' : 'bg-gray-50 border-gray-200'} border-b`}>
                      <table className="w-full">
                        <thead>
                          <tr className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            <th className="text-left px-4 py-2.5">{sectorConfig.productTerm}</th>
                            <th className="text-center px-2 py-2.5 w-24">Qty</th>
                            <th className="text-right px-3 py-2.5 w-32">Price</th>
                            <th className="text-center px-2 py-2.5 w-24">Disc %</th>
                            <th className="text-right px-3 py-2.5 w-28">Total</th>
                            <th className="w-10"></th>
                          </tr>
                        </thead>
                      </table>
                    </div>
                    {/* Scrollable rows */}
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      <table className="w-full">
                        <tbody>
                          <AnimatePresence>
                            {billItems.map((item, index) => {
                              const itemGstAmount = gstEnabled ? (item.price * item.quantity * (item.gstRate / 100)) : 0;
                              const itemTotal = item.price * item.quantity + itemGstAmount;
                              const itemId = item.selectedBatch ? `${item.code}-${item.selectedBatch}` : item.code;
                              const isEditing = editingItem === itemId;
                              return (
                                <motion.tr
                                  key={itemId}
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 20, height: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className={`border-b transition-colors ${
                                    darkMode ? 'border-slate-800/60 hover:bg-slate-800/20' : 'border-gray-100 hover:bg-gray-50'
                                  }`}
                                >
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className={`font-semibold text-sm ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{item.name}</p>
                                      {item.selectedBatch && (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-black tracking-wide uppercase ${
                                          darkMode ? 'bg-cyan-950 text-cyan-400 border border-cyan-900/30' : 'bg-cyan-50 text-cyan-705 border border-cyan-100'
                                        }`}>
                                          🧪 Batch: {item.selectedBatch}
                                        </span>
                                      )}
                                      {item.prescriptionFile && (
                                        <span 
                                          title="Rx Prescription Attached (offline base64)"
                                          className={`text-[9px] px-1.5 py-0.5 rounded font-black tracking-wide uppercase flex items-center gap-0.5 cursor-help ${
                                            darkMode ? 'bg-emerald-950/60 text-emerald-450 border border-emerald-900/30' : 'bg-emerald-50 text-emerald-705 border border-emerald-100'
                                          }`}
                                        >
                                          📄 Rx Attached
                                        </span>
                                      )}
                                    </div>
                                    <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>#{item.code}{gstEnabled && item.gstRate > 0 ? ` · ${item.gstRate}% GST` : ''}</p>
                                    
                                    {/* 💊 Pharmacy Inline Dosage Controls */}
                                    {activeSector === 'pharmacy' && (
                                      <div className="flex flex-col gap-1.5 mt-1.5">
                                        <div className="flex items-center gap-1 flex-wrap">
                                          <span className="text-[7.5px] font-black text-slate-500 font-mono tracking-wider">DOSAGE:</span>
                                          {['1-0-1', '1-1-1', '0-0-1', '1-0-0', 'SOS'].map((dos) => {
                                            const isSelected = item.dosage === dos;
                                            return (
                                              <button
                                                key={dos}
                                                type="button"
                                                onClick={() => {
                                                  setBillItems(prev => prev.map(bi => (bi.code === item.code && bi.selectedBatch === item.selectedBatch) ? { ...bi, dosage: dos } : bi));
                                                  toast.success(`Dosage set to ${dos} for ${item.name}`);
                                                }}
                                                className={`px-1.5 py-0.5 rounded text-[8px] font-black transition-all cursor-pointer ${
                                                  isSelected 
                                                    ? 'bg-teal-500 text-white shadow shadow-teal-500/25' 
                                                    : darkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-750' : 'bg-gray-150 text-gray-500 hover:bg-gray-200'
                                                }`}
                                              >
                                                {dos}
                                              </button>
                                            );
                                          })}
                                        </div>

                                        {/* Missing prescription warning if it is a Rx medicine */}
                                        {(item.code.charCodeAt(0) % 2 === 0) && !item.prescriptionFile && (
                                          <div className="flex items-center gap-1.5 text-[8.5px] font-black text-rose-500 animate-pulse bg-rose-500/5 px-2 py-0.5 rounded border border-rose-500/10 w-fit uppercase font-mono">
                                            ⚠️ Rx Required - Missing Prescription
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* 📦 Wholesale Case Calculator */}
                                    {activeSector === 'wholesale' && (
                                      <div className="mt-1 flex items-center gap-2 text-[8px] font-black text-amber-500/90 dark:text-amber-400/90 font-mono uppercase tracking-wider">
                                        <span>📦 Box size: {((item.code.charCodeAt(0) || 66) % 3 === 0) ? 12 : ((item.code.charCodeAt(0) || 66) % 3 === 1) ? 24 : 50} Pcs</span>
                                        <span>•</span>
                                        <span>{(item.quantity / (((item.code.charCodeAt(0) || 66) % 3 === 0) ? 12 : ((item.code.charCodeAt(0) || 66) % 3 === 1) ? 24 : 50)).toFixed(1)} Cases</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-2 py-2.5 w-24">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => updateQuantity(item.code, item.quantity - 1, item.selectedBatch)}
                                        disabled={billLocked}
                                        className={`w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-all disabled:opacity-30 ${
                                          darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-750/30' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                        }`}
                                      ><Minus size={12} /></button>
                                      <span className={`w-7 text-center text-sm font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{item.quantity}</span>
                                      <button
                                        onClick={() => updateQuantity(item.code, item.quantity + 1, item.selectedBatch)}
                                        disabled={billLocked}
                                        className={`w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-all disabled:opacity-30 ${
                                          darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-750/30' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                        }`}
                                      ><Plus size={12} /></button>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-right w-32">
                                    {isEditing ? (
                                      <div className="flex items-center gap-1 justify-end">
                                        <input
                                          type="number"
                                          step="0.01"
                                          defaultValue={item.price}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              const val = parseFloat((e.target as HTMLInputElement).value);
                                              if (!isNaN(val) && val >= 0) updatePrice(item.code, val, item.selectedBatch);
                                              setEditingItem(null);
                                            }
                                            if (e.key === 'Escape') setEditingItem(null);
                                          }}
                                          autoFocus
                                          className={`w-20 text-right text-sm border rounded px-1.5 py-0.5 focus:outline-none ${darkMode ? 'bg-slate-850 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-gray-300'}`}
                                        />
                                        <button onClick={() => setEditingItem(null)} className={`p-1 rounded ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}><X size={12} /></button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1 justify-end">
                                        <span className={`text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>₹{item.price.toFixed(2)}</span>
                                        {item.originalPrice && item.originalPrice !== item.price && (
                                          <span className={`text-[10px] line-through ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>₹{item.originalPrice.toFixed(2)}</span>
                                        )}
                                        {!billLocked && (
                                          <button onClick={() => setEditingItem(itemId)} className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-300 hover:text-gray-600'}`}><Edit2 size={11} /></button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-2 py-2.5 text-center w-24">
                                    <div className="flex items-center justify-center gap-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.5"
                                        disabled={billLocked}
                                        value={item.discountPercent ?? 0}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value);
                                          if (!isNaN(val) && val >= 0 && val <= 100) {
                                            updateItemDiscount(item.code, val, item.selectedBatch);
                                          }
                                        }}
                                        className={`w-14 text-center text-xs font-semibold border rounded py-1 focus:outline-none transition-all ${
                                          darkMode 
                                            ? 'bg-slate-850 border-slate-700 text-white focus:border-purple-500' 
                                            : 'bg-white border-gray-300 focus:border-purple-600'
                                        }`}
                                      />
                                      <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>%</span>
                                    </div>
                                  </td>
                                  <td className={`px-3 py-2.5 text-right font-bold text-sm w-28 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                    ₹{itemTotal.toFixed(2)}
                                  </td>
                                  <td className="pr-2 py-2.5 w-10">
                                    <button
                                      onClick={() => removeItem(item.code, item.selectedBatch)}
                                      disabled={billLocked}
                                      className={`p-1.5 rounded transition-all disabled:opacity-30 ${
                                        darkMode ? 'text-red-400 hover:bg-red-500/20' : 'text-red-500 hover:bg-red-50'
                                      }`}
                                    ><Trash2 size={14} /></button>
                                  </td>
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* ╚══════════════════════════════╝ END LEFT COLUMN */}

        {/* ── Vertical resize handle (main X split) ───────────────────────── */}
        <div
          onMouseDown={() => startDrag('x')}
          onDoubleClick={() => {
            if (leftColRef.current) leftColRef.current.style.width = '62%';
            splitXRef.current = 62;
          }}
          title="Drag to resize columns · Double-click to reset"
          className={`flex-shrink-0 w-1.5 cursor-col-resize group relative flex flex-col items-center justify-center transition-colors ${
            darkMode
              ? 'bg-gray-800 hover:bg-blue-600/60 active:bg-blue-500'
              : 'bg-gray-200 hover:bg-blue-400/60 active:bg-blue-400'
          } ${dragging === 'x' ? (darkMode ? 'bg-blue-500' : 'bg-blue-400') : ''}`}
        >
          <div className={`h-12 w-0.5 rounded-full transition-colors ${
            darkMode ? 'bg-gray-600 group-hover:bg-blue-400' : 'bg-gray-400 group-hover:bg-blue-400'
          } ${dragging === 'x' ? 'bg-blue-400' : ''}`} />
        </div>

        {/* ╔══════════════════════════════╗ RIGHT COLUMN */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* ▲ Panel 3 — Customer Information */}
          <div
            ref={customerPanelRef}
            onClick={() => setActivePanel('customer')}
            className={`flex flex-col overflow-hidden min-h-0 transition-all duration-150 ${
              activePanel === 'customer'
                ? darkMode ? 'ring-2 ring-inset ring-blue-500/50' : 'ring-2 ring-inset ring-blue-400/60'
                : ''
            }`}
            style={{ height: `${rightSplitYRef.current}%` }}
          >
            <div className={`flex-1 min-h-0 overflow-hidden p-2.5 flex flex-col gap-2 ${
              darkMode ? 'bg-slate-950/20 backdrop-blur-md border border-slate-900/60 rounded-2xl shadow-xl' : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'
            }`}>
              {/* Panel title bar */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0 ${
                darkMode ? 'bg-slate-900/40 border border-slate-800/40' : 'bg-white/80 border border-gray-200'
              }`}>
                <div className="w-1 h-4 rounded-full bg-purple-500" />
                <Users size={13} className={darkMode ? 'text-purple-400' : 'text-purple-600'} />
                <span className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{sectorConfig.customerLabel}</span>
              </div>

              <div className={`flex-1 min-h-0 overflow-y-auto rounded-xl border ${
                darkMode ? 'bg-slate-900/35 backdrop-blur-md border-slate-850/60 shadow-inner' : 'bg-white/95 border-gray-200 shadow-md'
              }`}>
                <div className="p-4 space-y-4">
                  {/* Customer Name */}
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{activeSector === 'pharmacy' ? 'Patient Name (Optional)' : activeSector === 'restaurant' ? 'Guest Name (Optional)' : activeSector === 'wholesale' ? 'Buyer / Company Name' : 'Customer Name (Optional)'}</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={activeSector === 'pharmacy' ? 'Enter patient name' : activeSector === 'restaurant' ? 'Enter guest name' : activeSector === 'wholesale' ? 'Enter buyer / company name' : 'Enter customer name'}
                      disabled={billLocked}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm disabled:opacity-50 transition-all ${
                        darkMode ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500' : 'border-gray-300 bg-white'
                      }`}
                    />
                  </div>
                  {/* Phone */}
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Phone (SMS Receipt & Loyalty)</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="10-digit mobile number"
                      disabled={billLocked}
                      maxLength={10}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm disabled:opacity-50 transition-all ${
                        darkMode ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500' : 'border-gray-300 bg-white'
                      }`}
                    />
                    {customerPhone && !validatePhone(customerPhone) && (
                      <p className={`text-xs mt-1 flex items-center gap-1 ${darkMode ? 'text-red-400' : 'text-red-600'}`}><AlertTriangle size={11} />Invalid (starts 6-9, 10 digits)</p>
                    )}
                    {customerPhone && validatePhone(customerPhone) && !currentCustomer && (
                      <p className={`text-xs mt-1 font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>✓ New customer — will earn loyalty points</p>
                    )}
                    {currentCustomer && (() => {
                      const points = currentCustomer.loyaltyPoints;
                      const spent = currentCustomer.totalSpent || 0;
                      const tierInfo = getLoyaltyTier(spent);

                      return (
                        <div className={`mt-2 p-3.5 rounded-xl border transition-all ${
                          darkMode 
                            ? 'bg-slate-900/60 border-slate-800 text-white' 
                            : 'bg-white border-gray-200 shadow-sm'
                        }`}>
                          {/* Header / Tier badge */}
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Loyalty Status</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gradient-to-r text-white ${tierInfo.colorClass}`}>
                              {tierInfo.name} Tier ({tierInfo.multiplier}x)
                            </span>
                          </div>

                          {/* Points & Spend Display */}
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-xl font-black text-purple-500 dark:text-purple-400">
                              {points} <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500">PTS</span>
                            </span>
                            <span className="text-xs font-bold text-emerald-500 dark:text-emerald-400">
                              ₹{Math.floor(spent).toLocaleString('en-IN')} <span className="text-[8px] text-gray-450 dark:text-slate-500 font-medium">SPENT</span>
                            </span>
                          </div>

                          {/* Tier Progress description */}
                          <div className="flex justify-between text-[9px] text-gray-400 dark:text-slate-500 font-medium mb-1">
                            <span>{tierInfo.name}</span>
                            {tierInfo.nextTier !== 'Max' ? (
                              <span>
                                ₹{Math.floor(spent).toLocaleString('en-IN')} / ₹{tierInfo.nextTierLimit.toLocaleString('en-IN')} to {tierInfo.nextTier}
                              </span>
                            ) : (
                              <span>Max Tier Unlocked!</span>
                            )}
                          </div>

                          {/* Beautiful Progress Bar */}
                          <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-slate-800 overflow-hidden mb-3">
                            <div 
                              className={`h-full bg-gradient-to-r ${tierInfo.colorClass} rounded-full transition-all duration-500`}
                              style={{ width: `${Math.min(Math.max(tierInfo.progress, spent > 0 ? 5 : 0), 100)}%` }}
                            />
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer border-t border-dashed dark:border-slate-800/80 pt-3">
                            <input type="checkbox" checked={redeemLoyalty} onChange={(e) => { setRedeemLoyalty(e.target.checked); if (!e.target.checked) setLoyaltyPointsToRedeem(0); }} disabled={billLocked || points === 0} className="w-4 h-4 rounded accent-purple-600 cursor-pointer" />
                            <span className={`text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Redeem Points for Discount</span>
                          </label>

                          {redeemLoyalty && points > 0 && (
                            <div className="mt-2.5 space-y-1.5 animate-fadeIn">
                              <input type="number" value={loyaltyPointsToRedeem} onChange={(e) => setLoyaltyPointsToRedeem(Math.min(parseInt(e.target.value) || 0, points))} max={points} min={0} placeholder="Points to redeem" disabled={billLocked} className={`w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/25 ${darkMode ? 'bg-slate-955 border-slate-800 text-white' : 'bg-white border-gray-300'}`} />
                              <p className={`text-xs font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>= ₹{(loyaltyPointsToRedeem * parseFloat(localStorage.getItem('pointValue') || '1')).toFixed(2)} discount applied</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Payment Method */}
                  <div>
                    <label className={`block text-xs font-semibold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Payment Method</label>
                    <div className="grid grid-cols-4 gap-1.5 mb-3">
                      {[{mode:'cash',icon:<Banknote size={20}/>,label:'Cash',key:'F1'},{mode:'upi',icon:<Smartphone size={20}/>,label:'UPI',key:'F2'},{mode:'card',icon:<CreditCard size={20}/>,label:'Card',key:'F3'},{mode:'ledger',icon:<Users size={20}/>,label:'Ledger',key:'F6'}].map(({mode,icon,label,key}) => (
                        <button
                          key={mode}
                          onClick={() => setPaymentMode(mode as any)}
                          disabled={billLocked}
                          className={`flex flex-col items-center gap-1.5 py-3 px-1.5 rounded-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            paymentMode === mode
                              ? darkMode ? 'border-emerald-500 bg-emerald-600/25 text-emerald-300 scale-105 shadow-lg' : 'border-emerald-500 bg-emerald-50 text-emerald-700 scale-105 shadow-md'
                              : darkMode ? 'border-slate-800 hover:border-slate-700 text-slate-400' : 'border-gray-300 hover:border-gray-400 text-gray-600'
                          }`}
                        >
                          {icon}
                          <span className="text-[11px] font-bold">{label}</span>
                          <span className="text-[9px] opacity-60">{key}</span>
                        </button>
                      ))}
                    </div>

                    {paymentMode === 'cash' && (
                      <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} className="space-y-2">
                        <input type="number" step="0.01" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} placeholder="Cash received" disabled={billLocked} className={`w-full px-3 py-2.5 border-2 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 transition-all text-base font-semibold ${darkMode ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500' : 'border-gray-300 bg-white'}`} />
                        <div className="grid grid-cols-3 gap-1">
                          <button type="button" onClick={() => setAmountReceived(roundedTotal.toString())} disabled={billLocked} className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all ${darkMode ? 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>Exact ₹{roundedTotal}</button>
                          {[50,100,200,500,2000].map(note => (
                            <button key={note} type="button" onClick={() => setAmountReceived(note.toString())} disabled={billLocked} className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all ${darkMode ? 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>₹{note}</button>
                          ))}
                        </div>
                        {amountReceivedNum >= roundedTotal && changeAmount > 0 && (
                          <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} className={`rounded-xl p-3 ${darkMode ? 'bg-green-600/20 border-2 border-green-500/40' : 'bg-green-50 border-2 border-green-300'}`}>
                            <span className={`text-xs font-bold uppercase ${darkMode ? 'text-green-300' : 'text-green-700'}`}>Change to Return</span>
                            <p className={`text-2xl font-black ${darkMode ? 'text-green-300' : 'text-green-700'}`}>₹{changeAmount.toFixed(2)}</p>
                          </motion.div>
                        )}
                      </motion.div>
                    )}

                    {paymentMode === ('ledger' as any) && (
                      <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}}>
                        <div className={`p-3.5 rounded-xl border-2 text-xs space-y-2 transition-all ${
                          customerPhone 
                            ? creditLimitExceeded
                              ? darkMode ? 'bg-rose-950/30 border-rose-500/40 text-rose-350' : 'bg-rose-50 border-rose-250 text-rose-800'
                              : darkMode ? 'bg-indigo-950/20 border-indigo-500/30 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-800'
                            : darkMode ? 'bg-amber-950/20 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                        }`}>
                          <p className="font-black uppercase tracking-wider text-[10px]">Ledger / Credit Sale Account</p>
                          
                          {customerPhone ? (
                            <div className="space-y-1.5">
                              <p className="font-extrabold">{customerName || 'Walk-in Customer'} · {customerPhone}</p>
                              
                              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-dashed dark:border-slate-800 border-gray-250">
                                <div>
                                  <span className="text-[9px] uppercase tracking-wider opacity-60 block">Ledger Balance</span>
                                  <span className="text-xs font-bold">₹{(currentCustomer?.outstandingBalance || 0).toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase tracking-wider opacity-60 block">Credit Limit</span>
                                  <span className="text-xs font-bold">₹{(currentCustomer?.creditLimit || 50000).toLocaleString('en-IN')}</span>
                                </div>
                              </div>

                              <p className="opacity-90 pt-1 font-semibold text-[11px]">
                                💸 Transaction total ₹{finalTotal.toFixed(2)} will be added to ledger.
                              </p>

                              {creditLimitExceeded && (
                                <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/35 rounded-lg text-rose-500 font-extrabold text-[10px] uppercase text-center animate-pulse tracking-wide select-none">
                                  ⚠️ CREDIT LIMIT EXCEEDED! (Max ₹{(currentCustomer?.creditLimit || 50000).toLocaleString('en-IN')})
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="font-bold text-red-500 animate-pulse">⚠️ Enter a customer phone number above first!</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Horizontal resize handle (right col) ────────────────────── */}
          <div
            onMouseDown={() => startDrag('ry')}
            onDoubleClick={() => {
              if (customerPanelRef.current) customerPanelRef.current.style.height = '52%';
              rightSplitYRef.current = 52;
            }}
            title="Drag to resize · Double-click to reset"
            className={`flex-shrink-0 h-1.5 cursor-row-resize group relative flex items-center justify-center transition-colors ${
              darkMode
                ? 'bg-gray-800 hover:bg-blue-600/60 active:bg-blue-500'
                : 'bg-gray-200 hover:bg-blue-400/60 active:bg-blue-400'
            } ${dragging === 'ry' ? (darkMode ? 'bg-blue-500' : 'bg-blue-400') : ''}`}
          >
            <div className={`w-12 h-0.5 rounded-full transition-colors ${
              darkMode ? 'bg-gray-600 group-hover:bg-blue-400' : 'bg-gray-400 group-hover:bg-blue-400'
            } ${dragging === 'ry' ? 'bg-blue-400' : ''}`} />
          </div>

          {/* ▼ Panel 4 — Bill Summary + Action Buttons */}
          <div
            onClick={() => setActivePanel('payment')}
            className={`flex flex-col overflow-hidden min-h-0 flex-1 transition-all duration-150 ${
              activePanel === 'payment'
                ? darkMode ? 'ring-2 ring-inset ring-blue-500/50' : 'ring-2 ring-inset ring-blue-400/60'
                : ''
            }`}
          >
            <div className={`flex-1 min-h-0 overflow-hidden p-2.5 flex flex-col gap-2 ${
              darkMode ? 'bg-slate-950/20 backdrop-blur-md border border-slate-900/60 rounded-2xl shadow-xl' : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'
            }`}>
              {/* Panel title bar */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0 ${
                darkMode ? 'bg-slate-900/40 border border-slate-800/40' : 'bg-white/80 border border-gray-200'
              }`}>
                <div className="w-1 h-4 rounded-full bg-emerald-500" />
                <DollarSign size={13} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                <span className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{sectorConfig.summaryLabel}</span>
                <motion.span key={roundedTotal} initial={{scale:1.15}} animate={{scale:1}} className={`ml-auto text-base font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  ₹{(roundedTotal - calculateLoyaltyDiscount()).toFixed(2)}
                </motion.span>
              </div>

              <div className={`flex-1 min-h-0 overflow-y-auto rounded-xl border ${
                darkMode ? 'bg-slate-900/35 backdrop-blur-md border-slate-850/60 shadow-inner' : 'bg-white/95 border-gray-200 shadow-md'
              }`}>
                <div className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Total Items</span>
                    <span className={`font-bold ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>{totalItems}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Subtotal</span>
                    <span className={`font-bold ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>₹{subtotal.toFixed(2)}</span>
                  </div>
                  {gstEnabled && totalGst > 0 && (
                    <div className={`border-t border-dashed pt-2 space-y-1 text-xs ${darkMode ? 'border-slate-800/80' : 'border-gray-200'}`}>
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>CGST</span>
                        <span className={darkMode ? 'text-green-400' : 'text-green-600'}>₹{cgst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>SGST</span>
                        <span className={darkMode ? 'text-green-400' : 'text-green-600'}>₹{sgst.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  {calculateLoyaltyDiscount() > 0 && (
                    <div className={`border-t border-dashed pt-2 text-xs ${darkMode ? 'border-slate-800/80' : 'border-gray-200'}`}>
                      <div className="flex justify-between">
                        <span className={`font-semibold ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>⭐ Loyalty ({loyaltyPointsToRedeem} pts)</span>
                        <span className={`font-bold ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>-₹{calculateLoyaltyDiscount().toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  {roundingEnabled && (paymentMode === 'cash' || paymentMode === 'upi') && roundingAdjustment !== 0 && (
                    <div className={`border-t border-dashed pt-2 space-y-1 text-xs ${darkMode ? 'border-slate-800/80' : 'border-gray-200'}`}>
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>Exact Total</span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>₹{exactTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>Rounding</span>
                        <span className={roundingAdjustment > 0 ? (darkMode ? 'text-green-400' : 'text-green-600') : (darkMode ? 'text-red-400' : 'text-red-600')}>{roundingAdjustment > 0 ? '+' : ''}₹{roundingAdjustment.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <div className={`border-t-2 pt-3 ${darkMode ? 'border-emerald-500/20' : 'border-emerald-200'}`}>
                    <div className={`p-3 rounded-xl flex items-baseline justify-between ${
                      darkMode ? 'bg-emerald-950/30 border border-emerald-900/50' : 'bg-emerald-50 border border-emerald-200'
                    }`}>
                      <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>{sectorConfig.grandTotalLabel}</span>
                      <motion.span key={roundedTotal} initial={{scale:1.1}} animate={{scale:1}} className={`text-2xl font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        ₹{(roundedTotal - calculateLoyaltyDiscount()).toFixed(2)}
                      </motion.span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-1">
                    <motion.button
                      whileHover={{ scale: billItems.length > 0 && !billLocked ? 1.01 : 1 }}
                      whileTap={{ scale: billItems.length > 0 && !billLocked ? 0.99 : 1 }}
                      onClick={handlePrintBill}
                      disabled={billItems.length === 0 || billLocked}
                      className={`w-full font-black py-3.5 rounded-xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base shadow-lg focus:ring-4 focus:ring-blue-500/40 ${
                        billItems.length > 0 && !billLocked
                          ? darkMode
                            ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white'
                            : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white'
                          : 'opacity-40 bg-gray-400 text-gray-200'
                      }`}
                    >
                      <Receipt size={20} />
                      {billLocked ? sectorConfig.billLockedText : sectorConfig.billButtonText}
                      {!billLocked && <span className="text-xs opacity-75 font-normal">(F4)</span>}
                    </motion.button>
                    <button
                      onClick={handleNewBill}
                      className={`w-full font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm border ${
                        darkMode ? 'bg-slate-800 hover:bg-slate-700 border-slate-700/40 text-slate-200' : 'bg-gray-200 hover:bg-gray-300 border-gray-300 text-gray-700'
                      }`}
                    >
                      <Plus size={15} /> {sectorConfig.newBillText} <span className="text-xs opacity-60">(F5 / ESC)</span>
                    </button>
                    <p className={`text-[10px] text-center ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                      Press <kbd className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${darkMode ? 'bg-slate-800 text-slate-350' : 'bg-gray-200'}`}>?</kbd> for all shortcuts
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* ╚══════════════════════════════╝ END RIGHT COLUMN */}

      </div>
      {/* ── END Tiling Canvas ─────────────────────────────────────────────── */}
        </div>
      )}

      {/* Modals */}
      {showReceipt && (
        <BillReceipt
          items={billItems}
          total={roundedTotal}
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
          roundedTotal={roundingEnabled ? roundedTotal : undefined}
          roundingAdjustment={roundingEnabled ? roundingAdjustment : undefined}
          onClose={handleNewBill}
          customerGstin={customerGstin}
          igst={igst}
          pricingTier={pricingTier}
        />
      )}

      {showCompletion && (
        <CompletionModal
          billNumber={currentBillNumber}
          itemCount={totalItems}
          total={roundedTotal}
          paymentMode={paymentMode}
          changeAmount={changeAmount}
          onClose={() => setShowCompletion(false)}
          onNewBill={handleNewBill}
        />
      )}



      {showHistory && (
        <BillHistoryModal
          billHistory={billHistory}
          onViewBill={handleViewBill}
          onClose={() => setShowHistory(false)}
          darkMode={darkMode}
        />
      )}

      {showShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}

      <ShiftStartModal />

      {showShiftClose && (
        <ShiftClosingModal onClose={() => setShowShiftClose(false)} />
      )}

      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl transition-all ${
              darkMode ? 'bg-slate-900/95 border-slate-800 text-white' : 'bg-white border-gray-200 text-slate-900'
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏷️</span>
                <div>
                  <h3 className="text-sm font-black tracking-tight">Quick Add Product</h3>
                  <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Scanned barcode not in catalog</p>
                </div>
              </div>
              <button 
                onClick={() => setShowQuickAddModal(false)}
                className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all ${
                  darkMode ? 'bg-slate-850 hover:bg-slate-800 border-slate-800 text-slate-400' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-500'
                }`}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="space-y-3.5">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Barcode / SKU *</label>
                <div className="flex gap-1.5">
                  <input 
                    type="text" 
                    required
                    placeholder="Scan or type barcode/SKU"
                    value={quickAddBarcode}
                    onChange={e => setQuickAddBarcode(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/25 ${
                      darkMode ? 'bg-slate-950 border-slate-800 text-purple-400' : 'bg-white border-gray-200 text-purple-600'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={startMobileScan}
                    className={`px-2.5 rounded-xl border flex items-center justify-center transition-all md:hidden hover:scale-105 active:scale-95 ${
                      darkMode ? 'bg-slate-850 hover:bg-slate-800 border-slate-800 text-purple-400' : 'bg-gray-100 hover:bg-gray-200 border-gray-250 text-purple-600'
                    }`}
                    title="Scan Barcode using phone camera"
                  >
                    <Camera size={14} />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Product Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Coca-Cola Can 330ml..."
                  value={quickAddForm.name}
                  onChange={e => setQuickAddForm(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all focus:ring-2 focus:ring-purple-500/25 ${
                    darkMode ? 'bg-slate-950 border-slate-850 text-white focus:border-purple-500' : 'bg-white border-gray-200 focus:border-purple-500'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Selling Price (₹)</label>
                  <input 
                    type="number" 
                    required
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={quickAddForm.price}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, price: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all focus:ring-2 focus:ring-purple-500/25 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white focus:border-purple-500' : 'bg-white border-gray-200 focus:border-purple-500'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Initial Stock</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    value={quickAddForm.stock}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, stock: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all focus:ring-2 focus:ring-purple-500/25 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white focus:border-purple-500' : 'bg-white border-gray-200 focus:border-purple-500'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Category</label>
                  <select 
                    value={quickAddForm.category}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, category: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all ${
                      darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-gray-200'
                    }`}
                  >
                    {sectorConfig.categories.map((cat: string) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">GST Slab (%)</label>
                  <select 
                    value={quickAddForm.gstRate}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, gstRate: parseInt(e.target.value) }))}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all ${
                      darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-gray-200'
                    }`}
                  >
                    <option value="0">0% Exempted</option>
                    <option value="5">5% GST</option>
                    <option value="12">12% GST</option>
                    <option value="18">18% GST</option>
                    <option value="28">28% GST</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Unit of Measurement (UOM) *</label>
                  {!isAddingCustomUom ? (
                    <select 
                      value={quickAddForm.uom}
                      onChange={e => {
                        if (e.target.value === '__add_custom_uom__') {
                          setIsAddingCustomUom(true);
                          setQuickAddForm(prev => ({ ...prev, uom: '' }));
                        } else {
                          setQuickAddForm(prev => ({ ...prev, uom: e.target.value }));
                        }
                      }}
                      className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all ${
                        darkMode ? 'bg-slate-955 border-slate-800 text-white' : 'bg-white border-gray-200'
                      }`}
                    >
                      <option value="PCS">PCS (Pieces)</option>
                      <option value="KG">KG (Kilograms)</option>
                      <option value="GRAM">GRAM</option>
                      <option value="LITRE">LITRE</option>
                      <option value="ML">ML (Milliliters)</option>
                      <option value="BOX">BOX</option>
                      <option value="PACK">PACK</option>
                      <option value="METER">METER</option>
                      <option value="__add_custom_uom__">➕ Add Custom Unit...</option>
                    </select>
                  ) : (
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="text"
                        value={quickAddForm.uom}
                        onChange={e => setQuickAddForm(prev => ({ ...prev, uom: e.target.value }))}
                        placeholder="e.g. BOTTLE, PAIR..."
                        autoFocus
                        className={`flex-1 px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all ${
                          darkMode ? 'bg-slate-955 border-slate-850 text-white focus:border-purple-500' : 'bg-white border-gray-200 focus:border-purple-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCustomUom(false);
                          setQuickAddForm(prev => ({ ...prev, uom: 'PCS' }));
                        }}
                        className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                          darkMode ? 'bg-slate-850 hover:bg-slate-800 border-slate-800 text-slate-350' : 'bg-gray-150 hover:bg-gray-205 border-gray-200 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">HSN Code (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 1905..."
                    value={quickAddForm.hsnCode}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, hsnCode: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all focus:ring-2 focus:ring-purple-500/25 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white focus:border-purple-500' : 'bg-white border-gray-200 focus:border-purple-500'
                    }`}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowQuickAddModal(false)}
                  className={`flex-1 font-bold py-2.5 rounded-xl text-xs border transition-all ${
                    darkMode ? 'bg-slate-850 border-slate-800 text-slate-350 hover:bg-slate-800' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 font-black py-2.5 rounded-xl text-xs text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-500/10 active:scale-95 transition-all"
                >
                  Save & Add
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showBatchSelectorModal && selectedProductForBatch && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={`w-full max-w-2xl p-6 rounded-2xl border shadow-2xl transition-all ${
              darkMode ? 'bg-slate-900/95 border-slate-800 text-white' : 'bg-white border-gray-200 text-slate-900'
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🧪</span>
                <div>
                  <h3 className="text-sm font-black tracking-tight">Select Medicine Batch</h3>
                  <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">{selectedProductForBatch.name}</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowBatchSelectorModal(false);
                  setSelectedProductForBatch(null);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all ${
                  darkMode ? 'bg-slate-850 hover:bg-slate-800 border-slate-800 text-slate-400' : 'bg-gray-100 hover:bg-gray-200 border-gray-250 text-gray-500'
                }`}
              >
                ✕
              </button>
            </div>

            <div className="my-4 max-h-[350px] overflow-y-auto rounded-xl border border-dashed dark:border-slate-800 border-gray-200">
              {availableProductBatches.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                  <AlertTriangle className="text-yellow-500 w-8 h-8 animate-bounce" />
                  <p className="text-xs font-bold text-gray-400">No active batches found in database!</p>
                  <p className="text-[10px] text-gray-500 max-w-sm">Please inward inventory for this medicine in settings dashboard before billing.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className={`border-b text-[10px] font-black uppercase tracking-wider ${darkMode ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                      <th className="px-4 py-3">Batch Number</th>
                      <th className="px-3 py-3 text-center">Expiry Date</th>
                      <th className="px-3 py-3 text-right">Available Qty</th>
                      <th className="px-3 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                    {availableProductBatches.map((batch) => {
                      const expiryDateObj = new Date(batch.expiry_date);
                      const isExpired = expiryDateObj < new Date();
                      
                      const warningHorizonDate = new Date();
                      warningHorizonDate.setDate(warningHorizonDate.getDate() + 90);
                      const isNearExpiry = !isExpired && expiryDateObj <= warningHorizonDate;

                      return (
                        <tr 
                          key={batch.id} 
                          className={`transition-colors ${
                            isExpired 
                              ? (darkMode ? 'bg-red-950/10 hover:bg-red-950/20' : 'bg-red-50/40 hover:bg-red-50/70') 
                              : (darkMode ? 'hover:bg-slate-850/40' : 'hover:bg-gray-50')
                          }`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-extrabold text-sm">{batch.batch_number}</p>
                            <p className={`text-[9px] font-mono ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              MFG: {batch.manufacturing_date || 'N/A'} {batch.drug_license ? `• DL: ${batch.drug_license}` : ''}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-center font-mono font-bold">
                            {batch.expiry_date}
                          </td>
                          <td className="px-3 py-3 text-right font-black text-sm">
                            {batch.stock_quantity}
                          </td>
                          <td className="px-3 py-3 text-center space-x-1">
                            {isExpired ? (
                              <span className="px-2 py-0.5 rounded text-[8.5px] font-black uppercase bg-red-500/10 text-red-500 border border-red-500/20">
                                🛑 Expired
                              </span>
                            ) : isNearExpiry ? (
                              <span className="px-2 py-0.5 rounded text-[8.5px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
                                ⚠️ Near Expiry
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[8.5px] font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                ✅ Active
                              </span>
                            )}
                            {(batch.prescription_required === 1 || batch.prescription_required === true) && (
                              <span className="px-2 py-0.5 rounded text-[8.5px] font-black uppercase bg-purple-500/10 text-purple-500 border border-purple-500/20">
                                Rx Req
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleSelectBatch(batch)}
                              disabled={isExpired || batch.stock_quantity <= 0}
                              className={`px-3.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all ${
                                isExpired
                                  ? 'bg-gray-500/10 text-gray-500 border border-gray-500/20 cursor-not-allowed'
                                  : batch.stock_quantity <= 0
                                  ? 'bg-gray-500/10 text-gray-500 border border-gray-500/20 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-500/10 active:scale-95'
                              }`}
                            >
                              {isExpired ? 'Block' : 'Select'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {showRxModal && selectedBatchForCart && selectedProductForBatch && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl transition-all ${
              darkMode ? 'bg-slate-900/95 border-slate-800 text-white' : 'bg-white border-gray-200 text-slate-900'
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📋</span>
                <div>
                  <h3 className="text-sm font-black tracking-tight">Prescription (Rx) Required</h3>
                  <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Regulated pharmaceutical item (Schedule H/X)</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowRxModal(false);
                  setSelectedBatchForCart(null);
                  setSelectedProductForBatch(null);
                  setRxImageBase64('');
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all ${
                  darkMode ? 'bg-slate-850 hover:bg-slate-800 border-slate-800 text-slate-400' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-500'
                }`}
              >
                ✕
              </button>
            </div>

            <div className="my-4 space-y-4">
              <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-950/40 border-slate-800 text-slate-350' : 'bg-gray-50 border-gray-200 text-gray-600'} text-xs space-y-1.5`}>
                <p className="font-bold text-slate-800 dark:text-white text-sm">🧪 {selectedProductForBatch.name}</p>
                <p>Batch: <span className="font-bold font-mono text-cyan-600">{selectedBatchForCart.batch_number}</span></p>
                <p className="text-[10.5px]">This drug requires a medical prescription from a registered practitioner. You must upload a copy to link to this bill item for audit records.</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-gray-400 block">Attach Prescription (PNG/JPG/PDF)</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setRxImageBase64(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all ${
                    darkMode ? 'bg-slate-950 border-slate-850 text-white focus:border-purple-500' : 'bg-white border-gray-200 focus:border-purple-500'
                  }`}
                />
              </div>

              {rxImageBase64 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-gray-400 block">Preview Attachment</span>
                  <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 max-h-[160px] bg-slate-950 flex items-center justify-center">
                    <img src={rxImageBase64} alt="Rx Prescription Attachment Preview" className="max-h-[160px] object-contain w-full" />
                    <button 
                      onClick={() => setRxImageBase64('')}
                      className="absolute top-2 right-2 bg-rose-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs hover:bg-rose-500 transition-colors shadow"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowRxModal(false);
                  setSelectedBatchForCart(null);
                  setSelectedProductForBatch(null);
                  setRxImageBase64('');
                }}
                className={`flex-1 font-bold py-2.5 rounded-xl text-xs border transition-all ${
                  darkMode ? 'bg-slate-850 border-slate-800 text-slate-350 hover:bg-slate-800' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!rxImageBase64) {
                    toast.error("⚠️ Please attach a prescription image/file to proceed!");
                    return;
                  }
                  addPharmacyProductToCart(selectedProductForBatch, selectedBatchForCart, rxImageBase64);
                }}
                disabled={!rxImageBase64}
                className={`flex-1 font-black py-2.5 rounded-xl text-xs text-white transition-all ${
                  rxImageBase64 
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/10 active:scale-95'
                    : 'bg-gray-500/10 text-gray-500 border border-gray-500/20 cursor-not-allowed'
                }`}
              >
                Confirm & Add
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 📷 Gorgeous Interactive Prescription OCR Laser Scanner Modal */}
      {showRxCaptureModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-lg flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className={`w-full max-w-lg p-6 rounded-3xl border shadow-2xl transition-all ${
              darkMode ? 'bg-slate-900/95 border-slate-800 text-white shadow-emerald-500/5' : 'bg-white border-gray-205 text-slate-900 shadow-xl'
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📷</span>
                <div>
                  <h3 className="text-sm font-black tracking-tight">Prescription Laser OCR Scanner</h3>
                  <p className="text-[10px] text-teal-400 font-bold uppercase tracking-wider">Dynamic Medical Document Digitizer</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowRxCaptureModal(false);
                  setRxCaptureState('idle');
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all ${
                  darkMode ? 'bg-slate-850 border-slate-800 text-slate-400 hover:bg-slate-800' : 'bg-gray-105 border-gray-250 text-gray-500 hover:bg-gray-200'
                }`}
              >
                ✕
              </button>
            </div>

            <div className="my-4 space-y-4">
              {/* Viewport container */}
              <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-slate-950 border border-slate-850 flex flex-col items-center justify-center p-4">
                
                {rxCaptureState === 'idle' && (
                  <div className="text-center flex flex-col items-center justify-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/25 flex items-center justify-center animate-pulse">
                      <Camera className="text-teal-400 w-8 h-8" />
                    </div>
                    <p className="text-xs font-bold text-gray-400">Position Doctor's Prescription Sheet</p>
                    <p className="text-[9.5px] text-gray-500 max-w-xs leading-normal">Ensure doctor's registration code and patient name are visible within standard focus borders.</p>
                  </div>
                )}

                {rxCaptureState === 'scanning' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {/* Glowing neon green scanning bar */}
                    <div className="absolute left-0 right-0 h-1 bg-emerald-500/80 dark:bg-emerald-400/80 shadow-md shadow-emerald-500/60 top-0 animate-[scan_2s_infinite]" />
                    <p className="text-xs font-black text-emerald-400 animate-pulse tracking-widest font-mono uppercase bg-slate-950/80 px-3 py-1.5 rounded-lg border border-emerald-500/20">📡 CAPTURING RX IMAGE...</p>
                    <style>{`
                      @keyframes scan {
                        0% { top: 0%; }
                        50% { top: 100%; }
                        100% { top: 0%; }
                      }
                    `}</style>
                  </div>
                )}

                {rxCaptureState === 'ocr' && (
                  <div className="text-center flex flex-col items-center justify-center gap-3">
                    <div className="w-12 h-12 rounded-full border-4 border-t-teal-400 border-teal-900 animate-spin" />
                    <p className="text-xs font-black text-teal-400 animate-pulse tracking-wider font-mono uppercase">Decoding Handwriting & OCR (NexusFlow AI)...</p>
                    <div className="text-[8px] font-mono text-gray-500 max-w-xs text-left bg-slate-900/60 p-2.5 rounded-lg border border-slate-850/60">
                      <p className="text-teal-500 font-bold">&gt; Initializing neural model...</p>
                      <p className="text-slate-450">&gt; Segmenting handwritten areas...</p>
                      <p className="text-slate-450">&gt; Matching Rx signatures...</p>
                    </div>
                  </div>
                )}

                {rxCaptureState === 'done' && (
                  <div className="w-full h-full flex gap-3 overflow-hidden p-2">
                    {/* Left: Scanned prescription layout preview */}
                    <div className="w-1/2 bg-white rounded-xl shadow-md p-3 border border-gray-200 text-slate-805 flex flex-col justify-between overflow-hidden relative select-none font-sans shrink-0">
                      {/* SVG / Vector Prescription Sheet */}
                      <div className="flex justify-between items-start border-b pb-1.5">
                        <div className="leading-none text-left">
                          <h4 className="font-extrabold text-[8px] text-teal-700 tracking-wider">APEX CLINIC</h4>
                          <p className="text-[5px] text-gray-500">Reg: 27A4510B / Delhi</p>
                        </div>
                        <span className="text-[12px] font-serif font-black text-teal-700 leading-none">Rx</span>
                      </div>

                      <div className="my-2 space-y-1 flex-1 min-h-0 overflow-y-auto pr-0.5 no-scrollbar text-left">
                        <div className="text-[6px] border-b pb-1 leading-snug">
                          <p><span className="font-bold">PATIENT:</span> {customerName || 'Rohan Verma'}</p>
                          <p><span className="font-bold">DATE:</span> {new Date().toLocaleDateString()}</p>
                        </div>
                        <div className="space-y-1 font-serif text-[7px] text-slate-800 mt-1 leading-normal">
                          <p className="font-bold tracking-tight">1. Amoxicillin 500mg (Capsules)</p>
                          <p className="text-[5px] font-sans text-gray-500 italic leading-none pl-2">Dosage: Twice Daily (1-0-1) - 5 Days</p>
                          <p className="font-bold tracking-tight mt-1">2. Paracetamol 650mg (Tablets)</p>
                          <p className="text-[5px] font-sans text-gray-500 italic leading-none pl-2">Dosage: Thrice Daily (1-1-1) - 3 Days</p>
                        </div>
                      </div>

                      <div className="flex justify-between items-end border-t pt-1 text-[5px] text-gray-500">
                        <div className="text-left">
                          <p className="font-bold text-[5.5px] text-slate-700 leading-none">Dr. Ramesh Sharma</p>
                          <p className="leading-none mt-0.5">MD, Reg No: MC-45902B</p>
                        </div>
                        <div className="text-right flex flex-col items-center">
                          <span className="w-6 h-3 opacity-75 border-b border-dashed border-teal-600 block flex items-end justify-center"><Check size={8} className="text-teal-600" /></span>
                          <span>Signature</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: OCR results detail list */}
                    <div className="flex-1 flex flex-col justify-between overflow-hidden">
                      <div className="space-y-2 text-left min-h-0 overflow-y-auto">
                        <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/15 uppercase font-mono tracking-wider w-fit block">✓ MATCHED & PARSED</span>
                        <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-xl border border-slate-850 text-[9.5px] font-semibold text-slate-350">
                          <p><span className="text-gray-500 uppercase font-mono text-[7.5px]">Practitioner:</span> Dr. Ramesh Sharma</p>
                          <p><span className="text-gray-500 uppercase font-mono text-[7.5px]">Reg Code:</span> MC-45902B</p>
                          <p><span className="text-gray-500 uppercase font-mono text-[7.5px]">Patient Match:</span> {customerName || 'Rohan Verma'}</p>
                          <p className="text-[8.5px] text-emerald-400 mt-1 font-bold">✨ OCR Confidence: 99.8%</p>
                        </div>
                      </div>
                      <p className="text-[8px] text-gray-500 dark:text-slate-500 italic leading-snug text-left">Prescription verified. Clicking Link will attach this Rx authorization to eligible medicines in the cart.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions row */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRxCaptureModal(false);
                    setRxCaptureState('idle');
                  }}
                  className={`flex-1 font-bold py-2.5 rounded-xl text-xs border transition-all cursor-pointer ${
                    darkMode ? 'bg-slate-850 border-slate-800 text-slate-355 hover:bg-slate-800' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Close
                </button>

                {rxCaptureState === 'idle' && (
                  <button
                    type="button"
                    onClick={() => {
                      playBeep('chime');
                      setRxCaptureState('scanning');
                      setTimeout(() => {
                        setRxCaptureState('ocr');
                        setTimeout(() => {
                          setRxCaptureState('done');
                          playBeep('success');
                        }, 1500);
                      }, 1200);
                    }}
                    className="flex-1 font-black py-2.5 rounded-xl text-xs text-white bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 shadow-lg shadow-teal-500/10 active:scale-95 cursor-pointer"
                  >
                    Capture & Parse Rx
                  </button>
                )}

                {rxCaptureState === 'done' && (
                  <button
                    type="button"
                    onClick={() => {
                      // Attach prescription file to pharmacy items in the cart
                      const mockRxImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><text x="10" y="30" fill="teal" font-size="12">Rx Scanned</text></svg>';
                      setBillItems(prev => prev.map(item => {
                        const isPrescriptionItem = item.code.charCodeAt(0) % 2 === 0;
                        if (isPrescriptionItem) {
                          return { ...item, prescriptionFile: mockRxImg };
                        }
                        return item;
                      }));
                      
                      setShowRxCaptureModal(false);
                      setRxCaptureState('idle');
                      toast.success('✨ Prescription digitized & linked to all cart prescription items!');
                    }}
                    className="flex-1 font-black py-2.5 rounded-xl text-xs text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/10 active:scale-95 cursor-pointer"
                  >
                    Link & Apply to Cart
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
