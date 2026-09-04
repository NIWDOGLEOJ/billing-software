import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Search, Trash2, Receipt, Settings, History, Scan, CreditCard, Smartphone, Banknote, X, Edit2, Check, AlertTriangle, Keyboard, Plus, Minus, Save, Lock, ShoppingCart, DollarSign, Info, Users, Camera, Store, Pill, UtensilsCrossed, Warehouse, Package } from 'lucide-react';
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
import { useDeferredLocalStorage } from '../hooks/useDeferredLocalStorage';
import { computeBillTotals } from '../lib/bill-totals';
import { ShiftStartModal } from './shift-start-modal';
import { ShiftClosingModal } from './shift-closing-modal';
import { BrowserMultiFormatReader } from '@zxing/library';
import { updatePointerGlare, SpecularGlareOverlay } from '../utils/glare';
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

/** How many search matches the dropdown shows. Shared with the keyboard
 *  handler so arrow navigation can never run past the visible rows. */
const SEARCH_RESULT_LIMIT = 8;

/** Max gap between keystrokes still considered machine-generated (barcode gun). */
const SCANNER_MAX_GAP_MS = 30;
/**
 * Consecutive sub-30ms gaps required before we start swallowing keystrokes.
 * A scanner sustains this trivially; a human typist essentially cannot, which
 * is what stops fast typing from losing characters.
 */
const SCANNER_MIN_FAST_RUN = 3;

/**
 * Shown in place of a product touch grid when there is nothing to draw.
 *
 * The grids previously mapped straight over the catalog with no guard, so a
 * cold load and an empty catalog both rendered as a silent blank panel — on the
 * cashier's primary work surface.
 */
function ProductGridPlaceholder({
  loading,
  searching,
  failed,
  onRetry,
}: {
  loading: boolean;
  searching: boolean;
  failed?: boolean;
  onRetry?: () => void;
}) {
  if (!loading && failed) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center text-center py-12 px-4 gap-2">
        <AlertTriangle size={28} className="text-[var(--danger)] opacity-80" />
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Couldn't load products
        </p>
        <p className="text-xs text-[var(--text-muted)] max-w-[17rem]">
          The till can't reach the server. Your catalog is safe — this is a
          connection problem, not missing data.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <>
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-[var(--border-glass)] bg-[var(--input-bg)] animate-pulse"
          />
        ))}
      </>
    );
  }

  return (
    <div className="col-span-full flex flex-col items-center justify-center text-center py-12 px-4 gap-2">
      <Package size={28} className="text-[var(--text-muted)] opacity-50" />
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {searching ? 'No matching products' : 'No products yet'}
      </p>
      <p className="text-xs text-[var(--text-muted)] max-w-[15rem]">
        {searching
          ? 'Try a different name or barcode.'
          : 'Add products in Settings → Products to start billing.'}
      </p>
    </div>
  );
}

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
  // Guards the checkout round-trip. The ref is the actual lock (set synchronously
  // before the first await, so two rapid clicks can never both get through);
  // the state exists only to drive the button's disabled/pending UI.
  const isSubmittingBillRef = useRef(false);
  const [isSubmittingBill, setIsSubmittingBill] = useState(false);
  // Lets the product grid show skeletons instead of an untouched blank panel,
  // which was indistinguishable from "this shop has no products".
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  // Distinguishes "the server didn't answer" from "this shop has no products".
  // Without it a failed fetch rendered the same "No products yet — add some in
  // Settings" message as a genuinely empty catalog.
  const [productsLoadFailed, setProductsLoadFailed] = useState(false);
  // Rupee value of one loyalty point. Held in state rather than read from
  // localStorage during render; loadData() refreshes it from server settings.
  const [pointValue, setPointValue] = useState(
    () => parseFloat(localStorage.getItem('pointValue') || '1') || 1
  );
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
  const [billingStep, setBillingStep] = useState<1 | 2 | 3>(1);

  // Sector & B2B states
  const [activeSector, setActiveSector] = useState<'retail'>(() => 'retail');

  // Bespoke Custom States for Sector Billing UIs
  const [manualInterstateOverride, setManualInterstateOverride] = useState<boolean | null>(null);
  const [showRxCaptureModal, setShowRxCaptureModal] = useState<boolean>(false);
  const [rxCaptureState, setRxCaptureState] = useState<'idle' | 'scanning' | 'ocr' | 'done'>('idle');
  const [prescriptionVerified, setPrescriptionVerified] = useState<boolean>(false);

  useEffect(() => {
    const handleSector = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.sector) {
        setActiveSector('retail');
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
    } catch {
      // Corrupt stored layout; start with no tables rather than crashing the till.
    }
    return [];
  });

  useEffect(() => {
    const handleSync = () => {
      try {
        const saved = localStorage.getItem('nexusflowTablesList');
        if (saved) setLocalTables(JSON.parse(saved));
      } catch {
        // Table state is advisory; billing continues regardless.
      }
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
        name: 'Retail Grocery POS',
        mobileName: 'Grocery Mobile',
        searchPlaceholder: 'Scan barcode or type product name / code...',
        searchPanelTitle: 'Add Grocery Items',
        cartTitle: 'Shopping Cart',
        cartEmptyTitle: 'Cart is empty',
        cartEmptyDesc: 'Search and add grocery items above',
        mobileCartEmpty: 'Your mobile cart is empty',
        mobileCartEmptyDesc: 'Use the manual drop-down or camera scan to add items.',
        quickAddLabel: 'Quick Add Grocery Item',
        quickAddDropdown: '-- Choose Product --',
        billButtonText: 'Generate Bill',
        billLockedText: 'Bill Generated ✓',
        newBillText: 'New Bill',
        customerLabel: 'Customer & Payment',
        summaryLabel: 'Bill Summary',
        grandTotalLabel: 'Grand Total',
        accentColor: 'teal',
        headerGradient: 'from-teal-500 to-cyan-600',
        sectorIcon: '🛒',
        sectorEmoji: '🛒',
        productTerm: 'Item',
        productTermPlural: 'Grocery Items',
        scannerLabel: 'Scan Grocery Barcode',
        scannerDesc: 'Scan package barcodes using rear camera',
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
  /**
   * Applies a /settings payload to local state. Extracted so a SETTINGS_UPDATED
   * broadcast can refresh settings alone, instead of re-running the full
   * three-endpoint load just to pick up a changed GST rate.
   */
  const applySettings = useCallback((settings: any) => {
    if (!settings) return;
    if (settings.gstEnabled !== undefined) setGstEnabled(settings.gstEnabled === 'true');
    if (settings.gstRate !== undefined) setGstRate(parseFloat(settings.gstRate));
    if (settings.roundingEnabled !== undefined) setRoundingEnabled(settings.roundingEnabled === 'true');
    if (settings.pointValue !== undefined) {
      const pv = parseFloat(settings.pointValue) || 1;
      setPointValue(pv);
      localStorage.setItem('pointValue', String(pv));
    }
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
  }, []);

  const loadSettingsOnly = useCallback(async () => {
    try {
      applySettings(await api.get<any>('/settings'));
    } catch (e) {
      // Settings are already applied from the last successful load; a failed
      // refresh just means this till keeps using them.
      console.error('Failed to refresh settings:', e);
    }
  }, [applySettings]);

  const loadData = useCallback(async () => {
    try {
      // These three are independent; fetching them in parallel cuts the cold
      // start from three sequential round-trips to one.
      setProductsLoadFailed(false);
      const [prods, settings, bills] = await Promise.all([
        api.get<any[]>('/products'),
        api.get<any>('/settings'),
        api.get<any[]>('/bills'),
      ]);

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

      applySettings(settings);

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
    } catch (e: any) {
      // This is the whole billing screen's data. Failing silently left the
      // cashier looking at an empty catalog with no idea anything was wrong.
      console.error('Failed to load initial data:', e);
      setProductsLoadFailed(true);
      toast.error(`Couldn't reach the server: ${e?.message || 'Connection failed'}`, {
        description: 'Product list and bill history may be out of date.',
      });
    } finally {
      setIsLoadingProducts(false);
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
      }
    },
    // The event carries the bill, so prepend it instead of re-fetching the
    // catalog, the settings, and the entire bill history.
    BILL_CREATED: (data: any) => {
      if (!data) return;
      const incoming: SavedBill = {
        billNumber: data.bill_number,
        date: data.date,
        items: data.items,
        total: data.total,
        subtotal: data.subtotal,
        gstAmount: data.gst_amount,
        cgst: data.cgst,
        sgst: data.sgst,
        gstRate: data.gst_rate,
        gstEnabled: data.gst_enabled,
        cashierName: data.cashier_name || 'Cashier',
        shopDetails: typeof data.shop_details === 'string'
          ? JSON.parse(data.shop_details)
          : (data.shop_details || { name: '', address: '', phone: '', email: '' }),
        customerName: data.customer_name || undefined,
        customerPhone: data.customer_phone || undefined,
        paymentMode: data.payment_mode,
        amountReceived: data.amount_received || undefined,
        changeAmount: data.change_amount || undefined,
        roundedTotal: data.total,
        roundingAdjustment: data.rounding_adjustment || 0,
        generatedBy: data.cashier_id,
      };
      setBillHistory(prev =>
        prev.some(b => b.billNumber === incoming.billNumber) ? prev : [incoming, ...prev]
      );
    },
    SETTINGS_UPDATED: () => {
      // Settings genuinely need a re-read, but only the settings — not the
      // product catalog and bill history alongside them.
      loadSettingsOnly();
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
          } else {
          toast.error('🔒 Access Denied: Only owners can access settings');
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setShowHistory(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNewBill();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        if (billItems.length > 0 && !billLocked) {
          // Fire-and-forget: handlePrintBill already toasts on failure, we only
          // swallow the rejection here so it isn't an unhandled promise.
          void handlePrintBill().catch(() => {});
        }
      }
      // F1-F5 shortcuts
      else if (e.key === 'F1') {
        e.preventDefault();
        setPaymentMode('cash');
      } else if (e.key === 'F2') {
        e.preventDefault();
        setPaymentMode('upi');
      } else if (e.key === 'F3') {
        e.preventDefault();
        setPaymentMode('card');
      } else if (e.key === 'F6') {
        e.preventDefault();
        setPaymentMode('ledger' as any);
        toast.info('Ledger / Khata — this sale will be recorded as unpaid credit');
      } else if (e.key === 'F4' && billItems.length > 0 && !billLocked) {
        e.preventDefault();
        // See the Ctrl+P handler above — the toast is the user-facing report.
        void handlePrintBill().catch(() => {});
      } else if (e.key === 'F5') {
        e.preventDefault();
        handleNewBill();
      } else if (e.key === 'F7') {
        // Step back. Without these two the wizard could only be navigated by
        // Tabbing to the header buttons, which breaks keyboard-only operation.
        e.preventDefault();
        setBillingStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev));
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (billItems.length === 0) {
          playBeep('warning');
          toast.error('Add at least one item before taking payment');
        } else {
          setBillingStep(2);
        }
      } else if (e.key === 'Escape' && showReceipt) {
        e.preventDefault();
        handleCloseReceipt();
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
    // Consecutive keystrokes fast enough to be machine-generated.
    let fastRun = 0;

    const handleBarcodeScan = (e: KeyboardEvent) => {
      if (billLocked) return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Intercept key if it's alphanumeric and time diff is small
      if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const isMachineFast = timeDiff < SCANNER_MAX_GAP_MS;
        fastRun = isMachineFast ? fastRun + 1 : 0;

        if (isMachineFast || buffer.length > 0) {
          if (isMachineFast || (buffer.length === 0 && timeDiff < 100)) {
            buffer += e.key;
            // Only swallow the keystroke once the input has been machine-fast
            // for a sustained run. Suppressing on a single sub-30ms gap ate
            // characters from fast human typists mid-word.
            if (fastRun >= SCANNER_MIN_FAST_RUN) {
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
          
          // The first few characters of a scan can reach the focused input
          // before the fast-run threshold trips, so clear it either way.
          setSearchQuery('');
          fastRun = 0;

          const found = products.find(p => p.code === scanCode || p.sku === scanCode);
          if (found) {
            addItem(found);
            playBarcodeBeep();
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
          }
        } else {
          buffer = '';
        }
      }
    };

    window.addEventListener('keydown', handleBarcodeScan, true);
    return () => window.removeEventListener('keydown', handleBarcodeScan, true);
  }, [products, billLocked]);

  // The two large caches are written off the critical path — serializing the
  // whole catalog and the whole bill history used to run synchronously right
  // after checkout, exactly when the next sale is starting.
  useDeferredLocalStorage('products', products);
  useDeferredLocalStorage('billHistory', billHistory);

  // Save settings
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
          // A blocking confirm() here froze the till at startup — and in kiosk
          // fullscreen the cashier could be staring at a modal they can't place.
          // An offer they can ignore is the right shape: doing nothing keeps the
          // draft, so it's still there next time.
          const itemCount = (parsed.items || []).length;
          toast('Unfinished bill from earlier', {
            description: `${itemCount} item${itemCount === 1 ? '' : 's'} were left in the cart.`,
            duration: 15000,
            action: {
              label: 'Restore',
              onClick: () => {
                setBillItems(parsed.items || []);
                setCustomerName(parsed.customerName || '');
                setCustomerPhone(parsed.customerPhone || '');
                setPaymentMode(parsed.paymentMode || 'cash');
                setAmountReceived(parsed.amountReceived || '');
                toast.success('Draft bill restored');
              },
            },
            cancel: {
              label: 'Discard',
              onClick: () => localStorage.removeItem('draftBill'),
            },
          });
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
    
    // No toast here on purpose. The row appearing in the cart, the highlight
    // driven by recentlyAddedCode, and the confirmation beep are all the
    // feedback an add needs — a toast per item buried the checkout column.
    setRecentlyAddedCode(product.code);
    setTimeout(() => setRecentlyAddedCode(null), 600);
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
    // Must be the list the dropdown actually renders. Iterating the full match
    // set while the dropdown showed only the first 8 meant ArrowDown walked into
    // invisible rows and Enter added a product the cashier could not see.
    const filtered = visibleSearchResults;

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
    }
    // Tab is deliberately NOT intercepted. It used to jump into quantity
    // editing via preventDefault(), which broke normal focus order out of the
    // search box and contradicted the shortcuts modal.
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

  // Search-box matches. Memoized and with the query lowercased once, instead of
  // re-filtering the whole catalog (twice per product) on every render.
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  // The dropdown and the keyboard handler must agree on exactly which rows
  // exist, so both read this one list.
  const visibleSearchResults = useMemo(
    () => filteredProducts.slice(0, SEARCH_RESULT_LIMIT),
    [filteredProducts]
  );

  // Category-only view, used by the restaurant touch grid.
  const categoryProducts = useMemo(
    () => (selectedCategory === 'All'
      ? products
      : products.filter(p => p.category === selectedCategory)),
    [products, selectedCategory]
  );

  // Category + search, shared by the grocery and wholesale touch grids.
  const catalogGridProducts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return products.filter(p => {
      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
    });
  }, [products, selectedCategory, searchQuery]);

  // Loyalty redemption value, used by both the memo below and handlePrintBill.
  const calculateLoyaltyDiscount = (): number => {
    if (!redeemLoyalty || !currentCustomer || loyaltyPointsToRedeem <= 0) return 0;
    return Math.min(loyaltyPointsToRedeem * pointValue, currentCustomer.loyaltyPoints * pointValue);
  };

  /**
   * Every number on the checkout column, in one memo.
   *
   * The arithmetic itself lives in lib/bill-totals.ts so it can be unit-tested
   * without mounting this component. This used to run inline on every render —
   * the reduce, the GST loop, the rounding, and a synchronous localStorage read
   * for the point value — so it recomputed on each keystroke in the search box.
   */
  const billTotals = useMemo(() => computeBillTotals({
    items: billItems,
    gstEnabled,
    isInterState,
    activeSector,
    roundingEnabled,
    paymentMode,
    amountReceived,
    redeemLoyalty,
    loyaltyPointsToRedeem,
    customerLoyaltyPoints: currentCustomer ? currentCustomer.loyaltyPoints : null,
    pointValue,
  }), [
    billItems, gstEnabled, activeSector, isInterState, roundingEnabled,
    paymentMode, amountReceived, redeemLoyalty, currentCustomer,
    loyaltyPointsToRedeem, pointValue,
  ]);

  // Destructured so the rest of the component reads exactly as before.
  const {
    subtotal, totalGst, cgst, sgst, igst, exactTotal,
    roundedTotal, roundingAdjustment, amountReceivedNum,
    loyaltyDiscount, finalTotal, changeAmount,
  } = billTotals;

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

    // A checkout is already in flight. Stay silent — the button is disabled and
    // the pending label is already telling the cashier what's happening.
    if (isSubmittingBillRef.current) {
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

    // Everything above is synchronous, so claiming the lock here is race-free:
    // no second click can reach this point before the flag is set.
    isSubmittingBillRef.current = true;
    setIsSubmittingBill(true);

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

      // One confirmation per sale. The loyalty discount and points earned used
      // to be two more separate toasts on top of this one; they belong in the
      // description of the single "sale recorded" message.
      const loyaltyNotes: string[] = [];
      if (customerPhone && validatePhone(customerPhone)) {
        if (loyaltyDiscount > 0) {
          loyaltyNotes.push(`₹${loyaltyDiscount.toFixed(2)} loyalty discount applied`);
        }
        if (pointsEarned > 0) {
          loyaltyNotes.push(`${pointsEarned} points earned (${tierInfo.name} tier)`);
        }
      }
      toast.success(`Bill #${billNumber} recorded`, {
        description: loyaltyNotes.length ? loyaltyNotes.join(' • ') : undefined,
        duration: 3000,
      });

      setBillLocked(true);
      localStorage.removeItem('draftBill');
      
      if (activeTable) {
        releaseActiveTable();
      }
      
      // Play register chime
      playBeep('chime');

      // Update bill history list state locally
      setBillHistory((prev) => [newBill, ...prev]);

      // Trigger automatic receipt print and cash drawer popup over local LAN.
      // The sale IS recorded at this point, so a printer problem is a warning,
      // not a failure — but it has to be visible, or the cashier stands there
      // waiting for paper that is never coming.
      try {
        await api.post(`/print/receipt/${billNumber}`, {});
      } catch (err: any) {
        console.error('Automatic print failed:', err);
        toast.warning('Printer did not respond', {
          description: `Bill #${billNumber} was saved. Print it again from Bill History.`,
          duration: 6000,
        });
      }

      setShowReceipt(true);
      setShowCompletion(true);
      setIsMobileShiftActive(true);

      // NOTE: there used to be a toast here claiming "Bill receipt sent to
      // <phone> — Message delivery confirmed". Nothing in this codebase sends
      // SMS or WhatsApp, so that confirmation was false. Removed rather than
      // reworded: a cashier who reads it will tell the customer their receipt
      // is on its way. Wire up a real messaging provider before reinstating it.
    } catch (e: any) {
      console.error('Checkout failed:', e);
      // Play warning buzz
      playBeep('warning');
      toast.error(`❌ Checkout failed: ${e.message || 'Server error'}`);
      // Rethrow so callers know the sale was NOT recorded. BillReceipt awaits
      // onFinalizeBill() and aborts the print on a rejection — swallowing this
      // here is what let a receipt print for a sale the server had rejected.
      throw e;
    } finally {
      isSubmittingBillRef.current = false;
      setIsSubmittingBill(false);
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

  const handleCloseReceipt = () => {
    setShowReceipt(false);
    if (!billLocked) {
      setBillingStep(1);
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

  // Panel focus, used to highlight whichever area the cashier is working in.
  // (The old Hyprland-style tiling — three mouse-only drag handles writing
  // percentage sizes onto the DOM — was replaced by a CSS grid; the drag
  // machinery that went with it is gone.)
  const [activePanel, setActivePanel] = useState<'search' | 'cart' | 'customer' | 'payment'>('cart');
  const tilingRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const customerPanelRef = useRef<HTMLDivElement>(null);

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
      <div className="min-h-screen flex flex-col bg-[var(--bg-glass)] text-[var(--text-primary)] pb-24 overflow-y-auto">
        {/* Mobile Header */}
        <div className="p-4 pl-16 md:pl-4 sticky top-0 z-40 backdrop-blur-xl backdrop-saturate-200 border-b flex justify-between items-center transition-all border-[var(--border-glass)] bg-[var(--input-bg)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6)]">
          <div className="flex items-center gap-2">
            <Store className="text-[var(--primary-accent)] animate-pulse" size={24} />
            <div>
              <h1 className="text-base font-black tracking-tight">{sectorConfig.mobileName}</h1>
              <p className="text-[10px] text-[var(--text-muted)] font-medium">{sectorConfig.sectorEmoji} {activeSector.charAt(0).toUpperCase() + activeSector.slice(1)} • {user?.name || 'Cashier'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => toggleDarkMode()} 
              className="p-2 rounded-lg border text-xs font-bold transition-all bg-[var(--input-bg)] border-[var(--border-glass)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)]"
            >
              {darkMode ? '🌙' : '☀️'}
            </button>
            <button 
              onClick={() => logout()} 
              className="p-2 rounded-lg border text-[10px] font-bold bg-rose-500/10 border-rose-500/30 text-rose-500"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Mobile Attendance Status Card */}
          <div className="p-4 rounded-xl border transition-all shadow-sm glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Attendance Log Status</span>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                isMobileShiftActive 
                  ? 'bg-emerald-500/20 text-emerald-500' 
                  : 'bg-amber-500/20 text-amber-500'
              }`}>
                {isMobileShiftActive ? 'Shift Active' : 'Check-in Pending'}
              </span>
            </div>
            
            <p className="text-xs font-medium text-[var(--text-muted)] mt-1">
              {isMobileShiftActive 
                ? '✅ Attendance recorded successfully! Your hours are actively tracked.'
                : '⚠️ Mobile login requires generating a bill/checkout transaction to count towards active attendance and hours.'}
            </p>
          </div>

          {/* Quick manual select drop-down list */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{sectorConfig.quickAddLabel}</label>
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
                className="w-full p-2.5 rounded-xl border text-sm font-medium focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
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
            className="p-6 rounded-2xl border border-dashed text-center flex flex-col items-center justify-center gap-3 cursor-pointer hover:scale-[1.01] active:scale-[0.97] transition-all shadow-sm bg-purple-500/10 border-purple-500/40 hover:bg-purple-500/20 text-[var(--text-primary)]"
          >
            <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <Camera size={24} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-purple-500">{sectorConfig.scannerLabel}</h3>
              <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">{sectorConfig.scannerDesc}</p>
            </div>
          </div>

          {/* Cart Section */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{sectorConfig.cartTitle} ({totalItemsCount} items)</span>
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
              <div className="p-8 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                <ShoppingCart size={32} className="opacity-30 text-purple-500" />
                <p className="text-xs font-semibold opacity-60">{sectorConfig.mobileCartEmpty}</p>
                <p className="text-[10px] text-[var(--text-muted)] font-medium">{sectorConfig.mobileCartEmptyDesc}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {billItems.map(item => (
                  <div 
                    key={item.selectedBatch ? `${item.code}-${item.selectedBatch}` : item.code} 
                    className="p-3 rounded-xl border flex justify-between items-center shadow-sm transition-all glass-panel border-[var(--border-glass)] text-[var(--text-primary)]"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-extrabold">{item.name}</h4>
                        {item.selectedBatch && (
                          <span className="text-[8.5px] px-1 py-0.5 rounded font-black tracking-wide uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            🧪 {item.selectedBatch}
                          </span>
                        )}
                        {item.prescriptionFile && (
                          <span className="text-[8.5px] px-1 py-0.5 rounded font-black tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            📄 Rx
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] text-emerald-500 font-bold">₹{item.price.toFixed(2)}</span>
                        {item.originalPrice && item.originalPrice !== item.price && (
                          <span className="text-[9px] line-through text-[var(--text-muted)]">₹{item.originalPrice.toFixed(2)}</span>
                        )}
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/20">
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
                        className="w-6 h-6 rounded-lg flex items-center justify-center border text-xs font-bold bg-[var(--input-bg)] border-[var(--border-glass)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)]"
                      >
                        -
                      </button>
                      <span className="text-xs font-black px-1.5">{item.quantity}</span>
                      <button 
                        onClick={() => {
                          updateQuantity(item.code, item.quantity + 1, item.selectedBatch);
                        }}
                        className="w-6 h-6 rounded-lg flex items-center justify-center border text-xs font-bold bg-[var(--input-bg)] border-[var(--border-glass)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)]"
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
            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">Customer Information</span>
            
            <input 
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="10-digit customer phone number..."
              maxLength={10}
              className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            />

            {activeSector === 'wholesale' && (
              <div className="space-y-2 mt-2 pt-2 border-t border-dashed border-[var(--border-glass)]">
                <span className="text-[10px] font-bold uppercase text-emerald-500 block flex justify-between items-center select-none">
                  <span>Customer GSTIN (B2B Outward)</span>
                  {gstinIsValid !== null && (
                    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                      gstinIsValid ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
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
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] placeholder-[var(--text-muted)] ${gstinIsValid === false ? 'border-rose-500/40 focus:ring-rose-500/20' : ''}`}
                />
                
                {gstinIsValid && (
                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-tight">
                    💡 state routing: {isInterState ? '🌐 Inter-State (IGST Outward)' : '🏠 Intra-State (CGST + SGST)'}
                  </p>
                )}
              </div>
            )}

            {activeSector === 'wholesale' && (
              <div className="space-y-1.5 mt-2 pt-2 border-t border-dashed border-[var(--border-glass)]">
                <span className="text-[10px] font-bold uppercase text-emerald-500 block select-none">Wholesale Pricing Tier</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['retail', 'dealer', 'distributor'] as const).map(tier => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setPricingTier(tier)}
                      className={`py-1.5 rounded-lg text-[9px] font-black uppercase transition-all transform active:scale-[0.97] cursor-pointer ${
                        pricingTier === tier
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/15'
                          : 'bg-[var(--input-bg)] border border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
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
                <div className="p-3.5 rounded-xl border transition-all shadow-sm glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Loyalty Level</span>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gradient-to-r text-white ${tierInfo.colorClass}`}>
                      {tierInfo.name} Tier
                    </span>
                  </div>

                  <div className="flex justify-between items-center mb-2">
                    <span className="text-base font-black text-purple-500">{points} PTS</span>
                    <span className="text-xs font-bold text-emerald-500">₹{Math.floor(spent).toLocaleString('en-IN')} Spent</span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-[var(--input-bg)] overflow-hidden mb-2">
                    <div className={`h-full bg-gradient-to-r ${tierInfo.colorClass}`} style={{ width: `${tierInfo.progress}%` }} />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-dashed border-[var(--border-glass)]">
                    <input type="checkbox" checked={redeemLoyalty} onChange={(e) => { setRedeemLoyalty(e.target.checked); if (!e.target.checked) setLoyaltyPointsToRedeem(0); }} disabled={points === 0} className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer" />
                    <span className="text-[10px] font-bold text-[var(--text-muted)]">Redeem Points</span>
                  </label>

                  {redeemLoyalty && points > 0 && (
                    <div className="mt-2 space-y-1">
                      <input type="number" value={loyaltyPointsToRedeem} onChange={(e) => setLoyaltyPointsToRedeem(Math.min(parseInt(e.target.value) || 0, points))} max={points} min={0} placeholder="Points to redeem" className="w-full px-2 py-1 border rounded text-xs focus:outline-none bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]" />
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
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-white font-extrabold hover:bg-slate-700"
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
                <div className="absolute inset-x-6 h-40 border-2 border-[var(--primary-accent)] rounded-2xl flex items-center justify-center shadow-[0_0_15px_rgba(var(--primary-accent-rgb),0.3)] bg-[var(--primary-accent)]/5">
                  {/* Sweeping laser light */}
                  <div className="w-full h-0.5 bg-[var(--primary-accent)] animate-bounce shadow-[0_0_10px_var(--primary-accent)]" />
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
          <div className="fixed bottom-0 inset-x-0 p-4 border-t backdrop-blur-xl backdrop-saturate-200 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] z-30 flex gap-3 justify-between items-center transition-all glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase text-[var(--text-muted)]">Total</span>
              <span className="text-lg font-black text-emerald-500">₹{(roundedTotal - calculateLoyaltyDiscount()).toLocaleString('en-IN')}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <select 
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                className="p-2.5 rounded-xl border text-xs font-extrabold focus:outline-none bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
              >
                <option value="cash">💵 Cash</option>
                <option value="upi">📱 UPI</option>
                <option value="card">💳 Card</option>
              </select>

              <button 
                onClick={() => {
                  if (billItems.length === 0) {
                    toast.error('🛒 Cart is empty!');
                    return;
                  }
                  setBillingStep(3);
                  setShowReceipt(true);
                }}
                className="glass-btn glass-btn-accent px-6 py-3 rounded-xl font-extrabold text-xs"
              >
                {billLocked ? 'View Receipt' : 'Review & Print'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  const renderStepHeader = () => {
    const steps = [
      { id: 1 as const, title: 'Add Items', desc: 'Scan, search, and build cart', icon: <Scan size={15} /> },
      { id: 2 as const, title: 'Customer & Payment', desc: 'Loyalty, phone, and tender', icon: <Users size={15} /> },
      { id: 3 as const, title: 'Review & Print', desc: 'GST totals and final invoice', icon: <Receipt size={15} /> },
    ];

    const canGoPayment = billItems.length > 0;
    const canGoReview = billItems.length > 0 && (paymentMode !== 'ledger' || !!customerPhone);

    return (
      <div className="shrink-0 px-3 py-2 border-b backdrop-blur-xl backdrop-saturate-200 glass-panel border-[var(--border-glass)] text-[var(--text-primary)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl border glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white flex items-center justify-center">
              <Store size={16} />
            </div>
            <div>
              <div className="text-xs font-black leading-none">Retail Grocery POS</div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-teal-500 mt-1">LAN billing terminal</div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-3 gap-2 min-w-0">
            {steps.map((step) => {
              const isActive = billingStep === step.id;
              const isBlocked = (step.id === 2 && !canGoPayment) || (step.id === 3 && !canGoReview);
              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={isBlocked}
                  onClick={() => {
                    if (step.id === 3) {
                      if (billItems.length === 0) {
                        toast.error('🛒 Cart is empty! Add items to review invoice.');
                        return;
                      }
                      setBillingStep(3);
                      setShowReceipt(true);
                    } else {
                      setBillingStep(step.id);
                    }
                  }}
                  className={`min-w-0 px-3 py-2 rounded-xl border text-left transition-all active:scale-[0.97] disabled:opacity-45 disabled:cursor-not-allowed ${
                    isActive
                      ? 'glass-btn glass-btn-selected border-transparent'
                      : 'glass-btn text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/18 text-white' : 'bg-emerald-500/15 text-emerald-500'
                    }`}>
                      {step.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-black truncate">{step.title}</span>
                      <span className={`hidden xl:block text-[9px] font-semibold truncate ${isActive ? 'text-white/75' : 'text-[var(--text-muted)]'}`}>
                        {step.desc}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-3 px-3 py-2 rounded-xl border glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
            <div>
              <div className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Cart</div>
              <div className="text-xs font-black">{totalItems} items</div>
            </div>
            <div className="h-7 w-px bg-[var(--border-glass)]" />
            <div>
              <div className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Total</div>
              <div className="text-sm font-black text-emerald-500">₹{(roundedTotal - calculateLoyaltyDiscount()).toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {isMobileDevice ? renderMobileView() : (
        <div className="h-full flex flex-col overflow-hidden bg-transparent">
          {renderStepHeader()}

      {/* ── Hyprland-style Tiling Canvas ─────────────────────────────────── */}
      {/*
        Responsive billing canvas.

        This was a hand-rolled tiling system: three mouse-only drag handles
        writing percentage widths/heights straight onto the DOM. Those
        percentages were fixed regardless of viewport or content, so the product
        results panel was pinned at 28% of the canvas — slicing product cards in
        half — while the cart below sat mostly empty.

        It is now a CSS grid. Below xl the panels stack in one scrollable column;
        at xl and up the cart and totals move into their own column, which is
        the arrangement a till actually wants: browse on the left, running total
        always visible on the right.
      */}
      <div
        ref={tilingRef}
        className="flex-1 min-h-0 grid gap-2.5 p-2.5
                   grid-cols-1 auto-rows-min overflow-y-auto
                   xl:grid-rows-[minmax(0,1fr)] xl:auto-rows-auto xl:overflow-hidden"
      >

        {/* ╔══════════════════════════════╗ LEFT COLUMN */}
        <div
          ref={leftColRef}
          // Fractional rows, not `auto`: with `auto` the product grid grew to fit
          // its content and squeezed the cart to 0px. Both areas now get a
          // guaranteed share and scroll internally.
          className={`${billingStep === 1 ? 'grid' : 'hidden'} min-w-0 gap-2.5
                      auto-rows-min
                      xl:min-h-0 xl:overflow-hidden xl:auto-rows-auto
                      xl:grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)]`}
        >

          {/* ▲ Panel 1 — Search & Add Products */}
          <div
            ref={searchPanelRef}
            onClick={() => setActivePanel('search')}
            className={`flex flex-col overflow-hidden rounded-2xl transition-all duration-150
              min-h-[24rem] xl:min-h-0 ${
              activePanel === 'search'
                ? 'ring-2 ring-[var(--primary-accent)]/60'
                : ''
            }`}
          >
            <div className="flex-1 min-h-0 overflow-hidden p-2.5 flex flex-col gap-2 glass-panel border border-[var(--border-glass)] rounded-2xl shadow-xl">
              {/* Panel title bar */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0 bg-[var(--input-bg)] border border-[var(--border-glass)] text-[var(--text-primary)]">
                <div className="w-1 h-4 rounded-full bg-green-500" />
                <Scan size={13} className="text-green-500" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">{sectorConfig.searchPanelTitle}</span>
                
                {/* 🔌 High-end pulsing LAN Sync Indicator */}
                <div className="flex items-center gap-1.5 ml-3 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping absolute opacity-75" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  LAN Connected (1.2ms)
                </div>

                <span className="ml-auto text-[10px] text-[var(--text-muted)]">Ctrl+F · Barcode</span>
              </div>

              {activeSector === 'restaurant' ? (
                /* Restaurant-specific Dine-in quick-tap grid layout */
                <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                  {/* Table Plan Selector Bar */}
                  <div className="p-2.5 border-b flex flex-col gap-1.5 shrink-0 border-[var(--border-glass)] bg-[var(--input-bg)]">
                    <span className="text-[8.5px] font-black text-[var(--text-muted)] uppercase tracking-wider block font-mono">🍽️ SELECT ACTIVE TABLE</span>
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
                            className={`px-3 py-1.5 rounded-xl text-[10.5px] font-black uppercase transition-all whitespace-nowrap border flex items-center gap-1.5 cursor-pointer active:scale-[0.97] hover:scale-[1.02] shrink-0 ${
                              isSelected
                                ? 'bg-rose-500 border-rose-500 text-white shadow shadow-rose-500/25'
                                : isOccupied
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : 'bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  <div className="p-2.5 border-b flex gap-1.5 overflow-x-auto shrink-0 no-scrollbar border-[var(--border-glass)] bg-[var(--input-bg)]">
                    {['All', 'Starters', 'Main Course', 'Breads', 'Rice', 'Beverages', 'Desserts', 'Combo Meals'].map((cat) => {
                      const isSel = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer active:scale-[0.97] ${
                            isSel
                              ? 'bg-blue-600 text-white shadow'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>

                  {/* Touch Grid */}
                  <div className="flex-1 overflow-y-auto p-3 bg-transparent">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {(isLoadingProducts || categoryProducts.length === 0) && (
                        <ProductGridPlaceholder
                          loading={isLoadingProducts}
                          searching={selectedCategory !== 'All'}
                          failed={productsLoadFailed}
                          onRetry={loadData}
                        />
                      )}
                      {categoryProducts
                        .map((p) => (
                          <button
                            key={p.code}
                            type="button"
                            onClick={() => addItem(p)}
                            className="p-2.5 rounded-xl border text-left flex flex-col justify-between h-24 cursor-pointer select-none active:scale-[0.97] hover:scale-[1.01] transition-all glass-panel border-[var(--border-glass)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] shadow-sm"
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
                              <h4 className="font-black text-[11px] leading-tight mt-2 truncate w-full text-[var(--text-primary)]">
                                {p.name}
                              </h4>
                            </div>
                            <div className="flex justify-between items-center w-full border-t border-dashed border-[var(--border-glass)] pt-1.5 mt-1 text-[9px] font-bold">
                              <span className="text-[var(--text-muted)]">
                                {p.code}
                              </span>
                              <span className="font-extrabold text-blue-500">
                                ₹{p.price.toFixed(0)}
                              </span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              ) : activeSector === 'retail' ? (
                /* Retail view using the pharmacy project's compact dispenser UI pattern */
                <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                  {/* Combined Search & Mode Header */}
                  <div className="p-2.5 border-b flex flex-col gap-2 shrink-0 border-[var(--border-glass)] bg-[var(--input-bg)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-teal-400 uppercase tracking-widest block font-mono">🛒 RETAIL GROCERY DISPENSER</span>
                      <button 
                        onClick={() => {
                          inputRef.current?.focus();
                          toast.info('Scanner ready. Scan a barcode or type an item name.');
                        }}
                        className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all active:scale-[0.97] bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20"
                      >
                        <Scan size={10} /> Scan Barcode
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={14} />
                      <input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Search item name, category, SKU, or scan barcode..."
                        disabled={billLocked}
                        className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-teal-500"
                      />
                    </div>
                  </div>

                  {/* Horizontal Scrollable Grocery Category Tabs */}
                  <div className="p-2 border-b flex gap-1 overflow-x-auto shrink-0 no-scrollbar border-[var(--border-glass)] bg-[var(--input-bg)]">
                    {['All', 'Dairy', 'Bakery', 'Grains', 'Beverages', 'Produce', 'Snacks', 'Personal Care', 'Household'].map((cat) => {
                      const isSel = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`glass-btn px-2.5 py-1 rounded-md text-[8.5px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                            isSel
                              ? 'glass-btn-selected'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>

                  {/* Grocery Cards Touch Grid */}
                  <div className="flex-1 overflow-y-auto p-2.5 bg-transparent">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(isLoadingProducts || catalogGridProducts.length === 0) && (
                        <ProductGridPlaceholder
                          loading={isLoadingProducts}
                          searching={!!searchQuery || selectedCategory !== 'All'}
                          failed={productsLoadFailed}
                          onRetry={loadData}
                        />
                      )}
                      {catalogGridProducts
                        .map((p) => {
                          const isLowStock = p.stock !== undefined && p.lowStockThreshold !== undefined && p.stock <= p.lowStockThreshold;
                          const isOutOfStock = p.stock !== undefined && p.stock <= 0;
                          const charVal = p.code.charCodeAt(0) || 65;
                          const batchNum = `LOT-GR${charVal}${p.code.substring(Math.max(0, p.code.length - 2))}`;
                          const freshnessDate = `Best by ${String((charVal % 20) + 8).padStart(2, '0')}/08`;
                          
                          return (
                            <button
                              key={p.code}
                              type="button"
                              onClick={() => addItem(p)}
                              disabled={isOutOfStock}
                              className={`p-2 rounded-xl border text-left flex flex-col justify-between h-[105px] cursor-pointer select-none active:scale-[0.97] hover:scale-[1.01] transition-all relative glass-panel border-[var(--border-glass)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] shadow-sm ${isOutOfStock ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <div className="w-full">
                                <div className="flex items-center justify-between gap-1 w-full">
                                  <span className="text-[7px] font-black uppercase tracking-wider px-1 py-0.5 rounded border leading-none shrink-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/10">
                                    {p.category}
                                  </span>
                                  {isOutOfStock ? (
                                    <span className="text-[7.5px] font-black text-red-500 bg-red-500/5 px-1 py-0.5 rounded uppercase font-mono">Out</span>
                                  ) : isLowStock && (
                                    <span className="text-[7.5px] font-black text-amber-500 bg-amber-500/5 px-1 py-0.5 rounded uppercase font-mono">Low</span>
                                  )}
                                </div>
                                <h4 className="font-black text-[10.5px] leading-tight mt-1.5 truncate w-full text-[var(--text-primary)]">
                                  {p.name}
                                </h4>
                                <div className="flex items-center gap-1.5 text-[7.5px] font-bold text-[var(--text-muted)] mt-1 uppercase font-mono">
                                  <span>Lot: {batchNum}</span>
                                  <span>•</span>
                                  <span className="text-amber-500">{freshnessDate}</span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center w-full border-t border-dashed border-[var(--border-glass)] pt-1.5 mt-1 text-[8.5px] font-bold">
                                <span className="text-[var(--text-muted)]">
                                  Stock: {p.stock !== undefined ? p.stock : '60'}
                                </span>
                                <span className="font-black text-[10px] text-teal-400">
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
                <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                  {/* B2B Presets and Tax Slide Selector */}
                  <div className="p-2.5 border-b flex flex-col gap-2 shrink-0 border-[var(--border-glass)] bg-[var(--input-bg)]">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest block font-mono">📦 B2B BULK WORKSPACE</span>
                      
                      {/* Interactive Tax Toggle Slider */}
                      <div className="flex items-center gap-1 bg-[var(--input-bg)] p-0.5 rounded-lg border border-[var(--border-glass)]">
                        <button 
                          type="button" 
                          onClick={() => {
                            setManualInterstateOverride(false);
                            toast.info('🏠 Intrastate tax routing enforced (CGST + SGST)');
                          }}
                          className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase transition-all ${
                            isInterState === false 
                              ? 'glass-btn-selected' 
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                              ? 'glass-btn-selected' 
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                        className="px-2 py-1 rounded text-[8px] font-black uppercase border transition-all whitespace-nowrap bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
                        className="px-2 py-1 rounded text-[8px] font-black uppercase border transition-all whitespace-nowrap bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        Preset: Delhi (Distributor)
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={14} />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Scan bulk code, type SKU, or item code..."
                        disabled={billLocked}
                        className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {/* Horizontal Scrollable Wholesale Categories */}
                  <div className="p-2 border-b flex gap-1 overflow-x-auto shrink-0 no-scrollbar border-[var(--border-glass)] bg-[var(--input-bg)]">
                    {['All', 'General', 'FMCG', 'Bulk Grains', 'Beverages', 'Dairy', 'Frozen'].map((cat) => {
                      const isSel = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`glass-btn px-2.5 py-1 rounded-md text-[8.5px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                            isSel
                              ? 'glass-btn-selected'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                      {(isLoadingProducts || catalogGridProducts.length === 0) && (
                        <ProductGridPlaceholder
                          loading={isLoadingProducts}
                          searching={!!searchQuery || selectedCategory !== 'All'}
                          failed={productsLoadFailed}
                          onRetry={loadData}
                        />
                      )}
                      {catalogGridProducts
                        .map((p) => {
                          const charVal = p.code.charCodeAt(0) || 66;
                          const caseSize = (charVal % 3 === 0) ? 12 : (charVal % 3 === 1) ? 24 : 50;
                          const margin = 10 + (charVal % 5) * 2;
                          const moq = 5 + (charVal % 4) * 5;
                          
                          return (
                            <div
                              key={p.code}
                              className="p-2 rounded-xl border flex flex-col justify-between h-[120px] select-none transition-all relative glass-panel border-[var(--border-glass)] text-[var(--text-primary)] shadow-sm"
                            >
                              <div className="w-full cursor-pointer" onClick={() => addItem(p)}>
                                <div className="flex items-center justify-between gap-1 w-full">
                                  <span className="text-[7px] font-black uppercase tracking-wider px-1 py-0.5 rounded border leading-none bg-amber-500/10 text-amber-400 border-amber-500/10 shrink-0">
                                    {p.category}
                                  </span>
                                  <span className="text-[7.5px] font-black text-emerald-400 bg-emerald-500/5 px-1 py-0.5 rounded uppercase font-mono">Margin: {margin}%</span>
                                </div>
                                <h4 className="font-black text-[10.5px] leading-tight mt-1 truncate w-full text-[var(--text-primary)]">
                                  {p.name}
                                </h4>
                                <p className="text-[7.5px] font-bold text-[var(--text-muted)] uppercase font-mono mt-0.5">UOM: Box of {caseSize} • MOQ: {moq}</p>
                              </div>

                              {/* Bulk Quantity Multipliers Row */}
                              <div className="flex gap-1.5 mt-1 pt-1.5 border-t border-dashed border-[var(--border-glass)]">
                                <button 
                                  type="button" 
                                  onClick={() => addWholesaleBulkItem(p, 10)}
                                  className="flex-1 py-1 rounded text-[8px] font-black cursor-pointer uppercase active:scale-[0.97] transition-all bg-[var(--input-bg)] text-amber-500 hover:bg-[var(--surface-hover)]"
                                >
                                  +10
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => addWholesaleBulkItem(p, caseSize)}
                                  className="flex-1 py-1 rounded text-[8px] font-black cursor-pointer uppercase active:scale-[0.97] transition-all bg-amber-500 text-white hover:bg-amber-400 shadow shadow-amber-500/10"
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
                  <div className="w-1/3 flex flex-col overflow-hidden rounded-xl border p-2 shrink-0 glass-panel border-[var(--border-glass)]">
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
                          className="py-2 px-1.5 rounded-lg text-[9px] font-black uppercase text-center border cursor-pointer active:scale-[0.97] transition-all truncate bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Column: Laser Scan Simulator & Main Search bar */}
                  <div className="flex-1 flex flex-col overflow-hidden rounded-xl border glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                    {/* Search bar */}
                    <div className="p-2.5 border-b shrink-0 border-[var(--border-glass)] bg-[var(--input-bg)]">
                      <div className="pos-search-field relative rounded-lg border border-transparent transition-colors">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={14} />
                        <input
                          ref={inputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          onKeyDown={handleSearchKeyDown}
                          placeholder={sectorConfig.searchPlaceholder}
                          disabled={billLocked}
                          className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:border-blue-500"
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
                              visibleSearchResults.map((product, index) => {
                                const isLowStock = product.stock !== undefined && product.lowStockThreshold !== undefined && product.stock <= product.lowStockThreshold;
                                const isOutOfStock = product.stock !== undefined && product.stock <= 0;
                                return (
                                  <button
                                    key={product.code}
                                    onClick={() => addItem(product)}
                                    disabled={isOutOfStock}
                                    className={`w-full flex justify-between items-center px-4 py-3 transition-all border-b last:border-b-0 text-left group ${
                                      selectedResultIndex === index
                                        ? 'bg-blue-500/15 border-blue-500/30'
                                        : 'hover:bg-[var(--surface-hover)] border-[var(--border-glass)]'
                                    } ${isOutOfStock ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="font-semibold text-xs truncate text-[var(--text-primary)]">{product.name}</p>
                                        {isOutOfStock && <span className="text-[8px] px-1 py-0.5 bg-red-500 text-white rounded font-bold">OUT</span>}
                                        {!isOutOfStock && isLowStock && <span className="text-[8px] px-1 py-0.5 bg-amber-500 text-white rounded font-bold"><AlertTriangle size={8}/>LOW</span>}
                                      </div>
                                      <div className="flex items-center gap-2.5 text-[10px] mt-0.5">
                                        <span className="text-[var(--text-muted)]">#{product.code}</span>
                                        {product.stock !== undefined && <span className="text-[var(--text-muted)]">Stock: {product.stock}</span>}
                                        <span className="px-1.5 py-0.5 rounded-full font-medium bg-[var(--input-bg)] text-[var(--text-muted)]">{product.category}</span>
                                      </div>
                                    </div>
                                    <div className="text-right ml-4 shrink-0 font-mono">
                                      <p className="font-extrabold text-xs text-blue-500">₹{product.price.toFixed(2)}</p>
                                    </div>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="py-8 text-center text-[var(--text-muted)]">
                                <p className="text-xs font-semibold">No products found matching query</p>
                              </div>
                            )}
                          </motion.div>
                        ) : (
                          /* Glowing Barcode Scanner Simulator View */
                          <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none min-h-[220px]">
                            
                            {/* Neon Scanner Frame */}
                            <div className="relative w-40 h-28 border border-dashed rounded-xl flex items-center justify-center bg-[var(--input-bg)] border-blue-500/30 shadow-inner group overflow-hidden">
                              <span className="text-3xl opacity-20 group-hover:scale-110 transition-transform duration-200">📱</span>
                              
                              {/* Pulsing neon laser line */}
                              <div className="absolute left-0 right-0 h-0.5 bg-green-500/80 shadow-md shadow-green-500/60 top-1/2 -translate-y-1/2 animate-[bounce_2s_infinite]" />
                              
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
                              className="mt-4 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-500/10 active:scale-[0.97] cursor-pointer"
                            >
                              Simulate Laser Scan (Beep)
                            </button>
                            <p className="text-[9px] text-[var(--text-muted)] mt-2">Hardware scanner is fully active via USB/KB wedge. Scan codes directly.</p>
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

          {/* ▼ Panel 2 — Shopping Cart Line Items */}
          <div
            onClick={() => setActivePanel('cart')}
            className={`flex flex-col overflow-hidden transition-all duration-150
              min-h-[20rem] xl:min-h-0 ${
              activePanel === 'cart'
                ? 'ring-2 ring-inset ring-blue-500/50'
                : ''
            }`}
          >
            <div className="flex-1 min-h-0 overflow-hidden p-2.5 flex flex-col gap-2 glass-panel border border-[var(--border-glass)] rounded-2xl shadow-xl">
              {/* Panel title bar */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0 bg-[var(--input-bg)] border border-[var(--border-glass)] text-[var(--text-primary)]">
                <div className="w-1 h-4 rounded-full bg-blue-500" />
                <ShoppingCart size={13} className="text-blue-500" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">{sectorConfig.cartTitle}</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)]">
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
                    className="glass-btn glass-btn-danger ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                  >
                    <Trash2 size={11} /> Clear
                  </button>
                )}
              </div>

              {activeTable && (
                <div className="mb-1 p-3 rounded-xl flex items-center justify-between border bg-rose-500/10 border-rose-500/20 text-rose-400">
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
                        className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all select-none cursor-pointer flex items-center gap-1 bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/30 text-rose-300"
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
                      className="p-1 rounded border transition-all select-none cursor-pointer bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      title="Unlink Table"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
              )}

              {/* Cart Table */}
              <div className="flex-1 min-h-0 flex flex-col glass-panel rounded-xl border border-[var(--border-glass)] overflow-hidden">

                {billItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-8 px-6">
                    <ShoppingCart size={48} className="mx-auto mb-3 text-[var(--text-muted)] opacity-40" />
                    <p className="font-semibold text-[var(--text-muted)]">{sectorConfig.cartEmptyTitle}</p>
                    <p className="text-xs mt-1 text-[var(--text-muted)] opacity-75">{sectorConfig.cartEmptyDesc}</p>
                  </div>
                ) : (
                  <>
                    {/* Sticky table header */}
                    <div className="flex-shrink-0 bg-[var(--input-bg)] border-b border-[var(--border-glass)]">
                      <table className="w-full">
                        <thead>
                          <tr className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
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
                                  className="border-b transition-colors border-[var(--border-glass)] hover:bg-[var(--surface-hover)]"
                                >
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-semibold text-sm text-[var(--text-primary)]">{item.name}</p>
                                      {item.selectedBatch && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-black tracking-wide uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                          🧪 Batch: {item.selectedBatch}
                                        </span>
                                      )}
                                      {item.prescriptionFile && (
                                        <span 
                                          title="Rx Prescription Attached (offline base64)"
                                          className="text-[9px] px-1.5 py-0.5 rounded font-black tracking-wide uppercase flex items-center gap-0.5 cursor-help bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        >
                                          📄 Rx Attached
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-[var(--text-muted)]">#{item.code}{gstEnabled && item.gstRate > 0 ? ` · ${item.gstRate}% GST` : ''}</p>
                                    
                                    {/* 💊 Pharmacy Inline Dosage Controls */}
                                    {activeSector === 'pharmacy' && (
                                      <div className="flex flex-col gap-1.5 mt-1.5">
                                        <div className="flex items-center gap-1 flex-wrap">
                                          <span className="text-[7.5px] font-black text-[var(--text-muted)] font-mono tracking-wider">DOSAGE:</span>
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
                                                    ? 'glass-btn-selected' 
                                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                                      <div className="mt-1 flex items-center gap-2 text-[8px] font-black text-amber-500/90 font-mono uppercase tracking-wider">
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
                                        className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-all disabled:opacity-30 bg-[var(--input-bg)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-glass)]"
                                      ><Minus size={12} /></button>
                                      <span className="w-7 text-center text-sm font-bold text-[var(--text-primary)]">{item.quantity}</span>
                                      <button
                                        onClick={() => updateQuantity(item.code, item.quantity + 1, item.selectedBatch)}
                                        disabled={billLocked}
                                        className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-all disabled:opacity-30 bg-[var(--input-bg)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-glass)]"
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
                                          className="w-20 text-right text-sm border rounded px-1.5 py-0.5 focus:outline-none bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:border-blue-500"
                                        />
                                        <button onClick={() => setEditingItem(null)} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={12} /></button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1 justify-end">
                                        <span className="text-sm font-semibold text-[var(--text-primary)]">₹{item.price.toFixed(2)}</span>
                                        {item.originalPrice && item.originalPrice !== item.price && (
                                          <span className="text-[10px] line-through text-[var(--text-muted)]">₹{item.originalPrice.toFixed(2)}</span>
                                        )}
                                        {!billLocked && (
                                          <button onClick={() => setEditingItem(itemId)} className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--text-primary)]"><Edit2 size={11} /></button>
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
                                        className="w-14 text-center text-xs font-semibold border rounded py-1 focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:border-purple-500"
                                      />
                                      <span className="text-[10px] font-bold text-[var(--text-muted)]">%</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-bold text-sm w-28 text-emerald-500">
                                    ₹{itemTotal.toFixed(2)}
                                  </td>
                                  <td className="pr-2 py-2.5 w-10">
                                    <button
                                      onClick={() => removeItem(item.code, item.selectedBatch)}
                                      disabled={billLocked}
                                      className="glass-btn glass-btn-danger p-1.5 rounded-lg"
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

        {/* ╔══════════════════════════════╗ RIGHT COLUMN */}
        {/* The bill summary row keeps a floor of 15rem so the grand total and the
            checkout button are never pushed off-screen by a tall customer form. */}
        {/*
          Step 2 — Customer & Payment.

          This block had no step gating at all. It only *looked* correct before
          the layout was a CSS grid because the old percentage tiling gave the
          left column width:100% at step 1, squeezing this one to roughly zero
          pixels. It was hidden by accident, not by design, so the moment the
          columns became real grid tracks it started showing up on Add Items.
        */}
        <div className={`${billingStep === 2 ? 'grid' : 'hidden'} min-w-0 w-full gap-2.5 auto-rows-min
                        xl:min-h-0 xl:overflow-hidden xl:auto-rows-auto
                        xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]`}>

          {/* ▲ Panel 3 — Customer Information */}
          <div
            ref={customerPanelRef}
            onClick={() => setActivePanel('customer')}
            className={`flex flex-col overflow-hidden rounded-2xl transition-all duration-150
              min-h-[20rem] xl:min-h-0 ${
              activePanel === 'customer'
                ? 'ring-2 ring-[var(--primary-accent)]/60'
                : ''
            }`}
          >
            <div className="flex-1 min-h-0 overflow-hidden p-2.5 flex flex-col gap-2 glass-panel border border-[var(--border-glass)] rounded-2xl shadow-xl">
              {/* Panel title bar */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0 bg-[var(--input-bg)] border border-[var(--border-glass)] text-[var(--text-primary)]">
                <div className="w-1 h-4 rounded-full bg-purple-500" />
                <Users size={13} className="text-purple-500" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">{sectorConfig.customerLabel}</span>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border glass-panel border-[var(--border-glass)]">
                <div className="p-4 space-y-4">
                  {/* Customer Name */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-[var(--text-muted)]">{activeSector === 'pharmacy' ? 'Patient Name (Optional)' : activeSector === 'restaurant' ? 'Guest Name (Optional)' : activeSector === 'wholesale' ? 'Buyer / Company Name' : 'Customer Name (Optional)'}</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={activeSector === 'pharmacy' ? 'Enter patient name' : activeSector === 'restaurant' ? 'Enter guest name' : activeSector === 'wholesale' ? 'Enter buyer / company name' : 'Enter customer name'}
                      disabled={billLocked}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 text-sm disabled:opacity-50 transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    />
                  </div>
                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-[var(--text-muted)]">Phone (SMS Receipt & Loyalty)</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="10-digit mobile number"
                      disabled={billLocked}
                      maxLength={10}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 text-sm disabled:opacity-50 transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    />
                    {customerPhone && !validatePhone(customerPhone) && (
                      <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertTriangle size={11} />Invalid (starts 6-9, 10 digits)</p>
                    )}
                    {customerPhone && validatePhone(customerPhone) && !currentCustomer && (
                      <p className="text-xs mt-1 font-semibold text-blue-500">✓ New customer — will earn loyalty points</p>
                    )}
                    {currentCustomer && (() => {
                      const points = currentCustomer.loyaltyPoints;
                      const spent = currentCustomer.totalSpent || 0;
                      const tierInfo = getLoyaltyTier(spent);

                      return (
                        <div className="mt-2 p-3.5 rounded-xl border transition-all glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                          {/* Header / Tier badge */}
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Loyalty Status</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gradient-to-r text-white ${tierInfo.colorClass}`}>
                              {tierInfo.name} Tier ({tierInfo.multiplier}x)
                            </span>
                          </div>

                          {/* Points & Spend Display */}
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-xl font-black text-purple-500">
                              {points} <span className="text-[10px] font-bold text-[var(--text-muted)]">PTS</span>
                            </span>
                            <span className="text-xs font-bold text-emerald-500">
                              ₹{Math.floor(spent).toLocaleString('en-IN')} <span className="text-[8px] text-[var(--text-muted)] font-medium">SPENT</span>
                            </span>
                          </div>

                          {/* Tier Progress description */}
                          <div className="flex justify-between text-[9px] text-[var(--text-muted)] font-medium mb-1">
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
                          <div className="w-full h-2 rounded-full bg-[var(--input-bg)] overflow-hidden mb-3">
                            <div 
                              className={`h-full bg-gradient-to-r ${tierInfo.colorClass} rounded-full transition-all duration-500`}
                              style={{ width: `${Math.min(Math.max(tierInfo.progress, spent > 0 ? 5 : 0), 100)}%` }}
                            />
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer border-t border-dashed border-[var(--border-glass)] pt-3">
                            <input type="checkbox" checked={redeemLoyalty} onChange={(e) => { setRedeemLoyalty(e.target.checked); if (!e.target.checked) setLoyaltyPointsToRedeem(0); }} disabled={billLocked || points === 0} className="w-4 h-4 rounded accent-purple-600 cursor-pointer" />
                            <span className="text-xs font-medium text-[var(--text-primary)]">Redeem Points for Discount</span>
                          </label>

                          {redeemLoyalty && points > 0 && (
                            <div className="mt-2.5 space-y-1.5 animate-fadeIn">
                              <input type="number" value={loyaltyPointsToRedeem} onChange={(e) => setLoyaltyPointsToRedeem(Math.min(parseInt(e.target.value) || 0, points))} max={points} min={0} placeholder="Points to redeem" disabled={billLocked} className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/25 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]" />
                              <p className="text-xs font-semibold text-emerald-500">= ₹{(loyaltyPointsToRedeem * parseFloat(localStorage.getItem('pointValue') || '1')).toFixed(2)} discount applied</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Payment Method */}
                  <div>
                    <label className="block text-xs font-semibold mb-2 text-[var(--text-muted)]">Payment Method</label>
                    <div className="grid grid-cols-4 gap-1.5 mb-3">
                      {[{mode:'cash',icon:<Banknote size={20}/>,label:'Cash',key:'F1'},{mode:'upi',icon:<Smartphone size={20}/>,label:'UPI',key:'F2'},{mode:'card',icon:<CreditCard size={20}/>,label:'Card',key:'F3'},{mode:'ledger',icon:<Users size={20}/>,label:'Ledger',key:'F6'}].map(({mode,icon,label,key}) => (
                        <button
                          key={mode}
                          onClick={() => setPaymentMode(mode as any)}
                          disabled={billLocked}
                          className={`glass-btn flex flex-col items-center gap-1.5 py-3 px-1.5 rounded-xl transition-all disabled:cursor-not-allowed ${
                            paymentMode === mode
                              ? 'glass-btn-selected'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                        <input type="number" step="0.01" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} placeholder="Cash received" disabled={billLocked} className="w-full px-3 py-2.5 border-2 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 transition-all text-base font-semibold bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] placeholder-[var(--text-muted)]" />
                        <div className="grid grid-cols-3 gap-1">
                          <button type="button" onClick={() => setAmountReceived(roundedTotal.toString())} disabled={billLocked} className="py-1.5 text-[10px] font-bold rounded-lg border transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">Exact ₹{roundedTotal}</button>
                          {[50,100,200,500,2000].map(note => (
                            <button key={note} type="button" onClick={() => setAmountReceived(note.toString())} disabled={billLocked} className="py-1.5 text-[10px] font-bold rounded-lg border transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">₹{note}</button>
                          ))}
                        </div>
                        {amountReceivedNum >= roundedTotal && changeAmount > 0 && (
                          <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} className="rounded-xl p-3 bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400">
                            <span className="text-xs font-bold uppercase">Change to Return</span>
                            <p className="text-2xl font-black">₹{changeAmount.toFixed(2)}</p>
                          </motion.div>
                        )}
                      </motion.div>
                    )}

                    {paymentMode === ('ledger' as any) && (
                      <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}}>
                        <div className="p-3.5 rounded-xl border-2 text-xs space-y-2 transition-all glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                          <p className="font-black uppercase tracking-wider text-[10px]">Ledger / Credit Sale Account</p>
                          
                          {customerPhone ? (
                            <div className="space-y-1.5">
                              <p className="font-extrabold">{customerName || 'Walk-in Customer'} · {customerPhone}</p>
                              
                              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-dashed border-[var(--border-glass)]">
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

          {/* ▼ Panel 4 — Bill Summary + Action Buttons */}
          <div
            onClick={() => setActivePanel('payment')}
            className={`flex flex-col overflow-hidden transition-all duration-150
              min-h-[18rem] xl:min-h-0 ${
              activePanel === 'payment'
                ? 'ring-2 ring-inset ring-blue-500/50'
                : ''
            }`}
          >
            <div className="flex-1 min-h-0 overflow-hidden p-2.5 flex flex-col gap-2 glass-panel border border-[var(--border-glass)] rounded-2xl shadow-xl">
              {/* Panel title bar */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0 bg-[var(--input-bg)] border border-[var(--border-glass)] text-[var(--text-primary)]">
                <div className="w-1 h-4 rounded-full bg-emerald-500" />
                <DollarSign size={13} className="text-emerald-500" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">{sectorConfig.summaryLabel}</span>
                <motion.span key={roundedTotal} initial={{scale:1.15}} animate={{scale:1}} className="ml-auto text-base font-black text-emerald-500">
                  ₹{(roundedTotal - calculateLoyaltyDiscount()).toFixed(2)}
                </motion.span>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border glass-panel border-[var(--border-glass)] shadow-inner">
                <div className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Total Items</span>
                    <span className="font-bold text-[var(--text-primary)]">{totalItems}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Subtotal</span>
                    <span className="font-bold text-[var(--text-primary)]">₹{subtotal.toFixed(2)}</span>
                  </div>
                  {gstEnabled && totalGst > 0 && (
                    <div className="border-t border-dashed pt-2 space-y-1 text-xs border-[var(--border-glass)]">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">CGST</span>
                        <span className="text-emerald-500 font-bold">₹{cgst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">SGST</span>
                        <span className="text-emerald-500 font-bold">₹{sgst.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  {calculateLoyaltyDiscount() > 0 && (
                    <div className="border-t border-dashed pt-2 text-xs border-[var(--border-glass)]">
                      <div className="flex justify-between">
                        <span className="font-semibold text-purple-400">⭐ Loyalty ({loyaltyPointsToRedeem} pts)</span>
                        <span className="font-bold text-purple-400">-₹{calculateLoyaltyDiscount().toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  {roundingEnabled && (paymentMode === 'cash' || paymentMode === 'upi') && roundingAdjustment !== 0 && (
                    <div className="border-t border-dashed pt-2 space-y-1 text-xs border-[var(--border-glass)]">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Exact Total</span>
                        <span className="text-[var(--text-primary)]">₹{exactTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Rounding</span>
                        <span className={roundingAdjustment > 0 ? 'text-emerald-500' : 'text-rose-500'}>{roundingAdjustment > 0 ? '+' : ''}₹{roundingAdjustment.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <div className="border-t-2 pt-3 border-emerald-500/20">
                    <div className="p-3 rounded-xl flex items-baseline justify-between bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">{sectorConfig.grandTotalLabel}</span>
                      <motion.span key={roundedTotal} initial={{scale:1.1}} animate={{scale:1}} className="text-2xl font-black text-emerald-500">
                        ₹{(roundedTotal - calculateLoyaltyDiscount()).toFixed(2)}
                      </motion.span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-1">
                    <motion.button
                      whileHover={{ scale: billItems.length > 0 ? 1.01 : 1 }}
                      whileTap={{ scale: billItems.length > 0 ? 0.99 : 1 }}
                      onClick={() => {
                        if (billItems.length === 0) {
                          toast.error('🛒 Cart is empty! Add items to review invoice.');
                          return;
                        }
                        setBillingStep(3);
                        setShowReceipt(true);
                      }}
                      disabled={billItems.length === 0}
                      className="glass-btn glass-btn-accent w-full font-black py-3.5 rounded-xl disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
                    >
                      <Receipt size={20} />
                      {billLocked ? 'View Invoice / Receipt' : 'Review & Print Invoice'}
                      {!billLocked && <span className="text-xs opacity-75 font-normal">(F4)</span>}
                    </motion.button>
                    <button
                      onClick={handleNewBill}
                      className="w-full font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                    >
                      <Plus size={15} /> {sectorConfig.newBillText} <span className="text-xs opacity-60">(F5 / ESC)</span>
                    </button>
                    <p className="text-[10px] text-center text-[var(--text-muted)]">
                      Press <kbd className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[var(--input-bg)] border border-[var(--border-glass)] text-[var(--text-primary)]">?</kbd> for all shortcuts
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

          {/* Persistent keyboard hint bar.
              The shortcuts existed but were hidden behind a `?` modal, so a
              cashier had no way to discover them mid-sale. */}
          <div className="flex-shrink-0 flex items-center gap-x-4 gap-y-1 flex-wrap px-4 py-1.5
                          border-t border-[var(--border-glass)] bg-[var(--bg-glass)]
                          text-[10px] text-[var(--text-muted)]">
            {[
              ['Type', 'search'],
              ['↑ ↓', 'pick'],
              ['Enter', 'add to cart'],
              ['F1/F2/F3', 'cash / UPI / card'],
              ['F8', 'payment step'],
              ['F7', 'back'],
              ['F4', 'generate bill'],
              ['F5', 'new bill'],
              ['Ctrl+H', 'history'],
              ['?', 'all shortcuts'],
            ].map(([key, label]) => (
              <span key={key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <kbd className="kbd">{key}</kbd>
                <span>{label}</span>
              </span>
            ))}
          </div>
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
          billNumber={currentBillNumber || 'DRAFT-PREVIEW'}
          customerName={customerName}
          customerPhone={customerPhone}
          paymentMode={paymentMode}
          amountReceived={amountReceivedNum}
          changeAmount={changeAmount}
          roundedTotal={roundingEnabled ? roundedTotal : undefined}
          roundingAdjustment={roundingEnabled ? roundingAdjustment : undefined}
          onClose={handleCloseReceipt}
          onFinalizeBill={!billLocked ? handlePrintBill : undefined}
          customerGstin={customerGstin}
          igst={igst}
          pricingTier={pricingTier}
          billLocked={billLocked}
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl backdrop-saturate-200 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onPointerMove={updatePointerGlare}
            className="group relative w-full max-w-md p-6 rounded-2xl border shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] transition-all glass-panel border-[var(--border-glass)] text-[var(--text-primary)] overflow-hidden"
          >
            <SpecularGlareOverlay />
            <div className="relative z-10">
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
                className="w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="space-y-3.5">
              <div>
                <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Barcode / SKU *</label>
                <div className="flex gap-1.5">
                  <input 
                    type="text" 
                    required
                    placeholder="Scan or type barcode/SKU"
                    value={quickAddBarcode}
                    onChange={e => setQuickAddBarcode(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/25 bg-[var(--input-bg)] border-[var(--border-glass)] text-purple-400"
                  />
                  <button
                    type="button"
                    onClick={startMobileScan}
                    className="px-2.5 rounded-xl border flex items-center justify-center transition-all md:hidden hover:scale-105 active:scale-[0.97] bg-[var(--input-bg)] border-[var(--border-glass)] text-purple-400"
                    title="Scan Barcode using phone camera"
                  >
                    <Camera size={14} />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Product Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Coca-Cola Can 330ml..."
                  value={quickAddForm.name}
                  onChange={e => setQuickAddForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all focus:ring-2 focus:ring-purple-500/25 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Selling Price (₹)</label>
                  <input 
                    type="number" 
                    required
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={quickAddForm.price}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all focus:ring-2 focus:ring-purple-500/25 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Initial Stock</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    value={quickAddForm.stock}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, stock: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all focus:ring-2 focus:ring-purple-500/25 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Category</label>
                  <select 
                    value={quickAddForm.category}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                  >
                    {sectorConfig.categories.map((cat: string) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">GST Slab (%)</label>
                  <select 
                    value={quickAddForm.gstRate}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, gstRate: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
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
                  <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Unit of Measurement (UOM) *</label>
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
                      className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
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
                        className="flex-1 px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:border-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCustomUom(false);
                          setQuickAddForm(prev => ({ ...prev, uom: 'PCS' }));
                        }}
                        className="px-3 py-2 text-xs font-semibold rounded-xl border transition-colors bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">HSN Code (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 1905..."
                    value={quickAddForm.hsnCode}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, hsnCode: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all focus:ring-2 focus:ring-purple-500/25 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowQuickAddModal(false)}
                  className="glass-btn flex-1 font-bold py-2.5 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="glass-btn glass-btn-accent flex-1 font-black py-2.5 rounded-xl text-xs"
                >
                  Save & Add
                </button>
              </div>
            </form>
            </div>
          </motion.div>
        </div>
      )}

      {showBatchSelectorModal && selectedProductForBatch && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl backdrop-saturate-200 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onPointerMove={updatePointerGlare}
            className="group relative w-full max-w-2xl p-6 rounded-2xl border shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] transition-all glass-panel border-[var(--border-glass)] text-[var(--text-primary)] overflow-hidden"
          >
            <SpecularGlareOverlay />
            <div className="relative z-10">
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
                className="w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              >
                ✕
              </button>
            </div>

            <div className="my-4 max-h-[350px] overflow-y-auto rounded-xl border border-dashed border-[var(--border-glass)]">
              {availableProductBatches.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                  <AlertTriangle className="text-yellow-500 w-8 h-8 animate-bounce" />
                  <p className="text-xs font-bold text-[var(--text-muted)]">No active batches found in database!</p>
                  <p className="text-[10px] text-[var(--text-muted)] max-w-sm">Please inward inventory for this medicine in settings dashboard before billing.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-[10px] font-black uppercase tracking-wider bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)]">
                      <th className="px-4 py-3">Batch Number</th>
                      <th className="px-3 py-3 text-center">Expiry Date</th>
                      <th className="px-3 py-3 text-right">Available Qty</th>
                      <th className="px-3 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-glass)]">
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
                              ? 'bg-rose-500/10 hover:bg-rose-500/20' 
                              : 'hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-extrabold text-sm">{batch.batch_number}</p>
                            <p className="text-[9px] font-mono text-[var(--text-muted)]">
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
                                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-500/10 active:scale-[0.97]'
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
            </div>
          </motion.div>
        </div>
      )}

      {showRxModal && selectedBatchForCart && selectedProductForBatch && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl backdrop-saturate-200 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onPointerMove={updatePointerGlare}
            className="group relative w-full max-w-md p-6 rounded-2xl border shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] transition-all glass-panel border-[var(--border-glass)] text-[var(--text-primary)] overflow-hidden"
          >
            <SpecularGlareOverlay />
            <div className="relative z-10">
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
                className="w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              >
                ✕
              </button>
            </div>

            <div className="my-4 space-y-4">
              <div className="p-4 rounded-xl border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] text-xs space-y-1.5">
                <p className="font-bold text-[var(--text-primary)] text-sm">🧪 {selectedProductForBatch.name}</p>
                <p>Batch: <span className="font-bold font-mono text-cyan-500">{selectedBatchForCart.batch_number}</span></p>
                <p className="text-[10.5px]">This drug requires a medical prescription from a registered practitioner. You must upload a copy to link to this bill item for audit records.</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">Attach Prescription (PNG/JPG/PDF)</label>
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
                  className="w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:border-purple-500"
                />
              </div>

              {rxImageBase64 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">Preview Attachment</span>
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
                className="flex-1 font-bold py-2.5 rounded-xl text-xs border transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
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
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/10 active:scale-[0.97]'
                    : 'bg-gray-500/10 text-gray-500 border border-gray-500/20 cursor-not-allowed'
                }`}
              >
                Confirm & Add
              </button>
            </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 📷 Gorgeous Interactive Prescription OCR Laser Scanner Modal */}
      {showRxCaptureModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl backdrop-saturate-200 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            onPointerMove={updatePointerGlare}
            className="group relative w-full max-w-lg p-6 rounded-3xl border shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] transition-all glass-panel border-[var(--border-glass)] text-[var(--text-primary)] overflow-hidden"
          >
            <SpecularGlareOverlay />
            <div className="relative z-10">
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
                className="w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              >
                ✕
              </button>
            </div>

            <div className="my-4 space-y-4">
              {/* Viewport container */}
              <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-slate-950 border border-[var(--border-glass)] flex flex-col items-center justify-center p-4">
                
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
                    <div className="absolute left-0 right-0 h-1 bg-emerald-500/80 shadow-md shadow-emerald-500/60 top-0 animate-[scan_2s_infinite]" />
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
                    <div className="text-[8px] font-mono text-gray-500 max-w-xs text-left bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                      <p className="text-teal-500 font-bold">&gt; Initializing neural model...</p>
                      <p className="text-slate-400">&gt; Segmenting handwritten areas...</p>
                      <p className="text-slate-400">&gt; Matching Rx signatures...</p>
                    </div>
                  </div>
                )}

                {rxCaptureState === 'done' && (
                  <div className="w-full h-full flex gap-3 overflow-hidden p-2">
                    {/* Left: Scanned prescription layout preview */}
                    <div className="w-1/2 bg-white rounded-xl shadow-md p-3 border border-gray-200 text-slate-800 flex flex-col justify-between overflow-hidden relative select-none font-sans shrink-0">
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
                        <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-xl border border-[var(--border-glass)] text-[9.5px] font-semibold text-slate-300">
                          <p><span className="text-gray-500 uppercase font-mono text-[7.5px]">Practitioner:</span> Dr. Ramesh Sharma</p>
                          <p><span className="text-gray-500 uppercase font-mono text-[7.5px]">Reg Code:</span> MC-45902B</p>
                          <p><span className="text-gray-500 uppercase font-mono text-[7.5px]">Patient Match:</span> {customerName || 'Rohan Verma'}</p>
                          <p className="text-[8.5px] text-emerald-400 mt-1 font-bold">✨ OCR Confidence: 99.8%</p>
                        </div>
                      </div>
                      <p className="text-[8px] text-[var(--text-muted)] italic leading-snug text-left">Prescription verified. Clicking Link will attach this Rx authorization to eligible medicines in the cart.</p>
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
                  className="flex-1 font-bold py-2.5 rounded-xl text-xs border transition-all cursor-pointer bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
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
                    className="flex-1 font-black py-2.5 rounded-xl text-xs text-white bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 shadow-lg shadow-teal-500/10 active:scale-[0.97] cursor-pointer"
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
                    className="flex-1 font-black py-2.5 rounded-xl text-xs text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/10 active:scale-[0.97] cursor-pointer"
                  >
                    Link & Apply to Cart
                  </button>
                )}
              </div>
            </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
