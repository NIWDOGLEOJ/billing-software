import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router';
import {
  Search, Trash2, Settings, History, Check, AlertTriangle, Keyboard, Save,
  ShoppingCart, Info, Camera, Store, Pill, UtensilsCrossed, Warehouse,
  Package, Edit2, Zap, ZapOff, RefreshCw, X, ShieldAlert, Lock, CameraOff, AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
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
import { computeBillTotals, splitInclusiveGst } from '../lib/bill-totals';
import { MONO, NUM, EYEBROW, PANEL, PANEL_HEAD, FIELD, KBD, KBD_ON_FILL, inr } from '../lib/design-system';
import { ShiftStartModal } from './shift-start-modal';
import { ShiftClosingModal } from './shift-closing-modal';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { updatePointerGlare, SpecularGlareOverlay } from '../utils/glare';
import { ProductPhotoCaptureModal } from './product-photo-capture-modal';
import { compressImageFileToDataUrl } from '../utils/imageCompressor';
import { isMobileDevice as checkIsMobileDevice } from '../lib/device';
import {
  decodeBarcodeFromFile,
  hasLiveCameraSupport,
  startLiveBarcodeScanner,
  requestLiveCameraStream,
  hasTorchSupport,
  toggleCameraTorch,
  type LiveBarcodeScannerController
} from '../utils/barcodeDecoder';

// Polyfill window event listeners in SSR / Node test environments to prevent motion-dom crashes
if (typeof window !== 'undefined') {
  if (typeof (window as any).addEventListener !== 'function') {
    (window as any).addEventListener = () => {};
  }
  if (typeof (window as any).removeEventListener !== 'function') {
    (window as any).removeEventListener = () => {};
  }
}

export function getProductTierPrice(
  product: { price: number; wholesalePrice?: number; distributorPrice?: number },
  tier: 'retail' | 'dealer' | 'distributor' = 'retail'
): number {
  if (tier === 'dealer') {
    return (product.wholesalePrice && product.wholesalePrice > 0) ? product.wholesalePrice : product.price;
  }
  if (tier === 'distributor') {
    return (product.distributorPrice && product.distributorPrice > 0) ? product.distributorPrice : product.price;
  }
  return product.price;
}

export const SUPPORTED_BARCODE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'itf',
  'codabar',
  'qr_code',
  'data_matrix',
  'aztec',
  'pdf417'
];

export const ZXING_BARCODE_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.AZTEC,
  BarcodeFormat.PDF_417,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.RSS_14,
  BarcodeFormat.RSS_EXPANDED,
];

export function createConfiguredZxingReader(): BrowserMultiFormatReader {
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_BARCODE_FORMATS);
  return new BrowserMultiFormatReader(hints);
}

export {
  hasLiveCameraSupport,
  decodeBarcodeFromFile,
  startLiveBarcodeScanner,
  requestLiveCameraStream,
  hasTorchSupport,
  toggleCameraTorch
};

interface Product {
  id?: string;
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
  mrp?: number;
  purchasePrice?: number;
  wholesalePrice?: number;
  distributorPrice?: number;
  brand?: string;
  imageUrl?: string;
}

interface BillItem {
  id?: string;
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
  /** The store's own GSTIN, from Settings. Empty when not configured — the
      receipt then prints no GSTIN rather than inventing one. */
  gstin: string;
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

/* Register-only constants. The shared visual primitives (EYEBROW, PANEL,
   FIELD, KBD, NUM, inr…) come from ../lib/design-system so every redesigned
   screen draws them from one place. */
type PaymentMode = 'cash' | 'upi' | 'card' | 'ledger';

/** Tender options. Keys match the F-key handler already in the component. */
const PAY_MODES: ReadonlyArray<{ mode: PaymentMode; label: string; key: string }> = [
  { mode: 'cash', label: 'Cash', key: 'F1' },
  { mode: 'upi', label: 'UPI', key: 'F2' },
  { mode: 'card', label: 'Card', key: 'F3' },
  { mode: 'ledger', label: 'Khata', key: 'F6' },
];

/** What the cashier should physically do once a non-cash tender is picked. */
const DIGITAL_NOTES: Record<string, (customerName: string) => string> = {
  upi: () => 'Show the QR on the customer display. The bill locks once the LAN server confirms the UPI reference.',
  card: () => 'Swipe or tap on the PoS terminal, then enter the last 4 digits and approval code on the receipt screen.',
  ledger: (customerName) =>
    `This sale is recorded as unpaid credit against ${customerName || 'the walk-in account'}.`,
};

export function CashierBillingAdvanced() {
  const { user, activeShift, logout, isOwner, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode, showSettings, setShowSettings } = useTheme();
  const [showShiftClose, setShowShiftClose] = useState(false);
  
  // Mobile UI States
  const [isMobileDevice, setIsMobileDevice] = useState(() => checkIsMobileDevice());
  const [showMobileScanner, setShowMobileScanner] = useState(false);
  const [scannerStream, setScannerStream] = useState<MediaStream | null>(null);
  const [mobileScannerError, setMobileScannerError] = useState<'INSECURE_CONTEXT_OR_NO_GUM' | 'CAMERA_PERMISSION_DENIED' | 'CAMERA_STREAM_UNAVAILABLE' | ''>('');
  const [scannerTorchOn, setScannerTorchOn] = useState(false);
  const [scannerHasTorch, setScannerHasTorch] = useState(false);
  const [scannerFacingMode, setScannerFacingMode] = useState<'environment' | 'user'>('environment');
  const [scanSuccessFlash, setScanSuccessFlash] = useState(false);
  const [lastScannedItem, setLastScannedItem] = useState<{ name: string; price: number; code: string; time: number } | null>(null);
  const [unrecognizedBarcode, setUnrecognizedBarcode] = useState<string | null>(null);
  const lastScannedCodeRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);
  const clearedBarcodeViewRef = useRef<boolean>(true);
  const unrecognizedBarcodeRef = useRef<string | null>(null);
  const scannerControllerRef = useRef<LiveBarcodeScannerController | null>(null);
  const [isMobileShiftActive, setIsMobileShiftActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sharedAudioCtxRef = useRef<any>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const barcodePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const [isProcessingPhotoScan, setIsProcessingPhotoScan] = useState(false);

  const getInitialQuickAddDraft = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('nexusflow_quick_add_draft_v1') || sessionStorage.getItem('nexusflow_quick_add_draft');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.isOpen) {
          return parsed;
        }
      }
    } catch {}
    return null;
  };

  // Quick Add Product States - initialized synchronously from persistent storage to survive mobile memory eviction / reload
  const initialQuickAddDraft = useMemo(() => getInitialQuickAddDraft(), []);
  const [showQuickAddModal, setShowQuickAddModal] = useState(() => initialQuickAddDraft?.isOpen ?? false);
  const [quickAddBarcode, setQuickAddBarcode] = useState(() => initialQuickAddDraft?.barcode ?? '');
  const [isAddingCustomUom, setIsAddingCustomUom] = useState(() => initialQuickAddDraft?.isAddingCustomUom ?? false);
  const [showProductCameraModal, setShowProductCameraModal] = useState(false);
  const [quickAddImage, setQuickAddImage] = useState<string | null>(() => initialQuickAddDraft?.image ?? null);
  const quickAddGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const quickAddCameraInputRef = useRef<HTMLInputElement | null>(null);

  // Customer Coupon States
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number } | null>(null);

  const [quickAddForm, setQuickAddForm] = useState(() => initialQuickAddDraft?.form ?? {
    name: '',
    price: '',
    category: 'General',
    gstRate: 18,
    stock: '100',
    hsnCode: '',
    uom: 'PCS'
  });

  // Sync Quick Add Draft to localStorage & sessionStorage
  useEffect(() => {
    try {
      if (showQuickAddModal) {
        const payload = JSON.stringify({
          isOpen: true,
          barcode: quickAddBarcode,
          form: quickAddForm,
          image: quickAddImage,
          isAddingCustomUom,
        });
        localStorage.setItem('nexusflow_quick_add_draft_v1', payload);
        sessionStorage.setItem('nexusflow_quick_add_draft', payload);
      } else {
        localStorage.removeItem('nexusflow_quick_add_draft_v1');
        sessionStorage.removeItem('nexusflow_quick_add_draft');
      }
    } catch {
      // ignore
    }
  }, [showQuickAddModal, quickAddBarcode, quickAddForm, quickAddImage, isAddingCustomUom]);

  // Edit Product Modal State
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [editProductForm, setEditProductForm] = useState({
    name: '',
    price: '',
    mrp: '',
    category: 'General',
    gstRate: 5,
    stock: '0',
    lowStockThreshold: '10',
    hsnCode: '',
    uom: 'PCS',
    wholesalePrice: '',
    brand: '',
  });
  const [isUpdatingProduct, setIsUpdatingProduct] = useState(false);

  const canEditInventory = isOwner() || (hasPermission && hasPermission('access_inventory'));

  const handleOpenEditProduct = (p: Product) => {
    setProductToEdit(p);
    setEditProductForm({
      name: p.name || '',
      price: String(p.price ?? 0),
      mrp: String(p.mrp ?? p.price ?? 0),
      category: p.category || 'General',
      gstRate: p.gstRate ?? 5,
      stock: String(p.stock ?? 0),
      lowStockThreshold: String(p.lowStockThreshold ?? 10),
      hsnCode: p.hsnCode || '',
      uom: p.uom || 'PCS',
      wholesalePrice: String(p.wholesalePrice ?? ''),
      brand: p.brand || '',
    });
    setShowEditProductModal(true);
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobileDevice(checkIsMobileDevice());
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

  // Bespoke Custom States for Sector Billing UIs
  const [manualInterstateOverride, setManualInterstateOverride] = useState<boolean | null>(null);


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
        const currentTotal = splitInclusiveGst(billItems, gstEnabled).subtotal;

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
        toast.success(`Order suspended to ${activeTable.name} successfully`);
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

  // ── Register UI vocabulary ────────────────────────────────────────────────
  // Was a four-sector lookup keyed on `activeSector`. That state was typed
  // `useState<'retail'>` and only ever set to 'retail', so the pharmacy,
  // wholesale and restaurant rows were unreachable. Retail is now stated once,
  // directly. Every `sectorConfig.*` reader below is unchanged.
  const sectorConfig = {
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
      sectorIcon: '',
      sectorEmoji: '',
      productTerm: 'Item',
      productTermPlural: 'Grocery Items',
      scannerLabel: 'Scan Grocery Barcode',
      scannerDesc: 'Scan package barcodes using rear camera',
      checkoutLabel: 'Checkout',
      categories: ['General', 'Dairy', 'Bakery', 'Grains', 'Beverages', 'Meat', 'Produce', 'Snacks', 'Personal Care', 'Household', 'Frozen'],
  };

  const [customerGstin, setCustomerGstin] = useState('');
  const [gstinIsValid, setGstinIsValid] = useState<boolean | null>(null);
  const [pricingTier, setPricingTier] = useState<'retail' | 'dealer' | 'distributor'>('retail');
  const [creditLimitExceeded, setCreditLimitExceeded] = useState(false);
  const [activeReservationId, setActiveReservationId] = useState<string | null>(null);
  const [storeGstin, setStoreGstin] = useState(() => {
    try {
      // No fallback: an unconfigured store must not print someone else's GSTIN.
      return localStorage.getItem('gstNumber') || '';
    } catch {
      return '';
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


  // Credit limit checks for Ledger Payment mode
  useEffect(() => {
    if (paymentMode === 'ledger' && currentCustomer) {
      // Tax is inside the price, so the inclusive subtotal IS what is owed.
      const { subtotal: subtotalVal } = splitInclusiveGst(billItems, gstEnabled);
      const exactTotalVal = subtotalVal;
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
    name: 'J MART',
    address: '123 Main Street, City, State 12345',
    phone: '(555) 123-4567',
    email: 'contact@jmart.com',
    gstin: '',
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
      gstin: settings.gstNumber || '',
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
        id: p.id,
        code: p.sku || p.id,
        name: p.name,
        price: p.price,
        category: p.category || 'General',
        gstRate: p.gst_rate,
        stock: p.stock,
        lowStockThreshold: p.low_stock_threshold,
        hsnCode: p.hsn_code || '',
        uom: p.uom || 'PCS',
        discountPercent: p.discount_percent || 0,
        moq: p.moq || 1,
        mrp: p.mrp || p.price,
        purchasePrice: p.purchase_price,
        wholesalePrice: p.wholesale_price,
        distributorPrice: p.distributor_price,
        brand: p.brand || '',
        imageUrl: p.image_url || ''
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
        const prodMap = new Map(data.map((p: any) => [p.sku || p.id, p]));
        setProducts(data.map(p => ({
          id: p.id,
          code: p.sku || p.id,
          name: p.name,
          price: p.price,
          category: p.category || 'General',
          gstRate: p.gst_rate,
          stock: p.stock,
          lowStockThreshold: p.low_stock_threshold,
          hsnCode: p.hsn_code || '',
          uom: p.uom || 'PCS',
          discountPercent: p.discount_percent || 0,
          moq: p.moq || 1,
          mrp: p.mrp || p.price,
          purchasePrice: p.purchase_price,
          wholesalePrice: p.wholesale_price,
          distributorPrice: p.distributor_price,
          brand: p.brand || '',
          imageUrl: p.image_url || ''
        })));

        // Synchronize in-cart items if their price or GST was updated remotely
        setBillItems(prev => prev.map(item => {
          const fresh = prodMap.get(item.code) || (item.id ? prodMap.get(item.id) : undefined);
          if (fresh) {
            return {
              ...item,
              name: fresh.name,
              price: fresh.price,
              originalPrice: fresh.price,
              gstRate: gstEnabled ? (fresh.gst_rate ?? item.gstRate) : 0,
              hsnCode: fresh.hsn_code || item.hsnCode,
              uom: fresh.uom || item.uom,
            };
          }
          return item;
        }));
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

  // E2EE LAN Cart Sharing & Bill Transfer Handlers
  useEffect(() => {
    const handleRequestShare = () => {
      if (billItems.length === 0) {
        toast.error('Cannot share an empty cart');
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
        toast.error('Invalid shared bill format');
        return;
      }
      
      if (billLocked) {
        toast.error('Bill is locked. Please clear or finish the active transaction first.');
        return;
      }

      setBillItems(data.items);
      if (data.reservationId) setActiveReservationId(data.reservationId);
      if (data.customerName) setCustomerName(data.customerName);
      if (data.customerPhone) setCustomerPhone(data.customerPhone);
      if (data.paymentMode) setPaymentMode(data.paymentMode);
      if (data.amountReceived) setAmountReceived(data.amountReceived);
      
      toast.success(`Bill transferred from LAN successfully (${data.items.length} items loaded)`);
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
          toast.error('Access Denied: Only owners can access settings');
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
      if (typeof window === 'undefined') return;
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!sharedAudioCtxRef.current) {
        sharedAudioCtxRef.current = new AudioCtxClass();
      }
      const audioCtx = sharedAudioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
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
      toast.error('Bill is locked. Start a new bill to make changes.');
      return;
    }


    // Check stock
    if (product.stock !== undefined && product.stock <= 0) {
      playBeep('warning');
      toast.error(`${product.name} is out of stock`);
      return;
    }

    const itemGstRate = gstEnabled ? (product.gstRate || gstRate) : 0;
    
    setBillItems((prev) => {
      const existing = prev.find((item) => item.code === product.code);
      if (existing) {
        // Check if we have enough stock
        if (product.stock !== undefined && existing.quantity >= product.stock) {
          playBeep('warning');
          toast.error(`Only ${product.stock} units available`);
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
          toast.info(`Barcode/Product "${query}" not found. Opening Quick Add...`);
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
      toast.error('Bill is locked. Cannot modify items.');
      return;
    }

    const product = products.find(p => p.code === code);
    if (product && product.stock !== undefined && quantity > product.stock) {
      playBeep('warning');
      toast.error(`Only ${product.stock} units available`);
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
      toast.error('Bill is locked. Cannot modify prices.');
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
      
      toast.success(`Price updated: ${item.name} → ₹${newPrice.toFixed(2)}`, {
        description: `Changed from ₹${item.price.toFixed(2)} • Logged by ${cashierName}`,
        duration: 3000,
      });
    }
  };

  const updateItemDiscount = (code: string, discountPercent: number, selectedBatch?: string) => {
    if (billLocked) {
      toast.error('Bill is locked. Cannot modify discounts.');
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
      toast.error('Bill is locked. Cannot remove items.');
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
    setActiveReservationId(null);
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
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const res = await api.get<any[]>(`/coupons?code=${encodeURIComponent(couponCode.trim())}`);
      if (res && res.length > 0) {
        const c = res[0];
        if (c.customer_phone && customerPhone && c.customer_phone !== customerPhone) {
          toast.error(`Coupon is exclusive to phone ${c.customer_phone}`);
          return;
        }
        setAppliedCoupon({ code: c.code, discountAmount: c.discount_amount });
        toast.success(`Coupon ${c.code} applied for ₹${c.discount_amount} discount!`);
      } else {
        toast.error('Invalid or already redeemed coupon code.');
      }
    } catch {
      toast.error('Error validating coupon code.');
    }
  };

  const billTotals = useMemo(() => computeBillTotals({
    items: billItems,
    gstEnabled,
    isInterState,
    // Was `activeSector`, which was invariantly 'retail'. Stated literally so
    // computeBillTotals behaves exactly as before.
    activeSector: 'retail',
    roundingEnabled,
    paymentMode,
    amountReceived,
    redeemLoyalty,
    loyaltyPointsToRedeem,
    customerLoyaltyPoints: currentCustomer ? currentCustomer.loyaltyPoints : null,
    pointValue,
    couponDiscount: appliedCoupon ? appliedCoupon.discountAmount : 0,
  }), [
    billItems, gstEnabled, isInterState, roundingEnabled,
    paymentMode, amountReceived, redeemLoyalty, currentCustomer,
    loyaltyPointsToRedeem, pointValue, appliedCoupon,
  ]);

  // Destructured so the rest of the component reads exactly as before.
  const {
    subtotal, taxableValue, totalGst, cgst, sgst, igst, exactTotal,
    roundedTotal, roundingAdjustment, amountReceivedNum,
    loyaltyDiscount, couponDiscount, finalTotal, changeAmount,
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
      toast.error('Bill already generated');
      return;
    }

    // A checkout is already in flight. Stay silent — the button is disabled and
    // the pending label is already telling the cashier what's happening.
    if (isSubmittingBillRef.current) {
      return;
    }


    // Validate phone if provided
    if (customerPhone && !validatePhone(customerPhone)) {
      toast.error('Invalid phone number. Must be 10 digits starting with 6-9.');
      return;
    }

    // Ledger balance requirements
    if (paymentMode === ('ledger' as any)) {
      if (!customerPhone) {
        toast.error('Customer phone number is required to checkout using Ledger/Khata');
        return;
      }
      if (!validatePhone(customerPhone)) {
        toast.error('Invalid phone number. Must be 10 digits starting with 6-9.');
        return;
      }
      if (creditLimitExceeded) {
        toast.error(`Checkout Blocked: Customer credit limit of ₹${(currentCustomer?.creditLimit || 50000).toLocaleString('en-IN')} exceeded`);
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
      id: item.id || item.code,
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
        pricing_tier: pricingTier,
        reservation_id: activeReservationId
      });

      setActiveReservationId(null);

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
      toast.error(`Checkout failed: ${e.message || 'Server error'}`);
      // Rethrow so callers know the sale was NOT recorded. BillReceipt awaits
      // onFinalizeBill() and aborts the print on a rejection — swallowing this
      // here is what let a receipt print for a sale the server had rejected.
      throw e;
    } finally {
      isSubmittingBillRef.current = false;
      setIsSubmittingBill(false);
    }
  };

  const handleQuickAddGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFileToDataUrl(file, 800, 0.82);
      if (compressed) {
        setQuickAddImage(compressed);
        toast.success('Product photo loaded');
      }
    } catch (err: any) {
      toast.error('Failed to process image: ' + (err?.message || ''));
    } finally {
      e.target.value = '';
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
      const parsedPrice = parseFloat(price);
      const payload = {
        id: generatedId,
        sku: quickAddBarcode,
        name,
        price: parsedPrice,
        mrp: parsedPrice,
        category,
        gst_rate: gstRate,
        stock: parseInt(stock) || 0,
        low_stock_threshold: 10,
        hsn_code: hsnCode,
        uom: uom,
        image: quickAddImage || undefined,
      };

      const res = await api.post<any>('/products', payload);
      
      if (res && res.id) {
        // Successfully created product!
        const newProduct: Product = {
          id: res.id,
          code: res.sku, // standard maps SKU as code in search/lookup
          name: res.name,
          price: res.price,
          category: res.category,
          gstRate: res.gst_rate,
          stock: res.stock,
          lowStockThreshold: res.low_stock_threshold,
          hsnCode: res.hsn_code,
          uom: res.uom,
          discountPercent: res.discount_percent || 0,
          moq: res.moq || 1
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
        setQuickAddImage(null);
        try {
          sessionStorage.removeItem('nexusflow_quick_add_draft');
        } catch {}
        toast.success(`Product "${res.name}" created and added to cart`);
      }
    } catch (err: any) {
      console.error('Failed to create product:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to create product';
      
      if (err.response?.status === 403) {
        toast.error('Permission Denied', {
          description: 'This cashier account does not have inventory privileges. Please login as Owner/Manager to register new barcodes.'
        });
      } else {
        toast.error(`Error: ${errMsg}`);
      }
    }
  };

  const handleSaveEditedProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productToEdit) return;

    if (!editProductForm.name.trim() || !editProductForm.price) {
      toast.error('Product name and price are required');
      return;
    }

    setIsUpdatingProduct(true);
    const targetId = productToEdit.id || productToEdit.code;
    const parsedPrice = parseFloat(editProductForm.price) || 0;
    const parsedMrp = parseFloat(editProductForm.mrp) || parsedPrice;
    const rawStock = parseFloat(editProductForm.stock);
    const parsedStock = isNaN(rawStock) ? 0 : rawStock;
    const rawThreshold = parseFloat(editProductForm.lowStockThreshold);
    const parsedThreshold = isNaN(rawThreshold) ? 10 : rawThreshold;
    const rawWholesale = parseFloat(editProductForm.wholesalePrice);
    const parsedWholesale = isNaN(rawWholesale) ? 0 : rawWholesale;

    try {
      const payload: any = {
        sku: productToEdit.code,
        name: editProductForm.name.trim(),
        price: parsedPrice,
        mrp: parsedMrp,
        stock: parsedStock,
        category: editProductForm.category.trim() || 'General',
        gst_rate: editProductForm.gstRate,
        hsn_code: editProductForm.hsnCode.trim(),
        uom: editProductForm.uom.trim() || 'PCS',
        low_stock_threshold: parsedThreshold,
        wholesale_price: parsedWholesale,
        brand: editProductForm.brand.trim(),
      };

      const res = await api.put<any>(`/products/${encodeURIComponent(targetId)}`, payload);

      if (res) {
        const updated: Product = {
          ...productToEdit,
          id: res.id || targetId,
          code: res.sku || productToEdit.code,
          name: res.name || editProductForm.name,
          price: res.price !== undefined ? res.price : parsedPrice,
          mrp: res.mrp !== undefined ? res.mrp : parsedMrp,
          category: res.category || editProductForm.category,
          gstRate: res.gst_rate !== undefined ? res.gst_rate : editProductForm.gstRate,
          stock: res.stock !== undefined ? res.stock : parsedStock,
          lowStockThreshold: res.low_stock_threshold !== undefined ? res.low_stock_threshold : parsedThreshold,
          hsnCode: res.hsn_code || editProductForm.hsnCode,
          uom: res.uom || editProductForm.uom,
          wholesalePrice: res.wholesale_price !== undefined ? res.wholesale_price : parsedWholesale,
          brand: res.brand || editProductForm.brand,
          imageUrl: res.image_url !== undefined ? res.image_url : productToEdit.imageUrl,
        };

        // 1. Update product catalog state locally
        setProducts(prev => prev.map(p => (p.code === productToEdit.code || p.code === updated.code || p.id === targetId) ? updated : p));

        // 2. Update cart items if already in cart
        setBillItems(prev => prev.map(item => {
          if (item.code === productToEdit.code || item.code === updated.code || (item.id && item.id === targetId)) {
            return {
              ...item,
              code: updated.code,
              name: updated.name,
              price: updated.price,
              originalPrice: updated.price,
              gstRate: gstEnabled ? (updated.gstRate ?? item.gstRate) : 0,
              hsnCode: updated.hsnCode,
              uom: updated.uom
            };
          }
          return item;
        }));

        // 3. Update held table orders if present
        try {
          const savedListStr = localStorage.getItem('nexusflowTablesList');
          if (savedListStr) {
            const list = JSON.parse(savedListStr);
            let hasChanged = false;
            const updatedList = list.map((t: any) => {
              if (t.items && Array.isArray(t.items)) {
                let tableItemChanged = false;
                const newItems = t.items.map((item: any) => {
                  if (item.code === productToEdit.code || item.code === updated.code || (item.id && item.id === targetId)) {
                    tableItemChanged = true;
                    hasChanged = true;
                    return {
                      ...item,
                      code: updated.code,
                      name: updated.name,
                      price: updated.price,
                      originalPrice: updated.price,
                      gstRate: gstEnabled ? (updated.gstRate ?? item.gstRate) : 0,
                      hsnCode: updated.hsnCode,
                      uom: updated.uom
                    };
                  }
                  return item;
                });
                if (tableItemChanged) {
                  const newTotal = splitInclusiveGst(newItems, gstEnabled).subtotal;
                  return { ...t, items: newItems, total: newTotal };
                }
              }
              return t;
            });
            if (hasChanged) {
              localStorage.setItem('nexusflowTablesList', JSON.stringify(updatedList));
              window.dispatchEvent(new CustomEvent('nexusflow-tables-updated'));
            }
          }
        } catch (e) {
          console.error('Failed to sync held table items with updated product:', e);
        }

        setShowEditProductModal(false);
        setProductToEdit(null);
        toast.success(`Product "${updated.name}" updated successfully`);
      }
    } catch (err: any) {
      console.error('Failed to update product:', err);
      const errMsg = err?.message || 'Failed to update product';
      if (errMsg.includes('Permission required') || errMsg.includes('403')) {
        toast.error('Permission Denied', {
          description: 'This cashier account does not have inventory privileges to edit products.'
        });
      } else {
        toast.error(`Update failed: ${errMsg}`);
      }
    } finally {
      setIsUpdatingProduct(false);
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
    toast.success('Ready for new bill');
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

  /* Gross vs. taxable. computeBillTotals returns `subtotal` already net of the
     per-line discount (updateItemDiscount writes the discounted figure into
     item.price and keeps the original in originalPrice), so the design's
     "Gross" and "Item discounts" rows are recovered from originalPrice here
     rather than by changing the shared arithmetic. */
  const grossTotal = billItems.reduce(
    (sum, i) => sum + (i.originalPrice ?? i.price) * i.quantity, 0);
  const itemDiscountTotal = grossTotal - subtotal;

  /* Wall clock in the header, per the design. 10s cadence: it renders hh:mm, so
     a second-by-second interval would re-render the whole register for nothing. */
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, []);

  const shiftElapsed = useMemo(() => {
    if (!activeShift?.startTime) return '—';
    const mins = Math.max(0, Math.floor((Date.now() - new Date(activeShift.startTime).getTime()) / 60000));
    return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  }, [activeShift, clock]);

  /** Step moves refuse rather than silently no-op, so the cashier learns why. */
  const goToStep = (n: 1 | 2) => {
    if (n === 2 && billItems.length === 0) {
      toast.error('Add at least one item first');
      return;
    }
    setBillingStep(n);
  };

  // Panel focus, used to highlight whichever area the cashier is working in.
  // (The old Hyprland-style tiling — three mouse-only drag handles writing
  // percentage sizes onto the DOM — was replaced by a CSS grid; the drag
  // machinery that went with it is gone.)
  const [activePanel, setActivePanel] = useState<'search' | 'cart' | 'customer' | 'payment'>('cart');

  // Standard addToCart helper
  const addToCart = (product: Product) => {
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

  // Unified barcode result handler for continuous live video and photo capture
  const handleScannedCode = (scannedCode: string) => {
    if (!scannedCode) return;
    const cleanCode = scannedCode.trim();
    if (!cleanCode) return;

    // If an unrecognized barcode modal is currently visible, pause scanning new codes
    if (unrecognizedBarcodeRef.current) {
      return;
    }

    // Cooldown check to prevent duplicate triggers while the exact same barcode remains in camera view.
    // If user pulls item away (clearedBarcodeViewRef === true) or 2500ms has elapsed, allow immediate scan.
    const now = Date.now();
    if (
      lastScannedCodeRef.current === cleanCode &&
      now - lastScannedTimeRef.current < 2500 &&
      !clearedBarcodeViewRef.current
    ) {
      return;
    }
    lastScannedCodeRef.current = cleanCode;
    lastScannedTimeRef.current = now;
    clearedBarcodeViewRef.current = false;

    // Instant physical feedback: audio beep + mobile haptic vibration
    playBarcodeBeep();
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(60);
      } catch {
        // ignore
      }
    }

    // Trigger visual green laser flash on the viewfinder
    setScanSuccessFlash(true);
    setTimeout(() => setScanSuccessFlash(false), 500);

    // If scanning for the Quick Add modal barcode field
    if (showQuickAddModal) {
      setQuickAddBarcode(cleanCode);
      stopMobileScan();
      toast.success(`Barcode Scanned: ${cleanCode}`);
      return;
    }

    // Cashier register live continuous scanning
    const matched = products.find(p => p.code === cleanCode || (p as any).barcode === cleanCode);
    if (matched) {
      // Check if item is out of stock
      if (matched.stock !== undefined && matched.stock <= 0) {
        playBeep('warning');
        toast.error(`${matched.name} is out of stock`);
        return;
      }

      addToCart(matched);
      setLastScannedItem({
        name: matched.name,
        price: matched.price,
        code: matched.code,
        time: now,
      });
      toast.success(`Scanned: ${matched.name} (₹${matched.price})`, { duration: 1500 });
      // Keep scanner alive and open for continuous scanning of the next item!
    } else {
      // Unrecognized barcode
      playBeep('warning');
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch {
          // ignore
        }
      }
      unrecognizedBarcodeRef.current = cleanCode;
      setUnrecognizedBarcode(cleanCode);
    }
  };

  // ── Mobile-First Camera Barcode Scanner & View ──────────────────────────────
  const startMobileScan = async (overrideFacingMode?: 'environment' | 'user') => {
    setMobileScannerError('');
    unrecognizedBarcodeRef.current = null;
    setUnrecognizedBarcode(null);
    setShowMobileScanner(true);

    // Pre-warm audio context during user gesture so mobile browsers allow instant beep sounds
    try {
      if (typeof window !== 'undefined') {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          if (!sharedAudioCtxRef.current) {
            sharedAudioCtxRef.current = new AudioCtxClass();
          }
          if (sharedAudioCtxRef.current.state === 'suspended') {
            sharedAudioCtxRef.current.resume().catch(() => {});
          }
        }
      }
    } catch {
      // ignore
    }

    const targetFacingMode = overrideFacingMode || scannerFacingMode;

    const hasCam = typeof navigator !== 'undefined' &&
      Boolean(navigator?.mediaDevices?.getUserMedia) &&
      (typeof window !== 'undefined' ? window.isSecureContext !== false : true);

    if (!hasCam) {
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setMobileScannerError('INSECURE_CONTEXT_OR_NO_GUM');
      } else {
        setMobileScannerError('CAMERA_STREAM_UNAVAILABLE');
      }
      return;
    }

    try {
      // Stop any existing stream tracks first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setScannerStream(null);

      const stream = await requestLiveCameraStream(targetFacingMode);
      streamRef.current = stream;
      setScannerStream(stream);
      setScannerHasTorch(hasTorchSupport(stream));
      setScannerTorchOn(false);
      clearedBarcodeViewRef.current = true;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        await videoRef.current.play().catch(e => console.warn('Video play deferred:', e));
      }
    } catch (err: any) {
      console.error('Camera access failed:', err);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setMobileScannerError('CAMERA_PERMISSION_DENIED');
      } else {
        setMobileScannerError('CAMERA_STREAM_UNAVAILABLE');
      }
    }
  };

  const stopMobileScan = () => {
    if (scannerControllerRef.current) {
      scannerControllerRef.current.stop();
      scannerControllerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScannerStream(null);
    setScannerTorchOn(false);
    setScannerHasTorch(false);
    setScanSuccessFlash(false);
    unrecognizedBarcodeRef.current = null;
    setUnrecognizedBarcode(null);
    setShowMobileScanner(false);
  };

  const handleToggleTorch = async () => {
    if (!streamRef.current) return;
    const nextState = !scannerTorchOn;
    const ok = await toggleCameraTorch(streamRef.current, nextState);
    if (ok) {
      setScannerTorchOn(nextState);
    }
  };

  const handleFlipCamera = () => {
    const nextFacing = scannerFacingMode === 'environment' ? 'user' : 'environment';
    setScannerFacingMode(nextFacing);
    startMobileScan(nextFacing);
  };

  // Photo-based barcode scanning for mobile devices over HTTP LAN or difficult barcodes
  const handleBarcodePhotoInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPhotoScan(true);
    try {
      const scannedCode = await decodeBarcodeFromFile(file);
      if (scannedCode) {
        handleScannedCode(scannedCode);
      } else {
        toast.error('No barcode detected in photo. Please ensure barcode is well-lit and in focus, then try again.');
      }
    } catch (err) {
      console.error('[BarcodeScanner] Photo scan failed:', err);
      toast.error('Failed to read barcode from photo. Please try again.');
    } finally {
      setIsProcessingPhotoScan(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Run continuous camera scanning detection (supporting both native BarcodeDetector and ZXing fallback)
  useEffect(() => {
    if (!showMobileScanner || !scannerStream || mobileScannerError) return;

    let active = true;

    const setupScanner = () => {
      if (!videoRef.current || !active) return;

      // Ensure video element has stream attached and is playing
      if (videoRef.current.srcObject !== scannerStream) {
        videoRef.current.srcObject = scannerStream;
        videoRef.current.muted = true;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.play().catch(e => console.warn('Video play deferred:', e));
      }

      if (scannerControllerRef.current) {
        scannerControllerRef.current.stop();
      }

      scannerControllerRef.current = startLiveBarcodeScanner({
        videoElement: videoRef.current,
        onScan: (scannedCode) => {
          if (!active) return;
          handleScannedCode(scannedCode);
        },
        onNoBarcode: () => {
          if (!active) return;
          clearedBarcodeViewRef.current = true;
        },
        onError: () => {
          // Frame-to-frame retry
        },
        scanIntervalMs: 80,
      });
    };

    const timer = setTimeout(setupScanner, 100);

    return () => {
      active = false;
      clearTimeout(timer);
      if (scannerControllerRef.current) {
        scannerControllerRef.current.stop();
        scannerControllerRef.current = null;
      }
    };
  }, [showMobileScanner, scannerStream, mobileScannerError, products]);

  // Clean up camera stream and scanner when component unmounts
  useEffect(() => {
    return () => {
      if (scannerControllerRef.current) {
        scannerControllerRef.current.stop();
        scannerControllerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);


  const addWholesaleBulkItem = (product: Product, qty: number) => {
    if (billLocked) {
      playBeep('warning');
      toast.error('Bill is locked. Start a new bill.');
      return;
    }
    
    // Check stock
    if (product.stock !== undefined && product.stock <= 0) {
      playBeep('warning');
      toast.error(`${product.name} is out of stock`);
      return;
    }

    setBillItems(prev => {
      const existing = prev.find(item => item.code === product.code);
      const addQty = existing ? existing.quantity + qty : qty;
      
      // Stock warning check
      if (product.stock !== undefined && addQty > product.stock) {
        toast.warning(`Low stock warning: Selling ${addQty} of ${product.stock} units.`);
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
    toast.success(`Added ${qty} units of ${product.name} to cart`);
  };

  const renderMobileView = () => {
    const totalItemsCount = billItems.reduce((sum, item) => sum + item.quantity, 0);

    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)] pb-28 overflow-y-auto">
        {/* Mobile Header */}
        <div
          className="p-3.5 sticky top-0 z-40 border-b flex justify-between items-center transition-all bg-[var(--panel)] border-[var(--border)]"
        >
          <div className="flex items-center gap-2.5">
            <div>
              <h1 className="text-sm font-bold tracking-tight">{sectorConfig.mobileName}</h1>
              <p style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>{user?.name || 'Cashier'} · Till</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => toggleDarkMode()} 
              className="px-2.5 py-1 rounded-md border text-xs font-mono font-bold bg-[var(--sub)] border-[var(--border2)] text-[var(--ink)] cursor-pointer"
            >
              {darkMode ? 'LIGHT' : 'DARK'}
            </button>
            <button 
              onClick={() => logout()} 
              className="px-2.5 py-1 rounded-md border text-xs font-mono font-bold bg-[var(--danger-soft)] border-[var(--danger-line)] text-[var(--danger)] cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="p-3.5 space-y-3.5">
          {/* Mobile Attendance Status Card */}
          <div style={{ ...PANEL, padding: 14 }}>
            <div className="flex justify-between items-center mb-1">
              <span style={EYEBROW}>Shift Status</span>
              <span style={{
                fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: '2px 7px',
                borderRadius: 4, textTransform: 'uppercase',
                background: isMobileShiftActive ? 'var(--ok-soft)' : 'var(--warn-soft)',
                color: isMobileShiftActive ? 'var(--ok)' : 'var(--warn)',
                border: `1px solid ${isMobileShiftActive ? 'var(--ok-line)' : 'var(--warn-line)'}`,
              }}>
                {isMobileShiftActive ? 'Active' : 'Check-in Pending'}
              </span>
            </div>
            
            <p style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4, lineHeight: 1.5 }}>
              {isMobileShiftActive 
                ? 'Attendance recorded. Shift hours actively logged.'
                : 'Mobile login requires completing a sale to count towards shift attendance.'}
            </p>
          </div>

          {/* Quick manual select drop-down list */}
          <div className="space-y-1.5">
            <label style={EYEBROW}>{sectorConfig.quickAddLabel}</label>
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
                className="w-full"
                style={{ ...FIELD, height: 44, padding: '0 12px', fontSize: 14, fontWeight: 500 }}
              >
                <option value="">{sectorConfig.quickAddDropdown}</option>
                {products.map(p => (
                  <option key={p.code} value={p.code}>
                    {p.name} - {inr(p.price)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Mobile Camera Scanning trigger box */}
          <div 
            onClick={() => startMobileScan()}
            className="cursor-pointer text-center flex flex-col items-center justify-center gap-2 transition-all"
            style={{
              padding: '18px 14px', borderRadius: 8, border: '1.5px dashed var(--border2)',
              background: 'var(--sub)', color: 'var(--ink)',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-soft)',
              border: '1px solid var(--accent-line)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--accent)',
            }}>
              <Camera size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{sectorConfig.scannerLabel}</h3>
              <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{sectorConfig.scannerDesc}</p>
            </div>
          </div>

          {/* Cart Section */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span style={EYEBROW}>{sectorConfig.cartTitle} ({totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'})</span>
              {billItems.length > 0 && (
                <button 
                  onClick={() => setBillItems([])}
                  style={{
                    fontFamily: MONO, fontSize: 11, fontWeight: 600, color: 'var(--danger)',
                    background: 'transparent', border: 0, cursor: 'pointer',
                  }}
                  title={`Clear all items from ${sectorConfig.cartTitle}`}
                >
                  Clear Cart
                </button>
              )}
            </div>

            {billItems.length === 0 ? (
              <div style={{ ...PANEL, padding: '36px 14px', textAlign: 'center' }}>
                <ShoppingCart size={28} className="mx-auto" style={{ color: 'var(--ink4)' }} />
                <p style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{sectorConfig.mobileCartEmpty}</p>
                <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>{sectorConfig.mobileCartEmptyDesc}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {billItems.map(item => (
                  <div 
                    key={item.selectedBatch ? `${item.code}-${item.selectedBatch}` : item.code} 
                    className="flex justify-between items-center"
                    style={{ ...PANEL, padding: '10px 12px' }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</h4>
                        {item.selectedBatch && (
                          <span style={{
                            fontFamily: MONO, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                            background: 'var(--rule)', color: 'var(--ink2)',
                          }}>
                            {item.selectedBatch}
                          </span>
                        )}
                        {canEditInventory && (
                          <button
                            type="button"
                            title="Edit product master details"
                            onClick={() => {
                              const matchedProd = products.find(p => p.code === item.code);
                              if (matchedProd) {
                                handleOpenEditProduct(matchedProd);
                              } else {
                                handleOpenEditProduct({
                                  id: item.code,
                                  code: item.code,
                                  name: item.name,
                                  price: item.price,
                                  category: 'General',
                                  stock: 0,
                                  gstRate: item.gstRate,
                                });
                              }
                            }}
                            className="p-1 rounded cursor-pointer transition-colors"
                            style={{ color: 'var(--ink3)', background: 'transparent', border: 0 }}
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span style={{ ...NUM, fontSize: 13, fontWeight: 700 }}>{inr(item.price)}</span>
                        {item.originalPrice && item.originalPrice !== item.price && (
                          <span style={{ ...NUM, fontSize: 11, color: 'var(--ink4)', textDecoration: 'line-through' }}>
                            {inr(item.originalPrice)}
                          </span>
                        )}
                        <span style={{
                          fontFamily: MONO, fontSize: 10, padding: '1px 5px', borderRadius: 4,
                          background: 'var(--sub)', border: '1px solid var(--border2)', color: 'var(--ink3)',
                        }}>
                          {item.discountPercent ?? 0}% off
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button 
                        onClick={() => updateQuantity(item.code, item.quantity - 1, item.selectedBatch)}
                        className="cursor-pointer"
                        style={{
                          width: 30, height: 30, borderRadius: 5, border: '1px solid var(--border2)',
                          background: 'var(--sub)', color: 'var(--ink)', fontSize: 15, fontWeight: 600,
                        }}
                      >
                        −
                      </button>
                      <span style={{ ...NUM, width: 24, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>
                        {item.quantity}
                      </span>
                      <button 
                        onClick={() => updateQuantity(item.code, item.quantity + 1, item.selectedBatch)}
                        className="cursor-pointer"
                        style={{
                          width: 30, height: 30, borderRadius: 5, border: '1px solid var(--border2)',
                          background: 'var(--sub)', color: 'var(--ink)', fontSize: 15, fontWeight: 600,
                        }}
                      >
                        +
                      </button>
                      <button 
                        onClick={() => removeItem(item.code, item.selectedBatch)}
                        className="cursor-pointer ml-1"
                        style={{
                          width: 28, height: 28, borderRadius: 5, border: 0,
                          background: 'transparent', color: 'var(--danger)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Customer Loyalty Details */}
          <div className="space-y-2">
            <span style={EYEBROW}>Customer Information</span>
            
            <input 
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="10-digit mobile number..."
              maxLength={10}
              style={{ ...FIELD, ...NUM, width: '100%', height: 44, padding: '0 12px', fontSize: 14 }}
            />

            {customerPhone && validatePhone(customerPhone) && !currentCustomer && (
              <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ok)' }}>✓ New customer will be registered.</p>
            )}

            {currentCustomer && (() => {
              const points = currentCustomer.loyaltyPoints;
              const spent = currentCustomer.totalSpent || 0;
              const tierInfo = getLoyaltyTier(spent);

              return (
                <div style={{ ...PANEL, padding: 12 }}>
                  <div className="flex justify-between items-center mb-1">
                    <span style={EYEBROW}>Loyalty</span>
                    <span style={{
                      fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: '2px 7px',
                      borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--accent)',
                      border: '1px solid var(--accent-line)',
                    }}>
                      {tierInfo.name} Tier
                    </span>
                  </div>

                  <div className="flex justify-between items-center mb-2">
                    <span style={{ ...NUM, fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{points} PTS</span>
                    <span style={{ ...NUM, fontSize: 12, color: 'var(--ink2)' }}>{inr(spent)} Spent</span>
                  </div>

                  <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent)', width: `${tierInfo.progress}%` }} />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-2 mt-2" style={{ borderTop: '1px solid var(--rule)' }}>
                    <input type="checkbox" checked={redeemLoyalty} onChange={(e) => { setRedeemLoyalty(e.target.checked); if (!e.target.checked) setLoyaltyPointsToRedeem(0); }} disabled={points === 0} style={{ accentColor: 'var(--accent)' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)' }}>Redeem Points</span>
                  </label>

                  {redeemLoyalty && points > 0 && (
                    <div className="mt-2 space-y-1">
                      <input type="number" value={loyaltyPointsToRedeem} onChange={(e) => setLoyaltyPointsToRedeem(Math.min(parseInt(e.target.value) || 0, points))} max={points} min={0} placeholder="Points to redeem" style={{ ...FIELD, ...NUM, width: '100%', height: 36, padding: '0 10px', fontSize: 13 }} />
                      <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ok)' }}>= {inr(loyaltyPointsToRedeem * parseFloat(localStorage.getItem('pointValue') || '1'))} discount</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Discounts & Loyalty Rewards */}
          <div className="space-y-2">
            <span style={EYEBROW}>Discounts & Loyalty Rewards</span>
            <div style={{ ...PANEL, padding: 12 }}>
              <label style={EYEBROW} className="block mb-1">Customer Coupon Discount</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Enter coupon code (e.g. GOLD10)"
                  style={{ ...FIELD, ...NUM, height: 38, padding: '0 10px', fontSize: 13, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  style={{
                    height: 38, padding: '0 12px', borderRadius: 6,
                    background: 'var(--accent)', color: 'var(--panel)', border: 0,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Apply
                </button>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between items-center mt-2 text-xs" style={{ color: 'var(--ok)' }}>
                  <span>✓ Coupon {appliedCoupon.code} applied</span>
                  <span>−{inr(appliedCoupon.discountAmount)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Camera Scanner Overlay Modal */}
        {showMobileScanner && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between p-4 select-none">
            {/* Header bar */}
            <div className="flex justify-between items-center text-white z-20 pt-2 px-1">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <div>
                  <h3 className="text-sm font-black tracking-wide flex items-center gap-1.5">
                    Live Barcode Scanner
                  </h3>
                  <p className="text-[10px] text-gray-400 font-medium">
                    {mobileScannerError
                      ? 'Camera setup required'
                      : 'Point camera at product barcode — auto decodes'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Flashlight button if torch supported */}
                {scannerHasTorch && !mobileScannerError && (
                  <button
                    type="button"
                    onClick={handleToggleTorch}
                    className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                      scannerTorchOn
                        ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                        : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
                    }`}
                    title={scannerTorchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                  >
                    {scannerTorchOn ? <Zap size={16} /> : <ZapOff size={16} />}
                  </button>
                )}

                {/* Flip Camera button */}
                {!mobileScannerError && (
                  <button
                    type="button"
                    onClick={handleFlipCamera}
                    className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-white hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Switch Camera (Front/Back)"
                  >
                    <RefreshCw size={15} />
                  </button>
                )}

                {/* Close Button */}
                <button
                  type="button"
                  onClick={stopMobileScan}
                  className="w-9 h-9 rounded-full bg-slate-800/90 flex items-center justify-center border border-slate-700 text-white font-extrabold hover:bg-slate-700 transition-colors cursor-pointer"
                  title="Close Scanner"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Viewfinder Viewport */}
            <div className="relative flex-1 flex items-center justify-center my-4">
              <div className="relative w-full max-w-sm h-full max-h-[68vh] rounded-3xl overflow-hidden border-2 border-slate-700/80 bg-slate-950 flex items-center justify-center shadow-2xl">
                {mobileScannerError ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center select-none w-full h-full max-w-xs">
                    {mobileScannerError === 'INSECURE_CONTEXT_OR_NO_GUM' ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                          <Lock size={26} />
                        </div>
                        <h4 className="text-sm font-bold text-white">HTTPS Required for Live Camera</h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Modern mobile browsers (Safari on iOS, Chrome on Android) require a secure HTTPS connection to stream live camera video.
                        </p>
                        <div className="flex flex-col gap-2 w-full pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== 'undefined') {
                                window.location.href = window.location.href.replace(/^http:/, 'https:');
                              }
                            }}
                            className="w-full h-11 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 shadow-xl text-white bg-emerald-600 hover:bg-emerald-500"
                          >
                            <Lock size={15} />
                            <span>Switch to Secure HTTPS</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => startMobileScan()}
                            className="w-full h-9 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-2 cursor-pointer bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors"
                          >
                            <RefreshCw size={13} />
                            <span>Retry Camera</span>
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-500 pt-1">
                          💡 Tip: For LAN dev, run <code className="text-slate-400">pnpm dev</code> (HTTPS is default) and accept the dev certificate.
                        </p>
                      </div>
                    ) : mobileScannerError === 'CAMERA_PERMISSION_DENIED' ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                          <CameraOff size={26} />
                        </div>
                        <h4 className="text-sm font-bold text-white">Camera Access Blocked</h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Camera permission was not granted. Please allow camera permissions in your browser or device settings to scan barcodes.
                        </p>
                        <button
                          type="button"
                          onClick={() => startMobileScan()}
                          className="w-full h-11 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 shadow-xl text-white bg-emerald-600 hover:bg-emerald-500 mt-2"
                        >
                          <RefreshCw size={15} />
                          <span>Request Permission Again</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                          <AlertTriangle size={26} />
                        </div>
                        <h4 className="text-sm font-bold text-white">Camera Feed Inactive</h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Could not start camera video feed. Please check if another application is using the camera.
                        </p>
                        <button
                          type="button"
                          onClick={() => startMobileScan()}
                          className="w-full h-11 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 shadow-xl text-white bg-emerald-600 hover:bg-emerald-500 mt-2"
                        >
                          <RefreshCw size={15} />
                          <span>Retry Camera</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Aiming Reticle Overlay Box */}
                    <div
                      className={`absolute w-[82%] max-w-[280px] h-44 rounded-2xl transition-all duration-300 pointer-events-none flex flex-col items-center justify-center ${
                        scanSuccessFlash
                          ? 'border-2 border-emerald-400 bg-emerald-500/15 shadow-[0_0_25px_rgba(16,185,129,0.5)]'
                          : 'border-2 border-dashed border-sky-400/80 bg-sky-500/5'
                      }`}
                    >
                      {/* Sweeping laser light */}
                      <div
                        className={`absolute inset-x-2 h-0.5 pointer-events-none transition-colors duration-200 animate-barcode-laser ${
                          scanSuccessFlash
                            ? 'bg-emerald-400 shadow-[0_0_14px_#10b981]'
                            : 'bg-sky-400 shadow-[0_0_10px_#38bdf8]'
                        }`}
                      />

                      {/* Viewfinder corner accents */}
                      <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-white/80 rounded-tl pointer-events-none" />
                      <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-white/80 rounded-tr pointer-events-none" />
                      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-white/80 rounded-bl pointer-events-none" />
                      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-white/80 rounded-br pointer-events-none" />
                    </div>

                    {/* Guidance hint below aim box */}
                    <div className="absolute bottom-4 inset-x-4 flex justify-center pointer-events-none">
                      <span className="text-[10px] font-semibold text-white/90 bg-black/60 backdrop-blur-xs px-3 py-1 rounded-full border border-white/10 shadow">
                        Continuous Live Scanner • Decodes Automatically
                      </span>
                    </div>

                    {/* Unrecognized Barcode Modal Overlay */}
                    {unrecognizedBarcode && (
                      <div className="absolute inset-x-4 max-w-xs mx-auto p-4 rounded-2xl bg-slate-900/95 border border-amber-500/60 text-center shadow-2xl backdrop-blur-md z-30 flex flex-col items-center gap-2.5">
                        <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                          <AlertCircle size={20} />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">Item Not In Catalog</h4>
                          <p className="text-[10px] font-mono text-amber-300 mt-0.5 break-all">
                            "{unrecognizedBarcode}"
                          </p>
                        </div>
                        <div className="flex gap-2 w-full pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const code = unrecognizedBarcode;
                              unrecognizedBarcodeRef.current = null;
                              setUnrecognizedBarcode(null);
                              stopMobileScan();
                              setQuickAddBarcode(code);
                              setQuickAddForm({
                                name: '',
                                price: '',
                                category: 'General',
                                gstRate: 18,
                                stock: '100',
                                hsnCode: '',
                                uom: 'PCS',
                              });
                              setIsAddingCustomUom(false);
                              setShowQuickAddModal(true);
                              toast.info(`Opening Quick Add for ${code}`);
                            }}
                            className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow cursor-pointer transition-colors"
                          >
                            + Quick Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const dismissed = unrecognizedBarcode;
                              unrecognizedBarcodeRef.current = null;
                              setUnrecognizedBarcode(null);
                              if (dismissed) {
                                lastScannedCodeRef.current = dismissed;
                                lastScannedTimeRef.current = Date.now();
                              }
                              clearedBarcodeViewRef.current = false;
                            }}
                            className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700 cursor-pointer transition-colors"
                          >
                            Scan Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Hidden file inputs for backward compatibility */}
            <input
              ref={barcodePhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBarcodePhotoInput}
            />
            <input
              ref={barcodeGalleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBarcodePhotoInput}
            />

            {/* Bottom HUD: Real-time scan result & Cart total */}
            <div className="z-10 bg-slate-900/95 border border-slate-800 p-3.5 rounded-2xl max-w-sm mx-auto w-full flex flex-col gap-2.5 shadow-2xl backdrop-blur-md">
              {/* Recently scanned item banner */}
              {lastScannedItem && Date.now() - lastScannedItem.time < 5000 ? (
                <div className="flex items-center justify-between bg-emerald-950/60 border border-emerald-500/40 rounded-xl px-3 py-2 text-emerald-300 text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span className="font-bold truncate">{lastScannedItem.name}</span>
                  </div>
                  <span className="font-mono font-bold shrink-0 text-emerald-400">
                    ₹{lastScannedItem.price.toFixed(2)}
                  </span>
                </div>
              ) : null}

              {/* Running Cart Info & Finish Button */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    Current Cart
                  </p>
                  <p className="text-sm font-mono font-extrabold text-white">
                    {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'} • {inr(finalTotal)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={stopMobileScan}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-lg cursor-pointer transition-transform active:scale-95"
                  style={{ background: 'var(--accent)' }}
                >
                  <ShoppingCart size={14} />
                  <span>Done Scanning</span>
                </button>
              </div>

              {/* Quick Demo simulated barcodes */}
              {products.length > 0 && (
                <div className="pt-1 border-t border-slate-800/80">
                  <p className="text-[8px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Quick Demo Barcodes (Tap to Simulate Live Scan)
                  </p>
                  <div className="flex justify-start flex-wrap gap-1">
                    {products.slice(0, 4).map((p) => (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() => handleScannedCode(p.code)}
                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[9px] font-medium text-slate-300 border border-slate-700/60 cursor-pointer transition-colors"
                      >
                        {p.name.slice(0, 14)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sticky Mobile Bottom Checkout Bar */}
        {billItems.length > 0 && (
          <div
            className="fixed bottom-0 inset-x-0 p-3.5 border-t z-30 flex gap-3 justify-between items-center transition-all"
            style={{ background: 'var(--panel)', borderTop: '1px solid var(--border)' }}
          >
            <div className="flex flex-col">
              <span style={EYEBROW}>Total</span>
              <span style={{ ...NUM, fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>
                {inr(finalTotal)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select 
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                style={{ ...FIELD, height: 42, padding: '0 8px', fontSize: 13, fontWeight: 600 }}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="khata">Khata</option>
              </select>

              <button 
                onClick={() => {
                  if (billItems.length === 0) {
                    toast.error('Cart is empty!');
                    return;
                  }
                  setBillingStep(3);
                  setShowReceipt(true);
                }}
                className="cursor-pointer"
                style={{
                  height: 42, padding: '0 16px', borderRadius: 7, border: 0,
                  background: 'var(--accent)', color: 'var(--panel)', fontSize: 13, fontWeight: 700,
                }}
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
  /* Register header bar — 58px, per design-handoff/Register.dc.html.
     The design draws global nav (Back office / Staff / Settings) inline here;
     this app puts that in layout.tsx's sidebar, so it is deliberately not
     duplicated. What stays is what belongs to the register itself: which step
     you are on, who is on till, and whether the LAN server is answering. */
  const renderStepHeader = () => {
    const steps = [
      { id: 1 as const, label: 'Items' },
      { id: 2 as const, label: 'Payment' },
    ];

    return (
      <div
        className="shrink-0 flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2"
        style={{
          minHeight: 58, background: 'var(--panel)',
          borderBottom: '1px solid var(--border)', color: 'var(--ink)',
        }}
      >
        <div className="flex items-baseline gap-2.5">
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>{shopDetails.name}</span>
          <span style={{
            fontFamily: MONO, fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: 'var(--ink3)',
          }}>
            Retail Register
          </span>
        </div>

        {/* Step segment. Clicking 2 with an empty cart is refused by toStep. */}
        <div
          className="flex items-center gap-2"
          style={{
            padding: '4px 6px', border: '1px solid var(--border)',
            borderRadius: 8, background: 'var(--sub)',
          }}
        >
          {steps.map((s, i) => {
            const on = billingStep === s.id;
            return (
              <Fragment key={s.id}>
                {i > 0 && <div style={{ width: 14, height: 1, background: 'var(--border2)' }} />}
                <button
                  type="button"
                  onClick={() => goToStep(s.id)}
                  className="flex items-center gap-[7px] cursor-pointer"
                  style={{
                    padding: '3px 10px', borderRadius: 5, border: 0,
                    background: on ? 'var(--accent)' : 'transparent',
                    color: on ? 'var(--panel)' : 'var(--ink3)',
                  }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{s.id}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                </button>
              </Fragment>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-[7px]">
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: productsLoadFailed ? 'var(--danger)' : 'var(--ok)',
            }} />
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: 'var(--ink3)' }}>
              {productsLoadFailed ? 'LAN offline' : 'LAN synced'}
            </span>
          </div>

          <div className="hidden md:block" style={{ width: 1, height: 22, background: 'var(--border)' }} />

          <div className="hidden md:block text-right">
            <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>
              {user?.name || 'Cashier'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>
              {activeShift ? `Shift ${shiftElapsed}` : 'No open shift'}
            </div>
          </div>

          <div style={{
            ...NUM, fontSize: 13, fontWeight: 600, padding: '5px 9px',
            background: 'var(--sub)', border: '1px solid var(--border)', borderRadius: 7,
          }}>
            {clock}
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

          {/* ── Register canvas ───────────────────────────────────────────────
              Rebuilt from design-handoff/Register.dc.html.

              Two steps share one grid. Step 1 gives the cart column 1fr and
              pins a 400px totals rail beside it; step 2 drops the cart entirely
              and splits the rail three ways, so payment is a step rather than a
              modal floating over a cart nobody can act on any more. Below xl
              everything stacks in one scrolling column. */}
          <div
            className={`flex-1 min-h-0 grid gap-3.5 p-3.5 items-start overflow-y-auto grid-cols-1 ${
              billingStep === 1 ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : ''
            }`}
          >

            {billingStep === 1 && (
              <div className="flex flex-col gap-3.5 min-w-0">

                {/* ▲ Scan / search */}
                <div style={PANEL}>
                  <div style={PANEL_HEAD}>
                    <span style={EYEBROW}>Add {sectorConfig.productTerm}</span>
                    <span className="ml-auto inline-flex items-center gap-1.5"
                          style={{ fontSize: 11, color: 'var(--ink3)' }}>
                      Scanner armed
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)' }} />
                    </span>
                  </div>

                  <div style={{ padding: 14 }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        ref={inputRef}
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        disabled={billLocked}
                        placeholder="Scan barcode, or type name / code"
                        className="w-full"
                        style={{
                          ...FIELD, height: 52, padding: '0 88px 0 16px',
                          fontSize: 17, fontWeight: 500, borderWidth: 1.5,
                        }}
                      />
                      <span style={{
                        position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                        fontFamily: MONO, fontSize: 11, fontWeight: 600, color: 'var(--ink3)',
                        border: '1px solid var(--border2)', borderBottomWidth: 2, borderRadius: 5,
                        padding: '3px 7px', background: 'var(--panel)',
                      }}>Ctrl F</span>
                    </div>

                    {visibleSearchResults.length > 0 && (
                      <div style={{
                        marginTop: 12, border: '1px solid var(--rule2)',
                        borderRadius: 8, overflow: 'hidden',
                      }}>
                        {visibleSearchResults.map((p, idx) => {
                          const stock = p.stock ?? 0;
                          const low = (p.lowStockThreshold ?? 15);
                          return (
                            <div
                              key={`${p.code}-${idx}`}
                              className="w-full grid items-center gap-3 text-left"
                              style={{
                                gridTemplateColumns: canEditInventory ? 'minmax(0, 1fr) 96px 100px 36px' : 'minmax(0, 1fr) 96px 120px',
                                padding: '11px 14px',
                                borderBottom: '1px solid var(--rule2)',
                                background: idx === selectedResultIndex ? 'var(--accent-soft)' : 'var(--panel)',
                                color: 'var(--ink)',
                              }}
                            >
                              <div
                                onClick={() => addItem(p)}
                                className="cursor-pointer"
                                style={{ minWidth: 0 }}
                              >
                                <div className="truncate" style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
                                <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                                  #{p.code} · {p.category}
                                  {gstEnabled && p.gstRate != null ? ` · ${p.gstRate}% GST` : ''}
                                </div>
                              </div>
                              <div
                                onClick={() => addItem(p)}
                                className="cursor-pointer"
                                style={{
                                  fontFamily: MONO, fontSize: 11, fontWeight: 600, textAlign: 'right',
                                  color: stock === 0 ? 'var(--danger)' : stock < low ? 'var(--warn)' : 'var(--ink3)',
                                }}
                              >
                                {stock === 0 ? 'Out' : `${stock} in stock`}
                              </div>
                              <div
                                onClick={() => addItem(p)}
                                className="cursor-pointer"
                                style={{ ...NUM, fontSize: 16, fontWeight: 600, textAlign: 'right' }}
                              >
                                {inr(p.price)}
                              </div>
                              {canEditInventory && (
                                <button
                                  type="button"
                                  title="Edit product master (price, stock, details)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEditProduct(p);
                                  }}
                                  className="w-8 h-8 rounded flex items-center justify-center cursor-pointer transition-colors"
                                  style={{
                                    border: '1px solid var(--border2)',
                                    background: 'var(--sub)',
                                    color: 'var(--ink2)',
                                  }}
                                >
                                  <Edit2 size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {searchQuery.trim().length > 0 && visibleSearchResults.length === 0 && (
                      <div style={{
                        marginTop: 12, padding: 20, textAlign: 'center',
                        border: '1px dashed var(--border2)', borderRadius: 8,
                        fontFamily: MONO, fontSize: 12, color: 'var(--ink3)',
                      }}>
                        No match for “{searchQuery}”
                      </div>
                    )}
                  </div>
                </div>

                {/* ▼ Cart */}
                <div style={PANEL}>
                  <div style={PANEL_HEAD}>
                    <span style={EYEBROW}>{sectorConfig.cartTitle}</span>
                    <span style={{
                      fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: '2px 7px',
                      borderRadius: 4, background: 'var(--rule)', color: 'var(--ink2)',
                    }}>
                      {totalItems === 1 ? '1 unit' : `${totalItems} units`} ·{' '}
                      {billItems.length === 1 ? '1 line' : `${billItems.length} lines`}
                    </span>
                    <button
                      type="button"
                      onClick={() => { clearBill(); toast.success('Bill cleared'); }}
                      disabled={billLocked || billItems.length === 0}
                      className="ml-auto cursor-pointer disabled:opacity-40"
                      style={{
                        border: '1px solid var(--border)', background: 'var(--panel)',
                        borderRadius: 6, padding: '5px 10px', fontSize: 11,
                        fontWeight: 600, color: 'var(--danger)',
                      }}
                    >
                      Clear bill
                    </button>
                  </div>

                  {billItems.length === 0 ? (
                    <div style={{ padding: '56px 20px', textAlign: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>No items on this bill</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--ink3)', marginTop: 6 }}>
                        Scan a barcode or press Ctrl F to search
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div
                        className="hidden md:grid gap-2.5"
                        style={{
                          gridTemplateColumns: 'minmax(0, 1fr) 128px 116px 92px 116px 40px',
                          padding: '9px 14px', background: 'var(--sub)',
                          borderBottom: '1px solid var(--rule2)', fontFamily: MONO,
                          fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.1em', color: 'var(--ink3)',
                        }}
                      >
                        <div>{sectorConfig.productTerm}</div>
                        <div style={{ textAlign: 'center' }}>Qty</div>
                        <div style={{ textAlign: 'right' }}>Rate</div>
                        <div style={{ textAlign: 'center' }}>Disc %</div>
                        <div style={{ textAlign: 'right' }}>Amount</div>
                        <div />
                      </div>

                      {billItems.map((item) => {
                        const line = item.price * item.quantity;
                        const amount = line;
                        const key = `${item.code}-${item.selectedBatch ?? ''}`;
                        return (
                          <div
                            key={key}
                            className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_128px_116px_92px_116px_40px] gap-2.5 items-center"
                            style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)' }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div className="flex items-center gap-1.5">
                                <span className="truncate" style={{ fontSize: 15, fontWeight: 600 }}>{item.name}</span>
                                {canEditInventory && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const matchedProd = products.find(p => p.code === item.code);
                                      if (matchedProd) {
                                        handleOpenEditProduct(matchedProd);
                                      } else {
                                        handleOpenEditProduct({
                                          id: item.code,
                                          code: item.code,
                                          name: item.name,
                                          price: item.price,
                                          category: 'General',
                                          stock: 0,
                                          gstRate: item.gstRate,
                                        });
                                      }
                                    }}
                                    className="p-1 rounded cursor-pointer transition-colors"
                                    style={{ color: 'var(--ink3)' }}
                                    title="Edit product master details"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                )}
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                                #{item.code}
                                {gstEnabled && item.gstRate ? ` · ${item.gstRate}% GST` : ''}
                                {item.discountPercent ? ` · ${item.discountPercent}% off` : ''}
                              </div>
                            </div>

                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.code, item.quantity - 1, item.selectedBatch)}
                                disabled={billLocked}
                                className="cursor-pointer disabled:opacity-40"
                                style={{
                                  width: 34, height: 34, border: '1px solid var(--border2)',
                                  background: 'var(--sub)', borderRadius: 6, fontSize: 17,
                                  fontWeight: 600, lineHeight: 1, color: 'var(--ink)',
                                }}
                              >−</button>
                              <div style={{ ...NUM, width: 34, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
                                {item.quantity}
                              </div>
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.code, item.quantity + 1, item.selectedBatch)}
                                disabled={billLocked}
                                className="cursor-pointer disabled:opacity-40"
                                style={{
                                  width: 34, height: 34, border: '1px solid var(--border2)',
                                  background: 'var(--sub)', borderRadius: 6, fontSize: 17,
                                  fontWeight: 600, lineHeight: 1, color: 'var(--ink)',
                                }}
                              >+</button>
                            </div>

                            <div style={{ ...NUM, fontSize: 14, textAlign: 'right' }}>
                              {inr(item.originalPrice ?? item.price)}
                            </div>

                            <div className="flex justify-center">
                              <input
                                value={String(item.discountPercent ?? 0)}
                                onChange={(e) => updateItemDiscount(
                                  item.code,
                                  Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)),
                                  item.selectedBatch,
                                )}
                                disabled={billLocked}
                                inputMode="decimal"
                                style={{
                                  ...FIELD, ...NUM, width: 62, height: 34, textAlign: 'center',
                                  fontSize: 14, fontWeight: 600, borderRadius: 6,
                                }}
                              />
                            </div>

                            <div style={{ ...NUM, fontSize: 16, fontWeight: 700, textAlign: 'right' }}>
                              {inr(amount)}
                            </div>

                            <button
                              type="button"
                              onClick={() => removeItem(item.code, item.selectedBatch)}
                              disabled={billLocked}
                              aria-label={`Remove ${item.name}`}
                              className="cursor-pointer disabled:opacity-40 justify-self-end md:justify-self-auto"
                              style={{
                                width: 32, height: 32, border: '1px solid var(--rule2)',
                                background: 'var(--panel)', borderRadius: 6,
                                fontSize: 14, color: 'var(--ink3)',
                              }}
                            >×</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Totals rail. One column in step 1; three across in step 2. */}
            <div
              className={`grid gap-3.5 items-start min-w-0 ${
                billingStep === 1
                  ? 'grid-cols-1'
                  : 'grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)_minmax(340px,1.15fr)]'
              }`}
            >

              {/* ▲ Bill totals */}
              <div style={PANEL}>
                <div style={{ ...PANEL_HEAD, padding: '12px 16px' }}>
                  <span style={EYEBROW}>Bill {currentBillNumber || 'unsaved'}</span>
                </div>

                <div className="flex flex-col gap-[9px]" style={{ padding: '14px 16px' }}>
                  <div className="flex justify-between items-baseline" style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--ink2)' }}>Gross</span>
                    <span style={{ ...NUM, fontWeight: 500 }}>{inr(grossTotal)}</span>
                  </div>
                  <div className="flex justify-between items-baseline" style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--ink2)' }}>Item discounts</span>
                    <span style={{ ...NUM, fontWeight: 500, color: 'var(--danger)' }}>
                      {itemDiscountTotal > 0 ? '−' : ''}{inr(itemDiscountTotal)}
                    </span>
                  </div>
                  <div
                    className="flex justify-between items-baseline"
                    style={{ fontSize: 13, paddingTop: 9, borderTop: '1px solid var(--rule)' }}
                  >
                    <span style={{ color: 'var(--ink2)' }}>Taxable value</span>
                    <span style={{ ...NUM, fontWeight: 500 }}>{inr(taxableValue)}</span>
                  </div>

                  {gstEnabled && (igst > 0 ? (
                    <div className="flex justify-between items-baseline" style={{ fontSize: 13 }}>
                      <span style={{ color: 'var(--ink2)' }}>IGST</span>
                      <span style={{ ...NUM, fontWeight: 500 }}>{inr(igst)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-baseline" style={{ fontSize: 13 }}>
                        <span style={{ color: 'var(--ink2)' }}>CGST</span>
                        <span style={{ ...NUM, fontWeight: 500 }}>{inr(cgst)}</span>
                      </div>
                      <div className="flex justify-between items-baseline" style={{ fontSize: 13 }}>
                        <span style={{ color: 'var(--ink2)' }}>SGST</span>
                        <span style={{ ...NUM, fontWeight: 500 }}>{inr(sgst)}</span>
                      </div>
                    </>
                  ))}

                  {loyaltyDiscount > 0 && (
                    <div className="flex justify-between items-baseline" style={{ fontSize: 13 }}>
                      <span style={{ color: 'var(--ink2)' }}>Loyalty redeemed</span>
                      <span style={{ ...NUM, fontWeight: 500, color: 'var(--danger)' }}>
                        −{inr(loyaltyDiscount)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline" style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--ink2)' }}>Round off</span>
                    <span style={{ ...NUM, fontWeight: 500 }}>
                      {roundingAdjustment >= 0 ? '+' : '−'}{inr(Math.abs(roundingAdjustment))}
                    </span>
                  </div>
                </div>

                {/* The one place accent appears at this size: what is owed. */}
                <div
                  className="flex items-end justify-between"
                  style={{ padding: 16, background: 'var(--accent)', color: 'var(--panel)' }}
                >
                  <div>
                    <div style={{
                      fontFamily: MONO, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.14em', opacity: 0.75,
                    }}>Amount due</div>
                    <div style={{
                      ...NUM, fontSize: 40, fontWeight: 700, lineHeight: 1.05,
                      letterSpacing: '-0.02em', marginTop: 4,
                    }}>{inr(finalTotal)}</div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, textAlign: 'right', opacity: 0.8 }}>
                    {totalItems === 1 ? '1 unit' : `${totalItems} units`}
                  </div>
                </div>
              </div>

              {/* ▼ Step 1 — continue to payment */}
              {billingStep === 1 && (
                <div className="flex flex-col gap-3" style={{ ...PANEL, padding: '14px 16px' }}>
                  {activeTable && (
                    <>
                      <div style={EYEBROW}>Held bills</div>
                      <button
                        type="button"
                        onClick={handleSuspendOrderToTable}
                        disabled={billItems.length === 0}
                        className="cursor-pointer disabled:opacity-40"
                        style={{
                          height: 40, border: '1px solid var(--border2)', background: 'var(--sub)',
                          borderRadius: 7, fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                        }}
                      >
                        Hold to {activeTable.name}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => goToStep(2)}
                    disabled={billItems.length === 0}
                    className="flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40"
                    style={{
                      height: 54, border: 0, borderRadius: 8, background: 'var(--ink)',
                      color: 'var(--panel)', fontSize: 15, fontWeight: 700,
                    }}
                  >
                    Continue to payment
                    <span style={KBD_ON_FILL}>F8</span>
                  </button>
                </div>
              )}

              {/* ▼ Step 2 — customer, then tender */}
              {billingStep === 2 && (
                <>
                  <div className="flex flex-col gap-3" style={{ ...PANEL, padding: '14px 16px' }}>
                    <div style={EYEBROW}>{sectorConfig.customerLabel}</div>
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Name (optional)"
                      style={{ ...FIELD, height: 42, padding: '0 12px', fontSize: 14 }}
                    />
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Mobile — receipt &amp; loyalty"
                      inputMode="numeric"
                      style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 14 }}
                    />

                    {currentCustomer && (() => {
                      const tier = getLoyaltyTier(currentCustomer.totalSpent);
                      return (
                        <div style={{
                          border: '1px solid var(--rule2)', borderRadius: 8,
                          padding: 12, background: 'var(--sub)',
                        }}>
                          <div className="flex items-baseline justify-between">
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{tier.name} tier</span>
                            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--ink2)' }}>
                              {currentCustomer.loyaltyPoints} pts · {inr(tier.spent)} spent
                            </span>
                          </div>
                          <div style={{
                            height: 6, borderRadius: 3, background: 'var(--border)',
                            marginTop: 10, overflow: 'hidden',
                          }}>
                            <div style={{
                              height: '100%', background: 'var(--accent)',
                              width: `${Math.max(4, Math.min(100, tier.progress))}%`,
                            }} />
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)', marginTop: 7 }}>
                            {tier.nextTier === 'Max'
                              ? 'Top tier · 2.0× points'
                              : `${inr(tier.nextTierLimit - tier.spent)} to ${tier.nextTier}`}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex flex-col gap-3" style={{ ...PANEL, padding: '14px 16px' }}>
                    <div style={EYEBROW}>Payment</div>

                    <div className="grid grid-cols-4 gap-2">
                      {PAY_MODES.map((p) => {
                        const on = paymentMode === p.mode;
                        return (
                          <button
                            key={p.mode}
                            type="button"
                            onClick={() => setPaymentMode(p.mode)}
                            className="flex flex-col items-center justify-center gap-1 cursor-pointer"
                            style={{
                              height: 62, borderRadius: 8, borderWidth: 1.5, borderStyle: 'solid',
                              borderColor: on ? 'var(--accent)' : 'var(--border2)',
                              background: on ? 'var(--accent-soft)' : 'var(--sub)',
                              color: on ? 'var(--accent)' : 'var(--ink2)',
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{p.label}</span>
                            <span style={{ fontFamily: MONO, fontSize: 10, opacity: 0.7 }}>{p.key}</span>
                          </button>
                        );
                      })}
                    </div>

                    {paymentMode === 'cash' ? (
                      <div className="flex flex-col gap-2.5">
                        <input
                          value={amountReceived}
                          onChange={(e) => setAmountReceived(e.target.value.replace(/[^\d.]/g, ''))}
                          placeholder="Cash received"
                          inputMode="decimal"
                          style={{
                            ...FIELD, ...NUM, height: 50, padding: '0 14px',
                            fontSize: 20, fontWeight: 600, borderWidth: 1.5, borderRadius: 8,
                          }}
                        />
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { v: Math.ceil(finalTotal), label: 'Exact' },
                            { v: 100, label: '₹100' }, { v: 200, label: '₹200' },
                            { v: 500, label: '₹500' }, { v: 1000, label: '₹1000' },
                            { v: 2000, label: '₹2000' },
                          ].map((n) => (
                            <button
                              key={n.label}
                              type="button"
                              onClick={() => setAmountReceived(String(n.v))}
                              className="cursor-pointer"
                              style={{
                                height: 34, border: '1px solid var(--border2)', background: 'var(--sub)',
                                borderRadius: 6, fontFamily: MONO, fontSize: 12,
                                fontWeight: 600, color: 'var(--ink)',
                              }}
                            >{n.label}</button>
                          ))}
                        </div>

                        {(() => {
                          const change = amountReceivedNum - finalTotal;
                          const settled = change >= 0;
                          return (
                            <div
                              className="flex items-center justify-between"
                              style={{
                                padding: '12px 14px', borderRadius: 8,
                                background: settled ? 'var(--ok-soft)' : 'var(--danger-soft)',
                                border: `1px solid ${settled ? 'var(--ok-line)' : 'var(--danger-line)'}`,
                              }}
                            >
                              <span style={{
                                fontFamily: MONO, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '0.12em', color: 'var(--ink2)',
                              }}>
                                {settled ? 'Change to return' : 'Still to collect'}
                              </span>
                              <span style={{
                                ...NUM, fontSize: 24, fontWeight: 700,
                                color: settled ? 'var(--ok)' : 'var(--danger)',
                              }}>{inr(Math.abs(change))}</span>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div style={{
                        padding: 14, border: '1px dashed var(--border2)', borderRadius: 8,
                        fontFamily: MONO, fontSize: 12, color: 'var(--ink2)', lineHeight: 1.6,
                      }}>
                        {DIGITAL_NOTES[paymentMode]?.(customerName) ?? ''}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => goToStep(1)}
                        className="cursor-pointer"
                        style={{
                          width: 96, height: 54, border: '1px solid var(--border2)',
                          background: 'var(--sub)', borderRadius: 8, fontSize: 13,
                          fontWeight: 600, color: 'var(--ink)',
                        }}
                      >
                        Back <span style={{ fontFamily: MONO, opacity: 0.7 }}>F7</span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintBill}
                        disabled={isSubmittingBill || billItems.length === 0}
                        className="flex-1 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40"
                        style={{
                          minWidth: 200, height: 54, border: 0, borderRadius: 8,
                          background: 'var(--accent)', color: 'var(--panel)',
                          fontSize: 15, fontWeight: 700,
                        }}
                      >
                        {isSubmittingBill ? 'Saving…' : sectorConfig.billButtonText}
                        <span style={KBD_ON_FILL}>F4</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Keyboard legend. The shortcuts already existed but were hidden
              behind a modal, so a cashier had no way to find them mid-sale. */}
          <div
            className="shrink-0 flex items-center gap-x-[18px] gap-y-1.5 flex-wrap"
            style={{
              padding: '10px 20px', background: 'var(--panel)',
              borderTop: '1px solid var(--border)',
            }}
          >
            {[
              ['Ctrl F', 'search'], ['↑ ↓', 'pick'], ['Enter', 'add'],
              ['F1 F2 F3', 'cash / UPI / card'], ['F6', 'khata'],
              ['F8', 'payment'], ['F7', 'back'], ['F4', 'complete bill'],
              ['F5', 'new bill'], ['Ctrl H', 'history'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center gap-[7px]">
                <span style={KBD}>{key}</span>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{label}</span>
              </div>
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md rounded-xl overflow-hidden flex flex-col shadow-2xl"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          >
            <div
              className="flex justify-between items-center px-5 py-4"
              style={{ borderBottom: '1px solid var(--rule2)' }}
            >
              <div>
                <div style={EYEBROW}>Catalogue &middot; Quick Insert</div>
                <h3 className="text-base font-bold tracking-tight text-[var(--ink)]">Quick Add Product</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                className="w-8 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors"
                style={{
                  background: 'var(--sub)',
                  border: '1px solid var(--border2)',
                  color: 'var(--ink3)',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="p-5 space-y-3.5">
              <div>
                <label style={EYEBROW} className="block mb-1">Barcode / SKU *</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    placeholder="Scan or type barcode/SKU"
                    value={quickAddBarcode}
                    onChange={e => setQuickAddBarcode(e.target.value)}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 14 }}
                  />
                  <button
                    type="button"
                    onClick={() => startMobileScan()}
                    className="px-3 rounded-md border flex items-center justify-center transition-all cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800"
                    style={{ background: 'var(--sub)', border: '1px solid var(--border2)', color: 'var(--ink2)' }}
                    title="Scan Barcode using camera"
                  >
                    <Camera size={14} />
                  </button>
                </div>
              </div>

              <div>
                <label style={EYEBROW} className="block mb-1">Product Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Whole Wheat Bread 400g"
                  value={quickAddForm.name}
                  onChange={e => setQuickAddForm(prev => ({ ...prev, name: e.target.value }))}
                  style={{ ...FIELD, height: 42, padding: '0 12px', fontSize: 13.5 }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={EYEBROW} className="block mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={quickAddForm.price}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, price: e.target.value }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={EYEBROW} className="block mb-1">Initial Stock</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={quickAddForm.stock}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, stock: e.target.value }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 14 }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={EYEBROW} className="block mb-1">Category</label>
                  <select
                    value={quickAddForm.category}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, category: e.target.value }))}
                    style={{ ...FIELD, height: 42, padding: '0 10px', fontSize: 12.5 }}
                  >
                    {sectorConfig.categories.map((cat: string) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={EYEBROW} className="block mb-1">GST Slab</label>
                  <select
                    value={quickAddForm.gstRate}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, gstRate: parseInt(e.target.value) }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 10px', fontSize: 12.5 }}
                  >
                    <option value="0">0% Exempt</option>
                    <option value="5">5% GST</option>
                    <option value="12">12% GST</option>
                    <option value="18">18% GST</option>
                    <option value="28">28% GST</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={EYEBROW} className="block mb-1">Unit of Measure</label>
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
                      style={{ ...FIELD, height: 42, padding: '0 10px', fontSize: 12.5 }}
                    >
                      <option value="PCS">PCS (Pieces)</option>
                      <option value="KG">KG (Kilograms)</option>
                      <option value="GRAM">GRAM</option>
                      <option value="LITRE">LITRE</option>
                      <option value="ML">ML (Milliliters)</option>
                      <option value="BOX">BOX</option>
                      <option value="PACK">PACK</option>
                      <option value="METER">METER</option>
                      <option value="__add_custom_uom__">+ Custom Unit...</option>
                    </select>
                  ) : (
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="text"
                        value={quickAddForm.uom}
                        onChange={e => setQuickAddForm(prev => ({ ...prev, uom: e.target.value }))}
                        placeholder="e.g. BOTTLE"
                        autoFocus
                        style={{ ...FIELD, height: 42, padding: '0 10px', fontSize: 12.5 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCustomUom(false);
                          setQuickAddForm(prev => ({ ...prev, uom: 'PCS' }));
                        }}
                        className="px-2.5 h-[42px] text-xs font-semibold rounded-md border"
                        style={{ background: 'var(--sub)', border: '1px solid var(--border2)', color: 'var(--ink2)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label style={EYEBROW} className="block mb-1">HSN Code</label>
                  <input
                    type="text"
                    placeholder="e.g. 1905"
                    value={quickAddForm.hsnCode}
                    onChange={e => setQuickAddForm(prev => ({ ...prev, hsnCode: e.target.value }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 13 }}
                  />
                </div>
              </div>

              {/* Product Photo for Web Catalog & POS */}
              <div>
                <label style={EYEBROW} className="block mb-1.5">Product Photo (Website & POS)</label>
                <input
                  type="file"
                  accept="image/*"
                  ref={quickAddGalleryInputRef}
                  onChange={handleQuickAddGalleryFile}
                  className="hidden"
                />
                <div
                  className="flex items-center justify-between p-2.5 rounded-lg border"
                  style={{ background: 'var(--sub)', borderColor: 'var(--border2)' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {quickAddImage ? (
                      <img
                        src={quickAddImage}
                        alt="Product preview"
                        className="w-10 h-10 object-contain rounded-md border bg-white shrink-0"
                        style={{ borderColor: 'var(--border2)' }}
                      />
                    ) : (
                      <div
                        onClick={() => setShowProductCameraModal(true)}
                        className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 cursor-pointer"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                        title="Open in-app camera viewfinder"
                      >
                        <Camera size={18} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }} className="truncate">
                        {quickAddImage ? 'Photo attached for website' : 'Customer website product photo'}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }} className="truncate">
                        {quickAddImage ? 'Auto-enhanced with white background' : 'Snap photo in-app or pick gallery'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {quickAddImage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowProductCameraModal(true)}
                          className="h-8 px-2.5 rounded-md text-[11px] font-semibold border cursor-pointer"
                          style={{ borderColor: 'var(--border2)', background: 'var(--panel)', color: 'var(--ink)' }}
                        >
                          Retake
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickAddImage(null)}
                          className="h-8 px-2 rounded-md text-[12px] font-bold cursor-pointer"
                          style={{ color: 'var(--danger)' }}
                          title="Remove photo"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowProductCameraModal(true)}
                          className="h-8 px-2.5 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer border-0"
                          style={{ background: 'var(--accent)', color: 'var(--panel)' }}
                          title="Open live camera"
                        >
                          <Camera size={12} />
                          <span>Snap</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => quickAddGalleryInputRef.current?.click()}
                          className="h-8 px-2 rounded-md text-[11px] font-medium border cursor-pointer"
                          style={{ borderColor: 'var(--border2)', background: 'var(--panel)', color: 'var(--ink2)' }}
                          title="Choose photo from phone gallery"
                        >
                          Gallery
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowQuickAddModal(false)}
                  className="flex-1 h-11 rounded-md text-xs font-semibold cursor-pointer"
                  style={{ background: 'var(--sub)', border: '1px solid var(--border2)', color: 'var(--ink2)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 h-11 rounded-md text-xs font-bold cursor-pointer"
                  style={{ background: 'var(--ink)', color: 'var(--panel)', border: 0 }}
                >
                  Save &amp; Add to Cart
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Product Modal */}
      {showEditProductModal && productToEdit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg rounded-xl overflow-hidden flex flex-col shadow-2xl my-8"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          >
            <div
              className="flex justify-between items-center px-5 py-4"
              style={{ borderBottom: '1px solid var(--rule2)' }}
            >
              <div>
                <div style={EYEBROW}>Master Inventory &middot; SKU #{productToEdit.code}</div>
                <h3 className="text-base font-bold tracking-tight text-[var(--ink)]">Edit Product Details</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditProductModal(false);
                  setProductToEdit(null);
                }}
                className="w-8 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors"
                style={{
                  background: 'var(--sub)',
                  border: '1px solid var(--border2)',
                  color: 'var(--ink3)',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditedProduct} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label style={EYEBROW} className="block mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amul Salted Butter 500g"
                  value={editProductForm.name}
                  onChange={e => setEditProductForm(prev => ({ ...prev, name: e.target.value }))}
                  style={{ ...FIELD, height: 42, padding: '0 12px', fontSize: 13.5 }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={EYEBROW} className="block mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={editProductForm.price}
                    onChange={e => setEditProductForm(prev => ({ ...prev, price: e.target.value }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={EYEBROW} className="block mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={editProductForm.mrp}
                    onChange={e => setEditProductForm(prev => ({ ...prev, mrp: e.target.value }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 14 }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={EYEBROW} className="block mb-1">Current Stock *</label>
                  <input
                    type="number"
                    required
                    step="any"
                    min="0"
                    value={editProductForm.stock}
                    onChange={e => setEditProductForm(prev => ({ ...prev, stock: e.target.value }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={EYEBROW} className="block mb-1">Low Stock Alert Level</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={editProductForm.lowStockThreshold}
                    onChange={e => setEditProductForm(prev => ({ ...prev, lowStockThreshold: e.target.value }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 14 }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={EYEBROW} className="block mb-1">Category</label>
                  <select
                    value={editProductForm.category}
                    onChange={e => setEditProductForm(prev => ({ ...prev, category: e.target.value }))}
                    style={{ ...FIELD, height: 42, padding: '0 10px', fontSize: 12.5 }}
                  >
                    {sectorConfig.categories.map((cat: string) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    {!sectorConfig.categories.includes(editProductForm.category) && editProductForm.category && (
                      <option value={editProductForm.category}>{editProductForm.category}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label style={EYEBROW} className="block mb-1">GST Slab</label>
                  <select
                    value={editProductForm.gstRate}
                    onChange={e => setEditProductForm(prev => ({ ...prev, gstRate: parseInt(e.target.value) }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 10px', fontSize: 12.5 }}
                  >
                    <option value="0">0% Exempt</option>
                    <option value="5">5% GST</option>
                    <option value="12">12% GST</option>
                    <option value="18">18% GST</option>
                    <option value="28">28% GST</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={EYEBROW} className="block mb-1">HSN Code</label>
                  <input
                    type="text"
                    placeholder="e.g. 1905"
                    value={editProductForm.hsnCode}
                    onChange={e => setEditProductForm(prev => ({ ...prev, hsnCode: e.target.value }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={EYEBROW} className="block mb-1">Unit of Measure</label>
                  <select
                    value={editProductForm.uom}
                    onChange={e => setEditProductForm(prev => ({ ...prev, uom: e.target.value }))}
                    style={{ ...FIELD, height: 42, padding: '0 10px', fontSize: 12.5 }}
                  >
                    <option value="PCS">PCS (Pieces)</option>
                    <option value="KG">KG (Kilograms)</option>
                    <option value="GRAM">GRAM</option>
                    <option value="LITRE">LITRE</option>
                    <option value="ML">ML (Milliliters)</option>
                    <option value="BOX">BOX</option>
                    <option value="PACK">PACK</option>
                    <option value="METER">METER</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={EYEBROW} className="block mb-1">Wholesale Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Optional"
                    value={editProductForm.wholesalePrice}
                    onChange={e => setEditProductForm(prev => ({ ...prev, wholesalePrice: e.target.value }))}
                    style={{ ...FIELD, ...NUM, height: 42, padding: '0 12px', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={EYEBROW} className="block mb-1">Brand / Manufacturer</label>
                  <input
                    type="text"
                    placeholder="e.g. Britannia"
                    value={editProductForm.brand}
                    onChange={e => setEditProductForm(prev => ({ ...prev, brand: e.target.value }))}
                    style={{ ...FIELD, height: 42, padding: '0 12px', fontSize: 13 }}
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditProductModal(false);
                    setProductToEdit(null);
                  }}
                  disabled={isUpdatingProduct}
                  className="flex-1 h-11 rounded-md text-xs font-semibold cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--sub)', border: '1px solid var(--border2)', color: 'var(--ink2)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingProduct}
                  className="flex-1 h-11 rounded-md text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'var(--ink)', color: 'var(--panel)', border: 0 }}
                >
                  {isUpdatingProduct ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* In-App Live Camera Viewfinder for Quick Add Product Photos */}
      <ProductPhotoCaptureModal
        isOpen={showProductCameraModal}
        onClose={() => setShowProductCameraModal(false)}
        onCapture={(dataUrl) => {
          setQuickAddImage(dataUrl);
          toast.success('Product photo captured for website');
        }}
        title="Quick Add Product Photo"
      />



      {/* Interactive Prescription OCR Laser Scanner Modal */}
    </>
  );
}
