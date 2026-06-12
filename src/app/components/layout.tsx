import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router';
import { Suspense, lazy, useEffect, useState, useMemo } from 'react';
import { Receipt, BarChart3, Moon, Sun, Users, TrendingUp, Settings, LogOut, User, Coffee, Clock, ChevronLeft, ChevronRight, History, Keyboard, Calendar, Plus, Trash2, CalendarCheck, MessageSquare, Store, Database, X, Search, ShieldAlert, CheckCircle2, AlertCircle, Filter, Sparkles, DollarSign, MapPin, CreditCard, PlusCircle } from 'lucide-react';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { InteractiveMeshBackground } from './ui/interactive-mesh-background';
import { E2EEChatbox } from './ui/e2ee-chatbox';
import { useWebSocket } from '../hooks/useWebSocket';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { KioskLockOverlay } from './ui/kiosk-lock-overlay';


// Lazy load settings to optimize initial page loading
const POSSettings = lazy(() => import('./pos-settings').then(m => ({ default: m.POSSettings })));

function PageLoader({ darkMode }: { darkMode: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center flex-1 min-h-[60vh] gap-4 ${
      darkMode ? 'bg-gray-900' : 'bg-gray-100'
    }`}>
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-blue-500/20" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
      </div>
      <p className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        Loading...
      </p>
    </div>
  );
}

interface OnboardingWizardProps {
  darkMode: boolean;
  onComplete: (sector: 'retail' | 'wholesale' | 'restaurant' | 'pharmacy', allowMultiSector: boolean) => void;
}

function OnboardingWizard({ darkMode, onComplete }: OnboardingWizardProps) {
  const industries = [
    {
      id: 'retail',
      title: 'Grocery & Supermarket',
      desc: 'Fast checkout, shelf inventory, and general POS billing.',
      icon: <Store className="w-8 h-8 text-blue-500" />,
      sector: 'retail' as const,
      tag: 'Recommended for Grocers'
    },
    {
      id: 'pharmacy',
      title: 'Pharmacy & Healthcare',
      desc: 'Medicine batches, expiry dates, drug licenses, and Rx locks.',
      icon: <Database className="w-8 h-8 text-purple-500" />,
      sector: 'pharmacy' as const,
      tag: 'Regulated Medical POS'
    },
    {
      id: 'wholesale',
      title: 'Wholesale & B2B Distribution',
      desc: 'Credit controls, bulk discounts, and regional GST routing.',
      icon: <TrendingUp className="w-8 h-8 text-emerald-500" />,
      sector: 'wholesale' as const,
      tag: 'Invoice & Ledger compliance'
    },
    {
      id: 'restaurant',
      title: 'Restaurant & Dine-In',
      desc: 'Custom dining floorplans, table registers, and KOT checkouts.',
      icon: <Coffee className="w-8 h-8 text-amber-500" />,
      sector: 'restaurant' as const,
      tag: 'F&B Order Tracking'
    },
    {
      id: 'retail_boutique',
      title: 'Retail Boutique & Boutique POS',
      desc: 'Standard catalog, loyalty tracking, and sales analytics.',
      icon: <Receipt className="w-8 h-8 text-pink-500" />,
      sector: 'retail' as const,
      tag: 'Clean Apparel POS'
    }
  ];

  const [selectedId, setSelectedId] = useState('retail');
  const [allowMultiSector, setAllowMultiSector] = useState(false);

  const handleCompleteOnboarding = () => {
    const chosen = industries.find(ind => ind.id === selectedId);
    const chosenSector = chosen ? chosen.sector : 'retail';

    onComplete(chosenSector, allowMultiSector);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 overflow-y-auto ${
      darkMode ? 'bg-slate-955 text-white' : 'bg-slate-50 text-slate-900'
    }`}>
      <InteractiveMeshBackground />
      
      <div className={`w-full max-w-4xl p-6 md:p-10 rounded-3xl border shadow-2xl relative z-10 backdrop-blur-xl transition-all ${
        darkMode ? 'bg-slate-900/85 border-slate-800 shadow-indigo-950/20' : 'bg-white/85 border-slate-200'
      }`}>
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-2xl text-white bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl mx-auto mb-4`}>
            N
          </div>
          <h1 className="text-3xl font-black tracking-tight">Configure Your NexusFlow Workspace</h1>
          <p className={`text-sm mt-2 font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            NexusFlow is a unified operating system built for multiple business sectors. Tell us about your business profile so we can configure the ideal bespoke workspace for you.
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {industries.map((ind) => {
            const isSelected = selectedId === ind.id;
            return (
              <div
                key={ind.id}
                onClick={() => setSelectedId(ind.id)}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between hover:scale-[1.02] active:scale-[0.98] ${
                  isSelected
                    ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/5'
                    : darkMode
                    ? 'bg-slate-955/45'
                    : 'bg-white border-slate-100 hover:border-slate-250 text-slate-700'
                } ${
                  !isSelected && darkMode
                    ? 'bg-slate-955/45 border-slate-800 hover:border-slate-700 text-slate-300'
                    : ''
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-2.5 rounded-xl border ${darkMode ? 'bg-slate-900/60 border-slate-850' : 'bg-slate-50 border-slate-150'}`}>
                      {ind.icon}
                    </div>
                    <span className={`text-[8.5px] px-2 py-0.5 rounded font-black tracking-wider uppercase ${
                      isSelected
                        ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                        : darkMode
                        ? 'bg-slate-800/40 text-slate-400 border border-slate-850'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {ind.tag}
                    </span>
                  </div>
                  <h3 className={`font-extrabold text-sm mb-1.5 ${darkMode ? 'text-white' : 'text-slate-850'}`}>{ind.title}</h3>
                  <p className={`text-[11px] font-semibold leading-relaxed opacity-70`}>{ind.desc}</p>
                </div>
                <div className="pt-4 flex items-center gap-1.5">
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                    isSelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-400'
                  }`}>
                    {isSelected && <span className="text-[10px]">✓</span>}
                  </div>
                  <span className="text-[10px] font-bold text-gray-450">Select this profile</span>
                </div>
              </div>
            );
          })}

          {/* Enterprise card placeholder for multi-sector */}
          <div
            className={`p-5 rounded-2xl border-2 border-dashed flex flex-col justify-center items-center text-center transition-all relative ${
              darkMode ? 'bg-slate-955/20 border-slate-800/80 hover:border-slate-700' : 'bg-gray-50/50 border-gray-250 hover:border-gray-300'
            }`}
          >
            <div className="p-3 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-400 rounded-xl mb-3 border border-indigo-500/10">
              🏢
            </div>
            <h3 className={`font-extrabold text-xs mb-1 ${darkMode ? 'text-white' : 'text-slate-850'}`}>Multi-Sector Enterprise</h3>
            <p className="text-[10.5px] font-semibold text-gray-400 max-w-[200px] leading-relaxed">Operate multi-department B2B wholesalers, pharmacies, and groceries in a single unified store.</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <input 
                type="checkbox"
                id="multi-sector-setup-check"
                checked={allowMultiSector}
                onChange={(e) => setAllowMultiSector(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
              />
              <label htmlFor="multi-sector-setup-check" className="text-[10px] font-bold text-gray-400 select-none cursor-pointer uppercase tracking-wide">
                Enable Multi-Sector
              </label>
            </div>
          </div>
        </div>

        {/* Footer Complete Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-t dark:border-slate-800 pt-6 gap-4">
          <div className="text-left text-xs text-gray-400 max-w-sm">
            <span className="font-bold text-slate-500 block uppercase text-[9px] tracking-wide mb-0.5">Local-First Persistence</span>
            Changes will configure this client terminal immediately. You can re-configure or switch modes at any time in settings under <span className="font-semibold text-blue-500">Workspace Profile</span>.
          </div>
          <button
            onClick={handleCompleteOnboarding}
            className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-xl shadow-lg shadow-blue-500/10 active:scale-95 transition-all text-xs uppercase tracking-wider select-none cursor-pointer"
          >
            Complete Setup & Launch NexusFlow
          </button>
        </div>
      </div>
    </div>
  );
}

interface SectorPanelModalProps {
  panel: 'kot' | 'tables' | 'batches' | 'prescriptions' | 'gstin' | 'crm';
  onClose: () => void;
  darkMode: boolean;
}

function SectorPanelModal({ panel, onClose, darkMode }: SectorPanelModalProps) {
  const [batches, setBatches] = useState<any[]>([]);
  const [batchSearch, setBatchSearch] = useState('');
  const [batchesLoading, setBatchesLoading] = useState(false);
  
  const [prescriptions, setPrescriptions] = useState([
    { id: 'rx-1', patientName: 'Alexander Richards', doctorName: 'Dr. Evelyn Martinez', medicineName: 'Alprazolam 0.5mg', date: '2026-06-01', status: 'pending', fileUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=400&q=80' },
    { id: 'rx-2', patientName: 'Sarah Jenkins', doctorName: 'Dr. Michael Chen', medicineName: 'Codeine Phosphate Syrup 60ml', date: '2026-05-30', status: 'verified', fileUrl: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=400&q=80' },
    { id: 'rx-3', patientName: 'Robert Vance', doctorName: 'Dr. Sarah Patel', medicineName: 'Diazepam 5mg', date: '2026-05-28', status: 'blocked', fileUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
    { id: 'rx-4', patientName: 'Emma Watson', doctorName: 'Dr. Evelyn Martinez', medicineName: 'Zolpidem 10mg', date: '2026-06-02', status: 'pending', fileUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=400&q=80' }
  ]);
  const [selectedRx, setSelectedRx] = useState<any>(null);

  const [kotTickets, setKotTickets] = useState([
    { id: 'kot-402', tableNum: '4', cashierName: 'Joel', items: [{ name: 'Spicy Miso Ramen', qty: 2 }, { name: 'Pork Gyoza', qty: 1 }, { name: 'Iced Matcha Latte', qty: 2 }], elapsed: 4, status: 'PREPARING' },
    { id: 'kot-401', tableNum: '8', cashierName: 'Sara', items: [{ name: 'Salmon Teriyaki Bento', qty: 1 }, { name: 'Tempura Udon', qty: 1 }, { name: 'Sake 180ml', qty: 1 }], elapsed: 12, status: 'READY' },
    { id: 'kot-403', tableNum: '12', cashierName: 'Joel', items: [{ name: 'Chicken Katsu Curry', qty: 1 }], elapsed: 1, status: 'PREPARING' },
    { id: 'kot-400', tableNum: '2', cashierName: 'Joel', items: [{ name: 'Veggie Sushi Roll', qty: 2 }, { name: 'Edamame', qty: 1 }], elapsed: 18, status: 'SERVED' }
  ]);

  const [tablesList, setTablesList] = useState(() => {
    try {
      const saved = localStorage.getItem('nexusflowTablesList');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: 't-1', name: 'Table 1', seats: 2, status: 'available', total: 0, items: [] },
      { id: 't-2', name: 'Table 2', seats: 2, status: 'occupied', total: 420.00, items: [
        { code: 'R002', name: 'Paneer Tikka (8 pcs)', price: 320, quantity: 1, gstRate: 5, originalPrice: 320 },
        { code: 'R005', name: 'Garlic Naan', price: 50, quantity: 2, gstRate: 5, originalPrice: 50 }
      ]},
      { id: 't-3', name: 'Table 3', seats: 4, status: 'available', total: 0, items: [] },
      { id: 't-4', name: 'Table 4', seats: 4, status: 'occupied', total: 670.00, items: [
        { code: 'R001', name: 'Butter Chicken (Full)', price: 380, quantity: 1, gstRate: 5, originalPrice: 380 },
        { code: 'R005', name: 'Garlic Naan', price: 50, quantity: 3, gstRate: 5, originalPrice: 50 },
        { code: 'R020', name: 'Lassi (Sweet/Salt)', price: 70, quantity: 2, gstRate: 5, originalPrice: 70 }
      ]},
      { id: 't-5', name: 'Table 5', seats: 6, status: 'available', total: 0, items: [] },
      { id: 't-6', name: 'Table 6', seats: 6, status: 'reserved', total: 0, items: [] },
      { id: 't-7', name: 'Table 7', seats: 4, status: 'available', total: 0, items: [] },
      { id: 't-8', name: 'Table 8', seats: 4, status: 'occupied', total: 410.00, items: [
        { code: 'R003', name: 'Dal Makhani', price: 240, quantity: 1, gstRate: 5, originalPrice: 240 },
        { code: 'R004', name: 'Tandoori Roti', price: 30, quantity: 3, gstRate: 5, originalPrice: 30 },
        { code: 'R010', name: 'Gulab Jamun (2 pcs)', price: 80, quantity: 1, gstRate: 5, originalPrice: 80 }
      ]},
      { id: 't-9', name: 'Table 9', seats: 2, status: 'available', total: 0, items: [] },
      { id: 't-10', name: 'Table 10', seats: 8, status: 'available', total: 0, items: [] }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('nexusflowTablesList', JSON.stringify(tablesList));
    } catch (e) {}
  }, [tablesList]);

  const [selectedTable, setSelectedTable] = useState<any>(null);

  const [gstInvoices, setGstInvoices] = useState([
    { id: 'inv-1001', buyerName: 'SuperBazaar Hypermarkets', gstin: '29AAAAA1111A1Z1', subtotal: 45000, cgst: 4050, sgst: 4050, igst: 0, total: 53100, destinationState: 'Karnataka (Local)' },
    { id: 'inv-1002', buyerName: 'Apex Healthcare Distributors', gstin: '27BBBBB2222B2Z2', subtotal: 78000, cgst: 0, sgst: 0, igst: 14040, total: 92040, destinationState: 'Maharashtra (Inter-state)' },
    { id: 'inv-1003', buyerName: 'Greenfield Retail Ventures', gstin: '29CCCCC3333C3Z3', subtotal: 24000, cgst: 2160, sgst: 2160, igst: 0, total: 28320, destinationState: 'Karnataka (Local)' },
    { id: 'inv-1004', buyerName: 'Sagar Medical Agencies', gstin: '33DDDDD4444D4Z4', subtotal: 12500, cgst: 0, sgst: 0, igst: 1500, total: 14000, destinationState: 'Tamil Nadu (Inter-state)' }
  ]);
  const [gstSearch, setGstSearch] = useState('');

  const [crmCustomers, setCrmCustomers] = useState([
    { name: 'Metro Supermarket Chain', phone: '9880012345', limit: 150000, outstanding: 68400, terms: 'NET-30', rating: 'Low' },
    { name: 'Apex Pharma Distributors', phone: '9900112233', limit: 80000, outstanding: 74500, terms: 'NET-15', rating: 'High' },
    { name: 'Greenfield Organic Grocers', phone: '9845098765', limit: 50000, outstanding: 12000, terms: 'NET-30', rating: 'Medium' },
    { name: 'Daily Needs MiniMart', phone: '9123456789', limit: 30000, outstanding: 0, terms: 'NET-30', rating: 'Low' }
  ]);
  const [crmSearch, setCrmSearch] = useState('');
  const [selectedCrmCust, setSelectedCrmCust] = useState<any>(null);
  const [adjustLimitAmount, setAdjustLimitAmount] = useState<string>('');
  const [payOutstandingAmount, setPayOutstandingAmount] = useState<string>('');

  useEffect(() => {
    if (panel === 'batches') {
      setBatchesLoading(true);
      api.get<any[]>('/batches')
        .then(res => {
          if (res && res.length > 0) {
            setBatches(res);
          } else {
            setBatches([
              { id: 'b-1', product_name: 'Paracetamol 500mg (Crocin)', product_sku: 'MED-PARA-500', batch_number: 'PARA26A04', expiry_date: '2026-12-15', manufacturing_date: '2025-06-15', stock_quantity: 450, drug_license: 'DL-20B-98765', prescription_required: 0 },
              { id: 'b-2', product_name: 'Amoxicillin 250mg Antibiotic', product_sku: 'MED-AMOX-250', batch_number: 'AMX26C09', expiry_date: '2026-07-20', manufacturing_date: '2025-01-20', stock_quantity: 120, drug_license: 'DL-21B-43210', prescription_required: 1 },
              { id: 'b-3', product_name: 'Alprazolam 0.5mg (Alprax)', product_sku: 'MED-ALPR-05', batch_number: 'ALP26E11', expiry_date: '2026-06-10', manufacturing_date: '2024-12-10', stock_quantity: 80, drug_license: 'DL-21B-43210', prescription_required: 1 },
              { id: 'b-4', product_name: 'Ibuprofen 400mg Painkiller', product_sku: 'MED-IBUP-400', batch_number: 'IBU25F01', expiry_date: '2025-11-05', manufacturing_date: '2024-05-05', stock_quantity: 250, drug_license: 'DL-20B-98765', prescription_required: 0 },
              { id: 'b-5', product_name: 'Metformin 500mg Sugar Control', product_sku: 'MED-METF-500', batch_number: 'MET26H08', expiry_date: '2027-02-18', manufacturing_date: '2025-08-18', stock_quantity: 600, drug_license: 'DL-20B-98765', prescription_required: 1 }
            ]);
          }
        })
        .catch(() => {
          setBatches([
            { id: 'b-1', product_name: 'Paracetamol 500mg (Crocin)', product_sku: 'MED-PARA-500', batch_number: 'PARA26A04', expiry_date: '2026-12-15', manufacturing_date: '2025-06-15', stock_quantity: 450, drug_license: 'DL-20B-98765', prescription_required: 0 },
            { id: 'b-2', product_name: 'Amoxicillin 250mg Antibiotic', product_sku: 'MED-AMOX-250', batch_number: 'AMX26C09', expiry_date: '2026-07-20', manufacturing_date: '2025-01-20', stock_quantity: 120, drug_license: 'DL-21B-43210', prescription_required: 1 },
            { id: 'b-3', product_name: 'Alprazolam 0.5mg (Alprax)', product_sku: 'MED-ALPR-05', batch_number: 'ALP26E11', expiry_date: '2026-06-10', manufacturing_date: '2024-12-10', stock_quantity: 80, drug_license: 'DL-21B-43210', prescription_required: 1 },
            { id: 'b-4', product_name: 'Ibuprofen 400mg Painkiller', product_sku: 'MED-IBUP-400', batch_number: 'IBU25F01', expiry_date: '2025-11-05', manufacturing_date: '2024-05-05', stock_quantity: 250, drug_license: 'DL-20B-98765', prescription_required: 0 },
            { id: 'b-5', product_name: 'Metformin 500mg Sugar Control', product_sku: 'MED-METF-500', batch_number: 'MET26H08', expiry_date: '2027-02-18', manufacturing_date: '2025-08-18', stock_quantity: 600, drug_license: 'DL-20B-98765', prescription_required: 1 }
          ]);
        })
        .finally(() => setBatchesLoading(false));
    }
  }, [panel]);

  const handleVerifyRx = (id: string, newStatus: 'verified' | 'blocked') => {
    setPrescriptions(prev => prev.map(rx => rx.id === id ? { ...rx, status: newStatus } : rx));
    if (selectedRx && selectedRx.id === id) {
      setSelectedRx((prev: any) => ({ ...prev, status: newStatus }));
    }
    toast.success(`Rx prescription successfully marked as ${newStatus.toUpperCase()}`);
  };

  const handleKotAdvance = (id: string) => {
    setKotTickets(prev => prev.map(t => {
      if (t.id === id) {
        const nextStatus = t.status === 'PREPARING' ? 'READY' : 'SERVED';
        toast.success(`Ticket #${t.id} advanced to ${nextStatus}!`);
        
        try {
          const context = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = context.createOscillator();
          const gain = context.createGain();
          osc.connect(gain);
          gain.connect(context.destination);
          
          if (nextStatus === 'READY') {
            osc.frequency.setValueAtTime(660, context.currentTime);
            osc.frequency.setValueAtTime(880, context.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, context.currentTime);
            osc.start();
            osc.stop(context.currentTime + 0.25);
          } else {
            osc.frequency.setValueAtTime(440, context.currentTime);
            gain.gain.setValueAtTime(0.08, context.currentTime);
            osc.start();
            osc.stop(context.currentTime + 0.15);
          }
        } catch (e) {}

        return { ...t, status: nextStatus };
      }
      return t;
    }));
  };

  const handleTableToggle = (id: string) => {
    setTablesList(prev => prev.map(t => {
      if (t.id === id) {
        const nextStatus = t.status === 'available' ? 'occupied' : t.status === 'occupied' ? 'reserved' : 'available';
        const updatedTable = { 
          ...t, 
          status: nextStatus,
          total: nextStatus === 'occupied' ? 45.00 : 0,
          items: nextStatus === 'occupied' ? ['Custom Chef Salad x1', 'Ice Water x2'] : []
        };
        if (selectedTable && selectedTable.id === id) {
          setSelectedTable(updatedTable);
        }
        return updatedTable;
      }
      return t;
    }));
  };

  const handleUpdateCreditLimit = () => {
    if (!selectedCrmCust || !adjustLimitAmount || isNaN(Number(adjustLimitAmount))) {
      toast.error('Please enter a valid credit limit amount');
      return;
    }
    const amt = parseFloat(adjustLimitAmount);
    setCrmCustomers(prev => prev.map(c => c.name === selectedCrmCust.name ? { ...c, limit: amt } : c));
    setSelectedCrmCust((prev: any) => ({ ...prev, limit: amt }));
    setAdjustLimitAmount('');
    toast.success(`Outstanding credit limit for ${selectedCrmCust.name} updated to $${amt.toLocaleString()}`);
  };

  const handlePayOutstanding = () => {
    if (!selectedCrmCust || !payOutstandingAmount || isNaN(Number(payOutstandingAmount))) {
      toast.error('Please enter a valid payment amount');
      return;
    }
    const amt = parseFloat(payOutstandingAmount);
    setCrmCustomers(prev => prev.map(c => {
      if (c.name === selectedCrmCust.name) {
        const nextOutstanding = Math.max(0, c.outstanding - amt);
        setSelectedCrmCust((p: any) => ({ ...p, outstanding: nextOutstanding }));
        return { ...c, outstanding: nextOutstanding };
      }
      return c;
    }));
    setPayOutstandingAmount('');
    toast.success(`Ledger payment of $${amt.toLocaleString()} recorded for ${selectedCrmCust.name}`);
  };

  const handleExportGstr = () => {
    toast.loading('Compiling IGST, CGST, and SGST logs into GSTR-1 manifest...');
    setTimeout(() => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gstInvoices, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `GSTR1_COMPLIANCE_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.dismiss();
      toast.success('GSTR-1 compliance JSON generated & downloaded successfully!');
    }, 1500);
  };

  const filteredBatches = batches.filter(b => 
    b.batch_number.toLowerCase().includes(batchSearch.toLowerCase()) || 
    (b.product_name && b.product_name.toLowerCase().includes(batchSearch.toLowerCase()))
  );

  const filteredGst = gstInvoices.filter(g => 
    g.buyerName.toLowerCase().includes(gstSearch.toLowerCase()) || 
    g.gstin.toLowerCase().includes(gstSearch.toLowerCase())
  );

  const filteredCrm = crmCustomers.filter(c => 
    c.name.toLowerCase().includes(crmSearch.toLowerCase()) || 
    c.phone.includes(crmSearch)
  );

  const getExpiryBadge = (expiryStr: string) => {
    const today = new Date();
    const expiry = new Date(expiryStr);
    const timeDiff = expiry.getTime() - today.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    if (daysDiff <= 0) {
      return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20">Expired</span>;
    } else if (daysDiff <= 90) {
      return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">{`Expiring in ${daysDiff} days`}</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Active</span>;
  };

  return (
    <div className="fixed inset-0 z-45 flex items-center justify-center p-4 overflow-y-auto bg-slate-950/70 backdrop-blur-md transition-all">
      <div className={`w-full max-w-5xl rounded-3xl border shadow-2xl relative z-10 transition-all ${
        darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
      } flex flex-col max-h-[85vh]`}>
        
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 flex items-center gap-1.5 mb-1.5">
              <Sparkles size={11} className="animate-spin" />
              NexusFlow Dynamic Sector Module
            </span>
            <h2 className="text-2xl font-black tracking-tight uppercase flex items-center gap-2">
              {panel === 'batches' && <>🧪 Batch Expiry & Inventory Logs</>}
              {panel === 'prescriptions' && <>💊 Controlled Prescription Audit Registry</>}
              {panel === 'kot' && <>🍽️ Live Kitchen Order Tickets (KOT)</>}
              {panel === 'tables' && <>🪑 Restaurant Table Floor Plan Grid</>}
              {panel === 'gstin' && <>📊 B2B GST Compliance Ledger</>}
              {panel === 'crm' && <>🤝 CRM & Credit Control Ledger</>}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full border hover:scale-105 active:scale-95 transition-transform dark:border-slate-800 dark:bg-slate-950 hover:bg-red-500 hover:text-white cursor-pointer select-none"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          
          {panel === 'batches' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                <div className="relative w-full sm:max-w-md">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500"><Search size={16} /></span>
                  <input
                    type="text"
                    value={batchSearch}
                    onChange={(e) => setBatchSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs border rounded-xl dark:bg-slate-950 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Search by batch number or medicine name..."
                  />
                </div>
                <div className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-2">
                  <Database size={14} className="text-blue-500" />
                  SQLite Active Ledger Connection: Online
                </div>
              </div>

              {batchesLoading ? (
                <div className="py-12 flex justify-center items-center"><div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" /></div>
              ) : (
                <div className="border dark:border-slate-800 rounded-2xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 border-b dark:border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="p-4">Medicine & SKU</th>
                        <th className="p-4">Batch Number</th>
                        <th className="p-4">Mfg / Expiry Date</th>
                        <th className="p-4">Available Qty</th>
                        <th className="p-4">Drug License Required</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-slate-800">
                      {filteredBatches.map(b => (
                        <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                          <td className="p-4">
                            <div className="font-extrabold text-sm">{b.product_name}</div>
                            <div className="text-[10px] text-gray-500 uppercase font-semibold">{b.product_sku || 'MED-GEN-01'}</div>
                          </td>
                          <td className="p-4 font-mono font-bold text-blue-500">{b.batch_number}</td>
                          <td className="p-4">
                            <div className="font-semibold text-gray-400">Mfg: {b.manufacturing_date || 'N/A'}</div>
                            <div className="font-extrabold text-white">Exp: {b.expiry_date}</div>
                          </td>
                          <td className="p-4 font-extrabold text-sm">{b.stock_quantity} units</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              b.prescription_required ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                            }`}>
                              {b.prescription_required ? 'Rx Drug Lock' : 'Over the Counter'}
                            </span>
                          </td>
                          <td className="p-4">{getExpiryBadge(b.expiry_date)}</td>
                          <td className="p-4 text-right">
                            <button 
                              onClick={() => {
                                toast.success(`📦 Stock recall triggered for Batch ${b.batch_number}. Notification sent to warehouse.`);
                              }}
                              className="px-2.5 py-1.5 bg-red-500/15 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg font-bold text-[10px] uppercase select-none transition-all active:scale-95 cursor-pointer"
                            >
                              Recall Batch
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {panel === 'prescriptions' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="border dark:border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 border-b dark:border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="p-4">Patient Details</th>
                        <th className="p-4">Required Medicine</th>
                        <th className="p-4">Doctor</th>
                        <th className="p-4">Verification</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-slate-800">
                      {prescriptions.map(rx => (
                        <tr 
                          key={rx.id} 
                          className={`hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-pointer ${
                            selectedRx?.id === rx.id ? 'bg-blue-500/5 dark:bg-blue-500/5 border-l-2 border-l-blue-500' : ''
                          }`}
                          onClick={() => setSelectedRx(rx)}
                        >
                          <td className="p-4">
                            <div className="font-extrabold text-sm">{rx.patientName}</div>
                            <div className="text-[10px] text-gray-500">{rx.date}</div>
                          </td>
                          <td className="p-4 font-mono font-bold text-purple-400">{rx.medicineName}</td>
                          <td className="p-4 font-semibold text-gray-400">{rx.doctorName}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              rx.status === 'verified' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              rx.status === 'blocked' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {rx.status}
                            </span>
                          </td>
                          <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1.5 justify-end">
                              <button 
                                onClick={() => handleVerifyRx(rx.id, 'verified')}
                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded border border-emerald-500/10 cursor-pointer transition-all active:scale-95"
                                title="Approve Verification"
                              >
                                ✓
                              </button>
                              <button 
                                onClick={() => handleVerifyRx(rx.id, 'blocked')}
                                className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded border border-red-500/10 cursor-pointer transition-all active:scale-95"
                                title="Block Purchase"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border dark:border-slate-800 rounded-3xl p-5 flex flex-col bg-slate-950/40 justify-between">
                {selectedRx ? (
                  <div className="space-y-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-blue-500 uppercase tracking-wider mb-3">Prescription Document Preview</h3>
                      <div className="rounded-xl overflow-hidden border dark:border-slate-800 bg-slate-900 h-44 relative flex items-center justify-center">
                        <img 
                          src={selectedRx.fileUrl} 
                          alt="Prescription Scan" 
                          className="w-full h-full object-cover opacity-60"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent flex items-end p-3">
                          <div className="text-[10px] text-gray-300 font-bold">Doc ID: {selectedRx.id.toUpperCase()}</div>
                        </div>
                      </div>
                      <div className="space-y-2 mt-4 text-xs">
                        <div className="flex justify-between"><span className="text-gray-400">Patient:</span> <span className="font-bold text-white">{selectedRx.patientName}</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">Physician:</span> <span className="font-bold text-white">{selectedRx.doctorName}</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">Rx Drug:</span> <span className="font-bold text-purple-400">{selectedRx.medicineName}</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">Verification:</span> 
                          <span className={`font-black uppercase text-[10px] ${
                            selectedRx.status === 'verified' ? 'text-emerald-500' : selectedRx.status === 'blocked' ? 'text-red-500' : 'text-amber-500'
                          }`}>{selectedRx.status}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 border-t dark:border-slate-800 pt-4 mt-4">
                      <button
                        onClick={() => handleVerifyRx(selectedRx.id, 'verified')}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs uppercase cursor-pointer select-none active:scale-95 transition-all"
                      >
                        Approve Rx Lock
                      </button>
                      <button
                        onClick={() => handleVerifyRx(selectedRx.id, 'blocked')}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs uppercase cursor-pointer select-none active:scale-95 transition-all"
                      >
                        Reject & Lock
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-10">
                    <Clock size={40} className="opacity-30 mb-3" />
                    <h3 className="font-extrabold text-sm">Select a Record</h3>
                    <p className="text-[11px] leading-relaxed max-w-[200px] mt-1">Select any patient prescription ledger on the left to verify active medical scans and unlock pharmacy checkouts.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {panel === 'kot' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {kotTickets.map(ticket => {
                  const isPreparing = ticket.status === 'PREPARING';
                  const isReady = ticket.status === 'READY';
                  const isServed = ticket.status === 'SERVED';
                  return (
                    <div 
                      key={ticket.id} 
                      className={`p-5 rounded-2xl border-2 flex flex-col justify-between h-80 transition-all ${
                        isPreparing ? 'bg-amber-500/5 border-amber-500/40 shadow-lg shadow-amber-500/5' :
                        isReady ? 'bg-emerald-500/5 border-emerald-500/40 shadow-lg shadow-emerald-500/5' :
                        'bg-slate-900/20 border-slate-800 text-gray-400'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-3 border-b dark:border-slate-800 pb-2">
                          <div>
                            <h3 className="font-black text-white text-sm">Table {ticket.tableNum}</h3>
                            <span className="text-[9px] text-gray-500 uppercase font-black">{ticket.id.toUpperCase()}</span>
                          </div>
                          <span className={`text-[9px] px-2 py-0.5 rounded font-black tracking-wider uppercase ${
                            isPreparing ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse' :
                            isReady ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            'bg-slate-800 text-slate-500'
                          }`}>
                            {ticket.status}
                          </span>
                        </div>

                        <div className="space-y-2 overflow-y-auto max-h-36 pr-1">
                          {ticket.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs font-semibold">
                              <span className={isServed ? 'line-through text-gray-500' : 'text-gray-200'}>{item.name}</span>
                              <span className="font-extrabold text-blue-400">x{item.qty}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t dark:border-slate-800 pt-3 flex flex-col gap-2">
                        <div className="flex justify-between text-[10px] font-bold text-gray-450">
                          <span>Cashier: {ticket.cashierName}</span>
                          <span className={isPreparing && ticket.elapsed > 10 ? 'text-red-500 animate-pulse font-extrabold' : ''}>
                            ⏱️ {ticket.elapsed} min ago
                          </span>
                        </div>
                        
                        {!isServed && (
                          <button
                            onClick={() => handleKotAdvance(ticket.id)}
                            className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all select-none ${
                              isPreparing
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-md shadow-amber-500/10'
                                : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-md shadow-emerald-500/10'
                            }`}
                          >
                            {isPreparing ? 'Mark as Ready' : 'Mark as Served'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {panel === 'tables' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 space-y-4">
                <div className="text-xs font-bold text-gray-550 uppercase mb-2">Dining Room Floor Plan Register</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {tablesList.map(table => {
                    const isAvail = table.status === 'available';
                    const isOcc = table.status === 'occupied';
                    return (
                      <div
                        key={table.id}
                        onClick={() => setSelectedTable(table)}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.97] flex flex-col justify-between h-36 ${
                          selectedTable?.id === table.id
                            ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/5'
                            : isAvail
                            ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-400'
                            : isOcc
                            ? 'bg-amber-500/5 border-amber-500/30 text-amber-400'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-extrabold text-sm text-white">{table.name}</h3>
                            <span className="text-[10px] text-gray-550">{table.seats} seats capacity</span>
                          </div>
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            isAvail ? 'bg-emerald-500' : isOcc ? 'bg-amber-500' : 'bg-gray-500'
                          }`} />
                        </div>

                        <div className="pt-4 border-t border-dashed dark:border-slate-800/80 flex flex-col justify-between">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Active Order Check</span>
                          <span className="font-extrabold text-white text-sm mt-0.5">
                            {isOcc ? `₹${table.total.toFixed(0)}` : 'Empty'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border dark:border-slate-800 rounded-3xl p-5 flex flex-col bg-slate-950/40 justify-between">
                {selectedTable ? (
                  <div className="space-y-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-extrabold text-base text-white">{selectedTable.name} Registers</h3>
                          <span className="text-[10px] text-gray-550">{selectedTable.seats} Seats Dine-In layout</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          selectedTable.status === 'available' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          selectedTable.status === 'occupied' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {selectedTable.status}
                        </span>
                      </div>

                      {selectedTable.status === 'occupied' && (
                        <div className="mt-4 space-y-3">
                          <span className="text-[9px] font-black text-gray-550 uppercase tracking-widest block mb-1">Ordered Dishes</span>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {selectedTable.items && selectedTable.items.map((item: any, idx: number) => {
                              const isObj = typeof item === 'object' && item !== null;
                              const name = isObj ? item.name : item.split(' x')[0];
                              const qty = isObj ? item.quantity : item.split(' x')[1];
                              return (
                                <div key={idx} className="flex justify-between text-xs font-semibold bg-slate-900/60 p-2 rounded-lg border dark:border-slate-850">
                                  <span className="text-gray-300">{name}</span>
                                  <span className="font-black text-blue-400">x{qty}</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between text-xs font-bold border-t dark:border-slate-800 pt-3">
                            <span className="text-gray-400">Active Bill Total:</span>
                            <span className="text-white font-extrabold text-sm">₹{selectedTable.total.toFixed(0)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 border-t dark:border-slate-800 pt-4 mt-4">
                      <button
                        onClick={() => {
                          try {
                            localStorage.setItem('nexusflowActiveTable', JSON.stringify(selectedTable));
                            window.dispatchEvent(new CustomEvent('active-table-selected', { detail: { table: selectedTable } }));
                            setActiveSectorPanel(null);
                            toast.success(`🍽️ POS loaded for ${selectedTable.name}`);
                            navigate('/');
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-xl text-xs uppercase cursor-pointer select-none active:scale-95 transition-all flex items-center justify-center gap-1.5"
                      >
                        {selectedTable.status === 'occupied' ? <>✏️ Edit Order / Add Food</> : <>🍽️ Take Order & Add Food</>}
                      </button>
                      <button
                        onClick={() => handleTableToggle(selectedTable.id)}
                        className="w-full py-2 border dark:border-slate-800 dark:bg-slate-900/40 text-gray-450 font-bold rounded-xl text-xs uppercase cursor-pointer select-none active:scale-95 transition-all"
                      >
                        Toggle Status Manually
                      </button>
                      <button
                        onClick={() => {
                          toast.success(`💳 Printing receipt and billing register for ${selectedTable.name}`);
                        }}
                        disabled={selectedTable.status !== 'occupied'}
                        className={`w-full py-2 border dark:border-slate-800 dark:bg-slate-950 font-bold rounded-xl text-xs uppercase cursor-pointer select-none active:scale-95 transition-all ${
                          selectedTable.status !== 'occupied' ? 'opacity-40 cursor-not-allowed text-gray-600' : 'text-gray-300'
                        }`}
                      >
                        Print Table Check Bill
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-10">
                    <Store size={40} className="opacity-30 mb-3" />
                    <h3 className="font-extrabold text-sm">Select Table</h3>
                    <p className="text-[11px] leading-relaxed max-w-[200px] mt-1">Select any dine-in floorplan table on the left to allocate seats, review KOT receipts, or trigger billing checkouts.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {panel === 'gstin' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 border dark:border-slate-850 dark:bg-slate-900/40 rounded-2xl">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Total Taxable Turnover</span>
                  <div className="text-xl font-extrabold text-white mt-1">$159,500.00</div>
                </div>
                <div className="p-4 border dark:border-slate-850 dark:bg-slate-900/40 rounded-2xl">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">CGST collected (9%)</span>
                  <div className="text-xl font-extrabold text-blue-500 mt-1">$6,210.00</div>
                </div>
                <div className="p-4 border dark:border-slate-850 dark:bg-slate-900/40 rounded-2xl">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">SGST collected (9%)</span>
                  <div className="text-xl font-extrabold text-emerald-500 mt-1">$6,210.00</div>
                </div>
                <div className="p-4 border dark:border-slate-850 dark:bg-slate-900/40 rounded-2xl">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">IGST collected (18%)</span>
                  <div className="text-xl font-extrabold text-purple-500 mt-1">$15,540.00</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                <div className="relative w-full sm:max-w-md">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500"><Search size={16} /></span>
                  <input
                    type="text"
                    value={gstSearch}
                    onChange={(e) => setGstSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs border rounded-xl dark:bg-slate-900 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Search by buyer GSTIN or business name..."
                  />
                </div>
                <button
                  onClick={handleExportGstr}
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-xl text-xs uppercase cursor-pointer select-none active:scale-95 transition-all shadow-md shadow-blue-500/10"
                >
                  Export GSTR-1 Ledger
                </button>
              </div>

              <div className="border dark:border-slate-800 rounded-2xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 border-b dark:border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="p-4">Invoice / Buyer Details</th>
                      <th className="p-4">Buyer GSTIN</th>
                      <th className="p-4">Taxable Amount</th>
                      <th className="p-4">CGST (9%)</th>
                      <th className="p-4">SGST (9%)</th>
                      <th className="p-4">IGST (18%)</th>
                      <th className="p-4">Destination State</th>
                      <th className="p-4 text-right">Tax Liability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-slate-800">
                    {filteredGst.map(g => (
                      <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="p-4">
                          <div className="font-extrabold text-sm">{g.buyerName}</div>
                          <div className="text-[10px] font-mono text-blue-500 font-bold uppercase">{g.id.toUpperCase()}</div>
                        </td>
                        <td className="p-4 font-mono font-bold text-slate-400">{g.gstin}</td>
                        <td className="p-4 font-extrabold">${g.subtotal.toLocaleString()}</td>
                        <td className="p-4 font-semibold text-blue-500">${g.cgst.toLocaleString()}</td>
                        <td className="p-4 font-semibold text-emerald-500">${g.sgst.toLocaleString()}</td>
                        <td className="p-4 font-semibold text-purple-500">${g.igst.toLocaleString()}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                            <MapPin size={11} className="text-gray-500" />
                            {g.destinationState}
                          </div>
                        </td>
                        <td className="p-4 text-right font-extrabold text-white text-sm">
                          ${(g.cgst + g.sgst + g.igst).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {panel === 'crm' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 space-y-4">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500"><Search size={16} /></span>
                  <input
                    type="text"
                    value={crmSearch}
                    onChange={(e) => setCrmSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs border rounded-xl dark:bg-slate-900 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Search buyer portfolio by name or telephone..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredCrm.map(c => {
                    const usagePercent = c.limit > 0 ? (c.outstanding / c.limit) * 100 : 0;
                    return (
                      <div
                        key={c.phone}
                        onClick={() => setSelectedCrmCust(c)}
                        className={`p-5 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col justify-between h-44 ${
                          selectedCrmCust?.name === c.name
                            ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/5'
                            : 'bg-slate-900/40 border-slate-800'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-extrabold text-sm text-white">{c.name}</h3>
                              <span className="text-[10px] text-gray-500">PH: {c.phone}</span>
                            </div>
                            <span className={`text-[8.5px] px-2 py-0.5 rounded font-black tracking-wider uppercase ${
                              c.rating === 'Low' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              c.rating === 'Medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              'bg-red-500/10 text-red-500 border border-red-500/20'
                            }`}>
                              {c.rating} Risk
                            </span>
                          </div>

                          <div className="space-y-1 mt-3">
                            <div className="flex justify-between text-[10px] font-bold text-gray-450">
                              <span>Credit Ledger Usage:</span>
                              <span>{usagePercent.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  usagePercent > 80 ? 'bg-red-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-blue-500'
                                }`} 
                                style={{ width: `${Math.min(100, usagePercent)}%` }} 
                              />
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t dark:border-slate-850 flex justify-between text-xs">
                          <div>
                            <span className="text-[9px] text-slate-500 uppercase font-black block">Balance Owed</span>
                            <span className="font-extrabold text-white">${c.outstanding.toLocaleString()}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-slate-500 uppercase font-black block">Total Limit</span>
                            <span className="font-extrabold text-gray-400">${c.limit.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border dark:border-slate-800 rounded-3xl p-5 flex flex-col bg-slate-950/40 justify-between">
                {selectedCrmCust ? (
                  <div className="space-y-5 flex-1 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-extrabold text-base text-white">{selectedCrmCust.name}</h3>
                        <span className="text-[10px] text-gray-550">Ledger terms: {selectedCrmCust.terms}</span>
                      </div>

                      <div className="space-y-2 p-3 bg-slate-900/60 rounded-2xl border dark:border-slate-850">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider block">Record Outstanding Bill Payment</span>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500 text-xs font-bold">$</span>
                          <input
                            type="number"
                            value={payOutstandingAmount}
                            onChange={(e) => setPayOutstandingAmount(e.target.value)}
                            className="w-full pl-6 pr-3 py-1.5 text-xs border rounded-lg dark:bg-slate-900 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Enter paid cash..."
                          />
                        </div>
                        <button
                          onClick={handlePayOutstanding}
                          className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] uppercase select-none cursor-pointer active:scale-95 transition-all"
                        >
                          Submit Ledger Payoff
                        </button>
                      </div>

                      <div className="space-y-2 p-3 bg-slate-900/60 rounded-2xl border dark:border-slate-850">
                        <span className="text-[9px] font-black text-gray-550 uppercase tracking-wider block">Adjust Wholesale Credit Limit</span>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500 text-xs font-bold">$</span>
                          <input
                            type="number"
                            value={adjustLimitAmount}
                            onChange={(e) => setAdjustLimitAmount(e.target.value)}
                            className="w-full pl-6 pr-3 py-1.5 text-xs border rounded-lg dark:bg-slate-900 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="New limit amount..."
                          />
                        </div>
                        <button
                          onClick={handleUpdateCreditLimit}
                          className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[10px] uppercase select-none cursor-pointer active:scale-95 transition-all"
                        >
                          Configure credit limit
                        </button>
                      </div>
                    </div>

                    <div className="border-t dark:border-slate-800 pt-4 text-xs space-y-1.5 mt-4">
                      <div className="flex justify-between text-gray-400"><span>Risk Rating:</span> <span className="font-extrabold text-white">{selectedCrmCust.rating} Risk</span></div>
                      <div className="flex justify-between text-gray-400"><span>Owed ledger:</span> <span className="font-extrabold text-red-400">${selectedCrmCust.outstanding.toLocaleString()}</span></div>
                      <div className="flex justify-between text-gray-400"><span>Available limit:</span> <span className="font-extrabold text-emerald-400">${(selectedCrmCust.limit - selectedCrmCust.outstanding).toLocaleString()}</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-10">
                    <Users size={40} className="opacity-30 mb-3" />
                    <h3 className="font-extrabold text-sm">Select Buyer</h3>
                    <p className="text-[11px] leading-relaxed max-w-[200px] mt-1">Select any wholesale buyer account on the left to reconcile outstanding dues, adjust credit lines, or configure NET payment terms.</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// Migrate existing Evalix settings to NexusFlow if needed
const getMigratedKey = (key: string, defaultVal: string): string => {
  try {
    const nexusKey = `nexusflow${key}`;
    const evalixKey = `evalix${key}`;
    const value = localStorage.getItem(nexusKey);
    if (value !== null) return value;
    
    // Fallback and migrate old key
    const oldVal = localStorage.getItem(evalixKey);
    if (oldVal !== null) {
      localStorage.setItem(nexusKey, oldVal);
      return oldVal;
    }
  } catch {}
  return defaultVal;
};

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout, currentSession, endShift, isOwner, hasPermission, startBreak, endBreak, isOnBreak } = useAuth();
  const [isKioskLocked, setIsKioskLocked] = useState(false);

  // 🔒 Kiosk Immersive Mode Fullscreen Monitoring
  useEffect(() => {
    if (
      !isAuthenticated ||
      user?.username === 'developer' ||
      user?.role === 'owner' ||
      user?.role === 'co-owner'
    ) {
      setIsKioskLocked(false);
      return;
    }

    const checkFullscreen = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      // If not on break and not fullscreen, lock it!
      if (!isFs && !isOnBreak) {
        setIsKioskLocked(true);
      } else {
        setIsKioskLocked(false);
      }
    };

    // Run check immediately on mount/state changes
    checkFullscreen();

    // Attach event listeners for any fullscreen changes
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    document.addEventListener('mozfullscreenchange', checkFullscreen);
    document.addEventListener('MSFullscreenChange', checkFullscreen);

    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
      document.removeEventListener('mozfullscreenchange', checkFullscreen);
      document.removeEventListener('MSFullscreenChange', checkFullscreen);
    };
  }, [isAuthenticated, user, isOnBreak]);

  const handleRestoreFullscreen = async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen();
      } else if ((el as any).msRequestFullscreen) {
        await (el as any).msRequestFullscreen();
      }
      setIsKioskLocked(false);
    } catch (err) {
      console.warn('[Kiosk Immersive Mode] Fullscreen auto-restoration deferred (requires direct cashier interaction):', err);
    }
  };
  const { darkMode, toggleDarkMode, showSettings, setShowSettings } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Sector Personality State
  const [activeSector, setActiveSector] = useState<'retail' | 'wholesale' | 'restaurant' | 'pharmacy'>(() => {
    return (getMigratedKey('Sector', 'retail') as any);
  });

  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return getMigratedKey('Onboarded', 'false') !== 'true';
  });

  const [multiSectorEnabled, setMultiSectorEnabled] = useState<boolean>(() => {
    return getMigratedKey('MultiSectorEnabled', 'false') === 'true';
  });

  const [chatEnabled, setChatEnabled] = useState<boolean>(() => {
    return getMigratedKey('ChatEnabled', 'true') !== 'false';
  });

  const [activeSectorPanel, setActiveSectorPanel] = useState<'kot' | 'tables' | 'batches' | 'prescriptions' | 'gstin' | 'crm' | null>(null);

  // Listen to setting updates in workspace profiles
  useEffect(() => {
    const handleProfileSync = () => {
      try {
        const onboarded = localStorage.getItem('nexusflowOnboarded') === 'true';
        const multiEnabled = localStorage.getItem('nexusflowMultiSectorEnabled') === 'true';
        const sector = localStorage.getItem('nexusflowSector') as any;
        
        setShowOnboarding(!onboarded);
        setMultiSectorEnabled(multiEnabled);
        if (sector) {
          setActiveSector(sector);
        }
        const chatSetting = localStorage.getItem('nexusflowChatEnabled');
        setChatEnabled(chatSetting !== 'false');
      } catch (e) {}
    };

    window.addEventListener('nexusflow-profile-updated', handleProfileSync);
    return () => window.removeEventListener('nexusflow-profile-updated', handleProfileSync);
  }, []);

  // Listen to setting updates in dining tables editor
  useEffect(() => {
    const handleTablesSync = () => {
      try {
        const saved = localStorage.getItem('nexusflowTablesList');
        if (saved) {
          setTablesList(JSON.parse(saved));
        }
      } catch (e) {}
    };
    window.addEventListener('nexusflow-tables-updated', handleTablesSync);
    return () => window.removeEventListener('nexusflow-tables-updated', handleTablesSync);
  }, []);

  const handleSectorChange = (sector: 'retail' | 'wholesale' | 'restaurant' | 'pharmacy') => {
    setActiveSector(sector);
    localStorage.setItem('nexusflowSector', sector);
    toast.success(`✨ NexusFlow profile switched to ${sector.toUpperCase()}!`, {
      description: 'Interface dynamically configured for ' + (
        sector === 'retail' ? 'Supermarket & POS' :
        sector === 'wholesale' ? 'Wholesale B2B & GST' :
        sector === 'restaurant' ? 'Dine-In, Tables & KOT' : 'Batch, Expiry & Pharmacy'
      )
    });
    window.dispatchEvent(new CustomEvent('sector-changed', { detail: { sector } }));
  };



  const getSectorColorProfile = () => {
    switch (activeSector) {
      case 'wholesale':
        return {
          gradient: 'from-emerald-500 to-teal-600',
          text: 'text-emerald-500',
          badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          label: 'Wholesale B2B'
        };
      case 'restaurant':
        return {
          gradient: 'from-amber-500 to-red-600',
          text: 'text-amber-500',
          badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          label: 'Restaurant Dining'
        };
      case 'pharmacy':
        return {
          gradient: 'from-purple-500 to-indigo-600',
          text: 'text-purple-500',
          badgeBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          label: 'Pharmacy Medicine'
        };
      default:
        return {
          gradient: 'from-blue-500 to-indigo-600',
          text: 'text-blue-500',
          badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          label: 'Retail POS'
        };
    }
  };

  const sectorProfile = getSectorColorProfile();

  const sidebarLinks = useMemo(() => {
    const base = [];
    
    const getPOSLabel = () => {
      switch (activeSector) {
        case 'restaurant': return 'Dining Table POS';
        case 'pharmacy': return 'Pharmacy Dispense';
        case 'wholesale': return 'Wholesale B2B Billing';
        default: return 'Retail POS Billing';
      }
    };
    
    if (isOwner() || hasPermission('access_billing')) {
      base.push({
        id: 'billing',
        label: getPOSLabel(),
        icon: <Receipt size={20} className="flex-shrink-0" />,
        path: '/',
        title: 'Billing'
      });
    }

    if (activeSector === 'restaurant') {
      base.push(
        { id: 'kot', label: 'Kitchen Orders (KOT)', icon: <Coffee size={20} className="flex-shrink-0" />, path: '#', title: 'KOT Console' },
        { id: 'tables', label: 'Table Layout Grid', icon: <Store size={20} className="flex-shrink-0" />, path: '#', title: 'Table Management' }
      );
    } else if (activeSector === 'pharmacy') {
      base.push(
        { id: 'batches', label: 'Batch Expiry Logs', icon: <Database size={20} className="flex-shrink-0" />, path: '#', title: 'Batch Logs' },
        { id: 'prescriptions', label: 'Prescription Records', icon: <Clock size={20} className="flex-shrink-0" />, path: '#', title: 'Prescriptions' }
      );
    } else if (activeSector === 'wholesale') {
      base.push(
        { id: 'gstin', label: 'B2B GST Compliance', icon: <CalendarCheck size={20} className="flex-shrink-0" />, path: '#', title: 'GST Records' },
        { id: 'crm', label: 'CRM & Credit limits', icon: <Users size={20} className="flex-shrink-0" />, path: '#', title: 'CRM & Limits' }
      );
    }

    if (chatEnabled) {
      base.push({
        id: 'chat',
        label: 'Secure LAN Chat',
        icon: <MessageSquare size={20} className="flex-shrink-0" />,
        path: 'chat_trigger',
        title: 'LAN Chat'
      });
    }

    if (isOwner() || hasPermission('view_analytics')) {
      base.push({
        id: 'analytics',
        label: 'Analytics & Insights',
        icon: <BarChart3 size={20} className="flex-shrink-0" />,
        path: '/analytics',
        title: 'Analytics'
      });
    }

    if (isOwner()) {
      base.push({
        id: 'performance',
        label: 'Staff Performance',
        icon: <TrendingUp size={20} className="flex-shrink-0" />,
        path: '/employee-performance',
        title: 'Performance'
      });
    }

    if (isOwner()) {
      base.push({
        id: 'employees',
        label: 'Staff Management',
        icon: <Users size={20} className="flex-shrink-0" />,
        path: '/employees',
        title: 'Employees'
      });
    }

    return base;
  }, [activeSector, user, hasPermission]);

  const handleLinkClick = (link: any) => {
    if (link.path === 'chat_trigger') {
      window.dispatchEvent(new Event('toggle-e2ee-chat'));
      return;
    }
    if (link.path === '#') {
      setActiveSectorPanel(link.id as any);
      return;
    }
    setShowSettings(false);
    navigate(link.path);
  };

  // Synchronize unread E2EE chat count from custom window events
  useEffect(() => {
    const handleUnreadUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      setUnreadChatCount(customEvent.detail?.count || 0);
    };
    window.addEventListener('chat-unread-updated', handleUnreadUpdate);
    return () => window.removeEventListener('chat-unread-updated', handleUnreadUpdate);
  }, []);

  // Attendance & Leaves Modal States
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceTab, setAttendanceTab] = useState<'logs' | 'calendar'>('logs');
  const [sessions, setSessions] = useState<any[]>([]);
  const [leavesList, setLeavesList] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  
  // Active calendar date selection
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState('');
  
  // Grant Leave Form State
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [newLeaveType, setNewLeaveType] = useState<'leave' | 'holiday'>('leave');
  const [newLeaveUserId, setNewLeaveUserId] = useState('');
  const [newLeaveReason, setNewLeaveReason] = useState('');
  
  // Owner filter for logs
  const [sessionsEmployeeFilter, setSessionsEmployeeFilter] = useState('all');
  
  // Owner filter for calendar statuses
  const [calendarEmployeeFilter, setCalendarEmployeeFilter] = useState('all');

  // Real-time login session invalidation (forces instant logout on older registers if a concurrent login session starts)
  useWebSocket({
    SESSION_INVALIDATED: (data: any) => {
      if (data && currentSession && currentSession.id === data.sessionId) {
        toast.error('⚠️ Your session has been terminated because you logged in from another device/register.', {
          duration: 10000,
          position: 'top-center'
        });
        logout();
      }
    }
  });
  const [shopName, setShopName] = useState(() => {
    try {
      const saved = localStorage.getItem('shopDetails');
      return saved ? JSON.parse(saved).name || 'NexusFlow' : 'NexusFlow';
    } catch { return 'NexusFlow'; }
  });

  // Keep shop name in sync if settings change
  useEffect(() => {
    const sync = () => {
      try {
        const saved = localStorage.getItem('shopDetails');
        if (saved) setShopName(JSON.parse(saved).name || 'NexusFlow');
      } catch {}
    };
    window.addEventListener('storage', sync);
    // Also poll on focus in case settings were changed in same tab
    window.addEventListener('focus', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', sync); };
  }, []);

  // Redirect any direct routing to /config back to / and open the settings drawer
  useEffect(() => {
    if (location.pathname === '/config') {
      setShowSettings(true);
      navigate('/', { replace: true });
    }
  }, [location.pathname, navigate, setShowSettings]);

  // Lock parent/body scrolling when settings modal or attendance modal is open to prevent background leak
  useEffect(() => {
    if (showSettings || showAttendanceModal) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [showSettings, showAttendanceModal]);

  // Fetch all logs & leaves
  const fetchAttendanceData = async () => {
    try {
      const isUserOwner = isOwner();
      
      // Fetch shift logs
      const logsUrl = isUserOwner ? '/users/sessions' : '/users/my-sessions';
      const logsData = await api.get<any[]>(logsUrl);
      setSessions(logsData);
      
      // Fetch leaves
      const leavesData = await api.get<any[]>('/leaves');
      setLeavesList(leavesData);

      // Fetch employees list (only for owners to grant leaves)
      if (isUserOwner) {
        const usersData = await api.get<any[]>('/users');
        setEmployees(usersData.filter((u: any) => u.is_active));
        if (usersData.length > 0) {
          setNewLeaveUserId(usersData[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch attendance data:', err);
    }
  };

  useEffect(() => {
    if (showAttendanceModal) {
      fetchAttendanceData();
    }
  }, [showAttendanceModal]);

  // Calendar Navigation Helpers
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Calculate calendar grid days
  const calendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells = [];
    
    // Blank padding cells for previous month padding
    for (let i = 0; i < firstDay; i++) {
      cells.push({ day: null, dateStr: null });
    }

    // Actual calendar days
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ day, dateStr });
    }

    return cells;
  }, [currentDate]);

  const getLeavesForDate = (dateStr: string) => {
    return leavesList.filter(l => l.date === dateStr);
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedDateStr(dateStr);
    if (isOwner()) {
      setShowLeaveForm(true);
    }
  };

  const handleAssignLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDateStr) return;

    try {
      const selectedEmp = employees.find(emp => emp.id === newLeaveUserId);
      const leavePayload = {
        id: `leave_${Date.now()}`,
        user_id: newLeaveType === 'holiday' ? 'all' : newLeaveUserId,
        user_name: newLeaveType === 'holiday' ? 'Store Wide' : (selectedEmp ? selectedEmp.name : 'Employee'),
        date: selectedDateStr,
        type: newLeaveType,
        reason: newLeaveReason || (newLeaveType === 'holiday' ? 'Store Holiday' : 'Casual Leave')
      };

      await api.post('/leaves', leavePayload);
      toast.success(newLeaveType === 'holiday' ? '🎉 Store holiday scheduled successfully!' : '📅 Employee leave granted successfully!');
      
      setNewLeaveReason('');
      setShowLeaveForm(false);
      fetchAttendanceData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to assign leave/holiday');
    }
  };

  const handleRevokeLeave = async (id: string) => {
    try {
      await api.delete(`/leaves/${id}`);
      toast.success('Record revoked successfully');
      fetchAttendanceData();
    } catch (err) {
      toast.error('Failed to revoke leave/holiday');
    }
  };

  const formatDuration = (secs: number | null, logoutTime: string | null) => {
    if (!logoutTime) return 'Active Session';
    if (!secs || secs <= 0) return '0m';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const getTodayDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (showOnboarding) {
    return (
      <OnboardingWizard
        darkMode={darkMode}
        onComplete={(chosenSector, allowMultiSector) => {
          try {
            localStorage.setItem('nexusflowSector', chosenSector);
            localStorage.setItem('nexusflowOnboarded', 'true');
            localStorage.setItem('nexusflowMultiSectorEnabled', allowMultiSector ? 'true' : 'false');
          } catch (e) {
            console.error('Failed to save onboarding settings:', e);
          }

          // Trigger backend installation API to allocate separate database and remove unused databases
          api.post('/settings/install', { sector: chosenSector, multiEnabled: allowMultiSector })
            .then(() => {
              toast.success(`🎉 Installation completed!`, {
                description: `Bespoke sector database (${chosenSector}.db) prepared. Unwanted billing databases deleted.`
              });
            })
            .catch(err => {
              console.error('[INSTALL] Backend database swap failed:', err);
            })
            .finally(() => {
              setActiveSector(chosenSector);
              setMultiSectorEnabled(allowMultiSector);
              setShowOnboarding(false);
              window.dispatchEvent(new CustomEvent('sector-changed', { detail: { sector: chosenSector } }));
            });
        }}
      />
    );
  }

  return (
    <div className={`relative flex h-screen overflow-hidden ${darkMode ? 'bg-gray-955 text-white' : 'bg-gray-55 text-gray-900'} px-0`}>
      {/* 🔮 Interactive High-Performance Mesh Background Constellation & Parallax Blobs */}
      <InteractiveMeshBackground />


      {/* Collapsible Sidebar */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } transition-all duration-300 ease-in-out flex-shrink-0 ${
          darkMode 
            ? 'bg-gray-900/60 border-gray-800/80 text-white' 
            : 'bg-white/60 border-gray-200/50 text-gray-800'
        } border-r backdrop-blur-md flex flex-col relative z-20`}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`absolute -right-3.5 top-6 z-30 w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-md transition-all hover:scale-110 ${
            darkMode
              ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {sidebarCollapsed
            ? <ChevronRight size={14} />
            : <ChevronLeft size={14} />}
        </button>

        {/* Logo/Brand */}
        <div className={`px-4 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex flex-col gap-3.5 overflow-hidden`}>
          <div className="flex items-center gap-3">
            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-black text-lg text-white bg-gradient-to-br ${sectorProfile.gradient} shadow-lg shadow-blue-500/10 transition-all duration-500 transform hover:rotate-12`}>
              N
            </div>
            {!sidebarCollapsed && (
              <div className="overflow-hidden">
                <h1 className={`text-sm font-black tracking-tight leading-tight truncate ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  NexusFlow
                </h1>
                <p className={`text-[10px] font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-505'}`}>
                  Unified OS
                </p>
              </div>
            )}
          </div>
          
          {/* Dynamic Sector Selector Dropdown */}
          {!sidebarCollapsed && multiSectorEnabled && (
            <div className="flex flex-col gap-1 mt-1 transition-all duration-300 animate-fade-in">
              <span className={`text-[8px] font-black uppercase tracking-widest opacity-50 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Sector personality
              </span>
              <select
                value={activeSector}
                onChange={(e) => handleSectorChange(e.target.value as any)}
                className={`w-full px-2.5 py-1.5 border rounded-xl text-[11px] font-extrabold focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer ${
                  darkMode 
                    ? 'bg-slate-900 border-slate-800 text-slate-200' 
                    : 'bg-slate-50 border-slate-200 text-slate-800 shadow-sm'
                }`}
              >
                <option value="retail">🛒 Retail POS</option>
                <option value="wholesale">🏢 Wholesale B2B</option>
                <option value="restaurant">🍽️ Restaurant Dining</option>
                <option value="pharmacy">💊 Pharmacy Medicine</option>
              </select>
            </div>
          )}

          {!sidebarCollapsed && !multiSectorEnabled && (
            <div className="mt-1 flex flex-col gap-1 animate-fade-in">
              <span className={`text-[8px] font-black uppercase tracking-widest opacity-50 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Industry Mode
              </span>
              <div className="flex">
                <span className={`text-[9.5px] px-2.5 py-1 rounded-lg font-black tracking-wide uppercase shadow-sm select-none border bg-gradient-to-r ${sectorProfile.gradient} text-white border-transparent`}>
                  {activeSector === 'pharmacy' && '🧪 '}
                  {activeSector === 'restaurant' && '🍽️ '}
                  {activeSector === 'wholesale' && '🏢 '}
                  {activeSector === 'retail' && '🛒 '}
                  {sectorProfile.label}
                </span>
              </div>
            </div>
          )}
        </div>

        <nav className={`flex-1 py-3 ${sidebarCollapsed ? 'px-2' : 'px-3'} space-y-1 overflow-y-auto no-scrollbar`}>
          {sidebarLinks.map((link) => {
            const isPOSBilling = link.id === 'billing';
            const isActive = isPOSBilling 
              ? (location.pathname === '/' && !showSettings)
              : (location.pathname === link.path);

            return (
              <button
                key={link.id}
                title={link.title}
                onClick={() => handleLinkClick(link)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left relative group hover:scale-[1.02] active:scale-[0.98] select-none ${
                  isActive
                    ? `bg-gradient-to-r ${sectorProfile.gradient} text-white shadow-lg`
                    : darkMode
                      ? 'text-gray-300 hover:bg-gray-800'
                      : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="relative flex-shrink-0">
                  {link.icon}
                  {link.id === 'chat' && sidebarCollapsed && unreadChatCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-black text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center border border-gray-900 animate-bounce">
                      {unreadChatCount}
                    </span>
                  )}
                </div>
                
                {!sidebarCollapsed && (
                  <span className="font-semibold text-xs whitespace-nowrap">{link.label}</span>
                )}
                
                {link.id === 'chat' && !sidebarCollapsed && unreadChatCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full animate-bounce">
                    {unreadChatCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Theme Toggle */}
          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left group hover:scale-[1.02] active:scale-[0.98] select-none ${
              darkMode
                ? 'text-yellow-400 hover:bg-gray-800'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {darkMode
              ? <Sun size={20} className="flex-shrink-0" />
              : <Moon size={20} className="flex-shrink-0" />}
            {!sidebarCollapsed && (
              <span className="font-semibold text-xs whitespace-nowrap">
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </span>
            )}
          </button>

          {/* Settings */}
          {isOwner() && (
            <button
              title="Settings"
              onClick={() => setShowSettings(true)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left group hover:scale-[1.02] active:scale-[0.98] select-none ${
                showSettings
                  ? `bg-gradient-to-r ${sectorProfile.gradient} text-white shadow-lg`
                  : darkMode
                    ? 'text-gray-300 hover:bg-gray-800'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Settings size={20} className="flex-shrink-0" />
              {!sidebarCollapsed && <span className="font-semibold text-xs whitespace-nowrap">Settings</span>}
            </button>
          )}
        </nav>

        {/* Bottom Panel */}
        <div className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} ${
          sidebarCollapsed ? 'p-2 space-y-2' : 'p-3 space-y-2'
        }`}>
          {sidebarCollapsed ? (
            /* Collapsed: just icons */
            <>
              {user?.role === 'employee' && (
                <button
                  onClick={isOnBreak ? endBreak : startBreak}
                  title={isOnBreak ? 'End Break' : 'Start Break'}
                  className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors ${
                    isOnBreak
                      ? 'bg-orange-500 text-white'
                      : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Coffee size={18} />
                </button>
              )}
              <button
                onClick={() => setShowAttendanceModal(true)}
                title="Attendance & Calendar"
                className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors ${
                  darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Clock size={18} />
              </button>
              <button
                onClick={user?.role === 'employee' ? endShift : logout}
                title={user?.role === 'employee' ? 'End Shift' : 'Logout'}
                className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors ${
                  darkMode ? 'bg-red-900/20 text-red-400 hover:bg-red-900/30' : 'bg-red-50 text-red-600 hover:bg-red-100'
                }`}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            /* Expanded: full user card */
            <>
              <div className={`p-2.5 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg`}>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`p-1.5 flex-shrink-0 ${darkMode ? 'bg-gray-600' : 'bg-white'} rounded-lg`}>
                    <User size={16} className={darkMode ? 'text-gray-300' : 'text-gray-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-800'} truncate`}>
                      {user?.name}
                    </p>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {user?.role === 'owner' ? 'Owner' : user?.role === 'co-owner' ? 'Co-Owner' : 'Employee'}
                    </p>
                  </div>
                </div>

                {user?.role === 'employee' ? (
                  <>
                    {isOnBreak && (
                      <div className={`mb-1.5 px-2 py-1 ${darkMode ? 'bg-orange-900/30 border-orange-800' : 'bg-orange-50 border-orange-200'} border rounded-lg flex items-center gap-1.5 animate-pulse`}>
                        <Clock size={12} className="text-orange-500" />
                        <span className={`text-xs font-medium ${darkMode ? 'text-orange-400' : 'text-orange-700'}`}>On Break</span>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        onClick={() => setShowAttendanceModal(true)}
                        className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:scale-[1.02] active:scale-[0.98] select-none ${
                          darkMode
                            ? 'bg-slate-800 hover:bg-slate-750 border-slate-700/50 text-slate-200 shadow-md shadow-black/5'
                            : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-700'
                        }`}
                      >
                        <Clock size={13} />
                        Attendance
                      </button>
                      
                      <button
                        onClick={isOnBreak ? endBreak : startBreak}
                        className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] select-none ${
                          isOnBreak
                            ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/10'
                            : darkMode
                            ? 'bg-slate-800 hover:bg-slate-750 border-slate-700/50 text-slate-200 border shadow-md shadow-black/5'
                            : 'bg-white hover:bg-gray-50 border border-gray-300 text-gray-700'
                        }`}
                      >
                        <Coffee size={13} />
                        {isOnBreak ? 'End Break' : 'Break'}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => setShowAttendanceModal(true)}
                    className={`w-full mt-2 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:scale-[1.02] active:scale-[0.98] select-none ${
                      darkMode
                        ? 'bg-slate-800 hover:bg-slate-750 border-slate-700/50 text-slate-200 shadow-md shadow-black/5'
                        : 'bg-white hover:bg-gray-50 border border-gray-300 text-gray-700'
                    }`}
                  >
                    <Clock size={14} />
                    Attendance & Calendar
                  </button>
                )}
              </div>

              <button
                onClick={user?.role === 'employee' ? endShift : logout}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'bg-red-900/20 text-red-400 hover:bg-red-900/30'
                    : 'bg-red-50 text-red-600 hover:bg-red-100'
                }`}
              >
                <LogOut size={16} />
                <span className="text-xs font-medium">
                  {user?.role === 'employee' ? 'End Shift' : 'Logout'}
                </span>
              </button>


            </>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        <Suspense fallback={<PageLoader darkMode={darkMode} />}>
          <Outlet />
        </Suspense>

        {/* Unified Settings Modal */}
        {showSettings && (
          <Suspense fallback={null}>
            <POSSettings 
              isModal={true} 
              onClose={() => setShowSettings(false)} 
            />
          </Suspense>
        )}

        {/* Unified Attendance & Shifts Calendar Modal */}
        {showAttendanceModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-6 animate-fade-in">
            <div className={`w-full max-w-5xl h-[82vh] ${
              darkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-800'
            } shadow-2xl rounded-2xl flex flex-col z-50 overflow-hidden border border-gray-100 dark:border-gray-800 animate-scale-in`}>
              
              {/* Modal Header */}
              <div className={`p-5 border-b ${darkMode ? 'border-gray-800' : 'border-gray-100'} flex justify-between items-center bg-opacity-70 backdrop-blur-md flex-shrink-0`}>
                <div>
                  <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Attendance & Calendar Log</h2>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                    Track daily shifts login/logout times, schedule employee leaves, and declare store holidays.
                  </p>
                </div>
                <button 
                  onClick={() => setShowAttendanceModal(false)}
                  className={`p-2 rounded-xl transition-all ${darkMode ? 'hover:bg-gray-800 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-555 hover:text-gray-900'}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className={`p-4 border-b ${darkMode ? 'border-gray-800' : 'border-gray-100'} flex gap-3 flex-shrink-0`}>
                <button
                  onClick={() => setAttendanceTab('logs')}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all select-none cursor-pointer ${
                    attendanceTab === 'logs'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
                      : darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <History size={14} />
                  Shift Logs History
                </button>
                <button
                  onClick={() => setAttendanceTab('calendar')}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all select-none cursor-pointer ${
                    attendanceTab === 'calendar'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
                      : darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Calendar size={14} />
                  Leave & Holiday Calendar
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-hidden p-5 flex flex-col min-h-0">
                {attendanceTab === 'logs' ? (
                  <div className="h-full flex flex-col min-h-0 overflow-hidden">
                    {/* Log Toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
                      <div>
                        <h3 className="text-sm font-bold tracking-wide">Daily Shift Duration Logs</h3>
                        <p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          All local terminal active login sessions and logout timestamps.
                        </p>
                      </div>
                      
                      {isOwner() && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-bold opacity-60">Employee:</span>
                          <select
                            value={sessionsEmployeeFilter}
                            onChange={(e) => setSessionsEmployeeFilter(e.target.value)}
                            className={`px-2 py-1 text-xs border rounded-lg ${
                              darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                            } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                          >
                            <option value="all">All Employees</option>
                            {employees.map((emp: any) => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Table View */}
                    <div className="flex-1 overflow-y-auto border border-gray-150/10 rounded-xl min-h-0">
                      <table className="w-full text-left border-collapse">
                        <thead className={`sticky top-0 z-10 ${darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'} text-[10px] font-bold uppercase tracking-wider`}>
                          <tr>
                            <th className="px-4 py-3">Cashier/User</th>
                            <th className="px-4 py-3">Role</th>
                            <th className="px-4 py-3 text-center">Login Time</th>
                            <th className="px-4 py-3 text-center">Logout Time</th>
                            <th className="px-4 py-3 text-right">Active Duration</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y text-xs ${darkMode ? 'divide-slate-800/80 text-gray-200' : 'divide-gray-155 text-gray-705'}`}>
                          {sessions.filter(s => sessionsEmployeeFilter === 'all' || s.user_id === sessionsEmployeeFilter).length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                                No shift records found in logs.
                              </td>
                            </tr>
                          ) : (
                            sessions
                              .filter(s => sessionsEmployeeFilter === 'all' || s.user_id === sessionsEmployeeFilter)
                              .map((session) => (
                                <tr key={session.id} className="hover:bg-gray-50/40 dark:hover:bg-slate-900/10 transition-colors">
                                  <td className="px-4 py-3 font-semibold text-sm">
                                    {session.user_name || 'System User'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                      session.user_role === 'owner' || session.user_role === 'co-owner'
                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                    }`}>
                                      {session.user_role === 'owner' ? 'Owner' : session.user_role === 'co-owner' ? 'Co-Owner' : 'Employee'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono text-[11px] opacity-80">
                                    {new Date(session.login_time).toLocaleString('en-IN', {
                                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                    })}
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono text-[11px] opacity-85">
                                    {session.logout_time ? (
                                      new Date(session.logout_time).toLocaleString('en-IN', {
                                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                      })
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-500/15 text-emerald-500 animate-pulse">
                                        Online Now
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono font-bold text-blue-500">
                                    {formatDuration(session.duration, session.logout_time)}
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col md:flex-row gap-5 min-h-0 overflow-hidden">
                    
                    {/* Calendar grid container */}
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden border border-gray-150/10 p-4 rounded-2xl bg-gray-50/20 dark:bg-gray-950/20">
                      
                      {/* Active Filter Resolution */}
                      {(() => {
                        const activeCalendarUser = isOwner() ? calendarEmployeeFilter : (user?.id || 'all');

                        const getDayStatusStyles = (dateStr: string | null) => {
                          if (!dateStr) return { btnClass: '', badge: null };

                          const dateLeaves = getLeavesForDate(dateStr);
                          const isStoreHoliday = dateLeaves.some(l => l.type === 'holiday');
                          
                          const isUserOnLeave = activeCalendarUser === 'all'
                            ? dateLeaves.some(l => l.type === 'leave')
                            : dateLeaves.some(l => l.type === 'leave' && l.user_id === activeCalendarUser);

                          const isPresent = activeCalendarUser === 'all'
                            ? sessions.some(s => s.login_time && s.login_time.startsWith(dateStr) && s.is_attendance !== 0)
                            : sessions.some(s => s.user_id === activeCalendarUser && s.login_time && s.login_time.startsWith(dateStr) && s.is_attendance !== 0);

                          // Determine user registration date limit to prevent false "Absent" states on past days before they were hired
                          let isAfterRegistration = true;
                          if (activeCalendarUser !== 'all') {
                            const regDateStr = user?.id === activeCalendarUser
                              ? (user?.createdAt || user?.created_at || '')
                              : (employees.find(e => e.id === activeCalendarUser)?.created_at || '');
                            
                            if (regDateStr) {
                              const regYYYYMMDD = regDateStr.slice(0, 10);
                              isAfterRegistration = dateStr >= regYYYYMMDD;
                            }
                          }

                          const isPast = dateStr < getTodayDateStr();
                          const isAbsent = activeCalendarUser !== 'all' && isPast && isAfterRegistration && !isStoreHoliday && !isUserOnLeave && !isPresent;

                          const todayClass = dateStr === getTodayDateStr() ? 'ring-2 ring-indigo-500/50 shadow-md shadow-indigo-500/10' : '';

                          if (isStoreHoliday) {
                            return {
                              btnClass: `bg-emerald-500/10 dark:bg-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/40 text-emerald-600 dark:text-emerald-400 ${todayClass}`,
                              badge: (
                                <span className="px-1 py-0.5 rounded text-[7px] font-extrabold uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-450 leading-none truncate w-full text-center">
                                  🎉 Holiday
                                </span>
                              )
                            };
                          }

                          if (isUserOnLeave) {
                            return {
                              btnClass: `bg-amber-500/10 dark:bg-amber-500/5 border-amber-500/30 hover:border-amber-500/40 text-amber-600 dark:text-amber-400 ${todayClass}`,
                              badge: (
                                <span className="px-1 py-0.5 rounded text-[7px] font-extrabold uppercase bg-amber-500/20 text-amber-600 dark:text-amber-450 leading-none truncate w-full text-center">
                                  📅 Leave
                                </span>
                              )
                            };
                          }

                          if (isPresent) {
                            return {
                              btnClass: `bg-blue-500/10 dark:bg-blue-500/5 border-blue-500/30 hover:border-blue-500/40 text-blue-600 dark:text-blue-400 ${todayClass}`,
                              badge: (
                                <span className="px-1 py-0.5 rounded text-[7px] font-extrabold uppercase bg-blue-500/20 text-blue-600 dark:text-blue-450 leading-none truncate w-full text-center">
                                  ✅ Present
                                </span>
                              )
                            };
                          }

                          if (isAbsent) {
                            return {
                              btnClass: `bg-rose-500/10 dark:bg-rose-500/5 border-rose-500/30 hover:border-rose-500/40 text-rose-600 dark:text-rose-400 ${todayClass}`,
                              badge: (
                                <span className="px-1 py-0.5 rounded text-[7px] font-extrabold uppercase bg-rose-500/20 text-rose-600 dark:text-rose-450 leading-none truncate w-full text-center">
                                  ❌ Absent
                                </span>
                              )
                            };
                          }

                          return {
                            btnClass: `${
                              darkMode
                                ? 'bg-gray-900 border-gray-850 hover:bg-gray-800/40 hover:border-gray-750 text-slate-300'
                                : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm text-gray-800'
                            } ${todayClass}`,
                            badge: null
                          };
                        };

                        return (
                          <>
                            {/* Month Controller & Filter Row */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 flex-shrink-0">
                              <div className="flex items-center justify-between sm:justify-start gap-4">
                                <h3 className="font-extrabold text-base tracking-wide flex items-center gap-2">
                                  <CalendarCheck className="text-blue-500" size={18} />
                                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                                </h3>
                                <div className="flex gap-1">
                                  <button
                                    onClick={prevMonth}
                                    className={`px-3 py-1 rounded-lg border text-[11px] font-extrabold transition-all select-none cursor-pointer ${
                                      darkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-white' : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    Prev
                                  </button>
                                  <button
                                    onClick={nextMonth}
                                    className={`px-3 py-1 rounded-lg border text-[11px] font-extrabold transition-all select-none cursor-pointer ${
                                      darkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-white' : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    Next
                                  </button>
                                </div>
                              </div>

                              {isOwner() && (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-[10px] font-bold opacity-60">Status Filter:</span>
                                  <select
                                    value={calendarEmployeeFilter}
                                    onChange={(e) => setCalendarEmployeeFilter(e.target.value)}
                                    className={`px-2 py-1 text-xs border rounded-lg ${
                                      darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                                    } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                                  >
                                    <option value="all">All Employees (Leaves/Holidays)</option>
                                    {employees.map((emp: any) => (
                                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>

                            {/* Color Legend Header */}
                            <div className="flex flex-wrap items-center gap-4 mt-0.5 mb-4 text-[9px] font-bold opacity-80 border-b dark:border-gray-800 pb-2 flex-shrink-0">
                              <span className="text-gray-400">STATUS SCHEMES:</span>
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500/20 border border-blue-500/40" /> Present</span>
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500/20 border border-rose-500/40" /> Absent</span>
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/40" /> Leave</span>
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40" /> Holiday</span>
                            </div>

                            {/* Days Header */}
                            <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold uppercase tracking-wider opacity-60 flex-shrink-0 mb-1.5">
                              {daysOfWeek.map(d => <div key={d} className="py-1">{d}</div>)}
                            </div>

                            {/* Grid Body */}
                            <div className="flex-1 grid grid-cols-7 gap-1.5 min-h-0 overflow-y-auto no-scrollbar">
                              {calendarCells.map((cell, idx) => {
                                if (!cell.day) {
                                  return <div key={`empty_${idx}`} className="p-1 rounded-xl bg-transparent opacity-10" />;
                                }

                                const isSelected = cell.dateStr === selectedDateStr;
                                const isToday = cell.dateStr === getTodayDateStr();
                                const { btnClass, badge } = getDayStatusStyles(cell.dateStr);

                                return (
                                  <button
                                    key={`day_${cell.day}`}
                                    onClick={() => handleDayClick(cell.dateStr || '')}
                                    className={`p-1.5 min-h-[55px] border rounded-xl flex flex-col justify-between transition-all hover:scale-[1.02] active:scale-[0.98] select-none text-left cursor-pointer ${
                                      isSelected
                                        ? 'border-blue-500 shadow-md ring-1 ring-blue-500/40 bg-blue-500/5 z-10'
                                        : ''
                                    } ${btnClass}`}
                                  >
                                    {/* Day Number */}
                                    <span className={`block text-xs font-extrabold ${
                                      isToday ? 'text-indigo-500 font-extrabold' : ''
                                    }`}>{cell.day}</span>
                                    
                                    {/* Status Badge */}
                                    <div className="w-full mt-1.5 flex flex-col gap-0.5 overflow-hidden">
                                      {badge}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Right column details popup/panel */}
                    <div className={`w-full md:w-80 border rounded-2xl p-4 flex flex-col flex-shrink-0 overflow-y-auto ${
                      darkMode ? 'bg-slate-950/20 border-slate-800/80' : 'bg-white border-gray-200 shadow-md shadow-black/5'
                    }`}>
                      {selectedDateStr ? (
                        <div className="flex flex-col justify-between h-full min-h-0">
                          
                          {/* Selected Day Logs */}
                          <div className="flex-1">
                            <h4 className="font-extrabold text-sm tracking-wide border-b dark:border-gray-800 pb-2 mb-3">
                              {new Date(selectedDateStr).toLocaleDateString('en-IN', {
                                day: 'numeric', month: 'long', year: 'numeric'
                              })}
                            </h4>

                            {getLeavesForDate(selectedDateStr).length === 0 ? (
                              <div className="py-6 text-center text-gray-400">
                                <p className="text-xs leading-relaxed">No scheduled employee leaves or store holidays on this date.</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {getLeavesForDate(selectedDateStr).map((item) => (
                                  <div 
                                    key={item.id} 
                                    className={`p-3 border rounded-xl relative ${
                                      item.type === 'holiday'
                                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400'
                                    }`}
                                  >
                                    {/* Type badge */}
                                    <span className="block text-[9px] font-extrabold uppercase tracking-wide opacity-80 mb-1">
                                      {item.type === 'holiday' ? '🎉 Store Holiday' : '📅 Employee Leave'}
                                    </span>
                                    
                                    {/* Name */}
                                    <p className="font-bold text-sm tracking-tight text-gray-900 dark:text-white">
                                      {item.user_name}
                                    </p>
                                    
                                    {/* Reason */}
                                    <p className="text-[11px] opacity-75 mt-1 leading-relaxed">
                                      {item.reason}
                                    </p>

                                    {/* Revoke button (owners only) */}
                                    {isOwner() && (
                                      <button
                                        onClick={() => handleRevokeLeave(item.id)}
                                        className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-all border border-transparent hover:border-red-500/20 cursor-pointer"
                                        title="Revoke Assignment"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Grant Leave Form Inline Panel */}
                            {showLeaveForm && isOwner() && (
                              <form onSubmit={handleAssignLeave} className="mt-4 p-3 border dark:border-gray-800 rounded-xl space-y-3 bg-gray-50/10 dark:bg-gray-900/10">
                                <div className="flex justify-between items-center border-b dark:border-gray-800 pb-1.5">
                                  <span className="text-xs font-bold">Schedule Leave/Holiday</span>
                                  <button 
                                    type="button" 
                                    onClick={() => setShowLeaveForm(false)}
                                    className="text-[10px] opacity-60 hover:opacity-100 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>

                                {/* Type selection */}
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setNewLeaveType('leave')}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                      newLeaveType === 'leave'
                                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                                        : darkMode ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-white border-gray-300 text-gray-600'
                                    }`}
                                  >
                                    Employee Leave
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setNewLeaveType('holiday')}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                      newLeaveType === 'holiday'
                                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                                        : darkMode ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-white border-gray-300 text-gray-600'
                                    }`}
                                  >
                                    Store Holiday
                                  </button>
                                </div>

                                {/* Employee selector for leaves */}
                                {newLeaveType === 'leave' && (
                                  <div>
                                    <label className="block text-[9px] font-bold opacity-60 mb-1">Select Employee</label>
                                    <select
                                      value={newLeaveUserId}
                                      onChange={(e) => setNewLeaveUserId(e.target.value)}
                                      className={`w-full px-2 py-1 text-xs border rounded-lg ${
                                        darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                                      } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                                    >
                                      {employees.map((emp: any) => (
                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                {/* Reason input */}
                                <div>
                                  <label className="block text-[9px] font-bold opacity-60 mb-1">Reason / Description</label>
                                  <input
                                    type="text"
                                    value={newLeaveReason}
                                    onChange={(e) => setNewLeaveReason(e.target.value)}
                                    placeholder={newLeaveType === 'holiday' ? 'e.g. Diwali Festival' : 'e.g. Vacation / Medical'}
                                    className={`w-full px-2.5 py-1.5 text-xs rounded-lg border ${
                                      darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                                    } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                                    required
                                  />
                                </div>

                                <button
                                  type="submit"
                                  className="w-full py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
                                >
                                  Assign {newLeaveType === 'holiday' ? 'Holiday' : 'Leave'}
                                </button>
                              </form>
                            )}
                          </div>

                          {/* Trigger assign button */}
                          {!showLeaveForm && isOwner() && (
                            <button
                              onClick={() => {
                                setShowLeaveForm(true);
                                setNewLeaveReason('');
                              }}
                              className="mt-3 w-full py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10 transform active:scale-95 transition-all cursor-pointer select-none"
                            >
                              <Plus size={14} />
                              Schedule Leave / Holiday
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col justify-center items-center text-center text-gray-400 py-10">
                          <CalendarCheck size={40} className="opacity-30 mb-3" />
                          <p className="text-sm font-semibold">No Date Selected</p>
                          <p className="text-xs leading-relaxed max-w-[200px] mt-1">Click on any active calendar day cell to view details, grant employee leaves, or declare store holidays.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 🔒 Client-Side End-to-End Encrypted LAN Chatbox Drawer */}
      {chatEnabled && <E2EEChatbox />}

      {activeSectorPanel && (
        <SectorPanelModal
          panel={activeSectorPanel}
          onClose={() => setActiveSectorPanel(null)}
          darkMode={darkMode}
        />
      )}

      {isKioskLocked && (
        <KioskLockOverlay
          onRestore={handleRestoreFullscreen}
          onBreak={startBreak}
          onLogout={logout}
          darkMode={darkMode}
        />
      )}
    </div>
  );
}