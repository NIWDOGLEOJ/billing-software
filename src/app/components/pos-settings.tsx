import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth, User } from '../contexts/auth-context';
import { useTheme, ThemeMode, COLOR_THEME_PRESETS, GLASS_OPACITY_MIN, GLASS_OPACITY_MAX } from '../contexts/theme-context';
import { ShopDetails } from './cashier-billing-advanced';
import { Store, User as UserIcon, Lock, Database, Shield, Eye, EyeOff, Plus, Trash2, Crown, Users as UsersIcon, Printer, Clock, X, Package, Edit2, Search, FileSpreadsheet, Camera, Settings, Palette, Sliders, Sparkles, RotateCcw, Sun, Moon, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useConfirm } from '../hooks/useConfirm';
import { updatePointerGlare, SpecularGlareOverlay } from '../utils/glare';
import { Skeleton } from './ui/skeleton';

const isAndroid = typeof window !== 'undefined' && (!!(window as any).Android || /Android/i.test(navigator.userAgent));

const STANDARD_CATEGORIES = [
  'General',
  'Dairy',
  'Bakery',
  'Produce',
  'Meat',
  'Grains',
  'Beverages',
  'Snacks',
  'Canned Goods',
  'Frozen Foods',
  'Personal Care',
  'Household',
  'Electronics',
  'Apparel',
  'Stationery',
  'Pharmacy',
  'Baby Care',
  'Pet Care'
];

interface POSSettingsProps {
  onClose?: () => void;
  isModal?: boolean;
}

export function POSSettings({ onClose, isModal = false }: POSSettingsProps) {
  const { user, isOwner } = useAuth();
  const { theme, setTheme, resolvedTheme, darkMode, accentColor, setAccentColor, activePresetId, selectPresetTheme, surfaceColor, setSurfaceColor, buttonOpacity, setButtonOpacity, elementOpacity, setElementOpacity, resetThemeDefaults } = useTheme();
  // In-app replacement for native confirm(); `confirmDialog` is rendered below.
  const { confirm, confirmDialog } = useConfirm();

  // Active drawer tab state
  const [activeDrawerTab, setActiveDrawerTab] = useState<'shop' | 'theme' | 'workspace' | 'gst' | 'loyalty' | 'printer' | 'password' | 'owners' | 'database' | 'shifts' | 'products' | 'restock' | 'diagnostics' | 'inventory' | 'batches' | 'restaurant_tables'>('shop');

  // Helper to load settings with backward compatibility
  const getStoredKey = (key: string, defaultVal: string): string => {
    try {
      const nexusKey = `nexusflow${key}`;
      const evalixKey = `evalix${key}`;
      const val = localStorage.getItem(nexusKey);
      if (val !== null) return val;
      const oldVal = localStorage.getItem(evalixKey);
      if (oldVal !== null) {
        localStorage.setItem(nexusKey, oldVal);
        return oldVal;
      }
    } catch {
      // Storage unreadable — fall back to the default, same as a fresh install.
    }
    return defaultVal;
  };

  // Active sector configuration
  const activeSector = 'retail' as const;
  const multiSectorEnabled = false;
  const setActiveSector = (_val: any) => {};
  const setMultiSectorEnabled = (_val: boolean) => {};


  const [localTables, setLocalTables] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('nexusflowTablesList');
      if (saved) return JSON.parse(saved);
    } catch {
      // Corrupt stored layout; start from an empty table list.
    }
    return [];
  });

  const [newTableName, setNewTableName] = useState('');
  const [newTableSeats, setNewTableSeats] = useState(4);
  
  // Bulk setup state
  const [bulkTableCount, setBulkTableCount] = useState(12);
  const [bulkTableSeats, setBulkTableSeats] = useState(4);

  // Sync state whenever local storage or external updates trigger it
  useEffect(() => {
    const handleSync = () => {
      try {
        const saved = localStorage.getItem('nexusflowTablesList');
        if (saved) setLocalTables(JSON.parse(saved));
      } catch {
        // Malformed sync payload; keep the tables already on screen.
      }
    };
    window.addEventListener('nexusflow-tables-updated', handleSync);
    return () => window.removeEventListener('nexusflow-tables-updated', handleSync);
  }, []);

  const saveTables = (updatedList: any[]) => {
    setLocalTables(updatedList);
    try {
      localStorage.setItem('nexusflowTablesList', JSON.stringify(updatedList));
      window.dispatchEvent(new CustomEvent('nexusflow-tables-updated'));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTable = () => {
    if (!newTableName.trim()) {
      toast.error('Please enter a table name.');
      return;
    }
    const newTable = {
      id: `t-${Date.now()}`,
      name: newTableName,
      seats: newTableSeats,
      status: 'available',
      total: 0,
      items: []
    };
    const updated = [...localTables, newTable];
    saveTables(updated);
    setNewTableName('');
    toast.success(`🍽️ Table "${newTableName}" added!`);
  };

  const handleDeleteTable = async (id: string) => {
    if (await confirm({
      title: 'Delete this table?',
      description: 'It will be removed from the dining room layout.',
      confirmLabel: 'Delete table',
      destructive: true,
    })) {
      const updated = localTables.filter(t => t.id !== id);
      saveTables(updated);
      toast.success('Table deleted successfully.');
    }
  };

  const handleUpdateTableSeats = (id: string, seats: number) => {
    const updated = localTables.map(t => t.id === id ? { ...t, seats: Math.max(1, seats) } : t);
    saveTables(updated);
  };

  const handleBulkGenerate = async () => {
    if (await confirm({
      title: 'Replace the whole dining room layout?',
      description: `Your current tables will be discarded and replaced with ${bulkTableCount} tables of ${bulkTableSeats} seats each.`,
      confirmLabel: 'Replace layout',
      destructive: true,
    })) {
      const generated = Array.from({ length: bulkTableCount }, (_, i) => ({
        id: `t-bulk-${i + 1}`,
        name: `Table ${i + 1}`,
        seats: bulkTableSeats,
        status: 'available',
        total: 0,
        items: []
      }));
      saveTables(generated);
      toast.success(`🎉 Generated ${bulkTableCount} dine-in tables successfully!`);
    }
  };

  // Sound States
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(50);
  const [soundProfile, setSoundProfile] = useState<'classic' | 'crisp' | 'retro' | 'cozy'>('classic');
  const [successBeepEnabled, setSuccessBeepEnabled] = useState(true);
  const [errorBuzzEnabled, setErrorBuzzEnabled] = useState(true);
  const [chimeEnabled, setChimeEnabled] = useState(true);

  // LAN Diagnostics states
  const [hostIpAddress, setHostIpAddress] = useState('127.0.0.1');
  const [networkPingLatency, setNetworkPingLatency] = useState<number | null>(null);
  const [wsConnectionStatus, setWsConnectionStatus] = useState<'Connected' | 'Connecting' | 'Offline'>('Connected');

  // Shop Details
  const [shopDetails, setShopDetails] = useState<ShopDetails>({
    name: 'RETAIL SUPERMARKET',
    address: '123 Main Street, City, State 12345',
    phone: '(555) 123-4567',
    email: 'info@retailstore.com',
  });

  // GST Settings
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstRate, setGstRate] = useState(18);
  const [gstNumber, setGstNumber] = useState('');
  const [drugLicense20, setDrugLicense20] = useState('');
  const [drugLicense21, setDrugLicense21] = useState('');

  // Rounding Settings
  const [roundingEnabled, setRoundingEnabled] = useState(true);

  // Loyalty Settings
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true);
  const [pointsPerHundred, setPointsPerHundred] = useState(1);
  const [pointValue, setPointValue] = useState(1);

  // LAN Chat Settings
  const [chatEnabled, setChatEnabled] = useState(true);

  // Password Change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Owner Management
  const [owners, setOwners] = useState<User[]>([]);
  const [showAddOwnerModal, setShowAddOwnerModal] = useState(false);
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerUsername, setNewOwnerUsername] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');

  // Printer & Cash Drawer Settings
  const [receiptPrinterName, setReceiptPrinterName] = useState('');
  const [autoOpenDrawer, setAutoOpenDrawer] = useState(true);

  // Shifts History & Z-Reports
  const [shiftsHistory, setShiftsHistory] = useState<any[]>([]);

  // Warehouse & Inventory States
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inventoryLedger, setInventoryLedger] = useState<any[]>([]);
  const [showAddWarehouseModal, setShowAddWarehouseModal] = useState(false);
  const [newWarehouseForm, setNewWarehouseForm] = useState({ name: '', code: '', address: '' });
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ product_id: '', from_warehouse_id: '', to_warehouse_id: '', quantity: '', notes: '' });
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ product_id: '', warehouse_id: '', change_qty: '', type: 'damaged' as 'damaged' | 'audit', notes: '' });

  // Pharmacy Batch States
  const [batches, setBatches] = useState<any[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
  const [showAddBatchModal, setShowAddBatchModal] = useState(false);
  const [newBatchForm, setNewBatchForm] = useState({
    product_id: '',
    batch_number: '',
    expiry_date: '',
    manufacturing_date: '',
    stock_quantity: '',
    drug_license: '',
    prescription_required: false
  });

  const loadInventoryAndBatches = async () => {
    try {
      const whData = await api.get<any[]>('/inventory/warehouses');
      setWarehouses(whData);
      const ledgerData = await api.get<any[]>('/inventory/ledger');
      setInventoryLedger(ledgerData);
      const batchesData = await api.get<any[]>('/batches');
      setBatches(batchesData);
      const expData = await api.get<any[]>('/batches/expiries');
      setExpiringBatches(expData);
    } catch (err) {
      console.warn('Failed to load inventory or batches details:', err);
    }
  };

  const handleCreateWarehouse = async () => {
    if (!newWarehouseForm.name || !newWarehouseForm.code) {
      return toast.error('Warehouse Name and Code are required');
    }
    try {
      await api.post('/inventory/warehouses', newWarehouseForm);
      toast.success('Warehouse created successfully');
      setNewWarehouseForm({ name: '', code: '', address: '' });
      setShowAddWarehouseModal(false);
      await loadInventoryAndBatches();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create warehouse');
    }
  };

  const handleTransferStock = async () => {
    const { product_id, from_warehouse_id, to_warehouse_id, quantity, notes } = transferForm;
    if (!product_id || !from_warehouse_id || !to_warehouse_id || !quantity) {
      return toast.error('All fields are required');
    }
    try {
      await api.post('/inventory/transfer', {
        product_id,
        from_warehouse_id,
        to_warehouse_id,
        quantity: parseInt(quantity),
        notes
      });
      toast.success('Stock transfer completed');
      setTransferForm({ product_id: '', from_warehouse_id: '', to_warehouse_id: '', quantity: '', notes: '' });
      setShowTransferModal(false);
      await loadInventoryAndBatches();
      await loadProducts();
    } catch (e: any) {
      toast.error(e.message || 'Failed to transfer stock');
    }
  };

  const handleAdjustStock = async () => {
    const { product_id, warehouse_id, change_qty, type, notes } = adjustForm;
    if (!product_id || !warehouse_id || !change_qty || !type) {
      return toast.error('All fields are required');
    }
    try {
      await api.post('/inventory/log', {
        product_id,
        warehouse_id,
        change_qty: type === 'damaged' ? -Math.abs(parseInt(change_qty)) : parseInt(change_qty),
        type,
        notes
      });
      toast.success('Stock adjustment logged successfully');
      setAdjustForm({ product_id: '', warehouse_id: '', change_qty: '', type: 'damaged', notes: '' });
      setShowAdjustModal(false);
      await loadInventoryAndBatches();
      await loadProducts();
    } catch (e: any) {
      toast.error(e.message || 'Failed to adjust stock');
    }
  };

  const handleCreateBatch = async () => {
    const { product_id, batch_number, expiry_date, manufacturing_date, stock_quantity, drug_license, prescription_required } = newBatchForm;
    if (!product_id || !batch_number || !expiry_date || !stock_quantity) {
      return toast.error('Missing required batch details');
    }
    try {
      await api.post('/batches', {
        product_id,
        batch_number,
        expiry_date,
        manufacturing_date,
        stock_quantity: parseInt(stock_quantity),
        drug_license,
        prescription_required: prescription_required ? 1 : 0
      });
      toast.success('Pharmacy batch inwarded successfully');
      setNewBatchForm({
        product_id: '',
        batch_number: '',
        expiry_date: '',
        manufacturing_date: '',
        stock_quantity: '',
        drug_license: '',
        prescription_required: false
      });
      setShowAddBatchModal(false);
      await loadInventoryAndBatches();
      await loadProducts();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create batch');
    }
  };

  const handleDeleteBatch = async (id: string, batchNumber: string) => {
    if (await confirm({
      title: `Delete batch ${batchNumber}?`,
      description: 'Stock tracked against this batch will no longer be available. This cannot be undone.',
      confirmLabel: 'Delete batch',
      destructive: true,
    })) {
      try {
        await api.delete(`/batches/${id}`);
        toast.success('Batch deleted successfully');
        await loadInventoryAndBatches();
        await loadProducts();
      } catch (e: any) {
        toast.error(e.message || 'Failed to delete batch');
      }
    }
  };

  // Product Management
  const [productsList, setProductsList] = useState<any[]>([]);
  // Separates "still fetching" from "no products", so the catalog tab doesn't
  // claim the shop is empty while the request is still in flight.
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  // Product categories list for filtering
  const productCategories = useMemo(() => {
    const cats = new Set(productsList.map(p => p.category || 'General'));
    return ['All', ...Array.from(cats)];
  }, [productsList]);

  // List of standard categories to present as default selectable options
  const selectableCategories = useMemo(() => {
    const dbCats = productsList.map(p => p.category || 'General');
    const allCats = new Set([...STANDARD_CATEGORIES, ...dbCats]);
    return Array.from(allCats).sort();
  }, [productsList]);

  // Replenishment & Purchase Order State
  const [supplierName, setSupplierName] = useState('Central Grocery Distributors');
  const [supplierContact, setSupplierContact] = useState('contact@centraldistributors.com');
  const [poNumber, setPoNumber] = useState(`PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [poCustomizations, setPoCustomizations] = useState<{
    [productId: string]: {
      quantity?: number;
      wholesalePrice?: number;
      selected?: boolean;
    }
  }>({});

  // Aggregate data by HSN code and stock levels for B2B Purchase Orders
  const restockItems = useMemo(() => {
    return productsList.map(p => {
      const threshold = p.low_stock_threshold ?? 10;
      const currentStock = p.stock ?? 0;
      const isLowStock = currentStock <= threshold;
      
      const custom = poCustomizations[p.id] || {};
      
      // Defaults: Ideal level is 3x threshold (min 30). Order qty brings stock to ideal. Cost is 70% of retail.
      const defaultIdeal = Math.max(30, threshold * 3);
      const defaultReplenish = Math.max(10, defaultIdeal - currentStock);
      const defaultWholesale = Math.round(p.price * 0.7 * 100) / 100;
      
      const quantity = custom.quantity !== undefined ? custom.quantity : defaultReplenish;
      const wholesalePrice = custom.wholesalePrice !== undefined ? custom.wholesalePrice : defaultWholesale;
      const selected = custom.selected !== undefined ? custom.selected : isLowStock;

      const taxableValue = quantity * wholesalePrice;
      const gstRate = p.gst_rate ?? 18;
      const gstAmount = (taxableValue * gstRate) / 100;
      const cgst = gstAmount / 2;
      const sgst = gstAmount / 2;
      const totalCost = taxableValue + gstAmount;

      return {
        ...p,
        threshold,
        currentStock,
        isLowStock,
        quantity,
        wholesalePrice,
        selected,
        taxableValue,
        gstRate,
        cgst,
        sgst,
        totalCost
      };
    });
  }, [productsList, poCustomizations]);

  const downloadPOCSV = () => {
    const selectedItems = restockItems.filter(item => item.selected && item.quantity > 0);
    if (selectedItems.length === 0) {
      toast.error('No products selected for Purchase Order');
      return;
    }

    const headers = [
      'SKU',
      'Product Name',
      'HSN Code',
      'Current Stock',
      'Order Quantity',
      'Wholesale Rate (INR)',
      'Taxable Value (INR)',
      'GST Rate %',
      'CGST (INR)',
      'SGST (INR)',
      'Total Cost (INR)'
    ];

    const rows = selectedItems.map(item => [
      `"${item.sku || item.id}"`,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.hsn_code || 'N/A'}"`,
      item.currentStock,
      item.quantity,
      item.wholesalePrice.toFixed(2),
      item.taxableValue.toFixed(2),
      `${item.gstRate}%`,
      item.cgst.toFixed(2),
      item.sgst.toFixed(2),
      item.totalCost.toFixed(2)
    ]);

    const meta = [
      ['PURCHASE ORDER', ''],
      ['PO Reference:', poNumber],
      ['Date:', new Date().toLocaleDateString('en-IN')],
      ['Supplier:', supplierName],
      ['Supplier Contact:', supplierContact],
      ['', ''],
      headers
    ];

    const csvContent = [
      ...meta.map(row => row.join(',')),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.setAttribute('download', `${poNumber}_Restock_PO.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`📦 Purchase Order ${poNumber} downloaded successfully!`);
  };
  const [showAddEditProductModal, setShowAddEditProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('All');
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [isAddingCustomUom, setIsAddingCustomUom] = useState(false);
  const [isScanToAddMode, setIsScanToAddMode] = useState(false);

  // Camera Barcode Scanner States for POS settings
  const [showSettingsCameraScanner, setShowSettingsCameraScanner] = useState(false);
  const [settingsCameraError, setSettingsCameraError] = useState('');
  const settingsVideoRef = useRef<HTMLVideoElement | null>(null);
  const settingsStreamRef = useRef<MediaStream | null>(null);
  const settingsZxingReaderRef = useRef<any | null>(null);

  const startSettingsCameraScan = async () => {
    setSettingsCameraError('');
    setShowSettingsCameraScanner(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 } 
        }
      });
      settingsStreamRef.current = stream;

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
        if (settingsVideoRef.current) {
          settingsVideoRef.current.srcObject = stream;
          settingsVideoRef.current.play().catch(e => console.warn('Video play deferred:', e));
        }
      }, 150);
    } catch (err: any) {
      console.error('Camera access failed:', err);
      setSettingsCameraError('Could not access camera. Please check permissions or type manually.');
    }
  };

  const downloadProductsCsv = () => {
    if (productsList.length === 0) {
      toast.error('No products in the catalog to export.');
      return;
    }

    const headers = [
      'Product ID', 'SKU / Barcode', 'Product Name', 'Category', 'Selling Price (₹)', 
      'GST Rate (%)', 'Current Stock', 'Low Stock Threshold', 'HSN Code', 'Brand', 
      'Unit of Measurement (UOM)', 'Purchase Price (₹)', 'Wholesale Price (₹)', 'MRP (₹)', 
      'Discount %', 'Batch Number', 'Expiry Date', 'Status', 'Barcode Type', 'MOQ', 'Distributor Price (₹)'
    ];

    const rows = productsList.map(p => [
      p.id, p.sku || '', p.name, p.category || 'General', p.price,
      p.gst_rate ?? 18, p.stock ?? 0, p.low_stock_threshold ?? 10, p.hsn_code || '', p.brand || '',
      p.uom || 'PCS', p.purchase_price ?? 0, p.wholesale_price ?? 0, p.mrp ?? 0,
      p.discount_percent ?? 0, p.batch_number || '', p.expiry_date || '', p.status || 'Active', p.barcode_type || 'EAN-13', p.moq ?? 1, p.distributor_price ?? 0
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.map(val => {
      if (typeof val === 'string') {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Product_Database_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('📊 Product database exported as CSV!');
  };

  const downloadCustomersCsv = async () => {
    try {
      const customers = await api.get<any[]>('/customers');
      if (customers.length === 0) {
        toast.error('No customer records to export.');
        return;
      }

      const headers = ['Phone Number', 'Customer Name', 'Loyalty Points', 'Total Spent (₹)', 'Visit Count', 'Last Visit', 'Outstanding Balance (₹)'];
      const rows = customers.map(c => [
        c.phone, c.name || '', c.loyalty_points ?? 0, c.total_spent ?? 0, c.visit_count ?? 0, c.last_visit || 'N/A', c.outstanding_balance ?? 0
      ]);

      const csvContent = [headers.join(','), ...rows.map(e => e.map(val => {
        if (typeof val === 'string') {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(','))].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Customer_Database_Export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('👥 Customer database exported as CSV!');
    } catch (e) {
      console.error('Failed to export customers:', e);
      toast.error('Failed to retrieve customer records for export.');
    }
  };

  const downloadEmployeesCsv = async () => {
    try {
      const users = await api.get<any[]>('/users');
      const employees = users.filter(u => u.role === 'employee');
      if (employees.length === 0) {
        toast.error('No employee records to export.');
        return;
      }

      const headers = ['Employee ID', 'Username', 'Full Name', 'Email Address', 'Phone Number', 'Role', 'Status', 'Permissions', 'Created At'];
      const rows = employees.map(u => [
        u.id, 
        u.username || '', 
        u.name || '', 
        u.email || '', 
        u.phone || '', 
        u.role || 'employee', 
        u.is_active === 1 || u.is_active === true ? 'Active' : 'Inactive', 
        u.permissions ? (typeof u.permissions === 'string' ? JSON.parse(u.permissions).join('; ') : u.permissions.join('; ')) : '',
        u.created_at || ''
      ]);

      const csvContent = [headers.join(','), ...rows.map(e => e.map(val => {
        if (typeof val === 'string') {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(','))].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Employee_Database_Export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('👥 Employee database exported as CSV!');
    } catch (e) {
      console.error('Failed to export employees:', e);
      toast.error('Failed to retrieve employee records for export.');
    }
  };

  const downloadOwnersCsv = async () => {
    try {
      const users = await api.get<any[]>('/users');
      // Export only owners & co-owners, explicitly filter out the developer account (dev_1 / developer)
      const admins = users.filter(u => 
        (u.role === 'owner' || u.role === 'co-owner') && 
        u.username !== 'developer' && 
        u.id !== 'dev_1' && 
        u.email !== 'developer@retailpos.com'
      );

      if (admins.length === 0) {
        toast.error('No administrator records to export.');
        return;
      }

      const headers = ['Admin ID', 'Username', 'Full Name', 'Email Address', 'Phone Number', 'Role', 'Status', 'Created At'];
      const rows = admins.map(u => [
        u.id, 
        u.username || '', 
        u.name || '', 
        u.email || '', 
        u.phone || '', 
        u.role || 'co-owner', 
        u.is_active === 1 || u.is_active === true ? 'Active' : 'Inactive', 
        u.created_at || ''
      ]);

      const csvContent = [headers.join(','), ...rows.map(e => e.map(val => {
        if (typeof val === 'string') {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(','))].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Admin_Database_Export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('👑 Admin database exported as CSV!');
    } catch (e) {
      console.error('Failed to export admins:', e);
      toast.error('Failed to retrieve administrator records for export.');
    }
  };

  const stopSettingsCameraScan = () => {
    if (settingsStreamRef.current) {
      settingsStreamRef.current.getTracks().forEach(track => track.stop());
      settingsStreamRef.current = null;
    }
    if (settingsZxingReaderRef.current) {
      settingsZxingReaderRef.current.reset();
    }
    setShowSettingsCameraScanner(false);
  };

  useEffect(() => {
    if (!showSettingsCameraScanner) return;
    
    let active = true;
    
    const runSettingsZXingScanner = async () => {
      if (!settingsVideoRef.current || !active) return;
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/library');
        if (!settingsZxingReaderRef.current) {
          settingsZxingReaderRef.current = new BrowserMultiFormatReader();
        }
        
        const result = await settingsZxingReaderRef.current.decodeOnceFromVideoElement(settingsVideoRef.current);
        if (result && active) {
          const scanned = result.getText();
          // Beep audio synthesis
          try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.connect(gain);
            gain.connect(context.destination);
            osc.frequency.setValueAtTime(1200, context.currentTime);
            gain.gain.setValueAtTime(0.2, context.currentTime);
            osc.start();
            osc.stop(context.currentTime + 0.1);
          } catch (e) {
            // Ignore Audio
          }
          
          if (isScanToAddMode) {
            const defaultCat = selectableCategories[0] || 'General';
            setProductFormData({
              id: `prod_${Date.now()}`,
              sku: scanned,
              name: '',
              price: '',
              category: defaultCat,
              gstRate: '18',
              stock: '0',
              lowStockThreshold: '10',
              hsnCode: '',
              brand: '',
              uom: 'PCS',
              purchasePrice: '0',
              wholesalePrice: '0',
              mrp: '0',
              discountPercent: '0',
              batchNumber: '',
              expiryDate: '',
              status: 'Active',
              barcodeType: 'EAN-13',
              moq: '1',
              distributorPrice: '0'
            } as any);
            setIsAddingCustomCategory(false);
            setIsAddingCustomUom(false);
            stopSettingsCameraScan();
            setShowAddEditProductModal(true);
            toast.success(`🎉 Code "${scanned}" scanned! Opening Add Product...`);
          } else {
            setProductFormData(prev => ({ ...prev, sku: scanned }));
            toast.success(`🏷️ Barcode Scanned: ${scanned}`);
            stopSettingsCameraScan();
          }
        }
      } catch (err) {
        if (active) {
          setTimeout(runSettingsZXingScanner, 500);
        }
      }
    };
    
    runSettingsZXingScanner();
    
    return () => {
      active = false;
    };
  }, [showSettingsCameraScanner]);

  useEffect(() => {
    return () => {
      if (settingsStreamRef.current) {
        settingsStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Global hardware barcode scanner listener in Settings (always active on web app)
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();
    let timeoutId: any = null;

    const handleGlobalBarcode = (e: KeyboardEvent) => {
      // Ignore modifier keys
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Handle barcode characters (alphanumeric)
      if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key)) {
        if (timeoutId) clearTimeout(timeoutId);
        
        if (buffer.length === 0) {
          // First character
          buffer = e.key;
          timeoutId = setTimeout(() => {
            buffer = '';
          }, 40);
        } else {
          if (timeDiff < 40) {
            // High-speed scan character
            buffer += e.key;
            e.preventDefault();

            // Delete the first character from the active input if it was typed there
            if (buffer.length === 2) {
              const target = e.target as HTMLElement;
              if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                const input = target as HTMLInputElement;
                const value = input.value;
                const selStart = input.selectionStart;
                if (selStart !== null && selStart > 0) {
                  if (value[selStart - 1] === buffer[0]) {
                    input.value = value.slice(0, selStart - 1) + value.slice(selStart);
                    input.setSelectionRange(selStart - 1, selStart - 1);
                    const event = new Event('input', { bubbles: true });
                    const tracker = (input as any)._valueTracker;
                    if (tracker) tracker.setValue(value);
                    input.dispatchEvent(event);
                  }
                }
              }
            }

            timeoutId = setTimeout(() => {
              buffer = '';
            }, 40);
          } else {
            // Reset buffer with the new key as first character
            buffer = e.key;
            timeoutId = setTimeout(() => {
              buffer = '';
            }, 40);
          }
        }
      } else if (e.key === 'Enter') {
        if (buffer.length >= 3 && timeDiff < 40) {
          e.preventDefault();
          e.stopPropagation();
          const scanCode = buffer;
          buffer = '';
          if (timeoutId) clearTimeout(timeoutId);

          // Sound indicator
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.08);
          } catch {
            // Best-effort persistence; not worth interrupting the user.
          }

          if (showAddEditProductModal) {
            setProductFormData(prev => ({ ...prev, sku: scanCode }));
            toast.success(`🏷️ Barcode Scanned: ${scanCode}`);
          } else {
            // Open modal to add product
            setEditingProduct(null);
            const defaultCat = selectableCategories[0] || 'General';
            setProductFormData({
              id: `prod_${Date.now()}`,
              sku: scanCode,
              name: '',
              price: '',
              category: defaultCat,
              gstRate: '18',
              stock: '0',
              lowStockThreshold: '10',
              hsnCode: '',
              brand: '',
              uom: 'PCS',
              purchasePrice: '0',
              wholesalePrice: '0',
              mrp: '0',
              discountPercent: '0',
              batchNumber: '',
              expiryDate: '',
              status: 'Active',
              barcodeType: 'EAN-13',
              moq: '1',
              distributorPrice: '0'
            } as any);
            setIsAddingCustomCategory(false);
            setIsAddingCustomUom(false);
            stopSettingsCameraScan();
            setShowAddEditProductModal(true);
            toast.success(`🎉 Code "${scanCode}" scanned! Opening Add Product...`);
          }
        } else {
          buffer = '';
        }
      }
    };

    window.addEventListener('keydown', handleGlobalBarcode, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalBarcode, true);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [showAddEditProductModal, selectableCategories]);

  const [productFormData, setProductFormData] = useState({
    id: '',
    sku: '',
    name: '',
    price: '',
    category: 'General',
    gstRate: '18',
    stock: '0',
    lowStockThreshold: '10',
    hsnCode: '',
    brand: '',
    uom: 'PCS',
    purchasePrice: '0',
    wholesalePrice: '0',
    mrp: '0',
    discountPercent: '0',
    batchNumber: '',
    expiryDate: '',
    status: 'Active',
    barcodeType: 'EAN-13',
    moq: '1',
    distributorPrice: '0',
    genericName: '',
    manufacturer: '',
    dosageForm: '',
    strength: '',
    supplierDetails: '',
    prescriptionSchedule: 'None'
  });

  const loadProducts = async () => {
    try {
      const prods = await api.get<any[]>('/products');
      setProductsList(prods);
    } catch (e: any) {
      console.error('Failed to load products:', e);
      toast.error(`Couldn't load products: ${e?.message || 'Server unreachable'}`);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const handleSaveProduct = async () => {
    const {
      id,
      sku,
      name,
      price,
      category,
      gstRate,
      stock,
      lowStockThreshold,
      hsnCode,
      brand,
      uom,
      purchasePrice,
      wholesalePrice,
      mrp,
      discountPercent,
      batchNumber,
      expiryDate,
      status,
      barcodeType,
      moq,
      distributorPrice,
      genericName,
      manufacturer,
      dosageForm,
      strength,
      supplierDetails,
      prescriptionSchedule
    } = productFormData;
    
    if (!id.trim()) return toast.error('Product ID is required');
    if (!sku.trim()) return toast.error('SKU / Barcode is required');
    if (!name.trim()) return toast.error('Product Name is required');
    // HSN Code is now optional per user request
    if (!uom.trim()) return toast.error('Unit of Measurement (UOM) is required');
    
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) return toast.error('Valid price is required');
    
    const parsedGstRate = parseFloat(gstRate);
    const parsedStock = parseInt(stock);
    const parsedThreshold = parseInt(lowStockThreshold);

    try {
      const payload = {
        sku,
        name,
        price: parsedPrice,
        category: category || 'General',
        gst_rate: isNaN(parsedGstRate) ? 0 : parsedGstRate,
        stock: isNaN(parsedStock) ? 0 : parsedStock,
        low_stock_threshold: isNaN(parsedThreshold) ? 10 : parsedThreshold,
        hsn_code: hsnCode,
        brand: brand || '',
        uom: uom || 'PCS',
        purchase_price: parseFloat(purchasePrice) || 0,
        wholesale_price: parseFloat(wholesalePrice) || 0,
        mrp: parseFloat(mrp) || 0,
        discount_percent: parseFloat(discountPercent) || 0,
        batch_number: batchNumber || '',
        expiry_date: expiryDate || '',
        status: status || 'Active',
        barcode_type: barcodeType || 'EAN-13',
        moq: parseInt(moq) || 1,
        distributor_price: parseFloat(distributorPrice) || 0,
        generic_name: genericName || '',
        manufacturer: manufacturer || '',
        dosage_form: dosageForm || '',
        strength: strength || '',
        supplier_details: supplierDetails || '',
        prescription_schedule: prescriptionSchedule || 'None'
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        toast.success('Product updated successfully');
      } else {
        await api.post('/products', {
          id,
          ...payload
        });
        toast.success('Product created successfully');
      }
      await loadProducts();
      setShowAddEditProductModal(false);
      setEditingProduct(null);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save product');
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (await confirm({
      title: `Delete ${name}?`,
      description: 'The product is removed from inventory. Past bills that include it are unaffected.',
      confirmLabel: 'Delete product',
      destructive: true,
    })) {
      try {
        await api.delete(`/products/${id}`);
        toast.success('Product deleted successfully');
        await loadProducts();
      } catch (e: any) {
        toast.error(e.message || 'Failed to delete product');
      }
    }
  };

  const loadSettingsAndOwners = async () => {
    try {
      const settings = await api.get<any>('/settings');
      if (settings) {
        setShopDetails({
          name: settings.shopName || 'RETAIL SUPERMARKET',
          address: settings.shopAddress || '123 Main Street, City, State 12345',
          phone: settings.shopPhone || '(555) 123-4567',
          email: settings.shopEmail || 'info@retailstore.com',
        });
        if (settings.gstEnabled !== undefined) setGstEnabled(settings.gstEnabled === 'true');
        if (settings.gstRate !== undefined) setGstRate(parseFloat(settings.gstRate));
        if (settings.gstNumber !== undefined) setGstNumber(settings.gstNumber);
        if (settings.drugLicense20 !== undefined) setDrugLicense20(settings.drugLicense20);
        if (settings.drugLicense21 !== undefined) setDrugLicense21(settings.drugLicense21);
        if (settings.roundingEnabled !== undefined) setRoundingEnabled(settings.roundingEnabled === 'true');
        if (settings.loyaltyEnabled !== undefined) setLoyaltyEnabled(settings.loyaltyEnabled === 'true');
        if (settings.chatEnabled !== undefined) {
          setChatEnabled(settings.chatEnabled === 'true');
          try {
            localStorage.setItem('nexusflowChatEnabled', settings.chatEnabled);
          } catch {
            // Best-effort mirror of a server setting; storage may be full.
          }
        }
        if (settings.pointsPerHundred !== undefined) setPointsPerHundred(parseInt(settings.pointsPerHundred));
        if (settings.pointValue !== undefined) setPointValue(parseFloat(settings.pointValue));
        if (settings.receiptPrinterName !== undefined) setReceiptPrinterName(settings.receiptPrinterName);
        if (settings.autoOpenDrawer !== undefined) setAutoOpenDrawer(settings.autoOpenDrawer === 'true');
        if (settings.soundEnabled !== undefined) setSoundEnabled(settings.soundEnabled === 'true');
        if (settings.soundVolume !== undefined) setSoundVolume(parseInt(settings.soundVolume));
        if (settings.soundProfile !== undefined) setSoundProfile(settings.soundProfile as any);
        if (settings.successBeepEnabled !== undefined) setSuccessBeepEnabled(settings.successBeepEnabled === 'true');
        if (settings.errorBuzzEnabled !== undefined) setErrorBuzzEnabled(settings.errorBuzzEnabled === 'true');
        if (settings.chimeEnabled !== undefined) setChimeEnabled(settings.chimeEnabled === 'true');
      }

      const users = await api.get<any[]>('/users');
      setOwners(users.filter(u => u.role === 'owner' || u.role === 'co-owner').map(u => ({
        id: u.id,
        username: u.username,
        email: u.email || '',
        name: u.name,
        role: u.role,
        permissions: u.permissions || [],
        phone: u.phone || '',
        createdAt: u.created_at || '',
        isActive: u.is_active
      })));

      const shifts = await api.get<any[]>('/shifts');
      setShiftsHistory(shifts);
      await loadProducts();
      await loadInventoryAndBatches();
    } catch (e: any) {
      console.error('Failed to load settings or owners:', e);
      toast.error(`Couldn't load settings: ${e?.message || 'Server unreachable'}`, {
        description: 'Some panels may show stale or empty values.',
      });
    }
  };

  /**
   * Refreshes just the shift/attendance history — the only thing a break,
   * shift, or session event can change on this screen.
   */
  const loadShiftActivity = async () => {
    try {
      setShiftsHistory(await api.get<any[]>('/shifts'));
    } catch (e) {
      // The panel keeps showing the last good data.
      console.error('Failed to refresh shift activity:', e);
    }
  };

  useEffect(() => {
    if (isOwner()) {
      loadSettingsAndOwners();
    }
  }, [isOwner]);

  // Dynamic host LAN IP discovery and latency diagnostics pinger
  useEffect(() => {
    if (!isOwner()) return;
    
    // 1. Fetch Dynamic Host Network IP Address
    api.get<{ ip: string }>('/settings/network-ip')
      .then(res => {
        if (res && res.ip) setHostIpAddress(res.ip);
      })
      .catch(err => console.warn('Failed to discover server network IP:', err));

    // 2. Measure Host Ping Latency Periodically (Every 10s)
    const measureLatency = async () => {
      const start = Date.now();
      try {
        await api.get('/auth/heartbeat');
        setNetworkPingLatency(Date.now() - start);
        setWsConnectionStatus('Connected');
      } catch (err) {
        console.error('Diagnostics ping failure:', err);
        setWsConnectionStatus('Offline');
        setNetworkPingLatency(null);
      }
    };

    measureLatency();
    const interval = setInterval(measureLatency, 10000);
    return () => clearInterval(interval);
  }, [isOwner]);

  // Real-time WebSocket updates.
  //
  // These four events used to call loadSettingsAndOwners(), which re-fetches
  // settings, users, sessions, shifts, products, inventory and batches — six-plus
  // requests. A sale rung up at another till was reloading this screen's owner
  // list. Each event now refreshes only what it can actually change; BILL_CREATED
  // is gone entirely because no panel here derives from an individual bill.
  useWebSocket({
    BREAK_CHANGED: () => {
      loadShiftActivity();
    },
    SHIFT_CHANGED: () => {
      loadShiftActivity();
    },
    SESSION_CHANGED: () => {
      loadShiftActivity();
    },
    STOCK_UPDATED: () => {
      loadProducts();
    }
  });

  const handleSaveShopDetails = async () => {
    try {
      await api.put('/settings', {
        shopName: shopDetails.name,
        shopAddress: shopDetails.address,
        shopPhone: shopDetails.phone,
        shopEmail: shopDetails.email,
        drugLicense20,
        drugLicense21
      });
      toast.success('Shop details saved successfully');
    } catch {
      toast.error('Failed to save shop details');
    }
  };

  const handleSaveGSTSettings = async () => {
    try {
      await api.put('/settings', {
        gstEnabled: gstEnabled ? 'true' : 'false',
        gstRate: gstRate.toString(),
        gstNumber: gstNumber
      });
      toast.success('GST settings saved');
    } catch {
      toast.error('Failed to save GST settings');
    }
  };

  const handleSaveLoyaltySettings = async () => {
    try {
      await api.put('/settings', {
        loyaltyEnabled: loyaltyEnabled ? 'true' : 'false',
        pointsPerHundred: pointsPerHundred.toString(),
        pointValue: pointValue.toString()
      });
      toast.success('Loyalty settings saved');
    } catch {
      toast.error('Failed to save loyalty settings');
    }
  };

  const handleSavePrinterSettings = async () => {
    try {
      await api.put('/settings', {
        receiptPrinterName,
        autoOpenDrawer: autoOpenDrawer ? 'true' : 'false',
      });
      toast.success('Printer and Cash Drawer settings saved successfully');
    } catch {
      toast.error('Failed to save printer and cash drawer settings');
    }
  };

  const handleSaveSoundSettings = async () => {
    try {
      await api.put('/settings', {
        soundEnabled: soundEnabled ? 'true' : 'false',
        soundVolume: soundVolume.toString(),
        soundProfile,
        successBeepEnabled: successBeepEnabled ? 'true' : 'false',
        errorBuzzEnabled: errorBuzzEnabled ? 'true' : 'false',
        chimeEnabled: chimeEnabled ? 'true' : 'false'
      });
      toast.success('🔊 Audio and alert settings saved successfully');
    } catch {
      toast.error('❌ Failed to save audio settings');
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      const verifyRes = await api.post<any>('/auth/login', { username: user.username, password: currentPassword });
      if (!verifyRes || !verifyRes.token) {
        toast.error('Current password is incorrect');
        return;
      }

      await api.put(`/users/${user.id}/password`, {
        password: newPassword
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully');
    } catch (err) {
      toast.error('Current password is incorrect or password change failed');
    }
  };

  const handleAddCoOwner = async () => {
    if (!newOwnerName || !newOwnerUsername || !newOwnerPassword) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const newId = `co_${Date.now()}`;
      await api.post('/users', {
        id: newId,
        username: newOwnerUsername,
        email: newOwnerEmail,
        name: newOwnerName,
        role: 'co-owner',
        permissions: [],
        phone: newOwnerPhone,
        password: newOwnerPassword
      });

      await loadSettingsAndOwners();

      setShowAddOwnerModal(false);
      setNewOwnerName('');
      setNewOwnerUsername('');
      setNewOwnerEmail('');
      setNewOwnerPassword('');
      setNewOwnerPhone('');
      toast.success('Co-Owner added successfully');
    } catch (e: any) {
      toast.error(e.message || 'Failed to add co-owner');
    }
  };

  const handleRemoveOwner = async (ownerId: string) => {
    const remainingOwners = owners.filter(o => o.id !== ownerId && o.role === 'owner');
    if (remainingOwners.length === 0 && owners.find(o => o.id === ownerId)?.role === 'owner') {
      toast.error('Cannot remove the last owner');
      return;
    }

    if (!await confirm({
      title: 'Remove this owner?',
      description: 'They immediately lose owner access to settings, staff, and reports.',
      confirmLabel: 'Remove owner',
      destructive: true,
    })) {
      return;
    }

    try {
      await api.delete(`/users/${ownerId}`);
      await loadSettingsAndOwners();
      toast.success('Owner removed successfully');
    } catch {
      toast.error('Failed to remove owner');
    }
  };

  const handleClearData = (dataType: string) => {
    toast.error('Direct table deletion is disabled in LAN mode. Please use Backup / Restore functions.');
  };

  // Database Backup Function (GET /api/settings/backup)
  const handleBackupDatabase = async () => {
    try {
      const response = await api.get<any>('/settings/backup');
      
      const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `nexusflow_db_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('💾 Full database backup exported successfully!');
    } catch (e: any) {
      console.error('Database backup failed:', e);
      toast.error('❌ Failed to export database backup');
    }
  };

  // Database Restore Function (POST /api/settings/restore)
  const handleRestoreDatabase = async (file: File) => {
    if (!file) return;
    
    // File validation
    if (!file.name.endsWith('.json')) {
      toast.error('❌ Please upload a valid JSON backup file');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const jsonText = e.target?.result as string;
        const backupData = JSON.parse(jsonText);
        
        // Basic sanity validation
        if (!backupData.version || !backupData.data || typeof backupData.data !== 'object') {
          toast.error('❌ Invalid backup file structure');
          return;
        }

        if (await confirm({
      title: 'Overwrite the entire database?',
      description: 'Every product, bill, customer, and staff record in the current database is replaced by the backup file. This cannot be undone.',
      confirmLabel: 'Overwrite everything',
      destructive: true,
    })) {
          await api.post('/settings/restore', backupData);
          toast.success('✨ Full database successfully restored!');
          
          // Hydrate local UI lists
          await loadSettingsAndOwners();
        }
      } catch (err: any) {
        console.error('Restore database parsing failed:', err);
        toast.error('❌ Parsing failed: Backup file is corrupted or invalid');
      }
    };
    reader.readAsText(file);
  };

  if (!isOwner()) {
    return (
      <div className="p-8 bg-[var(--bg-glass)] text-[var(--text-primary)] min-h-screen flex items-center justify-center">
        <div className="text-center text-[var(--text-primary)]">
          <Shield size={64} className="mx-auto mb-4 text-rose-500" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            Only owners and co-owners can access settings.
          </p>
        </div>
      </div>
    );
  }

  // Pre-compiled forms designed to fit exactly on the screen without scrolling
  const shopDetailsPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-1.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
          <Store size={20} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          Shop Details
        </h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Shop Name
            </label>
            <input
              type="text"
              value={shopDetails.name}
              onChange={(e) => setShopDetails({ ...shopDetails, name: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Phone
            </label>
            <input
              type="tel"
              value={shopDetails.phone}
              onChange={(e) => setShopDetails({ ...shopDetails, phone: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Address
            </label>
            <textarea
              value={shopDetails.address}
              onChange={(e) => setShopDetails({ ...shopDetails, address: e.target.value })}
              rows={2}
              className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={shopDetails.email}
              onChange={(e) => setShopDetails({ ...shopDetails, email: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Drug License (Form 20 - General)
            </label>
            <input
              type="text"
              value={drugLicense20}
              onChange={(e) => setDrugLicense20(e.target.value.toUpperCase())}
              placeholder="e.g. DL-20B-12345"
              className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Drug License (Form 21 - Scheduled)
            </label>
            <input
              type="text"
              value={drugLicense21}
              onChange={(e) => setDrugLicense21(e.target.value.toUpperCase())}
              placeholder="e.g. DL-21B-12345"
              className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          onClick={handleSaveShopDetails}
          className="w-full px-4 py-2 glass-btn glass-btn-accent text-sm font-semibold rounded-lg transition-colors"
        >
          Save Shop Details
        </button>
      </div>
    </div>
  );

  const handleSaveWorkspaceProfile = (chosenSector: any, multiEnabled: boolean) => {
    try {
      localStorage.setItem('nexusflowSector', chosenSector);
      localStorage.setItem('nexusflowMultiSectorEnabled', multiEnabled ? 'true' : 'false');
      // If we are locking to a single sector, set Onboarded to true just in case
      localStorage.setItem('nexusflowOnboarded', 'true');
      
      setActiveSector(chosenSector);
      setMultiSectorEnabled(multiEnabled);
      
      // Notify parent layout shell and children billing terminals
      window.dispatchEvent(new CustomEvent('nexusflow-profile-updated'));
      window.dispatchEvent(new CustomEvent('sector-changed', { detail: { sector: chosenSector } }));
      
      toast.success('🎉 Workspace configuration updated successfully!', {
        description: `Bespoke layout adjusted to ${chosenSector.toUpperCase()} Mode.`
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to save workspace settings.');
    }
  };

  const workspaceProfilePanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border flex flex-col h-[56vh]">
      <div className="flex-shrink-0 flex items-center gap-3 mb-4 border-b border-[var(--border-glass)] pb-3">
        <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg text-white">
          <Store size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            Workspace Profile & Industry Mode
          </h2>
          <p className="text-[10px] text-[var(--text-muted)]">Configure your LAN operating system layout</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pr-1">
        <div className="p-4 rounded-xl border bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)] space-y-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-[var(--text-muted)]">
              Business Industry Profile
            </label>
            <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-purple-500/30 bg-purple-500/5">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg text-white text-base flex-shrink-0">
                💊
              </div>
              <div>
                <p className="font-extrabold text-sm text-purple-400">Pharmacy Medicine</p>
                <p className="text-[10px] mt-0.5 text-[var(--text-muted)]">Batch tracking, expiry management, Rx locks &amp; GST billing</p>
              </div>
              <span className="ml-auto text-[9px] px-2 py-0.5 rounded font-black tracking-wider uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20">Active</span>
            </div>
          </div>
        </div>

        {/* ── LAN Chat Toggle ──────────────────────────────────────────── */}
        <div className="p-4 rounded-xl border bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-[var(--text-primary)]">
                🔒 Secure LAN Chat
              </p>
              <p className="text-xs mt-0.5 text-[var(--text-muted)]">
                Enable encrypted real-time chat between connected terminals
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={chatEnabled}
                onChange={async (e) => {
                  const newVal = e.target.checked;
                  setChatEnabled(newVal);
                  try {
                    await api.put('/settings', { chatEnabled: newVal ? 'true' : 'false' });
                    localStorage.setItem('nexusflowChatEnabled', newVal ? 'true' : 'false');
                    window.dispatchEvent(new CustomEvent('nexusflow-profile-updated'));
                    toast.success(newVal ? '💬 LAN Chat enabled' : '🔇 LAN Chat disabled');
                  } catch { toast.error('Failed to update chat setting'); }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[var(--switch-background)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border-glass)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary-accent)]"></div>
            </label>
          </div>
          {!chatEnabled && (
            <p className="text-[10px] mt-2 px-2 py-1 rounded-lg bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20">
              ⚠️ Chat is disabled — the sidebar chat link and E2EE chatbox drawer will be hidden for all terminals.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const gstSettingsPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-1.5 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg">
          <Database size={20} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          GST & Tax Settings
        </h2>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-[var(--input-bg)] rounded-lg border border-[var(--border-glass)] text-[var(--text-primary)]">
          <div>
            <p className="font-semibold text-sm text-[var(--text-primary)]">
              Enable GST
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Apply GST calculations to checkout bills
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={gstEnabled}
              onChange={(e) => setGstEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[var(--switch-background)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border-glass)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary-accent)]"></div>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              GST Rate (%)
            </label>
            <input
              type="number"
              value={gstRate}
              onChange={(e) => setGstRate(parseFloat(e.target.value) || 0)}
              step="0.01"
              className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              GST Number (GSTIN)
            </label>
            <input
              type="text"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
              placeholder="e.g., 27AABCU9603R1ZM"
              maxLength={15}
              className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          onClick={handleSaveGSTSettings}
          className="w-full px-4 py-2 glass-btn glass-btn-accent text-sm font-semibold rounded-lg transition-colors"
        >
          Save GST Settings
        </button>
      </div>
    </div>
  );

  const loyaltySettingsPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-1.5 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg">
          <Crown size={20} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          Customer Loyalty Program
        </h2>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-[var(--input-bg)] rounded-lg border border-[var(--border-glass)] text-[var(--text-primary)]">
          <div>
            <p className="font-semibold text-sm text-[var(--text-primary)]">
              Enable Loyalty Program
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Reward customers with points
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={loyaltyEnabled}
              onChange={(e) => setLoyaltyEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[var(--switch-background)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border-glass)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Points Per ₹100 Spent
            </label>
            <input
              type="number"
              value={pointsPerHundred}
              onChange={(e) => setPointsPerHundred(parseInt(e.target.value) || 1)}
              min="1"
              className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Point Value (₹)
            </label>
            <input
              type="number"
              value={pointValue}
              onChange={(e) => setPointValue(parseFloat(e.target.value) || 1)}
              step="0.1"
              min="0.1"
              className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-3 bg-[var(--input-bg)] rounded-lg border border-[var(--border-glass)] text-[var(--text-primary)]">
          <p className="text-xs text-[var(--text-secondary)]">
            <strong>Example:</strong> Spent ₹500 → Earns {pointsPerHundred * 5} points → Redeem ₹{(pointsPerHundred * 5 * pointValue).toFixed(2)} discount.
          </p>
        </div>

        <button
          onClick={handleSaveLoyaltySettings}
          className="w-full px-4 py-2 glass-btn glass-btn-accent text-sm font-semibold rounded-lg transition-colors"
        >
          Save Loyalty Settings
        </button>
      </div>
    </div>
  );

  const changePasswordPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-1.5 bg-gradient-to-br from-green-500 to-green-600 rounded-lg">
          <Lock size={20} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          Change Password
        </h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
            Current Password
          </label>
          <div className="relative">
            <input
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-1.5 text-sm pr-10 border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--text-muted)]"
            >
              {showCurrentPassword ? (
                <EyeOff size={18} />
              ) : (
                <Eye size={18} />
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-sm pr-10 border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--text-muted)]"
              >
                {showNewPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-sm pr-10 border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--text-muted)]"
              >
                {showConfirmPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleChangePassword}
          className="w-full px-4 py-2 glass-btn glass-btn-accent text-sm font-semibold rounded-lg transition-colors"
        >
          Change Password
        </button>
      </div>
    </div>
  );

  const printerSettingsPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-1.5 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-lg">
          <Printer size={20} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          Printer & Drawer Settings
        </h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
            Receipt Printer Name
          </label>
          <input
            type="text"
            value={receiptPrinterName}
            onChange={(e) => setReceiptPrinterName(e.target.value)}
            placeholder="e.g. Epson_TM_T88V, Thermal_Printer, or empty for mock"
            className="w-full px-3 py-1.5 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Name of the local thermal printer configured on this server (for <code>lp -d</code>).
          </p>
        </div>

        <div className="flex items-center justify-between p-3 bg-[var(--input-bg)] rounded-lg border border-[var(--border-glass)] text-[var(--text-primary)]">
          <div>
            <p className="font-semibold text-sm text-[var(--text-primary)]">
              Auto-Open Cash Drawer
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Pop cash drawer on Cash transactions
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoOpenDrawer}
              onChange={(e) => setAutoOpenDrawer(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[var(--switch-background)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border-glass)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        <button
          onClick={handleSavePrinterSettings}
          className="w-full px-4 py-2 glass-btn glass-btn-accent text-sm font-semibold rounded-lg transition-colors mt-2"
        >
          Save Printer Settings
        </button>
      </div>
    </div>
  );

  const ownerManagementPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border flex flex-col h-[48vh]">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg">
            <UsersIcon size={20} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            Owner Management
          </h2>
        </div>
        <button
          onClick={() => setShowAddOwnerModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 glass-btn glass-btn-accent text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Co-Owner
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {owners.map((owner) => (
          <div
            key={owner.id}
            className="flex items-center justify-between p-3.5 bg-[var(--input-bg)] rounded-lg border border-[var(--border-glass)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-2 ${owner.role === 'owner' ? 'bg-gradient-to-br from-yellow-500 to-orange-500' : 'bg-gradient-to-br from-indigo-500 to-purple-500'} rounded-lg flex-shrink-0`}>
                <Crown size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[var(--text-primary)] truncate">
                  {owner.name}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  @{owner.username} • {owner.email || 'No email'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                owner.role === 'owner'
                  ? 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30'
                  : 'bg-[var(--secondary)] text-[var(--secondary-foreground)] border-[var(--border-glass)]'
              }`}>
                {owner.role === 'owner' ? 'Owner' : 'Co-Owner'}
              </span>
              {owner.role === 'co-owner' && (
                <button
                  onClick={() => handleRemoveOwner(owner.id)}
                  className="p-1.5 rounded-lg transition-colors hover:bg-red-50 text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const dataManagementPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-1.5 bg-gradient-to-br from-red-500 to-red-600 rounded-lg">
          <Database size={20} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          Data Management
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3.5 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              Bill History
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Clear all saved transaction bills
            </p>
          </div>
          <button
            onClick={() => handleClearData('bills')}
            className="w-full px-3 py-1.5 text-xs glass-btn glass-btn-danger font-semibold rounded-lg transition-colors"
          >
            Clear Bills
          </button>
        </div>

        <div className="p-3.5 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              Product Catalog
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Reset back to default catalog
            </p>
          </div>
          <button
            onClick={() => handleClearData('products')}
            className="w-full px-3 py-1.5 text-xs glass-btn glass-btn-danger font-semibold rounded-lg transition-colors"
          >
            Reset Products
          </button>
        </div>

        <div className="p-3.5 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              Session Data
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Clear login audits and breaks
            </p>
          </div>
          <button
            onClick={() => handleClearData('sessions')}
            className="w-full px-3 py-1.5 text-xs glass-btn glass-btn-danger font-semibold rounded-lg transition-colors"
          >
            Clear Sessions
          </button>
        </div>

        <div className="p-3.5 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              Customer DB
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Reset accounts and trust loyalty
            </p>
          </div>
          <button
            onClick={() => handleClearData('customers')}
            className="w-full px-3 py-1.5 text-xs glass-btn glass-btn-danger font-semibold rounded-lg transition-colors"
          >
            Clear Customers
          </button>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--border-glass)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          onClick={downloadProductsCsv}
          className="glass-btn px-4 py-2.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-2"
          style={{ '--glass-btn-fill': 'rgba(59, 130, 246, 0.14)', '--glass-btn-fill-hover': 'rgba(59, 130, 246, 0.24)', '--glass-btn-edge': 'rgba(59, 130, 246, 0.45)', '--glass-btn-edge-hover': 'rgba(59, 130, 246, 0.65)', '--glass-btn-ink': 'rgb(59, 130, 246)' } as React.CSSProperties}
        >
          <FileSpreadsheet size={16} /> Download Product DB (CSV)
        </button>
        <button
          onClick={downloadCustomersCsv}
          className="glass-btn px-4 py-2.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-2"
          style={{ '--glass-btn-fill': 'rgba(168, 85, 247, 0.14)', '--glass-btn-fill-hover': 'rgba(168, 85, 247, 0.24)', '--glass-btn-edge': 'rgba(168, 85, 247, 0.45)', '--glass-btn-edge-hover': 'rgba(168, 85, 247, 0.65)', '--glass-btn-ink': 'rgb(168, 85, 247)' } as React.CSSProperties}
        >
          <FileSpreadsheet size={16} /> Download Customer DB (CSV)
        </button>
        <button
          onClick={downloadEmployeesCsv}
          className="glass-btn px-4 py-2.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-2"
          style={{ '--glass-btn-fill': 'rgba(16, 185, 129, 0.14)', '--glass-btn-fill-hover': 'rgba(16, 185, 129, 0.24)', '--glass-btn-edge': 'rgba(16, 185, 129, 0.45)', '--glass-btn-edge-hover': 'rgba(16, 185, 129, 0.65)', '--glass-btn-ink': 'rgb(16, 185, 129)' } as React.CSSProperties}
        >
          <FileSpreadsheet size={16} /> Download Employee DB (CSV)
        </button>
        <button
          onClick={downloadOwnersCsv}
          className="glass-btn px-4 py-2.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-2"
          style={{ '--glass-btn-fill': 'rgba(245, 158, 11, 0.14)', '--glass-btn-fill-hover': 'rgba(245, 158, 11, 0.24)', '--glass-btn-edge': 'rgba(245, 158, 11, 0.45)', '--glass-btn-edge-hover': 'rgba(245, 158, 11, 0.65)', '--glass-btn-ink': 'rgb(245, 158, 11)' } as React.CSSProperties}
        >
          <FileSpreadsheet size={16} /> Download Admin DB (CSV)
        </button>
      </div>
    </div>
  );

  const testSoundChime = (type: 'success' | 'warning' | 'chime') => {
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
      console.warn('Test Audio synthesis failed:', e);
    }
  };

  const getLatencyLabel = () => {
    if (networkPingLatency === null) {
      return { text: 'Disconnected / Offline', color: 'text-[var(--danger)]' };
    }
    if (networkPingLatency < 20) {
      return { text: `${networkPingLatency}ms (Excellent - High Speed LAN)`, color: 'text-[var(--success)]' };
    }
    if (networkPingLatency < 80) {
      return { text: `${networkPingLatency}ms (Good - Standard LAN Sync)`, color: 'text-[var(--primary-accent)]' };
    }
    return { text: `${networkPingLatency}ms (Slow Subnet - Check Router Wifi)`, color: 'text-[var(--warning)]' };
  };

  const latencyInfo = getLatencyLabel();

  const soundDiagnosticsPanel = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* COLUMN 1: Web Audio Synth Preferences */}
      <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border flex flex-col justify-between h-[48vh] overflow-y-auto">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
              <Printer size={20} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              Audio Synthesis Controls
            </h2>
          </div>

          <div className="space-y-4">
            {/* Enable/Disable Audio */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold block">Audio Feedback Engine</span>
                <span className="text-[10px] text-[var(--text-muted)]">Toggle scan confirmation chimes and alerts</span>
              </div>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
            </div>

            {/* Volume Control Preset Buttons */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-[var(--text-muted)]">Scanner Chime Volume</label>
                <span className="text-xs font-mono font-bold text-emerald-400">{soundVolume}%</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[25, 50, 75, 100].map((vol) => (
                  <button
                    key={vol}
                    type="button"
                    disabled={!soundEnabled}
                    onClick={() => setSoundVolume(vol)}
                    className={`py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      soundVolume === vol 
                        ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400' 
                        : 'bg-[var(--input-bg)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                    } ${!soundEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {vol}%
                  </button>
                ))}
              </div>
            </div>

            {/* Sound Profile Select */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
                Scan Pitch Sound Profile
              </label>
              <select
                value={soundProfile}
                disabled={!soundEnabled}
                onChange={(e) => setSoundProfile(e.target.value as any)}
                className={`w-full px-3 py-2 border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] ${!soundEnabled && 'opacity-50 cursor-not-allowed'}`}
              >
                <option value="classic">Classic Sine Chirp (1.2 kHz)</option>
                <option value="crisp">Crisp Triangle Chime (1.8 kHz)</option>
                <option value="cozy">Cozy Warm Tone (880 Hz)</option>
                <option value="retro">Retro Square Beep (650 Hz)</option>
              </select>
            </div>

            {/* Individual Chime Toggles */}
            <div className="space-y-3 pt-3 border-t border-dashed border-[var(--border-glass)]">
              <label className="flex items-center justify-between text-xs font-semibold select-none cursor-pointer">
                <span>Scan success chime</span>
                <input
                  type="checkbox"
                  checked={successBeepEnabled}
                  disabled={!soundEnabled}
                  onChange={(e) => setSuccessBeepEnabled(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between text-xs font-semibold select-none cursor-pointer">
                <span>Out of stock / warning buzzer</span>
                <input
                  type="checkbox"
                  checked={errorBuzzEnabled}
                  disabled={!soundEnabled}
                  onChange={(e) => setErrorBuzzEnabled(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between text-xs font-semibold select-none cursor-pointer">
                <span>Successful bill checkout chime</span>
                <input
                  type="checkbox"
                  checked={chimeEnabled}
                  disabled={!soundEnabled}
                  onChange={(e) => setChimeEnabled(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            {/* Audio Synthesis Live Testers */}
            <div className="pt-4">
              <label className="text-[10px] font-black uppercase opacity-65 tracking-wider block mb-2">Live Sensory Testers</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => testSoundChime('success')}
                  className="py-2 rounded-xl border text-xs font-bold transition-all hover:scale-105 active:scale-[0.97] cursor-pointer bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] shadow-sm"
                >
                  🔊 Test Success
                </button>
                <button
                  type="button"
                  onClick={() => testSoundChime('warning')}
                  className="py-2 rounded-xl border text-xs font-bold transition-all hover:scale-105 active:scale-[0.97] cursor-pointer bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] shadow-sm"
                >
                  ⚠️ Test Warning
                </button>
                <button
                  type="button"
                  onClick={() => testSoundChime('chime')}
                  className="py-2 rounded-xl border text-xs font-bold transition-all hover:scale-105 active:scale-[0.97] cursor-pointer bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] shadow-sm"
                >
                  🛎️ Test Chime
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-5 border-t border-[var(--border-glass)] mt-4 flex justify-end flex-shrink-0">
          <button
            onClick={handleSaveSoundSettings}
            className="px-5 py-2 rounded-xl text-xs font-bold transition-all glass-btn glass-btn-accent shadow-blue-500/10 cursor-pointer transform active:scale-[0.97]"
          >
            Save Sound Settings
          </button>
        </div>
      </div>

      {/* COLUMN 2: LAN Host Diagnostics HUD */}
      <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border flex flex-col justify-between h-[48vh] overflow-y-auto">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
              <Shield size={20} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              LAN Diagnostics HUD
            </h2>
          </div>

          <div className="space-y-4">
            {/* Host Network Address Card */}
            <div className="p-4 border rounded-xl flex flex-col gap-1.5 bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)]">
              <span className="text-[10px] font-black uppercase opacity-65 tracking-wider">Host Server Local LAN Link</span>
              <code className="text-sm font-black text-[var(--primary-accent)] select-all leading-normal break-all">
                http://{hostIpAddress}:3000
              </code>
              <p className="text-[9px] leading-relaxed mt-1 text-[var(--text-muted)]">
                💡 Type this link into any secondary device (mobile, iPad, co-owner laptop) connected to the same local outlet router to start billing instantly—with <strong>zero installation required</strong>!
              </p>
            </div>

            {/* Connection Status & Latency logs */}
            <div className="grid grid-cols-2 gap-3.5 pt-2">
              <div className="p-3 border rounded-xl flex flex-col gap-0.5 bg-[var(--bg-glass)] border-[var(--border-glass)] shadow-sm">
                <span className="text-[9px] font-black uppercase opacity-55 tracking-wider">Socket Status</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      wsConnectionStatus === 'Connected' ? 'bg-emerald-400' : 'bg-yellow-400'
                    }`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      wsConnectionStatus === 'Connected' ? 'bg-emerald-500' : 'bg-yellow-500'
                    }`} />
                  </span>
                  <span className="text-xs font-extrabold uppercase tracking-wide">{wsConnectionStatus}</span>
                </div>
              </div>

              <div className="p-3 border rounded-xl flex flex-col gap-0.5 bg-[var(--bg-glass)] border-[var(--border-glass)] shadow-sm">
                <span className="text-[9px] font-black uppercase opacity-55 tracking-wider">Host Ping Latency</span>
                <span className={`text-xs font-extrabold mt-1 truncate ${latencyInfo.color}`}>{latencyInfo.text}</span>
              </div>
            </div>

            {/* Connected Registers terminal */}
            <div className="pt-2">
              <span className="text-[10px] font-black uppercase opacity-65 tracking-wider block mb-2">Connected LAN Registers</span>
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto no-scrollbar">
                {owners.length === 0 ? (
                  <p className="text-[10px] opacity-55 text-center py-4">Scanning local network registers...</p>
                ) : (
                  owners.map((owner) => (
                    <div
                      key={owner.id}
                      className="flex items-center justify-between p-2.5 border rounded-lg text-xs bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${owner.isActive ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--text-muted)]'}`}></div>
                        <span className="font-bold">{owner.name}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                          owner.role === 'owner' 
                            ? 'bg-[var(--secondary)] text-[var(--secondary-foreground)]' 
                            : 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                        }`}>
                          {owner.role}
                        </span>
                      </div>
                      <span className="font-mono text-[9px] opacity-65">{owner.createdAt ? new Date(owner.createdAt).toLocaleDateString('en-IN') : 'Active'}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Diagnostic Status Badge */}
        <div className={`pt-4 border-t border-[var(--border-glass)] mt-4 text-[9px] font-bold uppercase tracking-widest text-center ${
          wsConnectionStatus === 'Connected' ? 'text-emerald-500' : 'text-red-500'
        }`}>
          • Offline LAN Service Healthy • Local Subnet Sync On
        </div>
      </div>
    </div>
  );

  const shiftRecordsPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border flex flex-col h-[48vh]">
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
          <Clock size={20} className="text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            Shifts & Z-Reports Audit
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Audit registers, expected cash, and count discrepancies at shift close.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto border border-[var(--border-glass)] rounded-lg">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--input-bg)] text-[var(--text-primary)] border-b border-[var(--border-glass)] text-[10px] font-bold uppercase tracking-wider">
              <th className="py-2.5 px-3">Cashier</th>
              <th className="py-2.5 px-3">Shift Period</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Opening Float</th>
              <th className="py-2.5 px-3 text-right">Expected Cash</th>
              <th className="py-2.5 px-3 text-right">Reconciled Cash</th>
              <th className="py-2.5 px-3 text-right">Difference</th>
              <th className="py-2.5 px-3 text-right">UPI / Card</th>
              <th className="py-2.5 px-3 pl-4">Audit Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-glass)] text-[var(--text-primary)] text-xs">
            {shiftsHistory.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center opacity-60">
                  No shifts or Z-Reports recorded in the database yet.
                </td>
              </tr>
            ) : (
              shiftsHistory.map((shift) => {
                const isClosed = shift.status === 'closed';
                const expectedCashTotal = shift.initial_cash + (shift.system_cash || 0);
                const actualCashTotal = shift.actual_cash !== null && shift.actual_cash !== undefined ? shift.actual_cash : expectedCashTotal;
                const diff = isClosed ? (shift.discrepancy_cash || 0) : 0;
                
                return (
                  <tr key={shift.id} className="hover:bg-[var(--surface-hover)] transition-all">
                    <td className="py-2.5 px-3 font-semibold">
                      {shift.user_name}
                      <span className="block text-[9px] text-[var(--text-muted)] font-normal mt-0.5">
                        ID: {shift.id.replace('shift_', '')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[10px]">
                      <div>
                        <span className="font-bold text-emerald-500 mr-1">Start:</span>
                        {new Date(shift.start_time).toLocaleString()}
                      </div>
                      {shift.end_time && (
                        <div className="mt-0.5">
                          <span className="font-bold text-rose-500 mr-1">End:</span>
                          {new Date(shift.end_time).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                        isClosed
                          ? 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border-glass)]'
                          : shift.on_break
                            ? 'bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/30 animate-pulse'
                            : 'bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/30'
                      }`}>
                        {isClosed ? 'Closed' : shift.on_break ? 'On Break' : 'Active'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">
                      ₹{Number(shift.initial_cash).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium opacity-85">
                      ₹{Number(expectedCashTotal).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      {isClosed ? `₹${Number(actualCashTotal).toFixed(2)}` : '—'}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-bold`}>
                      {isClosed ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          diff === 0
                            ? 'text-emerald-500 bg-emerald-500/10'
                            : diff > 0
                              ? 'text-teal-500 bg-teal-500/10'
                              : 'text-rose-500 bg-rose-500/10'
                        }`}>
                          {diff === 0 ? 'Match' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[10px]">
                      {isClosed ? (
                        <div className="space-y-0.5">
                          <div>
                            <span className="opacity-60">UPI:</span>{' '}
                            <span className="font-bold">₹{Number(shift.actual_upi).toFixed(0)}</span>
                          </div>
                          <div>
                            <span className="opacity-60">Card:</span>{' '}
                            <span className="font-bold">₹{Number(shift.actual_card).toFixed(0)}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 pl-4 text-[10px] max-w-[150px] truncate" title={shift.notes || 'No notes'}>
                      <span className="opacity-70">{shift.notes || '—'}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const addOwnerModalMarkup = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-glass)] border border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-6">
          Add Co-Owner
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Name *
            </label>
            <input
              type="text"
              value={newOwnerName}
              onChange={(e) => setNewOwnerName(e.target.value)}
              className="w-full px-4 py-2 border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Username *
            </label>
            <input
              type="text"
              value={newOwnerUsername}
              onChange={(e) => setNewOwnerUsername(e.target.value)}
              className="w-full px-4 py-2 border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Email
            </label>
            <input
              type="email"
              value={newOwnerEmail}
              onChange={(e) => setNewOwnerEmail(e.target.value)}
              className="w-full px-4 py-2 border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Password *
            </label>
            <input
              type="password"
              value={newOwnerPassword}
              onChange={(e) => setNewOwnerPassword(e.target.value)}
              className="w-full px-4 py-2 border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setShowAddOwnerModal(false)}
            className="flex-1 px-4 py-2 bg-[var(--input-bg)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-lg transition-colors border border-[var(--border-glass)]"
          >
            Cancel
          </button>
          <button
            onClick={handleAddCoOwner}
            className="flex-1 px-4 py-2 glass-btn glass-btn-accent rounded-lg transition-colors"
          >
            Add Co-Owner
          </button>
        </div>
      </div>
    </div>
  );


  // Filter products list
  const filteredProducts = useMemo(() => {
    return productsList.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(productSearchQuery.toLowerCase())) ||
        p.id.toLowerCase().includes(productSearchQuery.toLowerCase());
      
      const matchesCategory = 
        productCategoryFilter === 'All' || 
        (p.category || 'General') === productCategoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [productsList, productSearchQuery, productCategoryFilter]);

  const productsManagementPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border flex flex-col h-[56vh]">
      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 flex-shrink-0">
        <div>
          <h3 className="font-bold text-lg text-[var(--text-primary)]">Product Inventory</h3>
          <p className="text-xs text-[var(--text-muted)]">Manage store items, pricing, GST rates, and stock alerts</p>
        </div>
        <div className="flex gap-2">
          {/* Mobile-only Camera Barcode Scanner to quickly add items */}
          <button
            onClick={() => {
              setIsScanToAddMode(true);
              startSettingsCameraScan();
            }}
            className={`px-4 py-2 glass-btn glass-btn-accent text-sm font-semibold rounded-xl flex items-center gap-2 transition-all hover:scale-105 ${isAndroid ? 'flex' : 'md:hidden'}`}
            title="Scan code using phone camera to add"
          >
            <Camera size={16} /> Scan to Add
          </button>

          <button
            onClick={() => {
              setEditingProduct(null);
              const defaultCat = selectableCategories[0] || 'General';
              setProductFormData({
                id: `prod_${Date.now()}`,
                sku: '',
                name: '',
                price: '',
                category: defaultCat,
                gstRate: '18',
                stock: '0',
                lowStockThreshold: '10',
                hsnCode: '',
                brand: '',
                uom: 'PCS',
                purchasePrice: '0',
                wholesalePrice: '0',
                mrp: '0',
                discountPercent: '0',
                batchNumber: '',
                expiryDate: '',
                status: 'Active',
                barcodeType: 'EAN-13',
                moq: '1',
                distributorPrice: '0',
                genericName: '',
                manufacturer: '',
                dosageForm: '',
                strength: '',
                supplierDetails: '',
                prescriptionSchedule: ''
              } as any);
              setIsAddingCustomCategory(false);
              setIsAddingCustomUom(false);
              setIsScanToAddMode(false);
              setShowAddEditProductModal(true);
            }}
            className="px-4 py-2 glass-btn glass-btn-accent text-sm font-semibold rounded-xl flex items-center gap-2 transition-all hover:scale-105"
          >
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col md:flex-row gap-3 mb-4 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
          <input
            type="text"
            placeholder="Search by name, SKU or ID..."
            value={productSearchQuery}
            onChange={(e) => setProductSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full no-scrollbar">
          {productCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setProductCategoryFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition-all ${
                productCategoryFilter === cat
                  ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                  : 'bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table grid */}
      <div className="flex-1 overflow-y-auto min-h-0 border rounded-xl border-[var(--border-glass)]">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--input-bg)] text-[var(--text-primary)] text-xs font-semibold border-b border-[var(--border-glass)]">
            <tr>
              <th className="px-4 py-3 text-left">Product / SKU</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-right">Price (₹)</th>
              <th className="px-4 py-3 text-right">GST</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-glass)] text-[var(--text-primary)] text-sm">
            {filteredProducts.map(prod => {
              const isLowStock = prod.stock <= (prod.low_stock_threshold ?? 10);
              return (
                <tr key={prod.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[var(--text-primary)]">{prod.name}</div>
                    <div className="text-xs text-[var(--text-muted)] font-mono flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span>SKU: {prod.sku || prod.id}</span>
                        {prod.hsn_code && <span className="opacity-80">| HSN: {prod.hsn_code}</span>}
                      </div>
                      {activeSector === 'pharmacy' && (prod.generic_name || prod.manufacturer) && (
                        <div className="text-[10px] text-purple-400 font-sans italic">
                          {prod.generic_name && <span>Gen: {prod.generic_name}</span>}
                          {prod.strength && <span> ({prod.strength})</span>}
                          {prod.manufacturer && <span> • Mfg: {prod.manufacturer}</span>}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--input-bg)] text-[var(--text-primary)] border border-[var(--border-glass)]">
                      {prod.category || 'General'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    ₹{prod.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--text-muted)]">
                    {prod.gst_rate}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className={`font-bold ${isLowStock ? 'text-red-500' : 'text-emerald-500'}`}>
                        {prod.stock}
                      </span>
                      {isLowStock && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/10 text-red-500 rounded-full">
                          LOW
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => {
                          setEditingProduct(prod);
                          setProductFormData({
                            id: prod.id,
                            sku: prod.sku || '',
                            name: prod.name,
                            price: prod.price.toString(),
                            category: prod.category || 'General',
                            gstRate: prod.gst_rate.toString(),
                            stock: prod.stock.toString(),
                            lowStockThreshold: (prod.low_stock_threshold ?? 10).toString(),
                            hsnCode: prod.hsn_code || '',
                            brand: prod.brand || '',
                            uom: prod.uom || 'PCS',
                            purchasePrice: (prod.purchase_price || 0).toString(),
                            wholesalePrice: (prod.wholesale_price || 0).toString(),
                            mrp: (prod.mrp || 0).toString(),
                            discountPercent: (prod.discount_percent || 0).toString(),
                            batchNumber: prod.batch_number || '',
                            expiryDate: prod.expiry_date || '',
                            status: prod.status || 'Active',
                            barcodeType: prod.barcode_type || 'EAN-13',
                            moq: (prod.moq || 1).toString(),
                            distributorPrice: (prod.distributor_price || 0).toString(),
                            genericName: prod.generic_name || '',
                            manufacturer: prod.manufacturer || '',
                            dosageForm: prod.dosage_form || '',
                            strength: prod.strength || '',
                            supplierDetails: prod.supplier_details || '',
                            prescriptionSchedule: prod.prescription_schedule || 'None'
                          });
                          setIsAddingCustomCategory(false);
                          setIsAddingCustomUom(false);
                          setIsScanToAddMode(false);
                          setShowAddEditProductModal(true);
                        }}
                        className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)] text-blue-500"
                        title="Edit Product"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(prod.id, prod.name)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)] text-red-500"
                        title="Delete Product"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isLoadingProducts ? (
          <div className="px-4 py-3 space-y-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        ) : filteredProducts.length === 0 && (
          <div className="text-center py-10 text-[var(--text-muted)]">
            <Package size={36} className="mx-auto mb-2 opacity-40" />
            <p className="text-xs">
              {productsList.length === 0
                ? 'No products yet. Use "Add Product" to build your catalog.'
                : 'No products match this search or category.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const addEditProductModal = showAddEditProductModal && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl backdrop-saturate-200 z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div onPointerMove={updatePointerGlare} className="group relative w-full max-w-2xl bg-[var(--bg-glass)] text-[var(--text-primary)] backdrop-blur-xl backdrop-saturate-200 border border-[var(--border-glass)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),inset_0_-1px_1px_rgba(0,0,0,0.08),var(--shadow-glass)] rounded-3xl flex flex-col p-6 animate-scale-in overflow-hidden">
        <SpecularGlareOverlay />
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-[var(--text-primary)]">{editingProduct ? '✏️ Edit Product' : '➕ Add New Product'}</h3>
          <button 
            onClick={() => setShowAddEditProductModal(false)}
            className="p-1 rounded-xl transition-all text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Section 1: Basic Details & Barcode */}
          <div className="p-4 rounded-2xl border space-y-3.5 bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)]">
            <h4 className="text-[10px] font-black uppercase text-blue-500 tracking-wider flex items-center gap-1.5">
              <span>🏷️</span> Basic Details & Barcode
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Product ID *
                </label>
                <input
                  type="text"
                  disabled={!!editingProduct}
                  value={productFormData.id}
                  onChange={(e) => setProductFormData({ ...productFormData, id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  SKU / Barcode *
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={productFormData.sku}
                    onChange={(e) => setProductFormData({ ...productFormData, sku: e.target.value })}
                    placeholder="Barcode No"
                    className="flex-1 px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={startSettingsCameraScan}
                    className={`px-2.5 rounded-lg border flex items-center justify-center transition-all ${isAndroid ? 'flex' : 'md:hidden'} hover:scale-105 active:scale-[0.97] bg-[var(--input-bg)] border-[var(--border-glass)] text-purple-500`}
                    title="Scan Barcode using phone camera"
                  >
                    <Camera size={14} />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Barcode Type
                </label>
                <select
                  value={productFormData.barcodeType}
                  onChange={(e) => setProductFormData({ ...productFormData, barcodeType: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                >
                  <option value="EAN-13">EAN-13</option>
                  <option value="UPC">UPC</option>
                  <option value="Code128">Code 128</option>
                  <option value="QR">QR Code</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={productFormData.name}
                  onChange={(e) => setProductFormData({ ...productFormData, name: e.target.value })}
                  placeholder="Product Description"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Brand Name
                </label>
                <input
                  type="text"
                  value={productFormData.brand}
                  onChange={(e) => setProductFormData({ ...productFormData, brand: e.target.value })}
                  placeholder="e.g. Nestlé"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Category
                </label>
                {!isAddingCustomCategory ? (
                  <select
                    value={productFormData.category}
                    onChange={(e) => {
                      if (e.target.value === '__add_custom__') {
                        setIsAddingCustomCategory(true);
                        setProductFormData({ ...productFormData, category: '' });
                      } else {
                        setProductFormData({ ...productFormData, category: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                  >
                    {selectableCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__add_custom__">➕ Add Custom Category...</option>
                  </select>
                ) : (
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="text"
                      value={productFormData.category}
                      onChange={(e) => setProductFormData({ ...productFormData, category: e.target.value })}
                      placeholder="New category name"
                      autoFocus
                      className="flex-1 px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCustomCategory(false);
                        const prevCat = selectableCategories[0] || 'General';
                        setProductFormData({ ...productFormData, category: prevCat });
                      }}
                      className="px-3 py-2 text-xs font-semibold rounded-lg border transition-colors bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Unit of Measurement (UOM) *
                </label>
                {!isAddingCustomUom ? (
                  <select
                    value={productFormData.uom}
                    onChange={(e) => {
                      if (e.target.value === '__add_custom_uom__') {
                        setIsAddingCustomUom(true);
                        setProductFormData({ ...productFormData, uom: '' });
                      } else {
                        setProductFormData({ ...productFormData, uom: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
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
                      value={productFormData.uom}
                      onChange={(e) => setProductFormData({ ...productFormData, uom: e.target.value })}
                      placeholder="e.g. BOTTLE, PAIR..."
                      autoFocus
                      className="flex-1 px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCustomUom(false);
                        setProductFormData({ ...productFormData, uom: 'PCS' });
                      }}
                      className="px-3 py-2 text-xs font-semibold rounded-lg border transition-colors bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Pricing & GST Compliance */}
          <div className="p-4 rounded-2xl border space-y-3.5 bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)]">
            <h4 className="text-[10px] font-black uppercase text-emerald-500 tracking-wider flex items-center gap-1.5">
              <span>💳</span> Pricing & GST Compliance
            </h4>
            
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Selling Price (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productFormData.price}
                  onChange={(e) => setProductFormData({ ...productFormData, price: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Wholesale Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productFormData.wholesalePrice}
                  onChange={(e) => setProductFormData({ ...productFormData, wholesalePrice: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Max Retail Price (MRP ₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productFormData.mrp}
                  onChange={(e) => setProductFormData({ ...productFormData, mrp: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Purchase Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productFormData.purchasePrice}
                  onChange={(e) => setProductFormData({ ...productFormData, purchasePrice: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Discount %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={productFormData.discountPercent}
                  onChange={(e) => setProductFormData({ ...productFormData, discountPercent: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Distributor Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productFormData.distributorPrice}
                  onChange={(e) => setProductFormData({ ...productFormData, distributorPrice: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  GST Rate *
                </label>
                <select
                  value={productFormData.gstRate}
                  onChange={(e) => setProductFormData({ ...productFormData, gstRate: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                >
                  <option value="0">0% (GST Exempt)</option>
                  <option value="5">5% (GST Slab)</option>
                  <option value="12">12% (GST Slab)</option>
                  <option value="18">18% (GST Slab)</option>
                  <option value="28">28% (GST Slab)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  HSN Code (Optional)
                </label>
                <input
                  type="text"
                  value={productFormData.hsnCode}
                  onChange={(e) => setProductFormData({ ...productFormData, hsnCode: e.target.value })}
                  placeholder="4, 6 or 8 digits"
                  maxLength={8}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Stock & Batch Control */}
          <div className="p-4 rounded-2xl border space-y-3.5 bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)]">
            <h4 className="text-[10px] font-black uppercase text-amber-500 tracking-wider flex items-center gap-1.5">
              <span>📅</span> Stock & Batch Control
            </h4>
            
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Current Stock
                </label>
                <input
                  type="number"
                  min="0"
                  value={productFormData.stock}
                  onChange={(e) => setProductFormData({ ...productFormData, stock: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Reorder Alert
                </label>
                <input
                  type="number"
                  min="0"
                  value={productFormData.lowStockThreshold}
                  onChange={(e) => setProductFormData({ ...productFormData, lowStockThreshold: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Wholesale MOQ
                </label>
                <input
                  type="number"
                  min="1"
                  value={productFormData.moq}
                  onChange={(e) => setProductFormData({ ...productFormData, moq: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Expiry Batch
                </label>
                <input
                  type="text"
                  value={productFormData.batchNumber}
                  onChange={(e) => setProductFormData({ ...productFormData, batchNumber: e.target.value })}
                  placeholder="e.g. B204"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={productFormData.expiryDate}
                  onChange={(e) => setProductFormData({ ...productFormData, expiryDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                  Product Status
                </label>
                <select
                  value={productFormData.status}
                  onChange={(e) => setProductFormData({ ...productFormData, status: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Discontinued">Discontinued</option>
                  <option value="Out of Stock">Out of Stock</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Medicine Details (Pharmacy Only) */}
          {activeSector === 'pharmacy' && (
            <div className="p-4 rounded-2xl border space-y-3.5 bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)]">
              <h4 className="text-[10px] font-black uppercase text-purple-500 tracking-wider flex items-center gap-1.5">
                <span>💊</span> Medicine Master Details
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                    Generic Name
                  </label>
                  <input
                    type="text"
                    value={productFormData.genericName}
                    onChange={(e) => setProductFormData({ ...productFormData, genericName: e.target.value })}
                    placeholder="e.g. Paracetamol"
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                    Manufacturer
                  </label>
                  <input
                    type="text"
                    value={productFormData.manufacturer}
                    onChange={(e) => setProductFormData({ ...productFormData, manufacturer: e.target.value })}
                    placeholder="e.g. Cipla Ltd"
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                    Dosage Form
                  </label>
                  <select
                    value={productFormData.dosageForm}
                    onChange={(e) => setProductFormData({ ...productFormData, dosageForm: e.target.value })}
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                  >
                    <option value="">Select Form</option>
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Injection">Injection</option>
                    <option value="Ointment">Ointment</option>
                    <option value="Drops">Drops</option>
                    <option value="Inhaler">Inhaler</option>
                    <option value="Powder">Powder</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                    Strength
                  </label>
                  <input
                    type="text"
                    value={productFormData.strength}
                    onChange={(e) => setProductFormData({ ...productFormData, strength: e.target.value })}
                    placeholder="e.g. 500mg, 10ml"
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                    Supplier Details
                  </label>
                  <input
                    type="text"
                    value={productFormData.supplierDetails}
                    onChange={(e) => setProductFormData({ ...productFormData, supplierDetails: e.target.value })}
                    placeholder="e.g. Acme Pharma Distrib."
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                    Prescription Schedule (India)
                  </label>
                  <select
                    value={productFormData.prescriptionSchedule}
                    onChange={(e) => setProductFormData({ ...productFormData, prescriptionSchedule: e.target.value })}
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                  >
                    <option value="None">None (OTC / General)</option>
                    <option value="H">Schedule H (Prescription)</option>
                    <option value="H1">Schedule H1 (Strict Rx Registry)</option>
                    <option value="X">Schedule X (Narcotic/Psychotropic)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6 border-t pt-4 border-[var(--border-glass)]">
          <button
            onClick={() => setShowAddEditProductModal(false)}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all bg-[var(--input-bg)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-glass)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveProduct}
            className="flex-1 px-4 py-2.5 text-sm font-semibold glass-btn glass-btn-accent rounded-xl transition-all"
          >
            Save Product
          </button>
        </div>
      </div>
    </div>
  );

  const restockManagementPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border flex flex-col h-[56vh]">
      {/* Header Info */}
      <div className="flex-shrink-0 mb-4 border-b border-[var(--border-glass)] pb-3 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg text-[var(--text-primary)]">Replenishment & PO Generator</h3>
          <p className="text-xs text-[var(--text-muted)]">Scan stock alerts, customize procurement rates, and export purchase orders.</p>
        </div>
      </div>

      {/* Inputs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 flex-shrink-0">
        <div className="p-4 rounded-xl border bg-[var(--input-bg)] border-[var(--border-glass)] grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-[var(--text-muted)]">Supplier Name</label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Supplier name..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-[var(--text-muted)]">Contact Email/Phone</label>
            <input
              type="text"
              value={supplierContact}
              onChange={(e) => setSupplierContact(e.target.value)}
              placeholder="Supplier contact..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-[var(--input-bg)] border-[var(--border-glass)] flex justify-between items-center gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-[var(--text-muted)]">PO Reference Number</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                className="w-32 px-2.5 py-1.5 text-xs rounded-lg border font-mono font-bold bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => setPoNumber(`PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`)}
                className="p-1.5 rounded-lg border text-[11px] font-semibold transition-all bg-[var(--input-bg)] border-[var(--border-glass)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)]"
                title="Regenerate Reference"
              >
                Reset
              </button>
            </div>
          </div>
          
          <div className="text-right">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Total PO Cost</span>
            <span className="text-lg font-extrabold text-blue-500">
              ₹{restockItems.reduce((sum, item) => sum + (item.selected ? item.totalCost : 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="block text-[9px] text-[var(--text-muted)] mt-0.5">
              {restockItems.filter(item => item.selected).length} items · {restockItems.reduce((sum, item) => sum + (item.selected ? item.quantity : 0), 0)} units
            </span>
          </div>
        </div>
      </div>

      {/* Table Slate */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-[var(--border-glass)] min-h-0 mb-4">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--input-bg)] text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider border-b border-[var(--border-glass)]">
            <tr>
              <th className="px-3 py-2.5 w-10 text-center">
                <input
                  type="checkbox"
                  checked={restockItems.every(item => item.selected)}
                  onChange={(e) => {
                    const selectAll = e.target.checked;
                    const updates: any = {};
                    productsList.forEach(p => {
                      updates[p.id] = { ...poCustomizations[p.id], selected: selectAll };
                    });
                    setPoCustomizations(updates);
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-3 py-2.5">Product Name</th>
              <th className="px-3 py-2.5 text-center">Stock / Alert</th>
              <th className="px-3 py-2.5 text-right w-24">Order Qty</th>
              <th className="px-3 py-2.5 text-right w-28">Wholesale Rate</th>
              <th className="px-3 py-2.5 text-center w-16">Tax</th>
              <th className="px-4 py-2.5 text-right w-28">Est. Total</th>
            </tr>
          </thead>
          <tbody className="divide-y text-xs divide-[var(--border-glass)] text-[var(--text-primary)]">
            {restockItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">
                  No products registered in system database.
                </td>
              </tr>
            ) : (
              restockItems.map((item) => (
                <tr 
                  key={item.id} 
                  className={`hover:bg-[var(--surface-hover)] transition-colors ${
                    item.isLowStock && item.selected ? 'bg-orange-500/5' : ''
                  }`}
                >
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) => {
                        setPoCustomizations({
                          ...poCustomizations,
                          [item.id]: { ...poCustomizations[item.id], selected: e.target.checked }
                        });
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                      {item.name}
                      {item.isLowStock && (
                        <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded bg-orange-500/10 text-orange-500 animate-pulse">
                          Low Stock
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      SKU: {item.sku || 'N/A'} · HSN: {item.hsn_code || 'N/A'}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono">
                    <span className={`font-bold ${item.isLowStock ? 'text-orange-500 font-extrabold' : 'text-[var(--text-muted)]'}`}>
                      {item.currentStock}
                    </span>
                    <span className="text-[10px] opacity-40 mx-0.5">/</span>
                    <span className="text-[var(--text-muted)] opacity-60 text-[11px]">{item.threshold}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setPoCustomizations({
                          ...poCustomizations,
                          [item.id]: { ...poCustomizations[item.id], quantity: val }
                        });
                      }}
                      className="w-20 px-2 py-1 text-xs text-right border font-semibold font-mono rounded bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40 text-[10px]">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.wholesalePrice}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setPoCustomizations({
                          ...poCustomizations,
                          [item.id]: { ...poCustomizations[item.id], wholesalePrice: val }
                        });
                      }}
                      className="w-24 px-2 py-1 pl-4 text-xs text-right border font-semibold font-mono rounded bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold text-[var(--text-muted)]">{item.gstRate}%</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-500">
                    ₹{item.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Procurement Actions bottom bar */}
      <div className="flex-shrink-0 flex items-center justify-between border-t border-[var(--border-glass)] pt-3">
        <span className="text-[10px] leading-relaxed text-[var(--text-muted)]">
          <span className="font-semibold">Procurement Logic:</span> Ideal levels default to 3x your stock alert limit. Wholesale prices default to a standard 30% retailer margin (70% of standard price). Tax subdivisions match item-wise GST rate allocations automatically.
        </span>
        <button
          onClick={downloadPOCSV}
          disabled={restockItems.filter(item => item.selected).length === 0}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg select-none cursor-pointer ${
            restockItems.filter(item => item.selected).length === 0
              ? 'opacity-40 cursor-not-allowed bg-[var(--input-bg)] text-[var(--text-muted)]'
              : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-blue-500/10 transform active:scale-[0.97]'
          }`}
        >
          <FileSpreadsheet size={15} />
          Generate & Download Restock PO
        </button>
      </div>
    </div>
  );

  const inventoryLedgerPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border flex flex-col h-[56vh]">
      <div className="flex-shrink-0 flex justify-between items-center mb-4 border-b border-[var(--border-glass)] pb-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg">
            <Database size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Multi-Warehouse Stock Ledger
            </h2>
            <p className="text-[10px] text-[var(--text-muted)]">Chronological stock entries & transfers</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddWarehouseModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all select-none cursor-pointer"
          >
            <Plus size={14} />
            Warehouse
          </button>
          <button
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all select-none cursor-pointer"
          >
            Transfer
          </button>
          <button
            onClick={() => setShowAdjustModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-all select-none cursor-pointer"
          >
            Audit/Write-Off
          </button>
        </div>
      </div>

      {/* Warehouses Info Row */}
      <div className="grid grid-cols-2 gap-3 mb-4 flex-shrink-0">
        {warehouses.map((wh) => (
          <div key={wh.id} className="p-3 rounded-xl border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]">
            <div className="flex justify-between items-center mb-1">
              <span className="font-extrabold text-xs text-blue-500">{wh.code}</span>
              <span className="text-[9px] text-[var(--text-muted)] font-mono">ID: {wh.id}</span>
            </div>
            <h4 className="font-bold text-xs">{wh.name}</h4>
            <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-normal truncate">{wh.address || 'No Address registered'}</p>
          </div>
        ))}
      </div>

      {/* Ledger Table */}
      <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-2 flex-shrink-0">Consolidated Stock Variation Logs</h3>
      <div className="flex-1 overflow-y-auto rounded-xl border border-[var(--border-glass)] min-h-0 mb-2">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--input-bg)] text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider border-b border-[var(--border-glass)]">
            <tr className="border-b border-[var(--border-glass)]">
              <th className="px-3 py-2 w-32">Timestamp</th>
              <th className="px-3 py-2">Product SKU / Name</th>
              <th className="px-3 py-2">Warehouse</th>
              <th className="px-2 py-2 text-center w-24">Change Qty</th>
              <th className="px-3 py-2 text-center w-24">Type</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-glass)] text-xs text-[var(--text-primary)]">
            {inventoryLedger.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--text-muted)] font-medium italic">
                  No stock ledger entries registered yet.
                </td>
              </tr>
            ) : (
              inventoryLedger.map((log) => {
                const date = new Date(log.timestamp).toLocaleDateString('en-IN', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                const isPositive = log.change_qty > 0;
                
                return (
                  <tr key={log.id} className="hover:bg-[var(--surface-hover)]">
                    <td className="px-3 py-2 font-mono text-[10px] text-[var(--text-muted)]">{date}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono font-bold text-blue-500 block text-[10px]">{log.product_sku}</span>
                      <span className="font-semibold block truncate max-w-[150px]">{log.product_name}</span>
                    </td>
                    <td className="px-3 py-2 font-medium">{log.warehouse_name || 'Main Warehouse'}</td>
                    <td className={`px-2 py-2 text-center font-mono font-black ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                      {isPositive ? '+' : ''}{log.change_qty}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[8px] uppercase tracking-wider ${
                        log.type === 'purchase' ? 'bg-emerald-500/10 text-emerald-500' :
                        log.type === 'sale' ? 'bg-red-500/10 text-red-500' :
                        log.type === 'transfer' ? 'bg-indigo-500/10 text-indigo-500' :
                        'bg-amber-500/10 text-amber-500'
                      }`}>
                        {log.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)] font-medium truncate max-w-[130px]" title={log.notes}>{log.notes}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const pharmacyBatchesPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border flex flex-col h-[56vh]">
      <div className="flex-shrink-0 flex justify-between items-center mb-4 border-b border-[var(--border-glass)] pb-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg">
            <Package size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Pharmacy Batch & Expiries
            </h2>
            <p className="text-[10px] text-[var(--text-muted)]">Track and inward drug batches and verify compliance dates</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddBatchModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 transition-all select-none cursor-pointer"
        >
          <Plus size={14} />
          Inward Drug Batch
        </button>
      </div>

      {/* Expiry alerts cards */}
      <div className="grid grid-cols-3 gap-2 mb-3.5 flex-shrink-0">
        <div className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/20 text-center">
          <span className="block text-[8px] font-black uppercase text-red-500 tracking-wider">Expired Batches</span>
          <span className="text-lg font-extrabold text-red-500">
            {batches.filter(b => new Date(b.expiry_date) < new Date()).length}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
          <span className="block text-[8px] font-black uppercase text-amber-500 tracking-wider">Near Expiry (90d)</span>
          <span className="text-lg font-extrabold text-amber-500">
            {batches.filter(b => {
              const diffTime = new Date(b.expiry_date).getTime() - Date.now();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return diffDays >= 0 && diffDays <= 90;
            }).length}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
          <span className="block text-[8px] font-black uppercase text-emerald-500 tracking-wider">Healthy Batches</span>
          <span className="text-lg font-extrabold text-emerald-500">
            {batches.filter(b => {
              const diffTime = new Date(b.expiry_date).getTime() - Date.now();
              return diffTime > 90 * 24 * 60 * 60 * 1000;
            }).length}
          </span>
        </div>
      </div>

      {/* Batches Table */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-[var(--border-glass)] min-h-0 mb-1">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--input-bg)] text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider border-b border-[var(--border-glass)]">
            <tr className="border-b border-[var(--border-glass)]">
              <th className="px-3 py-2">Medicine (SKU)</th>
              <th className="px-3 py-2 text-center w-24">Batch Number</th>
              <th className="px-3 py-2 text-center w-24">Expiry Date</th>
              <th className="px-2 py-2 text-center w-20">Stock Qty</th>
              <th className="px-3 py-2 text-center w-20">Rx?</th>
              <th className="px-3 py-2 text-center w-16">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-glass)] text-xs text-[var(--text-primary)]">
            {batches.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--text-muted)] font-medium italic">
                  No medicine batches inwarded. Click Inward Drug Batch to add.
                </td>
              </tr>
            ) : (
              batches.map((b) => {
                const isExpired = new Date(b.expiry_date) < new Date();
                const diffTime = new Date(b.expiry_date).getTime() - Date.now();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const isNearExpiry = diffDays >= 0 && diffDays <= 90;
                
                return (
                  <tr key={b.id} className="hover:bg-[var(--surface-hover)]">
                    <td className="px-3 py-2">
                      <span className="font-extrabold text-[var(--text-primary)] block">{b.product_name}</span>
                      <span className="font-mono text-[9px] text-[var(--text-muted)] block">SKU: {b.product_sku}</span>
                    </td>
                    <td className="px-3 py-2 text-center font-mono font-bold text-blue-500">{b.batch_number}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                        isExpired ? 'bg-red-500/10 text-red-500' :
                        isNearExpiry ? 'bg-amber-500/10 text-amber-500 animate-pulse' :
                        'bg-emerald-500/10 text-emerald-500'
                      }`}>
                        {b.expiry_date}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center font-mono font-black text-[var(--text-primary)]">{b.stock_quantity}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        b.prescription_required === 1 ? 'bg-red-500/10 text-red-500' : 'bg-gray-500/10 text-gray-400'
                      }`}>
                        {b.prescription_required === 1 ? 'Rx' : 'OTC'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleDeleteBatch(b.id, b.batch_number)}
                        className="text-red-500 hover:text-red-700 p-1 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const addWarehouseModalMarkup = showAddWarehouseModal && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl backdrop-saturate-200 z-[60] flex items-center justify-center p-4">
      <div onPointerMove={updatePointerGlare} className="group relative w-full max-w-md bg-[var(--bg-glass)] text-[var(--text-primary)] backdrop-blur-xl backdrop-saturate-200 border border-[var(--border-glass)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),inset_0_-1px_1px_rgba(0,0,0,0.08),var(--shadow-glass)] rounded-2xl p-6 animate-scale-in text-left overflow-hidden">
        <SpecularGlareOverlay />
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold flex items-center gap-2">
            <span>🏢</span> Add Warehouse Location
          </h3>
          <button onClick={() => setShowAddWarehouseModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"><X size={18} /></button>
        </div>
        <div className="space-y-4 text-xs font-semibold">
          <div>
            <label className="block mb-1 opacity-70">Warehouse Code (e.g. WH-SOUTH)</label>
            <input
              type="text"
              placeholder="WH-SOUTH"
              value={newWarehouseForm.code}
              onChange={(e) => setNewWarehouseForm({ ...newWarehouseForm, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 opacity-70">Warehouse Name</label>
            <input
              type="text"
              placeholder="Southern Supply Bin"
              value={newWarehouseForm.name}
              onChange={(e) => setNewWarehouseForm({ ...newWarehouseForm, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 opacity-70">Address / Location Details</label>
            <textarea
              placeholder="Building 4B, Southern Logistics Hub"
              rows={2}
              value={newWarehouseForm.address}
              onChange={(e) => setNewWarehouseForm({ ...newWarehouseForm, address: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            />
          </div>
          <button
            onClick={handleCreateWarehouse}
            className="w-full py-2.5 glass-btn glass-btn-accent text-xs font-bold rounded-xl shadow-blue-600/10 cursor-pointer uppercase transition-all"
          >
            Save Location
          </button>
        </div>
      </div>
    </div>
  );

  const addTransferModalMarkup = showTransferModal && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl backdrop-saturate-200 z-[60] flex items-center justify-center p-4">
      <div onPointerMove={updatePointerGlare} className="group relative w-full max-w-md bg-[var(--bg-glass)] text-[var(--text-primary)] backdrop-blur-xl backdrop-saturate-200 border border-[var(--border-glass)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),inset_0_-1px_1px_rgba(0,0,0,0.08),var(--shadow-glass)] rounded-2xl p-6 animate-scale-in text-left overflow-hidden">
        <SpecularGlareOverlay />
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-[var(--text-primary)]">
            <span>🔄</span> Internal Stock Transfer
          </h3>
          <button onClick={() => setShowTransferModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"><X size={18} /></button>
        </div>
        <div className="space-y-4 text-xs font-semibold">
          <div>
            <label className="block mb-1 text-[var(--text-muted)]">Select Product to Move</label>
            <select
              value={transferForm.product_id}
              onChange={(e) => setTransferForm({ ...transferForm, product_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            >
              <option value="">-- Choose Product --</option>
              {productsList.map(p => (
                <option key={p.id} value={p.id}>[{p.sku}] {p.name} (Stock: {p.stock})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-[var(--text-muted)]">Source Location</label>
              <select
                value={transferForm.from_warehouse_id}
                onChange={(e) => setTransferForm({ ...transferForm, from_warehouse_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
              >
                <option value="">-- Source WH --</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-[var(--text-muted)]">Destination Location</label>
              <select
                value={transferForm.to_warehouse_id}
                onChange={(e) => setTransferForm({ ...transferForm, to_warehouse_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
              >
                <option value="">-- Dest WH --</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block mb-1 text-[var(--text-muted)]">Transfer Quantity</label>
            <input
              type="number"
              placeholder="10"
              value={transferForm.quantity}
              onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 text-[var(--text-muted)]">Transaction Notes</label>
            <input
              type="text"
              placeholder="Consolidation of general depot stock"
              value={transferForm.notes}
              onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            />
          </div>
          <button
            onClick={handleTransferStock}
            className="w-full py-2.5 glass-btn glass-btn-accent text-xs font-bold rounded-xl shadow-indigo-600/10 cursor-pointer uppercase transition-all"
          >
            Execute Transfer
          </button>
        </div>
      </div>
    </div>
  );

  const addAdjustModalMarkup = showAdjustModal && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl backdrop-saturate-200 z-[60] flex items-center justify-center p-4">
      <div onPointerMove={updatePointerGlare} className="group relative w-full max-w-md bg-[var(--bg-glass)] text-[var(--text-primary)] backdrop-blur-xl backdrop-saturate-200 border border-[var(--border-glass)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),inset_0_-1px_1px_rgba(0,0,0,0.08),var(--shadow-glass)] rounded-2xl p-6 animate-scale-in text-left overflow-hidden">
        <SpecularGlareOverlay />
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-[var(--text-primary)]">
            <span>⚖️</span> Log Stock Audit / Damage Write-Off
          </h3>
          <button onClick={() => setShowAdjustModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"><X size={18} /></button>
        </div>
        <div className="space-y-4 text-xs font-semibold">
          <div>
            <label className="block mb-1 text-[var(--text-muted)]">Select Product to Audit</label>
            <select
              value={adjustForm.product_id}
              onChange={(e) => setAdjustForm({ ...adjustForm, product_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            >
              <option value="">-- Choose Product --</option>
              {productsList.map(p => (
                <option key={p.id} value={p.id}>[{p.sku}] {p.name} (Stock: {p.stock})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1 text-[var(--text-muted)]">Target Warehouse Location</label>
            <select
              value={adjustForm.warehouse_id}
              onChange={(e) => setAdjustForm({ ...adjustForm, warehouse_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            >
              <option value="">-- Choose WH --</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-[var(--text-muted)]">Variation Qty</label>
              <input
                type="number"
                placeholder="5"
                value={adjustForm.change_qty}
                onChange={(e) => setAdjustForm({ ...adjustForm, change_qty: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block mb-1 text-[var(--text-muted)]">Adjustment Type</label>
              <select
                value={adjustForm.type}
                onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value as any })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
              >
                <option value="damaged">Damage / Write-Off (Reduces stock)</option>
                <option value="audit">Inventory Audit (Adds/Subtracts stock)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block mb-1 text-[var(--text-muted)]">Adjustment Note / Incident Details</label>
            <input
              type="text"
              placeholder="Water leakage or discrepancy resolved during audit"
              value={adjustForm.notes}
              onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            />
          </div>
          <button
            onClick={handleAdjustStock}
            className="w-full py-2.5 glass-btn glass-btn-accent text-xs font-bold rounded-xl shadow-amber-600/10 cursor-pointer uppercase transition-all"
          >
            Apply Adjustment
          </button>
        </div>
      </div>
    </div>
  );

  const addBatchModalMarkup = showAddBatchModal && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl backdrop-saturate-200 z-[60] flex items-center justify-center p-4">
      <div onPointerMove={updatePointerGlare} className="group relative w-full max-w-md bg-[var(--bg-glass)] text-[var(--text-primary)] backdrop-blur-xl backdrop-saturate-200 border border-[var(--border-glass)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),inset_0_-1px_1px_rgba(0,0,0,0.08),var(--shadow-glass)] rounded-2xl p-6 animate-scale-in text-left overflow-hidden">
        <SpecularGlareOverlay />
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-[var(--text-primary)]">
            <span>🧪</span> Inward Pharmaceutical Medicine Batch
          </h3>
          <button onClick={() => setShowAddBatchModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"><X size={18} /></button>
        </div>
        <div className="space-y-4 text-xs font-semibold">
          <div>
            <label className="block mb-1 text-[var(--text-muted)]">Select Medicine Item</label>
            <select
              value={newBatchForm.product_id}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, product_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            >
              <option value="">-- Choose Medicine --</option>
              {productsList.filter(p => p.category === 'Pharmacy').map(p => (
                <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-[var(--text-muted)]">Batch Number</label>
              <input
                type="text"
                placeholder="AMX-2026"
                value={newBatchForm.batch_number}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, batch_number: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block mb-1 text-[var(--text-muted)]">Inward Quantity</label>
              <input
                type="number"
                placeholder="100"
                value={newBatchForm.stock_quantity}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, stock_quantity: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-[var(--text-muted)]">Expiry Date (YYYY-MM-DD)</label>
              <input
                type="date"
                value={newBatchForm.expiry_date}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, expiry_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block mb-1 text-[var(--text-muted)]">Mfg Date (YYYY-MM-DD)</label>
              <input
                type="date"
                value={newBatchForm.manufacturing_date}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, manufacturing_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
              />
            </div>
          </div>
          <div>
            <label className="block mb-1 text-[var(--text-muted)]">Drug License Number / Batch ID</label>
            <input
              type="text"
              placeholder="DL-27-12345"
              value={newBatchForm.drug_license}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, drug_license: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newBatchForm.prescription_required}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, prescription_required: e.target.checked })}
              className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
            />
            <span>This medicine requires strict Prescription (Rx) verification at checkout</span>
          </label>
          <button
            onClick={handleCreateBatch}
            className="w-full py-2.5 glass-btn glass-btn-accent text-xs font-bold rounded-xl shadow-purple-600/10 cursor-pointer uppercase transition-all"
          >
            Inward Stock
          </button>
        </div>
      </div>
    </div>
  );

  const restaurantTablesPanel = (
    <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border flex flex-col h-[56vh]">
      <div className="flex-shrink-0 flex items-center gap-3 mb-4 border-b border-[var(--border-glass)] pb-3">
        <div className="p-1.5 bg-gradient-to-br from-rose-500 to-pink-600 rounded-lg text-white">
          <Store size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            Dining Tables Layout Settings
          </h2>
          <p className="text-[10px] text-[var(--text-muted)]">Configure floorplan grid, seating capacities, and add/bulk-generate tables</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pr-1 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Custom Adder */}
          <div className="p-4 rounded-xl border bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              ➕ Add Single Dining Table
            </h3>
            <div className="space-y-2.5">
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-1 font-mono">TABLE NAME / CODE</label>
                <input
                  type="text"
                  placeholder="e.g. Table 11 or Patio 1"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border rounded-lg focus:ring-1 focus:ring-rose-500 focus:border-rose-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-1 font-mono">SEATING CAPACITY</label>
                <input
                  type="number"
                  min="1"
                  value={newTableSeats}
                  onChange={(e) => setNewTableSeats(parseInt(e.target.value) || 2)}
                  className="w-full px-3 py-1.5 text-xs border rounded-lg focus:ring-1 focus:ring-rose-500 focus:border-rose-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <button
                type="button"
                onClick={handleAddTable}
                className="w-full py-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-extrabold rounded-lg text-xs uppercase cursor-pointer select-none active:scale-[0.97] transition-all shadow-md shadow-rose-950/10"
              >
                Add Table To Floorplan
              </button>
            </div>
          </div>

          {/* Bulk Generator */}
          <div className="p-4 rounded-xl border bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              ⚡ Bulk Floorplan Generator
            </h3>
            <div className="space-y-2.5">
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-1 font-mono">TOTAL TABLES TO GENERATE</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={bulkTableCount}
                  onChange={(e) => setBulkTableCount(parseInt(e.target.value) || 12)}
                  className="w-full px-3 py-1.5 text-xs border rounded-lg focus:ring-1 focus:ring-rose-500 focus:border-rose-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-1 font-mono">STANDARD SEATS PER TABLE</label>
                <input
                  type="number"
                  min="1"
                  value={bulkTableSeats}
                  onChange={(e) => setBulkTableSeats(parseInt(e.target.value) || 4)}
                  className="w-full px-3 py-1.5 text-xs border rounded-lg focus:ring-1 focus:ring-rose-500 focus:border-rose-500 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                />
              </div>
              <button
                type="button"
                onClick={handleBulkGenerate}
                className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-lg text-xs uppercase cursor-pointer select-none active:scale-[0.97] transition-all"
              >
                Bulk Generate Layout
              </button>
            </div>
          </div>
        </div>

        {/* Current Table Layout */}
        <div className="p-4 rounded-xl border bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)] space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              🪑 Configured Dining Tables ({localTables.length})
            </h3>
            <span className="text-[9px] text-[var(--text-muted)] select-none font-mono font-bold">PERSISTED LOCAL LAYOUT</span>
          </div>

          {localTables.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)] font-medium">
              No tables configured. Use the Bulk Generator or Single Table Adder above to initialize your layout!
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {localTables.map((table) => (
                <div
                  key={table.id}
                  className="p-3 rounded-xl border flex flex-col justify-between gap-2.5 transition-all bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] shadow-sm"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-xs text-[var(--text-primary)]">
                      {table.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTable(table.id)}
                      className="p-1 rounded text-red-500 hover:bg-red-500/10 cursor-pointer select-none"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 border-t border-[var(--border-glass)] pt-2">
                    <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase whitespace-nowrap font-mono">SEATS:</span>
                    <input
                      type="number"
                      min="1"
                      value={table.seats}
                      onChange={(e) => handleUpdateTableSeats(table.id, parseInt(e.target.value) || 2)}
                      className="w-full px-1.5 py-0.5 text-[10px] font-black border rounded focus:ring-1 focus:ring-rose-500 focus:outline-none bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // UI Theme Settings Panel
  const uiThemePanel = (
    <div className="space-y-6 text-left animate-fade-in">
      <div className="p-5 rounded-2xl border glass-panel border-[var(--border-glass)] text-[var(--text-primary)] shadow-sm space-y-6">
        <div>
          <h3 className="text-base font-extrabold flex items-center gap-2 text-[var(--text-primary)]">
            <Palette className="text-emerald-500" size={20} />
            <span>UI Theme: Liquid Glass & Preference Controls</span>
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Choose system or explicit Light/Dark mode and adjust panel opacity while keeping text contrast automatic.
          </p>
        </div>

        {/* 0. Theme Preference Mode: System / Light / Dark Selector */}
        <div className="space-y-3 p-4 rounded-xl border border-[var(--border-glass)] bg-[var(--bg-glass)] text-[var(--text-primary)]">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-[var(--text-primary)]">
              <Monitor size={16} />
              <span>Theme Mode (System / Light / Dark)</span>
            </label>
            <span className="text-xs font-mono font-extrabold px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
              Active: {theme} {theme === 'system' ? `(${resolvedTheme})` : ''}
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Select explicit Light or Dark mode, or automatically synchronize with your operating system preference.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { id: 'system', label: 'System', icon: Monitor, desc: 'Auto OS preference' },
              { id: 'light', label: 'Light', icon: Sun, desc: 'Bright mode' },
              { id: 'dark', label: 'Dark', icon: Moon, desc: 'Glass dark mode' },
            ].map((option) => {
              const IconComponent = option.icon;
              const isSelected = theme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTheme(option.id as ThemeMode)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30 shadow-md'
                      : 'border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <IconComponent size={20} className={isSelected ? 'text-emerald-500' : ''} />
                  <span className={`text-xs font-bold mt-1.5 ${isSelected ? 'text-[var(--text-primary)]' : ''}`}>
                    {option.label}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-normal">
                    {option.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. Curated Preset Color Themes (Optimized for Light & Dark Contrast per color-selection-light-dark-themes.md skill) */}
        <div className="space-y-3 p-4 rounded-xl border border-[var(--border-glass)] bg-[var(--bg-glass)] text-[var(--text-primary)]">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-[var(--text-primary)]">
              <Palette size={16} />
              <span>1. Curated Preset Color Themes (Light & Dark Tuned)</span>
            </label>
            {activePresetId && (
              <span className="text-xs font-mono font-extrabold px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                Active: {COLOR_THEME_PRESETS.find(p => p.id === activePresetId)?.name || activePresetId}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Built using HSL lightness tuning (40–55% Light, 55–70% Dark) ensuring WCAG AA contrast across both light and dark themes.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
            {COLOR_THEME_PRESETS.map((preset) => {
              const isSelected = activePresetId === preset.id;
              const displayColor = darkMode ? preset.accentDark : preset.accentLight;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPresetTheme(preset.id)}
                  className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30 shadow-md'
                      : 'border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-4 h-4 rounded-full shadow-sm shrink-0 border border-white/20"
                      style={{ backgroundColor: displayColor }}
                    />
                    <span className={`text-xs font-bold ${isSelected ? 'text-[var(--text-primary)]' : ''}`}>
                      {preset.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-normal leading-tight line-clamp-2">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. SINGLE APPLICATION SLIDER: Liquid Glass Transparency & Opacity */}
        <div className="space-y-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-emerald-500">
              <Sliders size={16} />
              <span>2. Liquid Glass Opacity Slider (Single Application Slider)</span>
            </label>
            <span className="text-xs font-mono font-extrabold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              {Math.round(elementOpacity * 100)}% Opacity
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            The only slider in the application. It adjusts panel and card transparency globally; text keeps the readable light/dark theme colors.
          </p>
          <div className="flex items-center gap-4 pt-2">
            <span className="text-[10px] font-bold text-[var(--text-muted)]">More glass</span>
            <input
              type="range"
              min={GLASS_OPACITY_MIN}
              max={GLASS_OPACITY_MAX}
              step="0.01"
              value={elementOpacity}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setElementOpacity(val);
                setButtonOpacity(val);
              }}
              className="flex-1 accent-[var(--primary-accent)] cursor-pointer h-2.5 rounded-lg bg-[var(--surface-elevated)]"
            />
            <span className="text-[10px] font-bold text-[var(--text-muted)]">100% (Solid)</span>
          </div>
        </div>

        {/* Real-time Live Interactive Preview Box */}
        <div className="pt-4 border-t border-[var(--border-glass)]">
          <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-[var(--text-primary)]">
            Live Theme Preview
          </label>
          <div 
            className="p-4 rounded-2xl border border-[var(--border-glass)] transition-all space-y-3"
            style={{ 
              backgroundColor: darkMode
                ? `rgba(28, 29, 34, ${elementOpacity})`
                : `rgba(255, 255, 255, ${elementOpacity})`
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold tracking-tight flex items-center gap-1.5 text-[var(--text-primary)]">
                <Sparkles size={14} className="text-emerald-500" /> Sample Panel Text (1234567890)
              </span>
              <span 
                className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white shadow-sm"
                style={{ backgroundColor: accentColor }}
              >
                Liquid Glass Active (Surface Only)
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer"
                style={{ backgroundColor: accentColor }}
              >
                Sample Action Button (₹1,250.00)
              </button>

              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)]"
              >
                Cancel 100% Solid Text
              </button>
            </div>
          </div>
        </div>

        {/* Theme Actions: Reset & Save */}
        <div className="pt-4 flex flex-wrap justify-between items-center gap-3 border-t border-[var(--border-glass)]">
          <button
            type="button"
            onClick={() => {
              resetThemeDefaults();
              localStorage.removeItem('themeTextColor');
              document.documentElement.style.removeProperty('--custom-text-color');
              toast.success('UI theme reset to readable defaults.');
            }}
            className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer bg-[var(--input-bg)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
          >
            <RotateCcw size={14} />
            <span>Reset Colors to Defaults</span>
          </button>

          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event('nexusflow-theme-applied'));
              toast.success('Theme applied across the entire application.');
            }}
            className="liquid-glass-button px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-[0.97]"
          >
            <Sparkles size={15} />
            <span>✨ Apply Theme to Application</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderActiveTabContent = () => {
    switch (activeDrawerTab) {
      case 'shop': return shopDetailsPanel;
      case 'theme': return uiThemePanel;
      case 'workspace': return workspaceProfilePanel;
      case 'gst': return gstSettingsPanel;
      case 'loyalty': return loyaltySettingsPanel;
      case 'printer': return printerSettingsPanel;
      case 'password': return changePasswordPanel;
      case 'owners': return ownerManagementPanel;
      case 'database': return dataManagementPanel;
      case 'shifts': return shiftRecordsPanel;
      case 'products': return productsManagementPanel;
      case 'restock': return restockManagementPanel;
      case 'inventory': return inventoryLedgerPanel;
      case 'batches': return pharmacyBatchesPanel;
      case 'restaurant_tables': return restaurantTablesPanel;
      case 'diagnostics': return soundDiagnosticsPanel;
      default: return shopDetailsPanel;
    }
  };

  // Render centered modal if isModal is true
  if (isModal) {
    const rawTabs = [
      { id: 'shop', label: 'Shop Details', icon: <Store size={18} /> },
      { id: 'theme', label: 'UI Theme & Custom Colors', icon: <Palette size={18} /> },
      { id: 'workspace', label: 'Workspace Profile', icon: <Settings size={18} /> },
      { id: 'gst', label: 'GST & Tax Settings', icon: <Database size={18} /> },
      { id: 'loyalty', label: 'Loyalty Program', icon: <Crown size={18} /> },
      { id: 'printer', label: 'Printer & Drawer', icon: <Printer size={18} /> },
      { id: 'password', label: 'Change Password', icon: <Lock size={18} /> },
      { id: 'owners', label: 'Co-Owner Accounts', icon: <UsersIcon size={18} /> },
      { id: 'database', label: 'Data Management', icon: <Database size={18} /> },
      { id: 'products', label: 'Product Inventory', icon: <Package size={18} /> },
      { id: 'restaurant_tables', label: 'Dining Tables Settings', icon: <Store size={18} /> },
      { id: 'inventory', label: 'Warehouses & Ledgers', icon: <Database size={18} /> },
      { id: 'batches', label: 'Pharmacy Batches', icon: <Package size={18} /> },
      { id: 'restock', label: 'Restock PO Generator', icon: <Plus size={18} /> },
      { id: 'shifts', label: 'Shift Audit Z-Reports', icon: <Clock size={18} /> },
      { id: 'diagnostics', label: 'Sound & Diagnostics', icon: <Shield size={18} /> },
    ];

    const tabs = rawTabs.filter(tab => {
      if (multiSectorEnabled) return true;
      if (tab.id === 'shop' || tab.id === 'theme' || tab.id === 'workspace' || tab.id === 'password' || tab.id === 'owners' || tab.id === 'database' || tab.id === 'diagnostics') {
        return true;
      }
      
      if (activeSector === 'pharmacy') {
        // Show warehouses & batches, hide restock PO generator, tables, shift logs
        if (tab.id === 'restock' || tab.id === 'shifts' || tab.id === 'restaurant_tables') return false;
        return true;
      }
      if (activeSector === 'restaurant') {
        // Show shifts & printer, hide warehouses, PO generator, batches, gst, loyalty
        if (tab.id === 'batches' || tab.id === 'inventory' || tab.id === 'restock' || tab.id === 'gst' || tab.id === 'loyalty') return false;
        return true;
      }
      if (activeSector === 'wholesale') {
        // Show warehouses, PO generator, gst, hide batches, loyalty, shifts
        if (tab.id === 'batches' || tab.id === 'shifts' || tab.id === 'restaurant_tables') return false;
        return true;
      }
      if (activeSector === 'retail') {
        // Show everything except pharmacy batches
        if (tab.id === 'batches' || tab.id === 'restaurant_tables') return false;
        return true;
      }
      return true;
    });

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xl backdrop-saturate-200 z-50 flex flex-col p-0 animate-fade-in">
        <div 
          onPointerMove={updatePointerGlare}
          className="group relative w-full h-full rounded-none bg-[var(--bg-glass)] text-[var(--text-primary)] backdrop-blur-2xl backdrop-saturate-200 border-0 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),inset_0_-1px_1px_rgba(0,0,0,0.08),var(--shadow-glass)] flex flex-col z-50 overflow-hidden"
        >
          <SpecularGlareOverlay />

          {/* Header */}
          <div className="p-4 md:p-5 border-b border-[var(--border-glass)] bg-[var(--input-bg)] flex justify-between items-center shrink-0 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6)] relative z-10">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-[var(--text-primary)]">System Settings</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Configure parameters for your offline LAN NexusFlow (Owner Mode)</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-xl transition-all cursor-pointer text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] active:scale-[0.97]"
            >
              <X size={22} />
            </button>
          </div>

          {/* Mobile Horizontal Tabs Header */}
          <div className="md:hidden flex overflow-x-auto border-b border-[var(--border-glass)] glass-panel p-2 space-x-2 no-scrollbar shrink-0 relative z-10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveDrawerTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-all active:scale-[0.97] ${
                  activeDrawerTab === tab.id
                    ? 'glass-btn glass-btn-selected'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 flex overflow-hidden relative z-10">
            {/* Desktop Sidebar */}
            <div className="hidden md:flex w-64 border-r border-[var(--border-glass)] glass-panel p-4 space-y-1 flex-col overflow-y-auto shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveDrawerTab(tab.id as any)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer active:scale-[0.97] ${
                    activeDrawerTab === tab.id
                      ? 'glass-btn glass-btn-selected'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[var(--background)]">
              <div className="max-w-4xl mx-auto space-y-6">
                {renderActiveTabContent()}
              </div>
            </div>
          </div>
          
          {/* Add Co-Owner Modal rendered at the top level of the drawer */}
          {showAddOwnerModal && addOwnerModalMarkup}
          {addEditProductModal}
          {addWarehouseModalMarkup}
          {addTransferModalMarkup}
          {addAdjustModalMarkup}
          {addBatchModalMarkup}
          
          {showSettingsCameraScanner && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xl backdrop-saturate-200 z-[70] flex flex-col items-center justify-center p-4">
              <div 
                onPointerMove={updatePointerGlare}
                className="group relative w-full max-w-sm bg-[var(--card-bg)] border border-[var(--border-glass)] rounded-2xl p-5 text-[var(--text-primary)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] flex flex-col items-center overflow-hidden"
              >
                <SpecularGlareOverlay />
                <div className="relative z-10 w-full flex flex-col items-center">
                  <h4 className="font-bold text-sm tracking-tight text-center mb-4 flex items-center gap-2 text-[var(--text-primary)]">
                    <span>📷</span> Position Barcode In Camera Window
                  </h4>
                  
                  <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-black border-2 border-[var(--border-glass)] flex items-center justify-center mb-4">
                    <video
                      ref={settingsVideoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse" />
                </div>

                {settingsCameraError && (
                  <p className="text-xs text-rose-500 text-center font-medium mb-4">{settingsCameraError}</p>
                )}

                <button
                  type="button"
                  onClick={stopSettingsCameraScan}
                  className="w-full py-2 glass-btn glass-btn-danger text-xs font-bold rounded-xl transition-all active:scale-[0.97]"
                >
                  Cancel Scan
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    );
  }

  // Full-page return statement (fallback)
  return (
    <div className="p-8 bg-[var(--background)] text-[var(--text-primary)] min-h-screen">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-2">
          System Settings
        </h1>
        <p className="text-[var(--text-secondary)]">
          Configure your NexusFlow system (Owner/Co-Owner Access Only)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {shopDetailsPanel}
        {gstSettingsPanel}
        {loyaltySettingsPanel}
        {changePasswordPanel}
        {printerSettingsPanel}
        {ownerManagementPanel}
        {dataManagementPanel}
        {shiftRecordsPanel}
        {soundDiagnosticsPanel}
      </div>

      {showAddOwnerModal && addOwnerModalMarkup}
      {addEditProductModal}
      {addWarehouseModalMarkup}
      {addTransferModalMarkup}
      {addAdjustModalMarkup}
      {addBatchModalMarkup}
      {confirmDialog}
    </div>
  );
}
