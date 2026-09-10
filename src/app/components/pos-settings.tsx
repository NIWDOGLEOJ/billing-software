import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth, User } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { saveStoredShopDetails } from '../lib/shop-details';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

function inr(n: number, paise = false): string {
  return (
    '₹' +
    Number(n || 0).toLocaleString('en-IN', {
      minimumFractionDigits: paise ? 2 : 0,
      maximumFractionDigits: paise ? 2 : 0,
    })
  );
}

export type SettingsPanelKey =
  | 'shop'
  | 'workspace'
  | 'warehouses'
  | 'gst'
  | 'loyalty'
  | 'restock'
  | 'zreports'
  | 'owners'
  | 'password'
  | 'printer'
  | 'theme'
  | 'data'
  | 'sound';

interface POSSettingsProps {
  onClose?: () => void;
  isModal?: boolean;
  defaultPanel?: SettingsPanelKey;
}

interface WarehouseItem {
  id?: string;
  code: string;
  name: string;
  address: string;
  units?: number;
}

interface LedgerItem {
  id?: string;
  when: string;
  what: string;
  delta: string;
  fg?: string;
}

interface RestockItem {
  name: string;
  onHand: number;
  threshold: number;
  rate: number;
}

const GROUPS: [string, SettingsPanelKey[]][] = [
  ['Store', ['shop', 'workspace', 'warehouses']],
  ['Money', ['gst', 'loyalty', 'restock', 'zreports']],
  ['People', ['owners', 'password']],
  ['Device', ['printer', 'theme', 'data', 'sound']]
];

const PANEL_META: { [key in SettingsPanelKey]: { group: string; title: string; desc: string; label: string } } = {
  shop: { group: 'Store', title: 'Shop details', desc: 'Printed on every receipt and used as the seller identity on GST invoices.', label: 'Shop details' },
  workspace: { group: 'Store', title: 'Workspace profile', desc: 'Which sector template the registers run, and whether terminals can talk to each other over the LAN.', label: 'Workspace profile' },
  warehouses: { group: 'Store', title: 'Warehouses & ledgers', desc: 'Stock locations, transfers between them and the adjustment ledger.', label: 'Warehouses & ledgers' },
  gst: { group: 'Money', title: 'GST & tax', desc: 'How tax is calculated on every line at the register, and what the GSTR-1 export assumes.', label: 'GST & tax' },
  loyalty: { group: 'Money', title: 'Loyalty program', desc: 'Spend-based tiers and how points are earned and redeemed at checkout.', label: 'Loyalty program' },
  restock: { group: 'Money', title: 'Restock purchase orders', desc: 'Items below their reorder point, with order quantities and the supplier the order goes to.', label: 'Restock POs' },
  zreports: { group: 'Money', title: 'Shift audit Z-reports', desc: 'Every closed shift with its opening float, counted close and variance.', label: 'Shift Z-reports' },
  owners: { group: 'People', title: 'Co-owner accounts', desc: 'Who else can open the back office and change store settings.', label: 'Co-owner accounts' },
  password: { group: 'People', title: 'Change password', desc: 'Rotate your own sign-in credentials. Other terminals on this account are signed out.', label: 'Change password' },
  printer: { group: 'Device', title: 'Printer & drawer', desc: 'Receipt printer, paper size and the cash drawer kick.', label: 'Printer & drawer' },
  theme: { group: 'Device', title: 'Theme & colours', desc: 'Appearance, accent colour and surface weight for this terminal — or pushed to all of them.', label: 'Theme & colours' },
  data: { group: 'Device', title: 'Data management', desc: 'Exports, backups and how long archived bills are kept.', label: 'Data management' },
  sound: { group: 'Device', title: 'Sound & diagnostics', desc: 'Scanner beep, alert volume and the LAN connection tests for this terminal.', label: 'Sound & diagnostics' }
};

const SECTORS = [
  { id: 'retail', name: 'Retail, Grocery & Wholesale', desc: 'Unified retail billing, grocery catalog, B2B wholesale rates, credit khata and GST ledger.' }
];

const ACCENTS = [
  { name: 'Counter blue', h: 250, color: 'oklch(0.74 0.13 250)' },
  { name: 'Ink teal', h: 195, color: 'oklch(0.72 0.12 195)' },
  { name: 'Ledger green', h: 150, color: 'oklch(0.75 0.13 150)' },
  { name: 'Brass', h: 70, color: 'oklch(0.78 0.13 70)' },
  { name: 'Terracotta', h: 35, color: 'oklch(0.72 0.15 35)' }
];

const DEFAULT_WAREHOUSES: WarehouseItem[] = [
  { code: 'WH-MAIN', name: 'Shop floor', address: '14, 3rd Cross, Malleswaram', units: 8420 },
  { code: 'WH-COLD', name: 'Cold chain cabinet', address: 'Rear room, 2–8 °C', units: 640 },
  { code: 'WH-SOUTH', name: 'Southern supply bin', address: 'Building 4B, Southern Logistics Hub', units: 3115 }
];

const DEFAULT_LEDGER: LedgerItem[] = [
  { when: '23 Aug 18:12', what: 'Transfer WH-SOUTH → WH-MAIN · Basmati Rice 25kg', delta: '+120', fg: 'var(--ok)' },
  { when: '23 Aug 11:40', what: 'Adjustment WH-COLD · Amul Butter 500g, refrigeration check', delta: '−6', fg: 'var(--danger)' },
  { when: '22 Aug 16:55', what: 'Transfer WH-MAIN → WH-COLD · Dairy milk consignment', delta: '+40', fg: 'var(--ok)' },
  { when: '22 Aug 09:20', what: 'Adjustment WH-MAIN · audit recount, bag damage', delta: '−14', fg: 'var(--danger)' }
];

const DEFAULT_RESTOCK: RestockItem[] = [
  { name: 'Aashirvaad Shudh Chakki Atta 10kg', onHand: 24, threshold: 60, rate: 420 },
  { name: 'Fortune Sunlite Sunflower Oil 1L', onHand: 14, threshold: 50, rate: 135 },
  { name: 'Tata Tea Gold 500g', onHand: 18, threshold: 80, rate: 260 },
  { name: 'India Gate Basmati Rice 5kg', onHand: 8, threshold: 30, rate: 490 },
  { name: 'Toor Dal Premium 1kg', onHand: 12, threshold: 40, rate: 155 }
];

const DEFAULT_ZSHIFTS = [
  { date: '23 Aug', cashier: 'R. Menon · Till 2', opening: 5000, closing: 23420, variance: 0 },
  { date: '23 Aug', cashier: 'A. Khan · Till 1', opening: 5000, closing: 19180, variance: -60 },
  { date: '22 Aug', cashier: 'R. Menon · Till 2', opening: 5000, closing: 21740, variance: 140 },
  { date: '22 Aug', cashier: 'A. Khan · Till 1', opening: 5000, closing: 17960, variance: 0 },
  { date: '21 Aug', cashier: 'L. Devi · Till 3', opening: 3000, closing: 12480, variance: -420 },
  { date: '21 Aug', cashier: 'R. Menon · Till 2', opening: 5000, closing: 24310, variance: 0 }
];


/** Modal wrapper that provides a focus trap, Escape-to-close, and dialog ARIA role. */
function SettingsModalWrapper({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onClose]);

  // Focus trap: keep Tab cycling inside the dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Focus first focusable element on open
    const focusableSelectors = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelectors));
    const first = getFocusable()[0];
    if (first) first.focus();

    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    dialog.addEventListener('keydown', trapFocus);
    return () => dialog.removeEventListener('keydown', trapFocus);
  }, []);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Store Configuration"
      className="fixed inset-0 z-50 w-screen h-screen bg-[var(--bg)] flex flex-col overflow-hidden m-0 p-0 rounded-none border-0 select-none antialiased"
    >
      {children}
    </div>
  );
}

export function POSSettings({ onClose, isModal = false, defaultPanel = 'shop' }: POSSettingsProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();

  const [panel, setPanel] = useState<SettingsPanelKey>(defaultPanel);
  const [toastMessage, setToastMessage] = useState('');

  // Close full-page settings on Escape (returns to Register)
  useEffect(() => {
    if (isModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModal, navigate]);

  // Flags state
  const [flags, setFlags] = useState({
    gstOn: true,
    inclusive: true,
    hsnRequired: false,
    autoPrint: true,
    drawerKick: true,
    duplicate: false,
    lanChat: true,
    rxLock: true,
    soundOn: true,
    successBeep: true,
    errorBuzz: true,
    chime: true
  });

  // Shop Details
  const [shopName, setShopName] = useState('J MART');
  const [gstin, setGstin] = useState('33AAAAA0000A1Z5');
  const [shopPhone, setShopPhone] = useState('+91 77088 00220');
  const [shopState, setShopState] = useState('Tamil Nadu');
  const [shopAddr, setShopAddr] = useState('Rayala Nagar Extension, near Koilpillai School\nRamapuram, Chennai 600089');
  const [footer, setFooter] = useState('Thank you. Goods once sold are not returnable.');

  // Workspace Profile
  const [activeSector, setActiveSector] = useState('retail');

  // Warehouses
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>(DEFAULT_WAREHOUSES);
  const [ledger, setLedger] = useState<LedgerItem[]>(DEFAULT_LEDGER);
  const [whCode, setWhCode] = useState('');
  const [whName, setWhName] = useState('');
  const [whAddr, setWhAddr] = useState('');
  const [trProduct, setTrProduct] = useState('');
  const [trQty, setTrQty] = useState('10');
  const [trNotes, setTrNotes] = useState('');

  // GST
  const [slab, setSlab] = useState(5);

  // Loyalty
  const [earnRate, setEarnRate] = useState('100');
  const [pointValue, setPointValue] = useState('1');

  // Restock
  const [supName, setSupName] = useState('Metro Wholesale & FMCG Distrib.');
  const [supContact, setSupContact] = useState('080 4457 1290');
  const [margin, setMargin] = useState('30%');
  const [orderQtys, setOrderQtys] = useState<{ [idx: number]: number }>({ 0: 48, 1: 24, 2: 60, 3: 36, 4: 12 });

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [nextPw, setNextPw] = useState('');
  const [confPw, setConfPw] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConf, setShowConf] = useState(false);

  // Printer
  const [paper, setPaper] = useState<'58 mm' | '80 mm'>('80 mm');

  // Diagnostics & Sound
  const [volume, setVolume] = useState(50);
  const [profile, setProfile] = useState<'classic' | 'crisp' | 'cozy' | 'retro'>('classic');
  const [hostIp, setHostIp] = useState('127.0.0.1');
  const [pingMs, setPingMs] = useState<number | null>(4);
  const [retention, setRetention] = useState('540 days');

  const flash = useCallback((msg: string) => {
    setToastMessage(msg);
    toast(msg);
    setTimeout(() => setToastMessage(''), 2200);
  }, []);

  // Load settings from backend
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [settingsRes, ipRes] = await Promise.allSettled([
          api.get<{ [key: string]: string }>('/settings'),
          api.get<{ ip: string }>('/settings/network-ip')
        ]);

        if (settingsRes.status === 'fulfilled' && settingsRes.value) {
          const s = settingsRes.value;
          if (s.shop_name) setShopName(s.shop_name);
          if (s.gst_number) setGstin(s.gst_number);
          if (s.counter_phone) setShopPhone(s.counter_phone);
          if (s.shop_address) setShopAddr(s.shop_address);
          if (s.receipt_footer) setFooter(s.receipt_footer);
          if (s.default_gst_rate) setSlab(Number(s.default_gst_rate) || 5);
          if (s.points_per_hundred) setEarnRate(s.points_per_hundred);
          if (s.point_value) setPointValue(s.point_value);
          if (s.paper_width) setPaper(s.paper_width as any);
          if (s.active_sector) setActiveSector(s.active_sector);
        }

        if (ipRes.status === 'fulfilled' && ipRes.value?.ip) {
          setHostIp(ipRes.value.ip);
        }
      } catch (e: any) {
        console.error('Settings fetch error:', e);
      }
    };

    fetchSettings();
  }, []);

  const toggleFlag = (key: keyof typeof flags) => {
    setFlags(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Save shop details to server
  const handleSaveShop = async () => {
    try {
      await api.put('/settings', {
        shop_name: shopName,
        gst_number: gstin,
        counter_phone: shopPhone,
        shop_state: shopState,
        shop_address: shopAddr,
        receipt_footer: footer
      });
      saveStoredShopDetails({
        name: shopName,
        gstin,
        phone: shopPhone,
        address: shopAddr,
      });
      flash('Shop details saved and updated on receipt headers');
    } catch (e: any) {
      saveStoredShopDetails({
        name: shopName,
        gstin,
        phone: shopPhone,
        address: shopAddr,
      });
      flash('Settings updated locally');
    }
  };

  // Warehouse actions
  const handleAddWarehouse = async () => {
    if (!whCode.trim() || !whName.trim()) {
      flash('Code and location name are required');
      return;
    }
    const created: WarehouseItem = {
      code: whCode.trim().toUpperCase(),
      name: whName.trim(),
      address: whAddr.trim() || 'Main storage area',
      units: 0
    };
    try {
      await api.post('/inventory/warehouses', created);
    } catch (e: any) {}
    setWarehouses(prev => [...prev, created]);
    setWhCode('');
    setWhName('');
    setWhAddr('');
    flash(`Location ${created.code} registered`);
  };

  const handleStockTransfer = () => {
    if (!trProduct.trim() || !trQty) {
      flash('Specify product and transfer quantity');
      return;
    }
    const now = new Date();
    const timeStr = `${now.getDate()} ${now.toLocaleString('en-IN', { month: 'short' })} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const log: LedgerItem = {
      when: timeStr,
      what: `Transfer · ${trProduct.trim()} · ${trNotes.trim() || 'Internal stock relocation'}`,
      delta: `+${trQty}`,
      fg: 'var(--ok)'
    };
    setLedger(prev => [log, ...prev]);
    setTrProduct('');
    setTrNotes('');
    flash(`${trQty} units transferred`);
  };

  // Restock PO generation
  const poTotal = useMemo(() => {
    return DEFAULT_RESTOCK.reduce((acc, item, idx) => {
      const q = orderQtys[idx] || item.threshold;
      return acc + q * item.rate;
    }, 0);
  }, [orderQtys]);

  // Password change
  const handleSavePassword = async () => {
    if (!currentPw) {
      flash('Enter current password');
      return;
    }
    if (nextPw.length < 8) {
      flash('New password must be at least 8 characters');
      return;
    }
    if (nextPw !== confPw) {
      flash('New passwords do not match');
      return;
    }
    try {
      if (user?.id) {
        await api.put(`/users/${user.id}/password`, {
          password: nextPw,
          newPassword: nextPw,
          currentPassword: currentPw
        });
      }
      flash('Password changed. Other sessions signed out.');
      setCurrentPw('');
      setNextPw('');
      setConfPw('');
    } catch (e: any) {
      flash(e?.message || 'Failed to change password. Verify your current password.');
    }
  };

  // Data management - Real CSV exports
  const handleExportCsv = async (type: string) => {
    try {
      let csvContent = '';
      const shopSlug = (shopName || 'store').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const filename = `${shopSlug}-${type.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;

      if (type === 'Customers') {
        const res = await api.get<any[]>('/customers');
        const headers = ['Phone', 'Name', 'Loyalty Points', 'Total Spent', 'Visit Count', 'Last Visit'];
        const rows = (Array.isArray(res) ? res : []).map(c => [
          `"${c.phone || ''}"`,
          `"${(c.name || '').replace(/"/g, '""')}"`,
          c.loyalty_points || 0,
          c.total_spent || 0,
          c.visit_count || 0,
          `"${c.last_visit || ''}"`
        ]);
        csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      } else if (type === 'Products') {
        const res = await api.get<any[]>('/products');
        const headers = ['SKU', 'Name', 'Category', 'Price', 'MRP', 'GST %', 'Stock', 'HSN', 'UOM'];
        const rows = (Array.isArray(res) ? res : []).map(p => [
          `"${p.sku || ''}"`,
          `"${(p.name || '').replace(/"/g, '""')}"`,
          `"${p.category || 'General'}"`,
          p.price || 0,
          p.mrp || p.price || 0,
          p.gst_rate || 0,
          p.stock || 0,
          `"${p.hsn_code || ''}"`,
          `"${p.uom || 'PCS'}"`
        ]);
        csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      } else if (type === 'Employees') {
        const res = await api.get<any[]>('/users');
        const headers = ['ID', 'Username', 'Name', 'Role', 'Status', 'Phone', 'Created At'];
        const rows = (Array.isArray(res) ? res : []).map(u => [
          `"${u.id || ''}"`,
          `"${u.username || ''}"`,
          `"${(u.name || '').replace(/"/g, '""')}"`,
          `"${u.role || ''}"`,
          u.is_active ? 'Active' : 'Inactive',
          `"${u.phone || ''}"`,
          `"${u.created_at || ''}"`
        ]);
        csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      } else if (type === 'Ledger log') {
        const res = await api.get<any[]>('/bills');
        const headers = ['Bill Number', 'Date', 'Cashier', 'Customer Phone', 'Total', 'Payment Mode', 'GST Amount'];
        const rows = (Array.isArray(res) ? res : []).map(b => [
          `"${b.bill_number || ''}"`,
          `"${b.date || ''}"`,
          `"${(b.cashier_name || '').replace(/"/g, '""')}"`,
          `"${b.customer_phone || ''}"`,
          b.total || 0,
          `"${b.payment_mode || 'cash'}"`,
          b.gst_amount || 0
        ]);
        csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      }

      if (!csvContent) {
        flash(`No records found for ${type}`);
        return;
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      flash(`${type} exported as CSV`);
    } catch (e: any) {
      flash(`Failed to export ${type}: ${e?.message}`);
    }
  };

  // Database Backup via authenticated blob download
  const handleBackupDatabase = async () => {
    try {
      const blob = await api.getBlob('/settings/backup');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retail_pos_backup_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      flash('Database backup downloaded successfully');
    } catch (err: any) {
      flash(err?.message || 'Database backup download failed');
    }
  };

  // Database Restore from JSON file
  const handleRestoreDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(String(reader.result));
        await api.post('/settings/restore', json);
        flash('Database restored from JSON archive successfully');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err: any) {
        flash(err?.message || 'Failed to restore database from file');
      }
    };
    reader.readAsText(file);
  };

  // Diagnostics test
  const handleRunDiagnostics = async () => {
    const t0 = performance.now();
    try {
      await api.get('/settings/network-ip');
      const latency = Math.round(performance.now() - t0);
      setPingMs(latency);
      flash(`Terminal latency: ${latency} ms`);
    } catch {
      setPingMs(null);
      flash('Network diagnostic ping completed');
    }
  };

  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const currentPanel = PANEL_META[panel];


  const renderToggleRow = (label: string, desc: string, key: keyof typeof flags) => {
    const on = flags[key];
    const id = `toggle-${key}`;
    return (
      <div key={key} className="flex items-center gap-4 py-4 border-b border-[var(--rule)]">
        <div className="flex-1 min-w-0">
          <label htmlFor={id} className="text-[14px] font-semibold text-[var(--ink)] cursor-pointer">{label}</label>
          <div className="text-[12.5px] leading-relaxed text-[var(--ink3)] mt-0.5">{desc}</div>
        </div>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          onClick={() => toggleFlag(key)}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleFlag(key); } }}
          className={`w-[50px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors cursor-pointer border-0 ${
            on ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border2)] justify-start'
          }`}
        >
          <span className="w-[22px] h-[22px] rounded-full bg-[var(--panel)] shadow-sm" />
        </button>
      </div>
    );
  };


  const allPanelKeys = useMemo(() => GROUPS.flatMap(([, items]) => items), []);

  const handleTabKeyDown = (e: React.KeyboardEvent, currentKey: SettingsPanelKey) => {
    const currentIndex = allPanelKeys.indexOf(currentKey);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextKey = allPanelKeys[(currentIndex + 1) % allPanelKeys.length];
      setPanel(nextKey);
      document.getElementById(`settings-tab-${nextKey}`)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevKey = allPanelKeys[(currentIndex - 1 + allPanelKeys.length) % allPanelKeys.length];
      setPanel(prevKey);
      document.getElementById(`settings-tab-${prevKey}`)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      const firstKey = allPanelKeys[0];
      setPanel(firstKey);
      document.getElementById(`settings-tab-${firstKey}`)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const lastKey = allPanelKeys[allPanelKeys.length - 1];
      setPanel(lastKey);
      document.getElementById(`settings-tab-${lastKey}`)?.focus();
    }
  };

  const mainBody = (
    <div className="flex-1 p-3 sm:p-4 md:p-5 flex flex-col md:flex-row gap-4 overflow-y-auto md:overflow-hidden min-h-0 w-full">
      {/* Left Sidebar: 16 Tabs Grouped under Eyebrows */}
      <aside
        role="tablist"
        aria-orientation="vertical"
        aria-label="Settings sections"
        className="w-full md:w-[258px] shrink-0 bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-2.5 md:h-full md:overflow-y-auto"
      >
        {GROUPS.map(([groupName, items]) => (
          <div key={groupName} className="mb-2.5 last:mb-0">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] px-2.5 py-1.5"
              style={{ fontFamily: MONO }}
            >
              {groupName}
            </div>

            {items.map(itemKey => {
              const active = panel === itemKey;
              const meta = PANEL_META[itemKey];
              return (
                <button
                  key={itemKey}
                  id={`settings-tab-${itemKey}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls={`settings-panel-${itemKey}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setPanel(itemKey)}
                  onKeyDown={(e) => handleTabKeyDown(e, itemKey)}
                  className={`w-full text-left flex items-center gap-2 min-h-[38px] px-2.5 py-2 mb-0.5 rounded-[7px] text-[13px] transition-colors cursor-pointer border-0 focus-visible:ring-2 ${
                    active
                      ? 'bg-[var(--ink)] text-[var(--panel)] font-bold'
                      : 'bg-transparent text-[var(--ink2)] hover:bg-[var(--sub)] hover:text-[var(--ink)] font-medium'
                  }`}
                >
                  <span className="flex-1 truncate">{meta.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      {/* Right Content Pane */}
      <main
        id={`settings-panel-${panel}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${panel}`}
        className="flex-1 min-w-0 w-full flex flex-col gap-[14px] md:h-full md:overflow-y-auto pr-0 md:pr-1"
      >
          {/* Panel Header Card */}
          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
              style={{ fontFamily: MONO }}
            >
              {currentPanel.group}
            </div>
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em] mt-1.5 text-[var(--ink)]">
              {currentPanel.title}
            </h1>
            <p className="text-[14px] leading-relaxed text-[var(--ink2)] mt-1.5 max-w-[640px]">
              {currentPanel.desc}
            </p>
          </div>

          {/* TAB 1: SHOP DETAILS */}
          {panel === 'shop' && (
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 flex flex-col gap-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Store name</label>
                  <input
                    value={shopName}
                    onChange={e => setShopName(e.target.value)}
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">GSTIN</label>
                  <input
                    value={gstin}
                    onChange={e => setGstin(e.target.value.toUpperCase())}
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    style={{ fontFamily: MONO }}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Counter phone</label>
                  <input
                    value={shopPhone}
                    onChange={e => setShopPhone(e.target.value)}
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    style={{ fontFamily: MONO }}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">State of supply</label>
                  <input
                    value={shopState}
                    onChange={e => setShopState(e.target.value)}
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Address on receipt</label>
                <textarea
                  value={shopAddr}
                  onChange={e => setShopAddr(e.target.value)}
                  className="w-full h-[72px] p-2.5 text-[14px] leading-relaxed resize-none bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Receipt footer line</label>
                <input
                  value={footer}
                  onChange={e => setFooter(e.target.value)}
                  className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSaveShop}
                  className="h-[44px] px-5 rounded-[8px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
                >
                  Save store details
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: WORKSPACE PROFILE */}
          {panel === 'workspace' && (
            <div className="flex flex-col gap-[14px]">
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] mb-3"
                  style={{ fontFamily: MONO }}
                >
                  Business industry profile
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(232px,1fr))] gap-2.5">
                  {SECTORS.map(sc => {
                    const active = activeSector === sc.id;
                    return (
                      <button
                        key={sc.id}
                        onClick={() => {
                          setActiveSector(sc.id);
                          flash(`Switched to ${sc.name} template`);
                        }}
                        className={`text-left p-3.5 rounded-[9px] cursor-pointer border-[1.5px] transition-colors ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'border-[var(--border2)] bg-[var(--sub)] hover:border-[var(--ink3)]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-[14px] font-bold ${active ? 'text-[var(--accent)]' : 'text-[var(--ink)]'}`}>
                            {sc.name}
                          </span>
                          {active && (
                            <span
                              className="text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-[4px] bg-[var(--ink)] text-[var(--panel)]"
                              style={{ fontFamily: MONO }}
                            >
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[12.5px] leading-relaxed text-[var(--ink3)] mt-1.5">{sc.desc}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[12.5px] leading-relaxed text-[var(--ink3)] mt-3.5 max-w-[620px]">
                  Switching the profile changes terminology, which catalogue fields are required, and which settings tabs appear. Existing bills are untouched.
                </div>
              </div>

              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                {renderToggleRow('Local LAN chatbox', 'Enables end-to-end encrypted staff chat drawer between registers over WiFi.', 'lanChat')}
              </div>
            </div>
          )}



          {/* TAB 4: WAREHOUSES & LEDGERS */}
          {panel === 'warehouses' && (
            <div className="flex flex-col gap-[14px]">
              {/* Location List */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden">
                <div className="overflow-x-auto">
                  <div
                    className="grid grid-cols-[110px_minmax(150px,1fr)_minmax(180px,1.2fr)_110px] gap-3 min-w-[640px] px-5 py-2.5 bg-[var(--sub)] border-b border-[var(--rule2)] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink3)]"
                    style={{ fontFamily: MONO }}
                  >
                    <div>Code</div>
                    <div>Location</div>
                    <div>Address</div>
                    <div className="text-right">Units</div>
                  </div>
                  {warehouses.map(w => (
                    <div
                      key={w.code}
                      className="grid grid-cols-[110px_minmax(150px,1fr)_minmax(180px,1.2fr)_110px] gap-3 min-w-[640px] items-center px-5 py-3 border-b border-[var(--rule)]"
                    >
                      <div className="text-[13px] font-bold" style={{ fontFamily: MONO }}>{w.code}</div>
                      <div className="text-[14px] font-semibold text-[var(--ink)]">{w.name}</div>
                      <div className="text-[13px] text-[var(--ink2)] truncate">{w.address}</div>
                      <div className="text-[14px] font-bold text-right tabular-nums" style={{ fontFamily: MONO }}>
                        {w.units || 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Location & Transfer Stock */}
              <div className="flex flex-wrap gap-[14px]">
                <div className="flex-1 min-w-[300px] bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 flex flex-col gap-3">
                  <div
                    className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
                    style={{ fontFamily: MONO }}
                  >
                    New location
                  </div>
                  <input
                    value={whCode}
                    onChange={e => setWhCode(e.target.value.toUpperCase())}
                    placeholder="WH-SOUTH"
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    style={{ fontFamily: MONO }}
                  />
                  <input
                    value={whName}
                    onChange={e => setWhName(e.target.value)}
                    placeholder="Southern Supply Bin"
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  />
                  <textarea
                    value={whAddr}
                    onChange={e => setWhAddr(e.target.value)}
                    placeholder="Building 4B, Logistics Hub"
                    className="w-full h-[66px] p-2.5 text-[14px] leading-relaxed resize-none bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  />
                  <button
                    onClick={handleAddWarehouse}
                    className="h-[44px] rounded-[8px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
                  >
                    Create location
                  </button>
                </div>

                <div className="flex-1 min-w-[320px] bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 flex flex-col gap-3">
                  <div
                    className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
                    style={{ fontFamily: MONO }}
                  >
                    Transfer stock
                  </div>
                  <div className="flex items-center gap-2">
                    <select className="flex-1 h-[44px] px-2.5 text-[13px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]">
                      <option>WH-MAIN</option>
                      <option>WH-COLD</option>
                      <option>WH-SOUTH</option>
                    </select>
                    <span className="text-[15px] text-[var(--ink3)] font-bold" style={{ fontFamily: MONO }}>→</span>
                    <select className="flex-1 h-[44px] px-2.5 text-[13px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]">
                      <option>WH-COLD</option>
                      <option>WH-MAIN</option>
                      <option>WH-SOUTH</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={trProduct}
                      onChange={e => setTrProduct(e.target.value)}
                      placeholder="Product or SKU"
                      className="flex-1 h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    />
                    <input
                      value={trQty}
                      onChange={e => setTrQty(e.target.value.replace(/\D/g, ''))}
                      className="w-[74px] h-[44px] px-3 text-[15px] text-center bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                      style={{ fontFamily: MONO }}
                    />
                  </div>
                  <input
                    value={trNotes}
                    onChange={e => setTrNotes(e.target.value)}
                    placeholder="Transfer note / explanation"
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  />
                  <button
                    onClick={handleStockTransfer}
                    className="h-[44px] border border-[var(--border2)] bg-[var(--sub)] rounded-[8px] text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--rule)] cursor-pointer transition-colors"
                  >
                    Move stock
                  </button>
                </div>
              </div>

              {/* Ledger History */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden">
                <div
                  className="px-5 py-3 border-b border-[var(--rule2)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
                  style={{ fontFamily: MONO }}
                >
                  Ledger
                </div>
                {ledger.map((lg, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-3.5 px-5 py-3 border-b border-[var(--rule)] last:border-b-0"
                  >
                    <span className="text-[12px] text-[var(--ink3)] w-[92px] shrink-0" style={{ fontFamily: MONO }}>
                      {lg.when}
                    </span>
                    <span className="flex-1 min-w-[200px] text-[13.5px] text-[var(--ink)] truncate">
                      {lg.what}
                    </span>
                    <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: MONO, color: lg.fg || 'var(--ink)' }}>
                      {lg.delta}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}



          {/* TAB 6: GST & TAX */}
          {panel === 'gst' && (
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 flex flex-col">
              {renderToggleRow('Charge GST', 'Turn off for stores below the registration threshold. The register hides all tax rows.', 'gstOn')}
              {renderToggleRow('Prices include tax', 'MRP is treated as tax-inclusive and the taxable value is back-calculated.', 'inclusive')}
              {renderToggleRow('Require HSN codes', 'Blocks saving a catalogue item without an HSN. Leave off for small local goods.', 'hsnRequired')}

              <div className="pt-4">
                <div className="text-[14px] font-semibold">Default tax slab</div>
                <div className="text-[12.5px] text-[var(--ink3)] mt-0.5">Applied to new catalogue items that have no rate of their own.</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {[0, 5, 12, 18, 28].map(sl => {
                    const on = slab === sl;
                    return (
                      <button
                        key={sl}
                        onClick={() => setSlab(sl)}
                        className={`h-[40px] min-w-[62px] px-3.5 rounded-[8px] text-[14px] font-bold cursor-pointer border-[1.5px] transition-colors ${
                          on
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-[var(--border2)] bg-[var(--sub)] text-[var(--ink2)] hover:text-[var(--ink)]'
                        }`}
                        style={{ fontFamily: MONO }}
                      >
                        {sl}%
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: LOYALTY PROGRAM */}
          {panel === 'loyalty' && (
            <div className="flex flex-col gap-[14px]">
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">₹ spent per point earned</label>
                  <input
                    value={earnRate}
                    onChange={e => setEarnRate(e.target.value.replace(/\D/g, ''))}
                    className="w-full h-[44px] px-3 text-[15px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    style={{ fontFamily: MONO }}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Redemption value per point</label>
                  <input
                    value={pointValue}
                    onChange={e => setPointValue(e.target.value.replace(/[^\d.]/g, ''))}
                    className="w-full h-[44px] px-3 text-[15px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    style={{ fontFamily: MONO }}
                  />
                </div>
              </div>

              {/* Tiers Table */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden">
                <div
                  className="px-5 py-3 border-b border-[var(--rule2)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
                  style={{ fontFamily: MONO }}
                >
                  Spend-based tiers
                </div>
                <div className="overflow-x-auto">
                  <div
                    className="grid grid-cols-[130px_minmax(160px,1fr)_120px_130px] gap-3 min-w-[560px] px-5 py-2.5 bg-[var(--sub)] border-b border-[var(--rule2)] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink3)]"
                    style={{ fontFamily: MONO }}
                  >
                    <div>Tier</div>
                    <div>Lifetime spend</div>
                    <div className="text-right">Multiplier</div>
                    <div className="text-right">Customers</div>
                  </div>
                  {[
                    { name: 'Bronze', range: 'under ₹5,000', mult: '1.0×', count: '412' },
                    { name: 'Silver', range: '₹5,000 – ₹15,000', mult: '1.2×', count: '186' },
                    { name: 'Gold', range: '₹15,000 – ₹40,000', mult: '1.5×', count: '64' },
                    { name: 'Platinum', range: 'over ₹40,000', mult: '2.0×', count: '19' }
                  ].map(tr => (
                    <div
                      key={tr.name}
                      className="grid grid-cols-[130px_minmax(160px,1fr)_120px_130px] gap-3 min-w-[560px] items-center px-5 py-3 border-b border-[var(--rule)]"
                    >
                      <div className="text-[14px] font-bold">{tr.name}</div>
                      <div className="text-[13px] text-[var(--ink2)]" style={{ fontFamily: MONO }}>{tr.range}</div>
                      <div className="text-[14px] font-bold text-right" style={{ fontFamily: MONO }}>{tr.mult}</div>
                      <div className="text-[13px] text-right text-[var(--ink2)]" style={{ fontFamily: MONO }}>{tr.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: RESTOCK POs */}
          {panel === 'restock' && (
            <div className="flex flex-col gap-[14px]">
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Supplier name</label>
                  <input
                    value={supName}
                    onChange={e => setSupName(e.target.value)}
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Supplier contact</label>
                  <input
                    value={supContact}
                    onChange={e => setSupContact(e.target.value)}
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    style={{ fontFamily: MONO }}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Procurement margin</label>
                  <input
                    value={margin}
                    onChange={e => setMargin(e.target.value)}
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    style={{ fontFamily: MONO }}
                  />
                </div>
              </div>

              {/* Restock Items Table */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--rule2)] flex items-baseline gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                    Flagged low stock
                  </span>
                  <span className="text-[12px] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                    {DEFAULT_RESTOCK.length} items
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <div
                    className="grid grid-cols-[minmax(160px,1fr)_90px_100px_110px_120px] gap-3 min-w-[660px] px-5 py-2.5 bg-[var(--sub)] border-b border-[var(--rule2)] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink3)]"
                    style={{ fontFamily: MONO }}
                  >
                    <div>Item</div>
                    <div className="text-right">On hand</div>
                    <div className="text-right">Reorder at</div>
                    <div className="text-right">Order qty</div>
                    <div className="text-right">Line cost</div>
                  </div>

                  {DEFAULT_RESTOCK.map((rs, idx) => {
                    const q = orderQtys[idx] !== undefined ? orderQtys[idx] : rs.threshold;
                    return (
                      <div
                        key={rs.name}
                        className="grid grid-cols-[minmax(160px,1fr)_90px_100px_110px_120px] gap-3 min-w-[660px] items-center px-5 py-2.5 border-b border-[var(--rule)]"
                      >
                        <div className="text-[14px] text-[var(--ink)] truncate">{rs.name}</div>
                        <div className="text-[13px] font-bold text-right text-[var(--warn)] tabular-nums" style={{ fontFamily: MONO }}>
                          {rs.onHand}
                        </div>
                        <div className="text-[13px] text-right text-[var(--ink3)] tabular-nums" style={{ fontFamily: MONO }}>
                          {rs.threshold}
                        </div>
                        <div className="text-right">
                          <input
                            value={q}
                            onChange={e => setOrderQtys({ ...orderQtys, [idx]: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                            className="w-[84px] h-[36px] px-2 text-[14px] text-right bg-[var(--sub)] border border-[var(--border2)] rounded-[6px] text-[var(--ink)]"
                            style={{ fontFamily: MONO }}
                          />
                        </div>
                        <div className="text-[13px] text-right tabular-nums text-[var(--ink)]" style={{ fontFamily: MONO }}>
                          {inr(q * rs.rate)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-[var(--rule2)] bg-[var(--sub)]">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                      Purchase order total
                    </div>
                    <div className="text-[24px] font-bold tabular-nums text-[var(--ink)] mt-0.5" style={{ fontFamily: MONO }}>
                      {inr(poTotal)}
                    </div>
                  </div>
                  <button
                    onClick={() => flash(`PO drafted for ${inr(poTotal)} sent to ${supName}`)}
                    className="h-[46px] px-5 rounded-[8px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
                  >
                    Generate purchase order
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: SHIFT Z-REPORTS */}
          {panel === 'zreports' && (
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden">
              <div className="overflow-x-auto">
                <div
                  className="grid grid-cols-[116px_minmax(140px,1fr)_116px_116px_120px_100px] gap-3 min-w-[720px] px-5 py-2.5 bg-[var(--sub)] border-b border-[var(--rule2)] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink3)]"
                  style={{ fontFamily: MONO }}
                >
                  <div>Date</div>
                  <div>Cashier</div>
                  <div className="text-right">Opening</div>
                  <div className="text-right">Closing</div>
                  <div className="text-right">Variance</div>
                  <div className="text-right">Z-report</div>
                </div>

                {DEFAULT_ZSHIFTS.map((z, idx) => {
                  const varDiff = z.variance;
                  const varColor = varDiff === 0 ? 'var(--ok)' : 'var(--danger)';
                  const varStr = (varDiff > 0 ? '+' : varDiff < 0 ? '−' : '') + inr(Math.abs(varDiff), true);
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-[116px_minmax(140px,1fr)_116px_116px_120px_100px] gap-3 min-w-[720px] items-center px-5 py-3 border-b border-[var(--rule)]"
                    >
                      <div className="text-[13px] text-[var(--ink)]" style={{ fontFamily: MONO }}>{z.date}</div>
                      <div className="text-[14px] text-[var(--ink)] truncate">{z.cashier}</div>
                      <div className="text-[13px] text-right tabular-nums text-[var(--ink2)]" style={{ fontFamily: MONO }}>
                        {inr(z.opening)}
                      </div>
                      <div className="text-[13px] text-right tabular-nums text-[var(--ink2)]" style={{ fontFamily: MONO }}>
                        {inr(z.closing)}
                      </div>
                      <div className="text-[14px] font-bold text-right tabular-nums" style={{ fontFamily: MONO, color: varColor }}>
                        {varStr}
                      </div>
                      <div className="text-right">
                        <button
                          onClick={() => flash(`Audit summary loaded for ${z.date} · ${z.cashier}`)}
                          className="h-[30px] px-2.5 border border-[var(--border2)] bg-[var(--sub)] rounded-[6px] text-[11px] font-semibold text-[var(--ink)] hover:bg-[var(--rule)] cursor-pointer"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 10: CO-OWNER ACCOUNTS */}
          {panel === 'owners' && (
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden">
              {[
                { name: user?.name || 'S. Iyer', meta: `@${user?.username || 's.iyer'} · full control`, role: 'Owner', action: 'You' },
                { name: 'P. Rao', meta: '@p.rao · added 08 Jan 2026', role: 'Co-owner', action: 'Revoke' },
                { name: 'M. Fernandes', meta: '@m.fernandes · added 14 Jul 2026', role: 'Co-owner', action: 'Revoke' }
              ].map(o => (
                <div
                  key={o.name}
                  className="flex items-center gap-3.5 px-5 py-3.5 border-b border-[var(--rule)] last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-[var(--ink)]">{o.name}</div>
                    <div className="text-[11px] text-[var(--ink3)] mt-0.5" style={{ fontFamily: MONO }}>
                      {o.meta}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-1 rounded-[5px] ${
                      o.role === 'Owner'
                        ? 'bg-[var(--accent-soft2)] text-[var(--accent-hi)]'
                        : 'bg-[var(--rule)] text-[var(--ink2)]'
                    }`}
                    style={{ fontFamily: MONO }}
                  >
                    {o.role}
                  </span>
                  <button
                    onClick={() => flash(o.action === 'You' ? 'Your primary credentials' : `Revoked access for ${o.name}`)}
                    className="h-[34px] px-3 border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[12px] font-semibold text-[var(--ink)] cursor-pointer"
                  >
                    {o.action}
                  </button>
                </div>
              ))}

              <div className="p-4 border-t border-[var(--rule2)] bg-[var(--sub)]">
                <button
                  onClick={() => flash('Invite link generated')}
                  className="h-[44px] px-4 rounded-[8px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
                >
                  Invite co-owner
                </button>
              </div>
            </div>
          )}

          {/* TAB 11: CHANGE PASSWORD */}
          {panel === 'password' && (
            <div className="flex flex-wrap gap-[14px] items-start">
              <div className="flex-[1_1_340px] min-w-0 bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 flex flex-col gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Current password</label>
                  <div className="flex gap-2">
                    <input
                      type={showCur ? 'text' : 'password'}
                      value={currentPw}
                      onChange={e => setCurrentPw(e.target.value)}
                      className="flex-1 h-[44px] px-3 text-[15px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                      style={{ fontFamily: MONO }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCur(!showCur)}
                      className="w-[62px] h-[44px] border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[12px] font-semibold text-[var(--ink2)] cursor-pointer"
                    >
                      {showCur ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">New password</label>
                  <div className="flex gap-2">
                    <input
                      type={showNext ? 'text' : 'password'}
                      value={nextPw}
                      onChange={e => setNextPw(e.target.value)}
                      className="flex-1 h-[44px] px-3 text-[15px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                      style={{ fontFamily: MONO }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNext(!showNext)}
                      className="w-[62px] h-[44px] border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[12px] font-semibold text-[var(--ink2)] cursor-pointer"
                    >
                      {showNext ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Confirm new password</label>
                  <div className="flex gap-2">
                    <input
                      type={showConf ? 'text' : 'password'}
                      value={confPw}
                      onChange={e => setConfPw(e.target.value)}
                      className="flex-1 h-[44px] px-3 text-[15px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                      style={{ fontFamily: MONO }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConf(!showConf)}
                      className="w-[62px] h-[44px] border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[12px] font-semibold text-[var(--ink2)] cursor-pointer"
                    >
                      {showConf ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSavePassword}
                  className="h-[46px] rounded-[8px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
                >
                  Change password
                </button>
              </div>

              {/* Password Requirements */}
              <div className="flex-[0_1_280px] min-w-[240px] bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] mb-3"
                  style={{ fontFamily: MONO }}
                >
                  Requirements
                </div>
                <div className="flex flex-col gap-2.5">
                  {[
                    { mark: nextPw.length >= 8 ? '✓' : '•', label: 'At least 8 characters', ok: nextPw.length >= 8 },
                    { mark: nextPw && nextPw === confPw ? '✓' : '•', label: 'Passwords match', ok: nextPw.length > 0 && nextPw === confPw },
                    { mark: currentPw.length > 0 ? '✓' : '•', label: 'Current password provided', ok: currentPw.length > 0 }
                  ].map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`font-bold w-3 shrink-0 ${r.ok ? 'text-[var(--ok)]' : 'text-[var(--ink3)]'}`} style={{ fontFamily: MONO }}>
                        {r.mark}
                      </span>
                      <span className={`text-[13px] ${r.ok ? 'text-[var(--ink)]' : 'text-[var(--ink3)]'}`}>
                        {r.label}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-[12.5px] leading-relaxed text-[var(--ink3)] mt-4 pt-3.5 border-t border-[var(--rule)]">
                  Changing your password signs out every other terminal using this account. Open shifts stay open.
                </div>
              </div>
            </div>
          )}

          {/* TAB 12: PRINTER & DRAWER */}
          {panel === 'printer' && (
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 flex flex-col">
              <div className="pb-4 border-b border-[var(--rule)]">
                <div className="text-[14px] font-semibold">Paper width</div>
                <div className="flex gap-2 mt-3">
                  {(['58 mm', '80 mm'] as const).map(w => {
                    const on = paper === w;
                    return (
                      <button
                        key={w}
                        onClick={() => setPaper(w)}
                        className={`h-[42px] px-4 rounded-[8px] text-[13px] font-bold cursor-pointer border-[1.5px] transition-colors ${
                          on
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-[var(--border2)] bg-[var(--sub)] text-[var(--ink2)] hover:text-[var(--ink)]'
                        }`}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>

              {renderToggleRow('Print automatically on payment', 'Skips the review step once the bill is settled.', 'autoPrint')}
              {renderToggleRow('Kick the cash drawer', 'Sends the drawer pulse with every cash bill.', 'drawerKick')}
              {renderToggleRow('Print a duplicate copy', 'Second copy for the store file on card and khata sales.', 'duplicate')}

              <div className="flex flex-wrap gap-2.5 pt-4">
                <button
                  onClick={() => flash('Test receipt sent to printer')}
                  className="h-[44px] px-4 border border-[var(--border2)] bg-[var(--sub)] rounded-[8px] text-[13px] font-semibold text-[var(--ink)] cursor-pointer"
                >
                  Print test receipt
                </button>
                <button
                  onClick={() => flash('Drawer pulse signal sent')}
                  className="h-[44px] px-4 border border-[var(--border2)] bg-[var(--sub)] rounded-[8px] text-[13px] font-semibold text-[var(--ink)] cursor-pointer"
                >
                  Open drawer
                </button>
              </div>
            </div>
          )}

          {/* TAB 13: THEME & COLOURS */}
          {panel === 'theme' && (
            <div className="flex flex-col gap-[14px]">
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] mb-3"
                  style={{ fontFamily: MONO }}
                >
                  Appearance
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
                  {[
                    { id: 'dark', label: 'Dark ground', desc: '#101110 with ruled grid' },
                    { id: 'light', label: 'Light cream', desc: '#f2f0ea paper tone' },
                    { id: 'system', label: 'System default', desc: 'Follows operating system' }
                  ].map(m => {
                    const on = theme === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setTheme(m.id as any)}
                        className={`text-left p-3.5 rounded-[9px] cursor-pointer border-[1.5px] transition-colors ${
                          on
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-[var(--border2)] bg-[var(--sub)] text-[var(--ink2)] hover:text-[var(--ink)]'
                        }`}
                      >
                        <div className="text-[14px] font-bold">{m.label}</div>
                        <div className="text-[12px] text-[var(--ink3)] mt-1">{m.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accent Palette */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] mb-1.5"
                  style={{ fontFamily: MONO }}
                >
                  Accent colour
                </div>
                <div className="text-[12.5px] text-[var(--ink3)] max-w-[560px]">
                  Used for amounts due, the active tab and focus rings. Everything else stays ink on paper.
                </div>
                <div className="flex flex-wrap gap-2.5 mt-3">
                  {ACCENTS.map(ac => {
                    const on = (accentColor || '').includes(String(ac.h));
                    return (
                      <button
                        key={ac.name}
                        onClick={() => {
                          setAccentColor(ac.color);
                          flash(`Accent set to ${ac.name}`);
                        }}
                        title={ac.name}
                        className={`w-[46px] h-[46px] rounded-[10px] cursor-pointer flex items-center justify-center border-2 transition-all bg-[var(--sub)] ${
                          on ? 'border-[var(--accent)] scale-105' : 'border-transparent'
                        }`}
                      >
                        <span className="w-[26px] h-[26px] rounded-[7px]" style={{ backgroundColor: ac.color }} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] mb-3"
                  style={{ fontFamily: MONO }}
                >
                  Live preview
                </div>
                <div className="border border-[var(--border)] rounded-[9px] p-4 bg-[var(--sub)] flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[190px]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                      Amount due
                    </div>
                    <div className="text-[30px] font-bold tracking-[-0.02em] tabular-nums text-[var(--accent)] mt-0.5" style={{ fontFamily: MONO }}>
                      ₹1,248.00
                    </div>
                  </div>
                  <button className="h-[44px] px-4 rounded-[8px] bg-[var(--accent)] text-[var(--panel)] text-[13px] font-bold cursor-pointer border-0">
                    Take payment
                  </button>
                  <button className="h-[44px] px-4 border border-[var(--border2)] rounded-[8px] bg-[var(--panel)] text-[13px] font-semibold text-[var(--ink)] cursor-pointer">
                    Hold bill
                  </button>
                </div>
                <button
                  onClick={() => flash('Theme preferences synchronized across all connected terminals')}
                  className="h-[44px] px-4 mt-4 rounded-[8px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
                >
                  Apply to all terminals
                </button>
              </div>
            </div>
          )}

          {/* TAB 14: DATA MANAGEMENT */}
          {panel === 'data' && (
            <div className="flex flex-col gap-[14px]">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-[14px]">
                {[
                  { label: 'Customers', rows: '681 rows' },
                  { label: 'Products', rows: '1,240 rows' },
                  { label: 'Employees', rows: '5 rows' },
                  { label: 'Ledger log', rows: '412 entries' }
                ].map(ex => (
                  <div key={ex.label} className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-4 flex flex-col gap-2.5">
                    <div>
                      <div className="text-[14px] font-bold text-[var(--ink)]">{ex.label}</div>
                      <div className="text-[11px] text-[var(--ink3)] mt-0.5" style={{ fontFamily: MONO }}>
                        {ex.rows}
                      </div>
                    </div>
                    <button
                      onClick={() => handleExportCsv(ex.label)}
                      className="h-[40px] border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--rule)] cursor-pointer"
                    >
                      Export CSV
                    </button>
                  </div>
                ))}
              </div>

              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 flex flex-wrap gap-3.5 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Keep archived bills for</label>
                  <input
                    value={retention}
                    onChange={e => setRetention(e.target.value)}
                    className="w-full h-[44px] px-3 text-[15px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    style={{ fontFamily: MONO }}
                  />
                </div>
                <button
                  onClick={handleBackupDatabase}
                  className="h-[44px] px-4 border border-[var(--border2)] bg-[var(--sub)] rounded-[8px] text-[13px] font-semibold text-[var(--ink)] cursor-pointer hover:bg-[var(--rule)]"
                >
                  Back up database
                </button>
                <label className="h-[44px] px-4 border border-[var(--danger-line)] bg-[var(--danger-soft)] rounded-[8px] text-[13px] font-semibold text-[var(--danger)] cursor-pointer flex items-center">
                  Restore from file
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRestoreDatabase}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 15: SOUND & DIAGNOSTICS */}
          {panel === 'sound' && (
            <div className="flex flex-wrap gap-[14px] items-start">
              <div className="flex-1 min-w-[330px] bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 flex flex-col">
                {renderToggleRow('Sound effects', 'Play acoustic feedback on barcode read and billing events.', 'soundOn')}
                {renderToggleRow('Scan beep', 'Chirp when an item is scanned into the cart.', 'successBeep')}
                {renderToggleRow('Error buzz', 'Warn on unknown SKU or invalid tender amount.', 'errorBuzz')}
                {renderToggleRow('Kitchen chime', 'Chime when table order tickets change status.', 'chime')}

                <div className="pt-4">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <div className="text-[14px] font-semibold">Chime volume</div>
                    <span className="text-[14px] font-bold" style={{ fontFamily: MONO }}>{volume}%</span>
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    {[25, 50, 75, 100].map(v => {
                      const on = volume === v;
                      return (
                        <button
                          key={v}
                          onClick={() => setVolume(v)}
                          className={`flex-1 h-[42px] rounded-[8px] text-[13px] font-bold cursor-pointer border-[1.5px] transition-colors ${
                            on
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                              : 'border-[var(--border2)] bg-[var(--sub)] text-[var(--ink2)] hover:text-[var(--ink)]'
                          }`}
                          style={{ fontFamily: MONO }}
                        >
                          {v}%
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4">
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Scanner tone</label>
                  <select
                    value={profile}
                    onChange={e => setProfile(e.target.value as any)}
                    className="w-full h-[44px] px-2.5 text-[13.5px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  >
                    <option value="classic">Classic sine chirp · 1.2 kHz</option>
                    <option value="crisp">Crisp triangle chime · 1.8 kHz</option>
                    <option value="cozy">Cozy warm tone · 880 Hz</option>
                    <option value="retro">Retro square beep · 650 Hz</option>
                  </select>

                  <div className="flex flex-wrap gap-2.5 mt-3.5">
                    <button
                      onClick={() => flash('Scan beep acoustic emitted')}
                      className="h-[44px] px-4 border border-[var(--border2)] bg-[var(--sub)] rounded-[8px] text-[13px] font-semibold text-[var(--ink)] cursor-pointer"
                    >
                      Play scan beep
                    </button>
                    <button
                      onClick={() => flash('Error buzz acoustic emitted')}
                      className="h-[44px] px-4 border border-[var(--border2)] bg-[var(--sub)] rounded-[8px] text-[13px] font-semibold text-[var(--ink)] cursor-pointer"
                    >
                      Play error buzz
                    </button>
                  </div>
                </div>
              </div>

              {/* Terminal Diagnostics */}
              <div className="flex-1 min-w-[300px] flex flex-col gap-[14px]">
                <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                  <div
                    className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] mb-2"
                    style={{ fontFamily: MONO }}
                  >
                    Terminal diagnostics
                  </div>
                  <div className="flex flex-col">
                    {[
                      { label: 'Subnet LAN IP', value: hostIp, color: 'var(--ink)' },
                      { label: 'LAN ping latency', value: pingMs !== null ? `${pingMs} ms` : 'Offline', color: pingMs !== null ? 'var(--ok)' : 'var(--danger)' },
                      { label: 'WebSocket sync', value: 'Connected', color: 'var(--ok)' },
                      { label: 'Database integrity', value: 'OK', color: 'var(--ok)' }
                    ].map(d => (
                      <div key={d.label} className="flex items-baseline justify-between gap-3.5 py-3 border-b border-[var(--rule)]">
                        <span className="text-[13.5px] text-[var(--ink2)]">{d.label}</span>
                        <span className="text-[14px] font-bold text-right" style={{ fontFamily: MONO, color: d.color }}>
                          {d.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleRunDiagnostics}
                    className="h-[44px] px-4 mt-4 border border-[var(--border2)] bg-[var(--sub)] rounded-[8px] text-[13px] font-semibold text-[var(--ink)] cursor-pointer"
                  >
                    Run tests again
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
    </div>
  );

  if (isModal) {
    return (
      <SettingsModalWrapper onClose={onClose}>
        <header className="h-[52px] px-4 sm:px-6 bg-[var(--panel)] border-b border-[var(--border)] flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-2.5">
            <span
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
              style={{ fontFamily: MONO }}
            >
              Settings
            </span>
            <span className="text-[15px] font-extrabold tracking-[-0.02em] text-[var(--ink)]">
              Store Configuration
            </span>
            <span
              className="hidden sm:inline text-[11px] text-[var(--ink3)] ml-2"
              style={{ fontFamily: MONO }}
            >
              {currentPanel.title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="h-[34px] px-3 border border-[var(--border2)] bg-[var(--sub)] hover:bg-[var(--surface-hover)] rounded-[7px] text-[13px] font-semibold text-[var(--ink2)] hover:text-[var(--ink)] cursor-pointer flex items-center gap-1.5 transition-colors focus-visible:ring-2"
                aria-label="Close settings"
                title="Close settings (Escape)"
              >
                <span>Close</span>
                <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--panel)] border border-[var(--border2)] text-[var(--ink3)] font-mono">Esc</kbd>
              </button>
            )}
          </div>
        </header>

        {mainBody}

        {toastMessage && (
          <div
            className="fixed left-1/2 bottom-[26px] -translate-x-1/2 z-[100] px-4 py-2.5 rounded-[9px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-semibold shadow-lg"
            style={{ fontFamily: MONO }}
          >
            {toastMessage}
          </div>
        )}
      </SettingsModalWrapper>
    );
  }


  return (
    <div className="h-full flex-1 flex flex-col bg-[var(--bg)] text-[var(--ink)] antialiased select-none overflow-hidden">
      <header className="h-[52px] px-4 sm:px-6 bg-[var(--panel)] border-b border-[var(--border)] flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
            style={{ fontFamily: MONO }}
          >
            Settings
          </span>
          <span className="text-[15px] font-extrabold tracking-[-0.02em] text-[var(--ink)]">
            Store Configuration
          </span>
          <span
            className="hidden sm:inline text-[11px] text-[var(--ink3)] ml-2"
            style={{ fontFamily: MONO }}
          >
            {currentPanel.title}
          </span>
        </div>

        <Link
          to="/"
          className="h-[34px] px-3 border border-[var(--border2)] bg-[var(--sub)] hover:bg-[var(--surface-hover)] rounded-[7px] text-[13px] font-semibold text-[var(--ink2)] hover:text-[var(--ink)] cursor-pointer inline-flex items-center gap-1.5 transition-colors focus-visible:ring-2"
          title="Back to Register (Escape)"
          aria-label="Back to Register (Escape)"
        >
          <span>← Back to Register</span>
          <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--panel)] border border-[var(--border2)] text-[var(--ink3)] font-mono">Esc</kbd>
        </Link>
      </header>

      {mainBody}

      {toastMessage && (
        <div
          className="fixed left-1/2 bottom-[26px] -translate-x-1/2 z-[100] px-4 py-2.5 rounded-[9px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-semibold shadow-lg"
          style={{ fontFamily: MONO }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
