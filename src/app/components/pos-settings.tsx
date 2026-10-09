import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth, User } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { saveStoredShopDetails } from '../lib/shop-details';
import { useBetaFeatures } from '../lib/beta-features';
import {
  sanitizeWhatsAppPhone,
  formatWhatsAppReceipt,
  generateWhatsAppLink,
  openWhatsAppLink,
  getWhatsAppConnectionStatus,
  connectWhatsAppSession,
  disconnectWhatsAppSession,
  testWhatsAppSending,
} from '../utils/whatsapp';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Send,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Check,
  Mail,
  Server,
  Lock,
  Sparkles,
} from 'lucide-react';
import {
  EmailConfig,
  getEmailConfig,
  saveEmailConfig,
  verifyEmailConnection,
  testEmailSending,
} from '../utils/email';

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
  | 'sound'
  | 'beta'
  | 'whatsapp'
  | 'email';

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
  ['Device', ['printer', 'theme', 'data', 'sound', 'whatsapp', 'email']],
  ['Beta', ['beta']]
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
  sound: { group: 'Device', title: 'Sound & diagnostics', desc: 'Scanner beep, alert volume and the LAN connection tests for this terminal.', label: 'Sound & diagnostics' },
  whatsapp: { group: 'Device', title: 'WhatsApp Web Login', desc: 'Connect shop WhatsApp via Web QR to automatically send digital bills and receipts to customers.', label: 'WhatsApp' },
  email: { group: 'Device', title: 'Email & SMTP Invoices', desc: 'Configure outgoing SMTP mail server to automatically deliver branded digital GST tax invoices and receipts to customers.', label: 'Email / SMTP' },
  beta: { group: 'Beta', title: 'Beta features', desc: 'Enable or disable experimental and modular features across the terminal.', label: 'Beta' }
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
  const {
    gstLedger,
    warehouses: warehousesEnabled,
    loyalty: loyaltyEnabled,
    advancedSmtp,
    gstReturns,
    setFeature,
  } = useBetaFeatures();

  const [panel, setPanel] = useState<SettingsPanelKey>(defaultPanel);
  const [toastMessage, setToastMessage] = useState('');

  // Fallback if current panel gets disabled
  useEffect(() => {
    if (panel === 'warehouses' && !warehousesEnabled) {
      setPanel('shop');
    } else if (panel === 'loyalty' && !loyaltyEnabled) {
      setPanel('gst');
    }
  }, [panel, warehousesEnabled, loyaltyEnabled]);

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

  // WhatsApp settings (Shop Linked Device Web QR & Automated Dispatch)
  const [waEnabled, setWaEnabled] = useState(true);
  const [waAutoPrompt, setWaAutoPrompt] = useState(true);
  const [waStatus, setWaStatus] = useState<'disconnected' | 'connecting' | 'qr_ready' | 'connected'>('disconnected');
  const [waQrDataUrl, setWaQrDataUrl] = useState<string | null>(null);
  const [waConnectedNumber, setWaConnectedNumber] = useState<string | null>(null);
  const [waConnectedName, setWaConnectedName] = useState<string | null>(null);
  const [waConnectedAt, setWaConnectedAt] = useState<string | null>(null);
  const [waLastError, setWaLastError] = useState<string | null>(null);
  const [waLoadingAction, setWaLoadingAction] = useState<string | null>(null);
  const [waTestPhone, setWaTestPhone] = useState('');
  const [waTestResult, setWaTestResult] = useState<{ success: boolean; message: string; sampleLink?: string } | null>(null);

  // Email & SMTP settings (Store Tax Invoices & Digital Receipts)
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    enabled: true,
    autoSend: true,
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    senderName: '',
    senderEmail: '',
    subjectTemplate: 'Tax Invoice #{billNumber} - {shopName}',
  });
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestTarget, setEmailTestTarget] = useState('');
  const [emailVerifyResult, setEmailVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedEmailPreset, setSelectedEmailPreset] = useState<'gmail' | 'outlook' | 'zoho' | 'custom'>('gmail');

  const flash = useCallback((msg: string) => {
    setToastMessage(msg);
    toast(msg);
    setTimeout(() => setToastMessage(''), 2200);
  }, []);

  // Real-time WebSocket listener for WhatsApp Web status changes
  useWebSocket({
    WHATSAPP_STATUS_CHANGED: (data: any) => {
      if (data) {
        setWaStatus(data.status || 'disconnected');
        setWaQrDataUrl(data.qrDataUrl || null);
        setWaConnectedNumber(data.connectedNumber || null);
        setWaConnectedName(data.connectedName || null);
        setWaConnectedAt(data.connectedAt || null);
        setWaLastError(data.lastError || null);
      }
    },
  });

  const fetchWaStatus = useCallback(async () => {
    try {
      const res = await getWhatsAppConnectionStatus();
      if (res) {
        setWaStatus(res.status);
        setWaQrDataUrl(res.qrDataUrl);
        setWaConnectedNumber(res.connectedNumber);
        setWaConnectedName(res.connectedName);
        setWaConnectedAt(res.connectedAt);
        setWaLastError(res.lastError);
        if (res.enabled !== undefined) setWaEnabled(res.enabled);
        if (res.autoPrompt !== undefined) setWaAutoPrompt(res.autoPrompt);
      }
    } catch (e) {
      console.error('Failed to fetch WhatsApp status:', e);
    }
  }, []);

  const fetchEmailConfig = useCallback(async () => {
    try {
      setEmailLoading(true);
      const res = await getEmailConfig();
      if (res) {
        setEmailConfig(res);
        const hostLower = (res.host || '').toLowerCase();
        if (hostLower.includes('gmail')) setSelectedEmailPreset('gmail');
        else if (hostLower.includes('office365') || hostLower.includes('outlook')) setSelectedEmailPreset('outlook');
        else if (hostLower.includes('zoho')) setSelectedEmailPreset('zoho');
        else setSelectedEmailPreset('custom');
      }
    } catch (err: any) {
      console.error('Failed to fetch email settings:', err);
    } finally {
      setEmailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (panel === 'whatsapp') {
      fetchWaStatus();
      // Poll every 1.5s while on WhatsApp panel so QR code renders immediately
      // and phone scan triggers instant transition to connected state
      const interval = setInterval(() => {
        fetchWaStatus();
      }, 1500);
      return () => clearInterval(interval);
    }
    if (panel === 'email') {
      fetchEmailConfig();
    }
  }, [panel, fetchWaStatus, fetchEmailConfig]);

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

          if (s.whatsapp_enabled !== undefined) setWaEnabled(s.whatsapp_enabled !== 'false');
          if (s.whatsapp_auto_prompt !== undefined) setWaAutoPrompt(s.whatsapp_auto_prompt === 'true');
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

  // WhatsApp configuration actions
  const handleSaveWhatsApp = async () => {
    try {
      await api.put('/settings', {
        whatsapp_enabled: String(waEnabled),
        whatsapp_auto_prompt: String(waAutoPrompt),
      });
      flash('WhatsApp receipt settings saved');
    } catch (e: any) {
      flash('Failed to save WhatsApp settings: ' + (e?.message || 'Error'));
    }
  };

  const handleConnectWhatsApp = async (forceNew = false) => {
    try {
      setWaLoadingAction(forceNew ? 'refreshing_qr' : 'connecting');
      const res = await connectWhatsAppSession(forceNew);
      if (res) {
        setWaStatus(res.status);
        setWaQrDataUrl(res.qrDataUrl);
        setWaConnectedNumber(res.connectedNumber);
        setWaConnectedName(res.connectedName);
        setWaConnectedAt(res.connectedAt);
        setWaLastError(res.lastError);
      }
      if (res.status === 'connected') {
        flash('Shop WhatsApp is already connected and active!');
      } else if (res.status === 'qr_ready') {
        flash('Scan the QR code with WhatsApp on the shop phone');
      }
    } catch (err: any) {
      flash('Connection error: ' + (err?.message || 'Failed to start WhatsApp Web'));
    } finally {
      setWaLoadingAction(null);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!window.confirm('Unlink the shop WhatsApp account? Automatic bill dispatch will be disabled until you scan the QR code again.')) {
      return;
    }
    try {
      setWaLoadingAction('disconnecting');
      await disconnectWhatsAppSession();
      setWaStatus('disconnected');
      setWaQrDataUrl(null);
      setWaConnectedNumber(null);
      setWaConnectedName(null);
      setWaConnectedAt(null);
      flash('Shop WhatsApp unlinked successfully');
    } catch (err: any) {
      flash('Failed to disconnect: ' + (err?.message || 'Error'));
    } finally {
      setWaLoadingAction(null);
    }
  };

  const handleTestWhatsApp = async () => {
    const raw = waTestPhone.trim() || '9845012345';
    const clean = sanitizeWhatsAppPhone(raw);
    if (clean.length < 10) {
      flash('Enter a valid 10-digit mobile number');
      return;
    }
    setWaLoadingAction('testing');
    setWaTestResult(null);
    try {
      if (waStatus === 'connected') {
        const res = await testWhatsAppSending(clean);
        if (res && res.success) {
          setWaTestResult({
            success: true,
            message: `Automated test receipt successfully sent to +${res.targetPhone} from Shop WhatsApp (+${res.shopPhone || waConnectedNumber})!`,
          });
          flash('Test bill sent via Shop WhatsApp!');
        } else {
          setWaTestResult({
            success: false,
            message: res?.error || 'Failed to dispatch test bill.',
            sampleLink: res?.fallbackUrl,
          });
          flash(res?.error || 'Test message failed');
        }
      } else {
        const sampleMsg = formatWhatsAppReceipt({
          shopDetails: {
            name: shopName || 'J MART RETAIL',
            address: shopAddr || '123 Main Street, Bangalore',
            phone: shopPhone || '98450 12345',
            gstin: gstin || '29AAAAA1111A1Z1',
          },
          billNumber: 'BILL-1042',
          items: [
            { name: 'Maggi Noodles 70g x4', quantity: 2, price: 58, uom: 'PCS' },
            { name: 'Tata Salt 1kg', quantity: 1, price: 28, uom: 'PKT' },
          ],
          total: 144,
          subtotal: 136.8,
          gstAmount: 7.2,
          customerName: 'Customer',
          customerPhone: raw,
          cashierName: 'Counter Till 1',
          paymentMode: 'Cash',
        });
        const link = generateWhatsAppLink(clean, sampleMsg);
        openWhatsAppLink(link);
        setWaTestResult({
          success: true,
          message: `Shop WhatsApp not paired yet. Opened Click-to-Chat preview for +${clean}. Pair device with QR code above for 100% automatic sending!`,
          sampleLink: link,
        });
        flash('Opened Click-to-Chat fallback preview');
      }
    } catch (err: any) {
      setWaTestResult({
        success: false,
        message: err?.message || 'Error occurred while testing WhatsApp',
      });
      flash(err?.message || 'Test failed');
    } finally {
      setWaLoadingAction(null);
    }
  };

  // Email & SMTP configuration actions
  const applyEmailPreset = (preset: 'gmail' | 'outlook' | 'zoho' | 'custom') => {
    setSelectedEmailPreset(preset);
    if (preset === 'gmail') {
      setEmailConfig(prev => ({
        ...prev,
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
      }));
    } else if (preset === 'outlook') {
      setEmailConfig(prev => ({
        ...prev,
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
      }));
    } else if (preset === 'zoho') {
      setEmailConfig(prev => ({
        ...prev,
        host: 'smtp.zoho.com',
        port: 465,
        secure: true,
      }));
    }
  };

  const getPreparedEmailConfig = useCallback(() => {
    if (!advancedSmtp) {
      return {
        ...emailConfig,
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        pass: emailConfig.pass ? emailConfig.pass.replace(/\s+/g, '') : '',
        senderEmail: emailConfig.senderEmail || emailConfig.user,
      };
    }
    return {
      ...emailConfig,
      pass: (emailConfig.pass && (emailConfig.host || '').includes('gmail'))
        ? emailConfig.pass.replace(/\s+/g, '')
        : emailConfig.pass,
    };
  }, [advancedSmtp, emailConfig]);

  const handleSaveEmail = async () => {
    try {
      setEmailLoading(true);
      const toSave = getPreparedEmailConfig();
      await saveEmailConfig(toSave);
      setEmailConfig(prev => ({
        ...prev,
        ...toSave,
        pass: toSave.pass ? '••••••••' : prev.pass,
        hasPass: Boolean(toSave.pass || prev.hasPass),
      }));
      flash(!advancedSmtp ? 'Store Gmail settings saved' : 'Email & SMTP settings saved');
    } catch (e: any) {
      flash('Failed to save email settings: ' + (e?.message || 'Error'));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    try {
      setEmailVerifying(true);
      setEmailVerifyResult(null);
      const toSave = getPreparedEmailConfig();
      await saveEmailConfig(toSave);
      const res = await verifyEmailConnection();
      setEmailVerifyResult(res);
      if (res.success) {
        flash(!advancedSmtp ? 'Gmail connection verified successfully!' : 'SMTP connection verified successfully!');
      } else {
        flash((!advancedSmtp ? 'Gmail' : 'SMTP') + ' verification failed: ' + res.message);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Verification failed';
      setEmailVerifyResult({ success: false, message: msg });
      flash((!advancedSmtp ? 'Gmail' : 'SMTP') + ' verification error: ' + msg);
    } finally {
      setEmailVerifying(false);
    }
  };

  const handleTestEmail = async () => {
    const target = emailTestTarget.trim() || emailConfig.senderEmail || emailConfig.user;
    if (!target || !target.includes('@')) {
      flash('Enter a valid email address to send the test invoice');
      return;
    }
    setEmailTesting(true);
    setEmailTestResult(null);
    try {
      const toSave = getPreparedEmailConfig();
      await saveEmailConfig(toSave);
      const res = await testEmailSending(target);
      if (res && res.success) {
        setEmailTestResult({
          success: true,
          message: `Test email sent successfully to ${target}! (Message ID: ${res.messageId || 'OK'})`,
        });
        flash(`Test invoice sent to ${target}!`);
      } else {
        setEmailTestResult({
          success: false,
          message: res?.error || 'Failed to dispatch test email',
        });
        flash(res?.error || 'Test email failed');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to dispatch test email';
      setEmailTestResult({ success: false, message: msg });
      flash('Test email error: ' + msg);
    } finally {
      setEmailTesting(false);
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
  const currentPanel = useMemo(() => {
    const p = PANEL_META[panel] || PANEL_META.shop;
    if (panel === 'email') {
      return {
        ...p,
        title: advancedSmtp ? 'Store Email & SMTP Configuration' : 'Store Gmail Setup',
        desc: advancedSmtp
          ? 'Configure your shop\'s outgoing mail server (Gmail, Outlook 365, Zoho Mail, or custom SMTP) to automatically deliver branded digital GST tax invoices and receipts.'
          : 'Connect your store\'s Gmail account to automatically deliver branded digital GST tax invoices and receipts to customers upon bill generation.',
        label: advancedSmtp ? 'Email / SMTP' : 'Email (Gmail)',
      };
    }
    return p;
  }, [panel, advancedSmtp]);


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


  const visibleGroups = useMemo(() => {
    return GROUPS.map(([groupName, items]) => {
      const filtered = items.filter(key => {
        if (key === 'warehouses' && !warehousesEnabled) return false;
        if (key === 'loyalty' && !loyaltyEnabled) return false;
        return true;
      });
      return [groupName, filtered] as [string, SettingsPanelKey[]];
    }).filter(([, items]) => items.length > 0);
  }, [warehousesEnabled, loyaltyEnabled]);

  const allPanelKeys = useMemo(() => visibleGroups.flatMap(([, items]) => items), [visibleGroups]);

  const handleTabKeyDown = (e: React.KeyboardEvent, currentKey: SettingsPanelKey) => {
    if (allPanelKeys.length === 0) return;
    const currentIndex = allPanelKeys.indexOf(currentKey);
    if (currentIndex === -1) return;
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
      {/* Left Sidebar: Tabs Grouped under Eyebrows */}
      <aside
        role="tablist"
        aria-orientation="vertical"
        aria-label="Settings sections"
        className="w-full md:w-[258px] shrink-0 bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-2.5 md:h-full md:overflow-y-auto"
      >
        {visibleGroups.map(([groupName, items]) => (
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
              const tabLabel = itemKey === 'email' ? (advancedSmtp ? 'Email / SMTP' : 'Email (Gmail)') : (meta?.label || itemKey);
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
                  <span className="flex-1 truncate">{tabLabel}</span>
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

          {/* TAB 14: BETA FEATURES */}
          {panel === 'beta' && (
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5 flex flex-col">
              <div className="mb-2 pb-3 border-b border-[var(--rule2)]">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]" style={{ fontFamily: MONO }}>
                  Modular Features &amp; Experiments
                </span>
                <p className="text-[13px] text-[var(--ink2)] mt-1">
                  Enable or disable modular features across your terminal. Settings take effect immediately.
                </p>
              </div>

              {/* Toggle 1: GST Ledger */}
              <div className="flex items-center gap-4 py-4 border-b border-[var(--rule)]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <label className="text-[14px] font-semibold text-[var(--ink)] cursor-pointer">
                      GST ledger
                    </label>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-[4px] ${
                        gstLedger
                          ? 'bg-[var(--ok-soft2)] text-[var(--ok)]'
                          : 'bg-[var(--rule)] text-[var(--ink3)]'
                      }`}
                      style={{ fontFamily: MONO }}
                    >
                      {gstLedger ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="text-[12.5px] leading-relaxed text-[var(--ink3)] mt-0.5">
                    Controls whether the B2B GST ledger screen is accessible from the top navigation bar.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={gstLedger}
                  aria-label="Toggle GST ledger"
                  onClick={() => {
                    const next = !gstLedger;
                    setFeature('gstLedger', next);
                    flash(`GST ledger ${next ? 'enabled' : 'disabled'}`);
                  }}
                  className={`w-[50px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors cursor-pointer border-0 ${
                    gstLedger ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border2)] justify-start'
                  }`}
                >
                  <span className="w-[22px] h-[22px] rounded-full bg-[var(--panel)] shadow-sm" />
                </button>
              </div>

              {/* Toggle 2: Warehouses & Ledgers */}
              <div className="flex items-center gap-4 py-4 border-b border-[var(--rule)]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <label className="text-[14px] font-semibold text-[var(--ink)] cursor-pointer">
                      Warehouses &amp; ledgers (in Settings)
                    </label>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-[4px] ${
                        warehousesEnabled
                          ? 'bg-[var(--ok-soft2)] text-[var(--ok)]'
                          : 'bg-[var(--rule)] text-[var(--ink3)]'
                      }`}
                      style={{ fontFamily: MONO }}
                    >
                      {warehousesEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="text-[12.5px] leading-relaxed text-[var(--ink3)] mt-0.5">
                    Controls whether the Warehouses &amp; ledgers section is shown in Settings under the Store group.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={warehousesEnabled}
                  aria-label="Toggle Warehouses & ledgers"
                  onClick={() => {
                    const next = !warehousesEnabled;
                    setFeature('warehouses', next);
                    flash(`Warehouses & ledgers ${next ? 'enabled' : 'disabled'}`);
                  }}
                  className={`w-[50px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors cursor-pointer border-0 ${
                    warehousesEnabled ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border2)] justify-start'
                  }`}
                >
                  <span className="w-[22px] h-[22px] rounded-full bg-[var(--panel)] shadow-sm" />
                </button>
              </div>

              {/* Toggle 3: Loyalty Program */}
              <div className="flex items-center gap-4 py-4 border-b border-[var(--rule)]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <label className="text-[14px] font-semibold text-[var(--ink)] cursor-pointer">
                      Loyalty program
                    </label>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-[4px] ${
                        loyaltyEnabled
                          ? 'bg-[var(--ok-soft2)] text-[var(--ok)]'
                          : 'bg-[var(--rule)] text-[var(--ink3)]'
                      }`}
                      style={{ fontFamily: MONO }}
                    >
                      {loyaltyEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="text-[12.5px] leading-relaxed text-[var(--ink3)] mt-0.5">
                    Controls whether the Loyalty program settings panel and customer reward tiers are enabled.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={loyaltyEnabled}
                  aria-label="Toggle Loyalty program"
                  onClick={() => {
                    const next = !loyaltyEnabled;
                    setFeature('loyalty', next);
                    flash(`Loyalty program ${next ? 'enabled' : 'disabled'}`);
                  }}
                  className={`w-[50px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors cursor-pointer border-0 ${
                    loyaltyEnabled ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border2)] justify-start'
                  }`}
                >
                  <span className="w-[22px] h-[22px] rounded-full bg-[var(--panel)] shadow-sm" />
                </button>
              </div>

              {/* Toggle 4: Advanced & Custom SMTP Providers */}
              <div className="flex items-center gap-4 py-4 border-b border-[var(--rule)]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <label className="text-[14px] font-semibold text-[var(--ink)] cursor-pointer">
                      Advanced &amp; custom SMTP providers
                    </label>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-[4px] ${
                        advancedSmtp
                          ? 'bg-[var(--ok-soft2)] text-[var(--ok)]'
                          : 'bg-[var(--rule)] text-[var(--ink3)]'
                      }`}
                      style={{ fontFamily: MONO }}
                    >
                      {advancedSmtp ? 'Enabled' : 'Disabled (Gmail Only)'}
                    </span>
                  </div>
                  <div className="text-[12.5px] leading-relaxed text-[var(--ink3)] mt-0.5">
                    Controls whether non-Gmail presets (Outlook 365, Zoho Mail, Custom SMTP hosts, port, and SSL parameters) are unlocked in the Email settings panel.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={advancedSmtp}
                  aria-label="Toggle Advanced SMTP"
                  onClick={() => {
                    const next = !advancedSmtp;
                    setFeature('advancedSmtp', next);
                    flash(`Advanced SMTP providers ${next ? 'enabled' : 'disabled (Gmail only)'}`);
                  }}
                  className={`w-[50px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors cursor-pointer border-0 ${
                    advancedSmtp ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border2)] justify-start'
                  }`}
                >
                  <span className="w-[22px] h-[22px] rounded-full bg-[var(--panel)] shadow-sm" />
                </button>
              </div>

              {/* Toggle 5: GST Returns in Back Office */}
              <div className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <label className="text-[14px] font-semibold text-[var(--ink)] cursor-pointer">
                      GST returns (in Back office)
                    </label>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-[4px] ${
                        gstReturns
                          ? 'bg-[var(--ok-soft2)] text-[var(--ok)]'
                          : 'bg-[var(--rule)] text-[var(--ink3)]'
                      }`}
                      style={{ fontFamily: MONO }}
                    >
                      {gstReturns ? 'Enabled' : 'Disabled'}
                    </span>
                    <span
                      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      style={{ fontFamily: MONO }}
                    >
                      Beta
                    </span>
                  </div>
                  <div className="text-[12.5px] leading-relaxed text-[var(--ink3)] mt-0.5">
                    Controls whether the GSTR-1 outward supplies &amp; HSN tax summary tab is shown in the Back Office dashboard.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={gstReturns}
                  aria-label="Toggle GST returns in Back office"
                  onClick={() => {
                    const next = !gstReturns;
                    setFeature('gstReturns', next);
                    flash(`GST returns in Back office ${next ? 'enabled' : 'disabled'}`);
                  }}
                  className={`w-[50px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors cursor-pointer border-0 ${
                    gstReturns ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border2)] justify-start'
                  }`}
                >
                  <span className="w-[22px] h-[22px] rounded-full bg-[var(--panel)] shadow-sm" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 15: WHATSAPP WEB LOGIN & AUTOMATED DISPATCH */}
          {panel === 'whatsapp' && (
            <div className="flex flex-col gap-5">
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                <div className="mb-4 pb-3 border-b border-[var(--rule2)] flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]" style={{ fontFamily: MONO }}>
                      Customer Channels · Shop Linked Device
                    </span>
                    <h2 className="text-[18px] font-extrabold text-[var(--ink)] mt-0.5">
                      Shop WhatsApp Web QR Connection
                    </h2>
                    <p className="text-[12.5px] text-[var(--ink2)] mt-1">
                      Link your shop phone via WhatsApp Web QR code to automatically send digital tax invoices &amp; receipts to customers upon bill generation.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {waStatus === 'connected' ? (
                      <span
                        className="text-[11px] font-bold uppercase px-3 py-1 rounded-[5px] bg-[var(--ok-soft2)] text-[var(--ok)] border border-[var(--ok-line)] flex items-center gap-1.5"
                        style={{ fontFamily: MONO }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Connected · {waConnectedNumber ? `+${waConnectedNumber}` : 'Shop Phone'}</span>
                      </span>
                    ) : (waStatus === 'qr_ready' || waQrDataUrl) ? (
                      <span
                        className="text-[11px] font-bold uppercase px-3 py-1 rounded-[5px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5"
                        style={{ fontFamily: MONO }}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Scan QR Code to Link</span>
                      </span>
                    ) : waStatus === 'connecting' ? (
                      <span
                        className="text-[11px] font-bold uppercase px-3 py-1 rounded-[5px] bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center gap-1.5"
                        style={{ fontFamily: MONO }}
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Connecting...</span>
                      </span>
                    ) : (
                      <span
                        className="text-[11px] font-bold uppercase px-3 py-1 rounded-[5px] bg-[var(--rule)] text-[var(--ink3)] border border-[var(--border2)] flex items-center gap-1.5"
                        style={{ fontFamily: MONO }}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Offline / Not Paired</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* PAIRING / CONNECTION STATUS CARD */}
                <div className="mb-6">
                  {waStatus === 'connected' ? (
                    <div className="p-5 rounded-[10px] bg-[var(--ok-soft2)] border border-[var(--ok-line)] flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-[var(--ok)] text-white flex items-center justify-center shrink-0 shadow-sm">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[16.5px] font-bold text-[var(--ink)]">
                              Shop WhatsApp Connected &amp; Active
                            </h3>
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--ok)] text-white"
                              style={{ fontFamily: MONO }}
                            >
                              100% Automated Dispatch
                            </span>
                          </div>
                          <p className="text-[13px] text-[var(--ink2)] mt-1">
                            Linked Account: <strong className="font-mono text-[var(--ink)]">+{waConnectedNumber}</strong>
                            {waConnectedName && <span> ({waConnectedName})</span>}
                          </p>
                          <p className="text-[12px] text-[var(--ink3)] mt-1 max-w-xl">
                            Every bill generated in the billing terminal is automatically sent from this phone in the background to the customer&apos;s WhatsApp. No browser popups or manual clicks required.
                          </p>
                          {waConnectedAt && (
                            <p className="text-[11px] text-[var(--ink3)] mt-1 font-mono">
                              Session connected: {new Date(waConnectedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleDisconnectWhatsApp}
                          disabled={waLoadingAction === 'disconnecting'}
                          className="h-[40px] px-4 rounded-[7px] border border-[var(--danger-line2)] bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition-colors text-[13px] font-bold flex items-center gap-2 cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>{waLoadingAction === 'disconnecting' ? 'Unlinking...' : 'Unlink Device'}</span>
                        </button>
                      </div>
                    </div>
                  ) : waQrDataUrl ? (
                    <div className="p-6 rounded-[10px] bg-[var(--sub)] border border-[var(--border2)] flex flex-col md:flex-row items-center gap-8 shadow-sm">
                      {/* QR Code Container */}
                      <div className="flex flex-col items-center gap-3 shrink-0">
                        <div className="p-3.5 bg-white rounded-xl border border-[var(--border)] shadow-md">
                          <img
                            src={waQrDataUrl}
                            alt="WhatsApp Web Login QR Code"
                            className="w-56 h-56 object-contain block"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          <span className="text-[11.5px] font-medium text-[var(--ink2)]">
                            Waiting for phone scan...
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleConnectWhatsApp(true)}
                          disabled={waLoadingAction === 'refreshing_qr'}
                          className="text-xs font-bold text-[var(--accent)] hover:underline flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${waLoadingAction === 'refreshing_qr' ? 'animate-spin' : ''}`} />
                          <span>Refresh QR Code</span>
                        </button>
                      </div>

                      {/* Instructions */}
                      <div className="flex-1 space-y-3.5">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-5 h-5 text-[var(--accent)]" />
                          <h3 className="text-[16px] font-bold text-[var(--ink)]">
                            Pair Shop Phone in 3 Simple Steps:
                          </h3>
                        </div>
                        <ol className="space-y-2.5 text-[13px] text-[var(--ink2)] list-decimal list-inside pl-1 leading-relaxed">
                          <li>
                            Open <strong>WhatsApp</strong> on your shop&apos;s mobile phone.
                          </li>
                          <li>
                            Tap <strong>Settings</strong> (iOS) or <strong>⋮ More options</strong> (Android) &rarr; <strong>Linked devices</strong>.
                          </li>
                          <li>
                            Tap <strong>Link a device</strong> and scan the QR code on the left.
                          </li>
                        </ol>
                        <div className="mt-4 p-3 rounded-[7px] bg-[var(--panel)] border border-[var(--border)] text-[12px] text-[var(--ink3)] flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-[var(--ok)] shrink-0" />
                          <span>
                            Credentials are stored locally and encrypted. You only need to pair once; the terminal auto-reconnects on reboot.
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : waStatus === 'connecting' ? (
                    <div className="p-8 rounded-[10px] bg-[var(--sub)] border border-[var(--border2)] text-center flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
                      <h3 className="text-[16px] font-bold text-[var(--ink)]">Starting WhatsApp Web Session...</h3>
                      <p className="text-[13px] text-[var(--ink2)] max-w-md">
                        Connecting to WhatsApp Multi-Device server and generating pairing QR code. Please wait a moment.
                      </p>
                    </div>
                  ) : (
                    <div className="p-6 rounded-[10px] bg-[var(--sub)] border border-[var(--border2)] flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-[var(--rule)] text-[var(--ink2)] flex items-center justify-center shrink-0">
                          <QrCode className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-[16px] font-bold text-[var(--ink)]">
                            Connect Shop WhatsApp Account
                          </h3>
                          <p className="text-[13px] text-[var(--ink2)] mt-1">
                            Link your store phone via WhatsApp Web QR code.
                            Once linked, generated bills and receipts are sent automatically from your store&apos;s number.
                          </p>
                          <div className="mt-2.5 flex flex-wrap gap-4 text-[11.5px] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                            <span className="flex items-center gap-1">
                              <span className="text-[var(--ok)] font-bold">✓</span> Auto-sends on Bill Creation
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-[var(--ok)] font-bold">✓</span> No Meta API Charges
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-[var(--ok)] font-bold">✓</span> Zero Configuration
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleConnectWhatsApp(true)}
                        disabled={waLoadingAction === 'connecting'}
                        className="h-[44px] px-6 rounded-[8px] bg-[#25d366] hover:bg-[#20ba59] text-white text-[13.5px] font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-colors shrink-0 border-0"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>{waLoadingAction === 'connecting' ? 'Generating QR...' : 'Show Pairing QR Code'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Main Enable Toggle */}
                <div className="flex items-center gap-4 py-3.5 border-b border-[var(--rule)]">
                  <div className="flex-1 min-w-0">
                    <label className="text-[14px] font-semibold text-[var(--ink)] cursor-pointer">
                      Enable WhatsApp Features
                    </label>
                    <div className="text-[12px] text-[var(--ink3)] mt-0.5">
                      Allows billing counter to send bills and reminders to customer phone numbers.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={waEnabled}
                    onClick={() => setWaEnabled(!waEnabled)}
                    className={`w-[50px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors cursor-pointer border-0 ${
                      waEnabled ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border2)] justify-start'
                    }`}
                  >
                    <span className="w-[22px] h-[22px] rounded-full bg-[var(--panel)] shadow-sm" />
                  </button>
                </div>

                {/* Auto Prompt Toggle */}
                <div className="flex items-center gap-4 py-3.5 border-b border-[var(--rule)]">
                  <div className="flex-1 min-w-0">
                    <label className="text-[14px] font-semibold text-[var(--ink)] cursor-pointer">
                      Auto-Prompt WhatsApp Receipt at Checkout
                    </label>
                    <div className="text-[12px] text-[var(--ink3)] mt-0.5">
                      When a sale completes, automatically show the WhatsApp send confirmation on the settlement card.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={waAutoPrompt}
                    onClick={() => setWaAutoPrompt(!waAutoPrompt)}
                    className={`w-[50px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors cursor-pointer border-0 ${
                      waAutoPrompt ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border2)] justify-start'
                    }`}
                  >
                    <span className="w-[22px] h-[22px] rounded-full bg-[var(--panel)] shadow-sm" />
                  </button>
                </div>

                {/* Test Customer Mobile Number */}
                <div className="mt-5 pt-4 border-t border-[var(--rule)] flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                      Test Customer Mobile Number (10 digits)
                    </label>
                    <input
                      type="text"
                      value={waTestPhone}
                      onChange={e => setWaTestPhone(e.target.value)}
                      placeholder="e.g. 98450 12345"
                      className="w-full h-[42px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                      style={{ fontFamily: MONO }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleTestWhatsApp}
                    disabled={waLoadingAction === 'testing'}
                    className="h-[42px] px-4 border border-[#25d366]/40 bg-[#25d366]/15 hover:bg-[#25d366]/25 text-[#128c7e] dark:text-[#25d366] rounded-[7px] text-[13px] font-bold cursor-pointer transition-colors flex items-center gap-1.5"
                  >
                    <span>💬</span>
                    <span>{waLoadingAction === 'testing' ? 'Testing...' : waStatus === 'connected' ? 'Send Real Test Bill' : 'Test WhatsApp Link'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveWhatsApp}
                    className="h-[42px] px-5 rounded-[7px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 border-0"
                  >
                    Save settings
                  </button>
                </div>

                {waTestResult && (
                  <div
                    className={`mt-4 p-3.5 rounded-[8px] border text-[12.5px] leading-relaxed ${
                      waTestResult.success
                        ? 'bg-[var(--ok-soft2)] border-[var(--ok-line)] text-[var(--ok)]'
                        : 'bg-[var(--danger-soft)] border-[var(--danger-line2)] text-[var(--danger)]'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <span>{waTestResult.success ? '✓ Diagnostic Passed:' : '✕ Diagnostic Warning:'}</span>
                      <span>{waTestResult.message}</span>
                    </div>
                    {waTestResult.sampleLink && (
                      <div className="mt-2">
                        <a
                          href={waTestResult.sampleLink}
                          target="_blank"
                          rel="noreferrer"
                          className="underline font-semibold text-xs"
                        >
                          Click to test generated WhatsApp link →
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Receipt Template Preview Card */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] mb-2" style={{ fontFamily: MONO }}>
                  Customer WhatsApp Receipt Preview
                </div>
                <div className="p-4 rounded-[10px] bg-[#e7ffdb] dark:bg-[#122818] border border-[#b2e5a4] dark:border-[#1d4d29] text-[#123819] dark:text-[#c4f2cc] max-w-lg shadow-sm">
                  <div className="text-[12.5px] whitespace-pre-line leading-relaxed" style={{ fontFamily: MONO }}>
                    {`🧾 *${(shopName || 'J MART RETAIL').toUpperCase()}*
📍 ${shopAddr || '123 Main Street, Bangalore'}
📞 ${shopPhone || '98450 12345'} | GSTIN: ${gstin || '29AAAAA1111A1Z1'}
━━━━━━━━━━━━━━━━━━━━
*TAX INVOICE #BILL-1042*
📅 08 Oct 2026, 14:50
👤 Customer: Walk-in Customer (98450 12345)
Cashier: Counter Till 1
━━━━━━━━━━━━━━━━━━━━
*ITEMS PURCHASED:*
1. *Maggi Noodles 70g x4*
   2 PCS × ₹58.00 = ₹116.00
2. *Tata Salt 1kg*
   1 PKT × ₹28.00 = ₹28.00
━━━━━━━━━━━━━━━━━━━━
Subtotal: ₹144.00
Tax (GST Included): ₹7.20
*TOTAL AMOUNT: ₹144.00*
Payment Mode: *UPI*
━━━━━━━━━━━━━━━━━━━━
🙏 *Thank you for your visit!*
🌿 Save paper, protect nature. Your digital e-bill.`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 16: EMAIL & SMTP INVOICES */}
          {panel === 'email' && (
            <div className="flex flex-col gap-5">
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                <div className="mb-4 pb-3 border-b border-[var(--rule2)] flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]" style={{ fontFamily: MONO }}>
                      {advancedSmtp ? 'Customer Channels · Outgoing Mail Server' : 'Customer Channels · Gmail Invoicing'}
                    </span>
                    <h2 className="text-[18px] font-extrabold text-[var(--ink)] mt-0.5">
                      {advancedSmtp ? 'Store Email &amp; SMTP Configuration' : 'Store Gmail Setup'}
                    </h2>
                    <p className="text-[12.5px] text-[var(--ink2)] mt-1">
                      {advancedSmtp
                        ? 'Configure your shop’s outgoing mail server to automatically deliver branded digital GST tax invoices and receipts to customers upon bill generation.'
                        : 'Connect your shop’s Gmail account to automatically deliver branded digital GST tax invoices and receipts to customers upon bill generation.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {advancedSmtp && (
                      <span
                        className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-[5px] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] flex items-center gap-1"
                        style={{ fontFamily: MONO }}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Beta: Advanced SMTP</span>
                      </span>
                    )}
                    {emailConfig.enabled ? (
                      <span
                        className="text-[11px] font-bold uppercase px-3 py-1 rounded-[5px] bg-[var(--ok-soft2)] text-[var(--ok)] border border-[var(--ok-line)] flex items-center gap-1.5"
                        style={{ fontFamily: MONO }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Email Active · {emailConfig.senderEmail || emailConfig.user || (!advancedSmtp ? 'Gmail' : 'SMTP')}</span>
                      </span>
                    ) : (
                      <span
                        className="text-[11px] font-bold uppercase px-3 py-1 rounded-[5px] bg-[var(--rule)] text-[var(--ink3)] border border-[var(--border2)] flex items-center gap-1.5"
                        style={{ fontFamily: MONO }}
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Email Invoices Disabled</span>
                      </span>
                    )}
                  </div>
                </div>

                {!advancedSmtp ? (
                  /* GMAIL-ONLY CLEAN INTERFACE */
                  <div className="space-y-4 mb-5">
                    {/* 1-Minute Setup Guide Card */}
                    <div className="p-4 rounded-[9px] bg-[var(--sub)] border border-[var(--border2)] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[16px]">📮</span>
                          <span className="text-[13px] font-bold text-[var(--ink)]">
                            1-Minute Gmail Setup via Google App Password
                          </span>
                        </div>
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11.5px] font-bold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Open Google App Passwords</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[12px] text-[var(--ink2)]">
                        <div className="p-3 rounded-[7px] bg-[var(--panel)] border border-[var(--border2)]">
                          <div className="font-bold text-[var(--ink)] mb-0.5" style={{ fontFamily: MONO }}>
                            Step 1 · 2-Step Verification
                          </div>
                          <p className="text-[11.5px] text-[var(--ink3)] leading-relaxed">
                            Turn on 2-Step Verification in your store Google Account (<span className="font-mono text-[11px]">myaccount.google.com/security</span>).
                          </p>
                        </div>
                        <div className="p-3 rounded-[7px] bg-[var(--panel)] border border-[var(--border2)]">
                          <div className="font-bold text-[var(--ink)] mb-0.5" style={{ fontFamily: MONO }}>
                            Step 2 · Generate App Password
                          </div>
                          <p className="text-[11.5px] text-[var(--ink3)] leading-relaxed">
                            Open <strong className="text-[var(--ink)]">App Passwords</strong>, name it <strong className="text-[var(--ink)]">NexusFlow POS</strong>, and click Create.
                          </p>
                        </div>
                        <div className="p-3 rounded-[7px] bg-[var(--panel)] border border-[var(--border2)]">
                          <div className="font-bold text-[var(--ink)] mb-0.5" style={{ fontFamily: MONO }}>
                            Step 3 · Enter Below
                          </div>
                          <p className="text-[11.5px] text-[var(--ink3)] leading-relaxed">
                            Paste the 16-character code below and click Verify. Do <em>not</em> enter your personal Google login password.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Gmail Form Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Store Gmail Address */}
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                          Store Gmail Address
                        </label>
                        <input
                          type="email"
                          value={emailConfig.user}
                          onChange={e => {
                            const val = e.target.value.trim();
                            setEmailConfig(c => ({
                              ...c,
                              host: 'smtp.gmail.com',
                              port: 587,
                              secure: false,
                              user: val,
                              senderEmail: (!c.senderEmail || c.senderEmail === c.user) ? val : c.senderEmail,
                            }));
                          }}
                          placeholder="e.g. yourstore@gmail.com"
                          className="w-full h-[40px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                          style={{ fontFamily: MONO }}
                        />
                        <span className="text-[11px] text-[var(--ink3)] mt-1 block">
                          Digital GST invoices and receipts will be dispatched from this Gmail address.
                        </span>
                      </div>

                      {/* Google App Password */}
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                          Google App Password (16 Letters)
                        </label>
                        <input
                          type="password"
                          value={emailConfig.pass}
                          onChange={e => {
                            const val = e.target.value;
                            setEmailConfig(c => ({ ...c, pass: val }));
                          }}
                          placeholder={emailConfig.hasPass ? '•••••••• (Saved - type new code to change)' : 'e.g. abcd efgh ijkl mnop'}
                          className="w-full h-[40px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                          style={{ fontFamily: MONO }}
                        />
                        <span className="text-[11px] text-[var(--ink3)] mt-1 block">
                          Spaces are automatically removed. Generated securely from Google Account security settings.
                        </span>
                      </div>
                    </div>

                    {/* Sender Name */}
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                        Store Sender Name (Appears in Customer Inbox)
                      </label>
                      <input
                        type="text"
                        value={emailConfig.senderName}
                        onChange={e => setEmailConfig(c => ({ ...c, senderName: e.target.value }))}
                        placeholder={shopName || 'e.g. J Mart Retail'}
                        className="w-full h-[40px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                      />
                      <span className="text-[11px] text-[var(--ink3)] mt-1 block">
                        Customers will see this name as the sender (e.g. &quot;{emailConfig.senderName || shopName || 'J Mart Retail'}&quot; &lt;{emailConfig.user || 'yourstore@gmail.com'}&gt;).
                      </span>
                    </div>

                    {/* Beta Callout Card */}
                    <div className="p-3.5 rounded-[8px] bg-[var(--sub)] border border-[var(--border2)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[12px]">
                      <div className="flex items-center gap-2.5 text-[var(--ink2)]">
                        <span className="text-[15px]">💼</span>
                        <span>
                          Need <strong>Microsoft 365 / Outlook</strong>, <strong>Zoho Mail</strong>, or custom SMTP servers?
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPanel('beta')}
                        className="text-[12px] font-bold text-[var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer bg-transparent border-0 shrink-0 self-start sm:self-auto"
                      >
                        <span>Unlock in Beta Features &rarr;</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ADVANCED SMTP (BETA ENABLED) INTERFACE */
                  <div className="space-y-4 mb-5">
                    {/* Beta Active Banner */}
                    <div className="p-3 rounded-[8px] bg-[var(--accent-soft)] border border-[var(--accent)] text-[12px] text-[var(--ink)] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
                        <span>
                          <strong>Beta Mode Active:</strong> Multi-provider presets (Outlook, Zoho, Custom) and manual SMTP port/SSL controls are unlocked.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPanel('beta')}
                        className="text-[11px] font-bold text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-0 shrink-0"
                      >
                        Manage Beta Features &rarr;
                      </button>
                    </div>

                    {/* Presets Selector */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink3)] mb-2" style={{ fontFamily: MONO }}>
                        Quick SMTP Provider Presets:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <button
                          type="button"
                          onClick={() => applyEmailPreset('gmail')}
                          className={`px-3 py-2.5 rounded-[8px] text-[12.5px] font-bold border transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                            selectedEmailPreset === 'gmail'
                              ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] shadow-sm'
                              : 'bg-[var(--sub)] border-[var(--border2)] text-[var(--ink2)] hover:border-[var(--border)] hover:text-[var(--ink)]'
                          }`}
                        >
                          <span>📮 Gmail</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyEmailPreset('outlook')}
                          className={`px-3 py-2.5 rounded-[8px] text-[12.5px] font-bold border transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                            selectedEmailPreset === 'outlook'
                              ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] shadow-sm'
                              : 'bg-[var(--sub)] border-[var(--border2)] text-[var(--ink2)] hover:border-[var(--border)] hover:text-[var(--ink)]'
                          }`}
                        >
                          <span>💼 Outlook / M365</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyEmailPreset('zoho')}
                          className={`px-3 py-2.5 rounded-[8px] text-[12.5px] font-bold border transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                            selectedEmailPreset === 'zoho'
                              ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] shadow-sm'
                              : 'bg-[var(--sub)] border-[var(--border2)] text-[var(--ink2)] hover:border-[var(--border)] hover:text-[var(--ink)]'
                          }`}
                        >
                          <span>📬 Zoho Mail</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyEmailPreset('custom')}
                          className={`px-3 py-2.5 rounded-[8px] text-[12.5px] font-bold border transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                            selectedEmailPreset === 'custom'
                              ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] shadow-sm'
                              : 'bg-[var(--sub)] border-[var(--border2)] text-[var(--ink2)] hover:border-[var(--border)] hover:text-[var(--ink)]'
                          }`}
                        >
                          <span>⚙️ Custom SMTP</span>
                        </button>
                      </div>

                      {/* Preset Guidance Box */}
                      <div className="mt-3 p-3 rounded-[8px] bg-[var(--sub)] border border-[var(--border2)] text-[12px] text-[var(--ink2)] flex items-start gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                        <div>
                          {selectedEmailPreset === 'gmail' && (
                            <span>
                              <strong>Gmail Setup:</strong> Uses <span className="font-mono">smtp.gmail.com:587</span> with STARTTLS. Enter your Gmail address and 16-character <strong>Google App Password</strong>.
                            </span>
                          )}
                          {selectedEmailPreset === 'outlook' && (
                            <span>
                              <strong>Outlook 365 Setup:</strong> Uses <span className="font-mono">smtp.office365.com:587</span> with STARTTLS. Enter your Microsoft 365 or Outlook email and password.
                            </span>
                          )}
                          {selectedEmailPreset === 'zoho' && (
                            <span>
                              <strong>Zoho Mail Setup:</strong> Uses <span className="font-mono">smtp.zoho.com:465</span> with SSL. Enter your Zoho email and Zoho Application-Specific Password.
                            </span>
                          )}
                          {selectedEmailPreset === 'custom' && (
                            <span>
                              <strong>Custom Server Setup:</strong> Enter the outgoing SMTP server host and port provided by your transactional mail provider (e.g. Amazon SES, SendGrid, Mailgun) or cPanel.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Server Fields: Host & Port */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                          SMTP Host Server
                        </label>
                        <input
                          type="text"
                          value={emailConfig.host}
                          onChange={e => setEmailConfig(c => ({ ...c, host: e.target.value }))}
                          placeholder="e.g. smtp.gmail.com"
                          className="w-full h-[40px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                          style={{ fontFamily: MONO }}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                          SMTP Port
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={emailConfig.port}
                            onChange={e => setEmailConfig(c => ({ ...c, port: Number(e.target.value) || 587 }))}
                            placeholder="587"
                            className="w-full h-[40px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                            style={{ fontFamily: MONO }}
                          />
                          <label className="flex items-center gap-1.5 text-xs text-[var(--ink2)] shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={emailConfig.secure}
                              onChange={e => setEmailConfig(c => ({ ...c, secure: e.target.checked }))}
                              className="accent-[var(--accent)]"
                            />
                            <span>SSL (465)</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Username & Password */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                          SMTP Username / Email
                        </label>
                        <input
                          type="text"
                          value={emailConfig.user}
                          onChange={e => setEmailConfig(c => ({ ...c, user: e.target.value }))}
                          placeholder="e.g. billing@yourdomain.com"
                          className="w-full h-[40px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                          style={{ fontFamily: MONO }}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                          SMTP Password / App Secret
                        </label>
                        <input
                          type="password"
                          value={emailConfig.pass}
                          onChange={e => setEmailConfig(c => ({ ...c, pass: e.target.value }))}
                          placeholder={emailConfig.hasPass ? '•••••••• (Saved - type to change)' : 'Enter password or app secret'}
                          className="w-full h-[40px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                          style={{ fontFamily: MONO }}
                        />
                      </div>
                    </div>

                    {/* Sender Name & Sender Email */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                          Sender Name (Appears in Customer Inbox)
                        </label>
                        <input
                          type="text"
                          value={emailConfig.senderName}
                          onChange={e => setEmailConfig(c => ({ ...c, senderName: e.target.value }))}
                          placeholder={shopName || 'e.g. J Mart Retail'}
                          className="w-full h-[40px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                          Sender Email (From Header)
                        </label>
                        <input
                          type="email"
                          value={emailConfig.senderEmail}
                          onChange={e => setEmailConfig(c => ({ ...c, senderEmail: e.target.value }))}
                          placeholder={emailConfig.user || 'e.g. invoices@yourdomain.com'}
                          className="w-full h-[40px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                          style={{ fontFamily: MONO }}
                        />
                      </div>
                    </div>

                    {/* Subject Line Template */}
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--ink2)] mb-1">
                        Email Subject Line Template
                      </label>
                      <input
                        type="text"
                        value={emailConfig.subjectTemplate}
                        onChange={e => setEmailConfig(c => ({ ...c, subjectTemplate: e.target.value }))}
                        placeholder="Tax Invoice #{billNumber} - {shopName}"
                        className="w-full h-[40px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                      />
                      <span className="text-[11px] text-[var(--ink3)] mt-1 block">
                        Supported tags: <code className="font-mono text-xs">{'{billNumber}'}</code>, <code className="font-mono text-xs">{'{shopName}'}</code>, <code className="font-mono text-xs">{'{customerName}'}</code>
                      </span>
                    </div>
                  </div>
                )}

                {/* TOGGLES */}
                <div className="space-y-1 pt-2 border-t border-[var(--rule)]">
                  {/* Main Enable Toggle */}
                  <div className="flex items-center gap-4 py-3 border-b border-[var(--rule)]">
                    <div className="flex-1 min-w-0">
                      <label className="text-[14px] font-semibold text-[var(--ink)] cursor-pointer">
                        Enable Customer Email Invoicing
                      </label>
                      <div className="text-[12px] text-[var(--ink3)] mt-0.5">
                        Permits registers to send digital invoices and receipts to customer email addresses.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={emailConfig.enabled}
                      onClick={() => setEmailConfig(c => ({ ...c, enabled: !c.enabled }))}
                      className={`w-[50px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors cursor-pointer border-0 ${
                        emailConfig.enabled ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border2)] justify-start'
                      }`}
                    >
                      <span className="w-[22px] h-[22px] rounded-full bg-[var(--panel)] shadow-sm" />
                    </button>
                  </div>

                  {/* Auto-Dispatch Toggle */}
                  <div className="flex items-center gap-4 py-3 border-b border-[var(--rule)]">
                    <div className="flex-1 min-w-0">
                      <label className="text-[14px] font-semibold text-[var(--ink)] cursor-pointer">
                        Auto-Dispatch Invoice on Bill Creation
                      </label>
                      <div className="text-[12px] text-[var(--ink3)] mt-0.5">
                        When cashier finalizes a bill with a customer email, automatically deliver the tax invoice in the background without delay.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={emailConfig.autoSend}
                      onClick={() => setEmailConfig(c => ({ ...c, autoSend: !c.autoSend }))}
                      className={`w-[50px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors cursor-pointer border-0 ${
                        emailConfig.autoSend ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border2)] justify-start'
                      }`}
                    >
                      <span className="w-[22px] h-[22px] rounded-full bg-[var(--panel)] shadow-sm" />
                    </button>
                  </div>
                </div>

                {/* ACTION BAR: VERIFY & SAVE */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleVerifyEmail}
                      disabled={emailVerifying || !emailConfig.user}
                      className="h-[42px] px-4 rounded-[7px] border border-[var(--border2)] bg-[var(--sub)] hover:bg-[var(--surface-hover)] text-[var(--ink)] text-[13px] font-bold cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <Server className={`w-4 h-4 ${emailVerifying ? 'animate-spin' : ''}`} />
                      <span>
                        {emailVerifying
                          ? (!advancedSmtp ? 'Testing Gmail...' : 'Testing SMTP...')
                          : (!advancedSmtp ? 'Verify Gmail Connection' : 'Verify SMTP Connection')}
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveEmail}
                    disabled={emailLoading}
                    className="h-[42px] px-6 rounded-[7px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 border-0 transition-opacity"
                  >
                    {emailLoading ? 'Saving...' : (!advancedSmtp ? 'Save Gmail Settings' : 'Save Email Settings')}
                  </button>
                </div>

                {/* SMTP / Gmail Verify Result Alert */}
                {emailVerifyResult && (
                  <div
                    className={`mt-4 p-3.5 rounded-[8px] border text-[12.5px] leading-relaxed ${
                      emailVerifyResult.success
                        ? 'bg-[var(--ok-soft2)] border-[var(--ok-line)] text-[var(--ok)]'
                        : 'bg-[var(--danger-soft)] border-[var(--danger-line2)] text-[var(--danger)]'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <span>
                        {emailVerifyResult.success
                          ? (!advancedSmtp ? '✓ Gmail Connection Verified:' : '✓ SMTP Handshake Passed:')
                          : (!advancedSmtp ? '✕ Gmail Connection Failed:' : '✕ SMTP Handshake Failed:')}
                      </span>
                      <span>{emailVerifyResult.message}</span>
                    </div>
                  </div>
                )}

                {/* TEST EMAIL SENDER BOX */}
                <div className="mt-6 pt-5 border-t border-[var(--rule)]">
                  <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink3)] mb-1" style={{ fontFamily: MONO }}>
                    Send Live Test Invoice to Your Inbox
                  </label>
                  <div className="flex flex-wrap items-end gap-3 mt-2">
                    <div className="flex-1 min-w-[240px]">
                      <input
                        type="email"
                        value={emailTestTarget}
                        onChange={e => setEmailTestTarget(e.target.value)}
                        placeholder="e.g. your-email@gmail.com"
                        className="w-full h-[42px] px-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[13px] text-[var(--ink)]"
                        style={{ fontFamily: MONO }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleTestEmail}
                      disabled={emailTesting}
                      className="h-[42px] px-5 rounded-[7px] bg-[var(--accent)] hover:opacity-95 text-white text-[13px] font-bold cursor-pointer transition-opacity flex items-center gap-2 border-0 disabled:opacity-50"
                    >
                      <Send className={`w-4 h-4 ${emailTesting ? 'animate-pulse' : ''}`} />
                      <span>{emailTesting ? 'Delivering...' : 'Send Test Invoice'}</span>
                    </button>
                  </div>

                  {emailTestResult && (
                    <div
                      className={`mt-3 p-3.5 rounded-[8px] border text-[12.5px] leading-relaxed ${
                        emailTestResult.success
                          ? 'bg-[var(--ok-soft2)] border-[var(--ok-line)] text-[var(--ok)]'
                          : 'bg-[var(--danger-soft)] border-[var(--danger-line2)] text-[var(--danger)]'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1.5">
                        <span>{emailTestResult.success ? '✓ Dispatch Succeeded:' : '✕ Dispatch Failed:'}</span>
                        <span>{emailTestResult.message}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* EMAIL TEMPLATE PREVIEW CARD */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] mb-3" style={{ fontFamily: MONO }}>
                  Customer HTML Invoice Preview
                </div>
                <div className="max-w-xl mx-auto rounded-xl border border-[var(--border)] overflow-hidden shadow-sm bg-white text-slate-800 text-[13px]">
                  {/* Invoice Header */}
                  <div className="p-5 bg-slate-900 text-white flex justify-between items-start">
                    <div>
                      <h4 className="text-[18px] font-black tracking-tight">{shopName || 'J MART RETAIL'}</h4>
                      <p className="text-[11.5px] text-slate-300 mt-0.5">{shopAddr || 'Rayala Nagar Extension, Ramapuram, Chennai 600089'}</p>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">Ph: {shopPhone || '+91 77088 00220'} | GSTIN: {gstin || '33AAAAA0000A1Z5'}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-2.5 py-1 rounded bg-teal-500/20 text-teal-300 font-bold text-[10px] uppercase font-mono tracking-wider">
                        Tax Invoice
                      </span>
                      <p className="text-[13px] font-bold font-mono mt-1 text-white">#BILL-1042</p>
                    </div>
                  </div>

                  {/* Customer & Bill meta */}
                  <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10.5px] uppercase font-mono">Billed To</span>
                      <span className="font-semibold text-slate-900">Walk-in Customer</span>
                      <span className="text-slate-500 block text-[11px] font-mono">+91 98450 12345</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block text-[10.5px] uppercase font-mono">Date &amp; Tender</span>
                      <span className="font-semibold text-slate-900">08 Oct 2026, 14:50</span>
                      <span className="text-slate-500 block text-[11px] font-mono">Paid via UPI</span>
                    </div>
                  </div>

                  {/* Item table */}
                  <div className="p-4">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-mono">
                          <th className="py-1.5 font-bold">Item</th>
                          <th className="py-1.5 font-bold text-center">Qty</th>
                          <th className="py-1.5 font-bold text-right">Rate</th>
                          <th className="py-1.5 font-bold text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        <tr>
                          <td className="py-2 font-medium">Maggi Noodles 70g x4</td>
                          <td className="py-2 text-center font-mono">2 PCS</td>
                          <td className="py-2 text-right font-mono">₹58.00</td>
                          <td className="py-2 text-right font-mono font-semibold">₹116.00</td>
                        </tr>
                        <tr>
                          <td className="py-2 font-medium">Tata Salt 1kg</td>
                          <td className="py-2 text-center font-mono">1 PKT</td>
                          <td className="py-2 text-right font-mono">₹28.00</td>
                          <td className="py-2 text-right font-mono font-semibold">₹28.00</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Totals */}
                    <div className="mt-4 pt-3 border-t border-slate-200 space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span className="font-mono">₹137.14</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>GST (5% Included)</span>
                        <span className="font-mono">₹6.86</span>
                      </div>
                      <div className="flex justify-between items-baseline pt-2 border-t border-slate-300 text-sm font-bold text-slate-900">
                        <span>Total Paid</span>
                        <span className="font-mono text-[16px] text-teal-700">₹144.00</span>
                      </div>
                    </div>
                  </div>

                  {/* Eco Footer */}
                  <div className="p-3 bg-emerald-50 border-t border-emerald-100 text-center text-[11px] text-emerald-800">
                    🌿 Save paper, protect nature. Your official digital GST invoice.
                  </div>
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
