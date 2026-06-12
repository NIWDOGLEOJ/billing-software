import { X, Printer, Download, ShoppingCart, Sparkles, Package, TrendingUp, CheckCircle2, ShieldCheck, FileText, Check, Settings, Eye } from 'lucide-react';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useTheme } from '../contexts/theme-context';
import { api } from '../utils/api';
import { toast } from 'sonner';

interface BillItem {
  code: string;
  name: string;
  price: number;
  quantity: number;
  gstRate: number;
  hsnCode?: string;
  uom?: string;
  originalPrice?: number;
  discountPercent?: number;
  selectedBatch?: string;
  prescriptionFile?: string;
  dosage?: string;
  caseCount?: number;
  tradeDiscountPercent?: number;
}

interface ShopDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
}

interface BillReceiptProps {
  items: BillItem[];
  total: number;
  subtotal: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  gstRate: number;
  gstEnabled: boolean;
  shopDetails: ShopDetails;
  cashierName: string;
  billNumber: string;
  customerName?: string;
  customerPhone?: string;
  paymentMode?: string;
  amountReceived?: number;
  changeAmount?: number;
  roundedTotal?: number;
  roundingAdjustment?: number;
  onClose: () => void;
  customerGstin?: string;
  igst?: number;
  pricingTier?: string;
}

export function BillReceipt({
  items,
  total,
  subtotal,
  gstAmount,
  cgst,
  sgst,
  gstRate,
  gstEnabled,
  shopDetails,
  cashierName,
  billNumber,
  customerName,
  customerPhone,
  paymentMode,
  amountReceived,
  changeAmount,
  roundedTotal,
  roundingAdjustment,
  onClose,
  customerGstin,
  igst,
  pricingTier,
}: BillReceiptProps) {
  const { darkMode } = useTheme();

  const isInterState = useMemo(() => {
    if (!customerGstin) return false;
    const storeState = '27'; // Maharashtra State Code
    const customerState = customerGstin.substring(0, 2);
    return storeState !== customerState;
  }, [customerGstin]);

  // Template customizer state variables
  const [selectedTemplate, setSelectedTemplate] = useState<'invoice' | 'thermal'>('invoice');
  const [storeLogo, setStoreLogo] = useState<'standard' | 'grocery' | 'tech' | 'apparel'>('standard');
  const [signatoryName, setSignatoryName] = useState(cashierName || 'Store Manager');
  const [customFooter, setCustomFooter] = useState('Thank you for shopping with us! Visit again.');
  const [showGstBreakup, setShowGstBreakup] = useState(true);
  const [showVerificationStamp, setShowVerificationStamp] = useState(true);
  const [showQrCode, setShowQrCode] = useState(true);
  const [customInvoiceNote, setCustomInvoiceNote] = useState('Terms: 1. Goods once sold will not be taken back. 2. Any disputes subject to local jurisdiction.');

  // Load receipt customizer settings from backend upon mount
  useEffect(() => {
    const loadReceiptSettings = async () => {
      try {
        const settings = await api.get<any>('/settings');
        if (settings) {
          if (settings.receiptTemplate !== undefined) setSelectedTemplate(settings.receiptTemplate as any);
          if (settings.receiptLogo !== undefined) setStoreLogo(settings.receiptLogo as any);
          if (settings.receiptSignatory !== undefined) setSignatoryName(settings.receiptSignatory);
          if (settings.receiptFooter !== undefined) setCustomFooter(settings.receiptFooter);
          if (settings.showGstBreakup !== undefined) setShowGstBreakup(settings.showGstBreakup === 'true');
          if (settings.showVerificationStamp !== undefined) setShowVerificationStamp(settings.showVerificationStamp === 'true');
          if (settings.showQrCode !== undefined) setShowQrCode(settings.showQrCode === 'true');
          if (settings.customInvoiceNote !== undefined) setCustomInvoiceNote(settings.customInvoiceNote);
        }
      } catch (err) {
        console.warn('Failed to load receipt customizer settings:', err);
      }
    };
    loadReceiptSettings();
  }, []);

  const updateSetting = async (key: string, value: string) => {
    try {
      await api.put('/settings', { [key]: value });
    } catch (err) {
      console.warn(`Failed to save receipt setting: ${key} = ${value}`, err);
    }
  };

  // Date and time formatter
  const currentDate = useMemo(() => {
    return new Date().toLocaleString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, []);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [qrError, setQrError] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Generate QR Code dynamically
  useEffect(() => {
    const generateQR = async () => {
      try {
        const QRCode = await import('qrcode');
        if (qrCanvasRef.current) {
          const billData = JSON.stringify({
            billNumber,
            date: currentDate,
            total: total.toFixed(2),
            items: items.length,
            shop: shopDetails.name,
            customer: customerName || 'Walk-in',
            payment: paymentMode?.toUpperCase(),
          });

          await QRCode.toCanvas(qrCanvasRef.current, billData, {
            width: 130,
            margin: 1,
          });

          // Convert canvas to data URL for high-fidelity printing image
          const dataUrl = qrCanvasRef.current.toDataURL();
          setQrDataUrl(dataUrl);
        }
      } catch (error) {
        console.error('Error generating QR code:', error);
        setQrError(true);
      }
    };

    generateQR();
  }, [billNumber, currentDate, total, items.length, shopDetails.name, customerName, paymentMode]);

  // Aggregate items by GST tax rate slab for compliant regional GST audits
  interface TaxSlabSummary {
    rate: number;
    taxableValue: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    totalTax: number;
  }

  const taxSlabList = useMemo(() => {
    const taxSlabs: { [rate: number]: TaxSlabSummary } = {};
    items.forEach((item) => {
      if (!gstEnabled || !item.gstRate || item.gstRate <= 0) return;
      const taxableValue = item.price * item.quantity;
      const totalTax = (taxableValue * item.gstRate) / 100;
      const cgstAmount = isInterState ? 0 : totalTax / 2;
      const sgstAmount = isInterState ? 0 : totalTax / 2;
      const igstAmount = isInterState ? totalTax : 0;

      if (!taxSlabs[item.gstRate]) {
        taxSlabs[item.gstRate] = {
          rate: item.gstRate,
          taxableValue: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalTax: 0
        };
      }

      taxSlabs[item.gstRate].taxableValue += taxableValue;
      taxSlabs[item.gstRate].cgstAmount += cgstAmount;
      taxSlabs[item.gstRate].sgstAmount += sgstAmount;
      taxSlabs[item.gstRate].igstAmount += igstAmount;
      taxSlabs[item.gstRate].totalTax += totalTax;
    });
    return Object.values(taxSlabs);
  }, [items, gstEnabled, isInterState]);

  // Dynamic HSN slab summary for full corporate invoices
  const hsnSlabList = useMemo(() => {
    const hsnSlabs: {
      [key: string]: {
        hsnCode: string;
        taxableValue: number;
        gstRate: number;
        cgstAmount: number;
        sgstAmount: number;
        igstAmount: number;
        totalTax: number;
      }
    } = {};

    items.forEach((item) => {
      const hsn = item.hsnCode || '8517';
      const rate = gstEnabled ? (item.gstRate || 0) : 0;
      const key = `${hsn}_${rate}`;
      const taxableValue = item.price * item.quantity;
      const totalTax = (taxableValue * rate) / 100;
      const cgstAmount = isInterState ? 0 : totalTax / 2;
      const sgstAmount = isInterState ? 0 : totalTax / 2;
      const igstAmount = isInterState ? totalTax : 0;

      if (!hsnSlabs[key]) {
        hsnSlabs[key] = {
          hsnCode: hsn,
          taxableValue: 0,
          gstRate: rate,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalTax: 0
        };
      }

      hsnSlabs[key].taxableValue += taxableValue;
      hsnSlabs[key].cgstAmount += cgstAmount;
      hsnSlabs[key].sgstAmount += sgstAmount;
      hsnSlabs[key].igstAmount += igstAmount;
      hsnSlabs[key].totalTax += totalTax;
    });

    return Object.values(hsnSlabs).sort((a, b) => a.hsnCode.localeCompare(b.hsnCode));
  }, [items, gstEnabled, isInterState]);

  // Print function injecting customized overrides for A4 or thermal widths
  const handlePrint = (template: 'invoice' | 'thermal') => {
    const styleElement = document.createElement('style');
    styleElement.id = 'print-style-override';
    
    if (template === 'thermal') {
      styleElement.innerHTML = `
        @media print {
          body * {
            visibility: hidden !important;
          }
          #thermal-print-target, #thermal-print-target * {
            visibility: visible !important;
          }
          #thermal-print-target {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
          }
          @page {
            size: 80mm auto !important;
            margin: 0 !important;
          }
        }
      `;
    } else {
      styleElement.innerHTML = `
        @media print {
          body * {
            visibility: hidden !important;
          }
          #invoice-print-target, #invoice-print-target * {
            visibility: visible !important;
          }
          #invoice-print-target {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
          }
          @page {
            size: A4 portrait !important;
            margin: 10mm !important;
          }
        }
      `;
    }
    
    document.head.appendChild(styleElement);
    window.print();
    
    // Cleanup styles
    setTimeout(() => {
      const el = document.getElementById('print-style-override');
      if (el) el.remove();
    }, 1000);
  };

  // Render customized shop logo
  const renderStoreLogo = () => {
    switch (storeLogo) {
      case 'grocery':
        return <ShoppingCart className="w-10 h-10 text-emerald-500" />;
      case 'tech':
        return <Sparkles className="w-10 h-10 text-blue-500 animate-pulse" />;
      case 'apparel':
        return <Package className="w-10 h-10 text-pink-500" />;
      default:
        return <TrendingUp className="w-10 h-10 text-indigo-500" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all duration-300">
      <div className={`w-full max-w-6xl h-[92vh] flex flex-col md:flex-row rounded-3xl border overflow-hidden shadow-2xl transition-all ${
        darkMode 
          ? 'bg-slate-900/98 border-slate-800 text-white shadow-indigo-950/20' 
          : 'bg-white text-gray-900 border-gray-250 shadow-2xl'
      }`}>
        
        {/* LEFT COLUMN: INTERACTIVE CUSTOMIZATION SIDEBAR */}
        <div className={`w-full md:w-80 lg:w-[350px] flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r p-5 overflow-y-auto ${
          darkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-2 mb-5">
            <Settings className="w-5 h-5 text-blue-500" />
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wider">Reconciliation & Layout</h3>
              <p className="text-[10px] opacity-60">Customize templates and fields live</p>
            </div>
          </div>

          <div className="space-y-5 flex-1">
            {/* Template Selector */}
            <div>
              <label className="text-[10px] font-black uppercase opacity-65 tracking-wider block mb-2">Select Print Template</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setSelectedTemplate('invoice'); updateSetting('receiptTemplate', 'invoice'); }}
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border font-bold text-xs transition-all ${
                    selectedTemplate === 'invoice'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
                      : darkMode
                      ? 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-300'
                      : 'bg-white border-gray-200 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <FileText size={16} />
                  Tax Invoice
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedTemplate('thermal'); updateSetting('receiptTemplate', 'thermal'); }}
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border font-bold text-xs transition-all ${
                    selectedTemplate === 'thermal'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
                      : darkMode
                      ? 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-300'
                      : 'bg-white border-gray-200 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <Printer size={16} />
                  POS Receipt
                </button>
              </div>
            </div>

            {/* Logo Customization */}
            <div>
              <label className="text-[10px] font-black uppercase opacity-65 tracking-wider block mb-2">Supplier Corporate Icon</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['standard', 'grocery', 'tech', 'apparel'] as const).map((logo) => (
                  <button
                    key={logo}
                    type="button"
                    onClick={() => { setStoreLogo(logo); updateSetting('receiptLogo', logo); }}
                    className={`p-2 rounded-lg border flex items-center justify-center transition-all ${
                      storeLogo === logo
                        ? 'bg-blue-600/10 border-blue-500 text-blue-500'
                        : darkMode
                        ? 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-400 hover:text-slate-200'
                        : 'bg-white border-gray-200 hover:bg-gray-100 text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {logo === 'grocery' && <ShoppingCart size={15} />}
                    {logo === 'tech' && <Sparkles size={15} />}
                    {logo === 'apparel' && <Package size={15} />}
                    {logo === 'standard' && <TrendingUp size={15} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Inputs */}
            <div className="space-y-3.5">
              <div>
                <label className="text-[10px] font-black uppercase opacity-65 tracking-wider block mb-1">Authorized Signatory Name</label>
                <input
                  type="text"
                  value={signatoryName}
                  onChange={(e) => { setSignatoryName(e.target.value); updateSetting('receiptSignatory', e.target.value); }}
                  className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              {selectedTemplate === 'invoice' ? (
                <div>
                  <label className="text-[10px] font-black uppercase opacity-65 tracking-wider block mb-1">Invoice Notes / Terms</label>
                  <textarea
                    rows={3}
                    value={customInvoiceNote}
                    onChange={(e) => { setCustomInvoiceNote(e.target.value); updateSetting('customInvoiceNote', e.target.value); }}
                    className={`w-full px-3 py-2 text-[11px] border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black uppercase opacity-65 tracking-wider block mb-1">POS Receipt Greeting</label>
                  <textarea
                    rows={2}
                    value={customFooter}
                    onChange={(e) => { setCustomFooter(e.target.value); updateSetting('receiptFooter', e.target.value); }}
                    className={`w-full px-3 py-2 text-[11px] border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              )}
            </div>

            {/* Feature Toggles */}
            <div className="space-y-2.5 pt-2 border-t border-dashed dark:border-slate-800 border-gray-250">
              <label className="text-[10px] font-black uppercase opacity-65 tracking-wider block mb-1">Toggle Invoice Sections</label>
              
              <label className="flex items-center justify-between text-xs font-semibold select-none cursor-pointer">
                <span>GST breakups summary</span>
                <input
                  type="checkbox"
                  checked={showGstBreakup}
                  onChange={(e) => { setShowGstBreakup(e.target.checked); updateSetting('showGstBreakup', String(e.target.checked)); }}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between text-xs font-semibold select-none cursor-pointer">
                <span>Cryptographic Stamp Verified</span>
                <input
                  type="checkbox"
                  checked={showVerificationStamp}
                  onChange={(e) => { setShowVerificationStamp(e.target.checked); updateSetting('showVerificationStamp', String(e.target.checked)); }}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between text-xs font-semibold select-none cursor-pointer">
                <span>Interactive QR Code</span>
                <input
                  type="checkbox"
                  checked={showQrCode}
                  onChange={(e) => { setShowQrCode(e.target.checked); updateSetting('showQrCode', String(e.target.checked)); }}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </label>
            </div>
          </div>

          <div className="pt-4 border-t dark:border-slate-800 border-gray-250 mt-5">
            <button
              onClick={onClose}
              className={`w-full py-2.5 rounded-xl font-extrabold text-xs transition-all uppercase tracking-wider ${
                darkMode ? 'bg-slate-850 hover:bg-slate-800 text-slate-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              Close Previewer
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE INTERACTIVE PREVIEW & ACTIONS */}
        <div className={`flex-1 flex flex-col min-w-0 ${
          darkMode ? 'bg-slate-950/20' : 'bg-gray-100'
        }`}>
          {/* Action Header */}
          <div className={`flex justify-between items-center px-6 py-4 border-b print:hidden transition-colors ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-500" />
              <span className="font-bold text-sm">Interactive Live preview ({selectedTemplate === 'invoice' ? 'Tax Invoice A4' : 'Compact POS Receipt 80mm'})</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePrint(selectedTemplate)}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-extrabold text-xs shadow-lg shadow-blue-500/10 transition-all select-none cursor-pointer transform active:scale-95"
              >
                <Printer size={15} />
                Print / Save PDF
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`p-2 rounded-xl transition-colors cursor-pointer border ${
                  darkMode 
                    ? 'hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-white' 
                    : 'hover:bg-gray-50 border-gray-250 text-gray-500 hover:text-gray-800 bg-white'
                }`}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Live Preview Container */}
          <div className="flex-1 overflow-y-auto p-6 flex justify-center items-start min-h-0">
            {selectedTemplate === 'invoice' ? (
              
              /* ========================================================================= */
              /* A4 CORPORATE TAX INVOICE TEMPLATE                                         */
              /* ========================================================================= */
              <div 
                id="invoice-print-target" 
                className="w-full max-w-[800px] bg-white text-gray-900 border border-gray-300 rounded-2xl shadow-2xl p-8 my-4 print:my-0 print:border-none print:shadow-none animate-scale-in"
              >
                {/* Invoice Header */}
                <div className="flex justify-between items-start border-b-2 border-gray-200 pb-5 mb-5">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-gray-50 border border-gray-150 rounded-xl mt-1 print:p-0 print:border-none">
                      {renderStoreLogo()}
                    </div>
                    <div>
                      <h1 className="text-2xl font-black tracking-tight text-slate-800">{shopDetails.name}</h1>
                      <p className="text-[11px] text-gray-500 leading-relaxed max-w-sm mt-1">{shopDetails.address}</p>
                      <p className="text-[11px] text-gray-500 mt-1">Phone: <span className="font-semibold text-gray-800">{shopDetails.phone}</span> | Email: <span className="font-semibold text-gray-800">{shopDetails.email}</span></p>
                      <p className="text-[10px] text-gray-400 mt-0.5 font-bold font-mono">GSTIN: 27AAAAA1111A1Z1</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-3 py-1 bg-slate-100 text-slate-800 rounded-full font-black text-[10px] uppercase tracking-wider">Tax Invoice</span>
                    <h2 className="text-lg font-mono font-black text-blue-600 mt-2">#{billNumber}</h2>
                    <p className="text-[10px] text-gray-500 font-semibold mt-1">Date: {currentDate}</p>
                    <p className="text-[10px] text-gray-500 font-semibold uppercase mt-0.5">Mode: <span className="text-emerald-600">{paymentMode || 'Cash'}</span></p>
                  </div>
                </div>

                {/* Billed To Address Block */}
                <div className="grid grid-cols-2 gap-6 bg-slate-50 border border-gray-200 rounded-xl p-4 mb-5 text-xs">
                  <div>
                    <h4 className="font-black text-[10px] uppercase tracking-wider text-gray-400 mb-2">Billed To (Customer Details)</h4>
                    <p className="font-black text-sm text-slate-850">{customerName || 'Cash Customer'}</p>
                    <p className="text-gray-500 font-medium mt-1">Phone: {customerPhone || 'N/A'}</p>
                    {customerGstin && (
                      <p className="text-emerald-600 font-extrabold mt-1 text-[10px] uppercase tracking-wide font-mono select-all">
                        GSTIN: {customerGstin}
                      </p>
                    )}
                    {customerPhone && !customerGstin && <p className="text-[9px] text-purple-600 font-bold mt-1 uppercase tracking-wide">NexusFlow Loyalty Program Member</p>}
                  </div>
                  <div className="border-l border-gray-200 pl-6">
                    <h4 className="font-black text-[10px] uppercase tracking-wider text-gray-400 mb-2">Billing Reference Info</h4>
                    {customerGstin ? (
                      <p className="text-gray-500 font-medium">Taxation Scheme: <span className="font-black text-emerald-600">{customerGstin.substring(0, 2) !== '27' ? '🌐 Inter-State (IGST)' : '🏠 Intra-State (CGST+SGST)'}</span></p>
                    ) : (
                      <p className="text-gray-500 font-medium">Place of Supply: <span className="font-bold text-slate-800">Maharashtra (Local State)</span></p>
                    )}
                    <p className="text-gray-500 font-medium mt-1">Pricing Profile: <span className="font-bold uppercase text-indigo-600 text-[10px]">{pricingTier || 'Retail'}</span></p>
                    <p className="text-gray-500 font-medium mt-1">Cashier: <span className="font-bold text-slate-800">{cashierName}</span></p>
                  </div>
                </div>

                  {/* Items Table */}
                  <table className="w-full text-xs text-left border-collapse mb-5 border border-gray-200 rounded-lg overflow-hidden">
                   <thead>
                     <tr className="bg-slate-100 border-b border-gray-200 text-slate-700 font-bold uppercase text-[9px] tracking-wider">
                       <th className="px-2 py-2.5 w-6 text-center">#</th>
                       <th className="px-2 py-2.5">Product Name</th>
                       <th className="px-1.5 py-2.5 text-center">HSN</th>
                       <th className="px-1.5 py-2.5 text-center">Unit</th>
                       <th className="px-1.5 py-2.5 text-center">Qty</th>
                       <th className="px-2 py-2.5 text-right">Rate</th>
                       <th className="px-2 py-2.5 text-right text-purple-650">Disc</th>
                       <th className="px-2 py-2.5 text-right">Taxable Val</th>
                       <th className="px-1.5 py-2.5 text-center">GST%</th>
                       {isInterState ? (
                         <th className="px-2 py-2.5 text-right text-gray-500">IGST</th>
                       ) : (
                         <>
                           <th className="px-2 py-2.5 text-right text-gray-500">CGST</th>
                           <th className="px-2 py-2.5 text-right text-gray-500">SGST</th>
                         </>
                       )}
                       <th className="px-2.5 py-2.5 text-right font-black">Total</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-200">
                     {items.map((item, index) => {
                       const qty = item.quantity || 0;
                       const rate = item.gstRate || 0;
                       const origPrice = item.originalPrice || item.price;
                       const discAmountPerUnit = Math.max(0, origPrice - item.price);
                       const totalDiscVal = discAmountPerUnit * qty;
                       const taxableVal = item.price * qty;
                       const totalTaxVal = gstEnabled ? (taxableVal * rate) / 100 : 0;
                       const cgstVal = isInterState ? 0 : totalTaxVal / 2;
                       const sgstVal = isInterState ? 0 : totalTaxVal / 2;
                       const igstVal = isInterState ? totalTaxVal : 0;
                       const totalVal = taxableVal + totalTaxVal;

                       return (
                         <tr key={index} className="hover:bg-slate-50/50">
                           <td className="px-2 py-2.5 text-center text-gray-400 font-medium">{index + 1}</td>
                           <td className="px-2 py-2.5">
                             <p className="font-bold text-slate-800 leading-tight">{item.name}</p>
                             {item.selectedBatch && (
                               <p className="text-[8.5px] text-cyan-600 font-bold uppercase tracking-wider mt-0.5">
                                 🧪 Batch: {item.selectedBatch}
                               </p>
                             )}
                             {item.dosage && (
                               <p className="text-[8.5px] text-teal-650 font-black tracking-wide uppercase mt-0.5 font-mono">
                                 💊 Dosage: {item.dosage}
                               </p>
                             )}
                             <p className="text-[8px] text-gray-400 font-mono mt-0.5">SKU: {item.code}</p>
                           </td>
                           <td className="px-1.5 py-2.5 text-center font-mono text-[10px] opacity-75">{item.hsnCode || '99'}</td>
                           <td className="px-1.5 py-2.5 text-center text-[10px] font-medium text-slate-600">{item.uom || 'PCS'}</td>
                           <td className="px-1.5 py-2.5 text-center font-bold text-slate-800">{qty}</td>
                           <td className="px-2 py-2.5 text-right font-mono text-[10px]">₹{origPrice.toFixed(2)}</td>
                           <td className="px-2 py-2.5 text-right font-mono text-purple-650 text-[10px]">
                             {discAmountPerUnit > 0 ? (
                               <span>-₹{totalDiscVal.toFixed(2)}</span>
                             ) : (
                               <span className="opacity-45">0%</span>
                             )}
                           </td>
                           <td className="px-2 py-2.5 text-right font-mono text-[10px]">₹{taxableVal.toFixed(2)}</td>
                           <td className="px-1.5 py-2.5 text-center font-semibold text-slate-700">{rate}%</td>
                           {isInterState ? (
                             <td className="px-2 py-2.5 text-right font-mono text-gray-500 text-[9px]">₹{igstVal.toFixed(2)}</td>
                           ) : (
                             <>
                               <td className="px-2 py-2.5 text-right font-mono text-gray-500 text-[9px]">₹{cgstVal.toFixed(2)}</td>
                               <td className="px-2 py-2.5 text-right font-mono text-gray-500 text-[9px]">₹{sgstVal.toFixed(2)}</td>
                             </>
                           )}
                           <td className="px-2.5 py-2.5 text-right font-mono font-extrabold text-slate-900">₹{totalVal.toFixed(2)}</td>
                         </tr>
                       );
                     })}
                   </tbody>
                 </table>

                {/* Subtotals & Breakups Pane */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 items-start">
                  
                  {/* Left Column: Terms & E2EE Verification Stamp */}
                  <div className="space-y-4">
                    {/* Invoice Note */}
                    <div className="p-3 bg-slate-50 border border-gray-150 rounded-xl text-[10px] leading-relaxed text-gray-500">
                      <span className="font-bold uppercase tracking-wider text-slate-700 block mb-1">Invoice Remarks:</span>
                      {customInvoiceNote}
                    </div>

                    {/* Cryptographic Stamp */}
                    {showVerificationStamp && (
                      <div className="border-2 border-emerald-500 border-dashed rounded-xl p-3 bg-emerald-500/[0.02] text-emerald-700 text-center max-w-[280px]">
                        <div className="flex items-center justify-center gap-1.5 mb-1 font-bold text-[9px] uppercase">
                          <ShieldCheck size={13} className="text-emerald-600" />
                          <span>NexusFlow Certified</span>
                        </div>
                        <div className="font-black text-[11px] uppercase tracking-wide">Digitally Signed & Verified</div>
                        <div className="font-mono text-[8px] opacity-75 mt-1 truncate">BILL_HASH: {billNumber}</div>
                        <div className="text-[7px] opacity-60 uppercase mt-0.5">Secure LAN cryptosignature Rel. v1.2</div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Calculations Grid */}
                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 space-y-2.5 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span className="text-gray-500">Subtotal (Excl. Tax):</span>
                      <span className="font-mono">₹{subtotal.toFixed(2)}</span>
                    </div>

                    {gstEnabled && gstAmount > 0 && (
                      <div className="space-y-1.5 border-t border-b border-gray-200/80 py-2 my-2">
                        {isInterState ? (
                          <div className="flex justify-between text-[11px] text-gray-500">
                            <span>Integrated IGST Total:</span>
                            <span className="font-mono">₹{(igst !== undefined ? igst : gstAmount).toFixed(2)}</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between text-[11px] text-gray-500">
                              <span>Central CGST Total:</span>
                              <span className="font-mono">₹{cgst.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-[11px] text-gray-500">
                              <span>State SGST Total:</span>
                              <span className="font-mono">₹{sgst.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between font-bold text-slate-800 text-[11px]">
                          <span>Combined GST Total:</span>
                          <span className="font-mono">₹{gstAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {roundingAdjustment !== undefined && roundingAdjustment !== 0 && (
                      <div className="flex justify-between text-[11px] text-gray-500">
                        <span>Rounding Adjustment:</span>
                        <span className={`font-mono ${roundingAdjustment > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {roundingAdjustment > 0 ? '+' : ''}₹{roundingAdjustment.toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-lg font-black text-blue-600 border-t border-gray-200 pt-2 mt-2">
                      <span>Total Amount:</span>
                      <span className="font-mono">₹{total.toFixed(2)}</span>
                    </div>

                    {amountReceived !== undefined && amountReceived > 0 && (
                      <div className="space-y-1.5 border-t border-gray-200/80 pt-2 mt-2">
                        <div className="flex justify-between text-[11px] text-gray-500">
                          <span>Amount Received:</span>
                          <span className="font-mono">₹{amountReceived.toFixed(2)}</span>
                        </div>
                        {changeAmount !== undefined && changeAmount > 0 && (
                          <div className="flex justify-between text-xs font-bold text-emerald-600">
                            <span>Change Returned:</span>
                            <span className="font-mono">₹{changeAmount.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* HSN Slab Breakdown (Compliant tax summaries) */}
                {showGstBreakup && gstEnabled && hsnSlabList.length > 0 && (
                  <div className="mt-6 border-t border-gray-200 pt-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-600 mb-2">GST Outward Supplies HSN Breakup</p>
                    <table className="w-full text-left text-[10px] border-collapse border border-gray-150 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-200 text-slate-600 font-bold uppercase text-[8px] tracking-wider">
                          <th className="px-3 py-2">HSN Code</th>
                          <th className="px-2 py-2">GST Rate</th>
                          <th className="px-3 py-2 text-right">Taxable Value</th>
                          {isInterState ? (
                            <th className="px-3 py-2 text-right">IGST Amount</th>
                          ) : (
                            <>
                              <th className="px-3 py-2 text-right">CGST Amount</th>
                              <th className="px-3 py-2 text-right">SGST Amount</th>
                            </>
                          )}
                          <th className="px-3 py-2 text-right">Total Tax Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150 text-slate-700">
                        {hsnSlabList.map((slab) => (
                          <tr key={`${slab.hsnCode}_${slab.gstRate}`}>
                            <td className="px-3 py-2 font-mono font-bold text-blue-500">{slab.hsnCode}</td>
                            <td className="px-2 py-2 font-semibold">{slab.gstRate}%</td>
                            <td className="px-3 py-2 text-right font-mono">₹{slab.taxableValue.toFixed(2)}</td>
                            {isInterState ? (
                              <td className="px-3 py-2 text-right font-mono">₹{slab.igstAmount.toFixed(2)}</td>
                            ) : (
                              <>
                                <td className="px-3 py-2 text-right font-mono">₹{slab.cgstAmount.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-mono">₹{slab.sgstAmount.toFixed(2)}</td>
                              </>
                            )}
                            <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">₹{slab.totalTax.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bottom Footer block containing signatures & QR codes */}
                <div className="flex justify-between items-end border-t-2 border-gray-200 pt-6 mt-6">
                  {/* Left: QR code details */}
                  <div className="flex items-center gap-4 text-xs">
                    {showQrCode && (
                      <div>
                        <canvas ref={qrCanvasRef} className="hidden"></canvas>
                        {qrDataUrl && (
                          <img src={qrDataUrl} alt="Bill QR Code" className="border rounded-lg p-1.5 bg-white shadow-sm" width="105" height="105" />
                        )}
                      </div>
                    )}
                    <div className="max-w-[200px] text-gray-400 text-[10px] leading-relaxed">
                      <p className="font-bold uppercase text-slate-500 mb-1">Scan Invoice QR</p>
                      <p>Scan this QR code with any terminal to retrieve E2EE cart contents, loyalty balances, or transaction verification indexes offline.</p>
                    </div>
                  </div>

                  {/* Right: Signature block */}
                  <div className="text-center w-48">
                    <div className="h-12 border-b border-gray-300 flex items-end justify-center pb-1">
                      <span className="font-mono text-[9px] text-gray-300 uppercase tracking-widest">DIGITAL SIGNATURE</span>
                    </div>
                    <p className="font-bold text-slate-800 text-[11px] mt-1.5">{signatoryName}</p>
                    <p className="text-[9px] text-gray-400 uppercase font-black tracking-wider">Authorized Signatory</p>
                  </div>
                </div>

                {/* Corporate compliance label */}
                <div className="text-center text-[9px] text-gray-400 mt-8 uppercase tracking-widest font-semibold border-t pt-4">
                  Computer Generated Document • No Signature Required
                </div>
              </div>
            ) : (
              
              /* ========================================================================= */
              /* COMPACT POS THERMAL RECEIPT TEMPLATE (80mm Width)                        */
              /* ========================================================================= */
              <div 
                id="thermal-print-target"
                className="w-[300px] bg-white text-gray-900 border-2 border-dashed border-gray-300 p-5 rounded-2xl shadow-xl animate-scale-in"
              >
                {/* Store Header */}
                <div className="text-center pb-4 mb-4 border-b border-dashed border-gray-300">
                  <div className="inline-block p-2 bg-gray-50 border rounded-full mb-2">
                    {renderStoreLogo()}
                  </div>
                  <h1 className="text-lg font-black uppercase tracking-tight text-slate-850">{shopDetails.name}</h1>
                  <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{shopDetails.address}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Phone: {shopDetails.phone}</p>
                </div>

                {/* Receipt Metadata */}
                <div className="text-[10px] text-gray-500 space-y-1 pb-4 mb-4 border-b border-dashed border-gray-300 font-mono">
                  <div className="flex justify-between font-bold text-slate-800 text-[11px]">
                    <span>RECEIPT NO:</span>
                    <span>#{billNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DATE:</span>
                    <span>{currentDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CASHIER:</span>
                    <span>{cashierName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CUSTOMER:</span>
                    <span className="truncate max-w-[140px]">{customerName || 'Cash Customer'}</span>
                  </div>
                  {customerPhone && (
                    <div className="flex justify-between">
                      <span>PHONE:</span>
                      <span>{customerPhone}</span>
                    </div>
                  )}
                </div>

                {/* Items Grid */}
                <div className="pb-4 mb-4 border-b border-dashed border-gray-300 text-xs">
                  <div className="flex justify-between font-bold text-[10px] uppercase text-gray-400 tracking-wider pb-1">
                    <span>Item Description</span>
                    <span>Amount</span>
                  </div>
                  
                  <div className="space-y-3.5 mt-2">
                    {items.map((item, idx) => {
                      const lineTotal = item.price * item.quantity;
                      const lineGst = gstEnabled ? (lineTotal * item.gstRate) / 100 : 0;
                      const lineTotalWithGst = lineTotal + lineGst;

                      return (
                        <div key={idx} className="space-y-0.5">
                          <div className="flex justify-between font-bold text-slate-850">
                            <span>
                              {item.name}
                              {item.selectedBatch && (
                                <span className="text-[8.5px] text-cyan-650 font-black block tracking-wider mt-0.5">
                                  🧪 [BATCH: {item.selectedBatch}]
                                </span>
                              )}
                              {item.dosage && (
                                <span className="text-[8.5px] text-teal-650 font-black block tracking-wider mt-0.5">
                                  💊 [DOSAGE: {item.dosage}]
                                </span>
                              )}
                            </span>
                            <span className="font-mono">₹{lineTotalWithGst.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                            <span>{item.quantity} {item.uom || 'PCS'} x ₹{item.price.toFixed(2)} | HSN: {item.hsnCode || '99'}</span>
                            {gstEnabled && <span>GST {item.gstRate}%</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Totals Section */}
                <div className="space-y-2 text-xs pb-4 mb-4 border-b border-dashed border-gray-300">
                  <div className="flex justify-between font-semibold">
                    <span className="text-gray-500">Subtotal:</span>
                    <span className="font-mono">₹{subtotal.toFixed(2)}</span>
                  </div>
                  
                  {gstEnabled && gstAmount > 0 && (
                    <div className="space-y-1 font-mono text-[11px] text-gray-500 border-t border-b border-gray-200/50 py-1 my-1">
                      {isInterState ? (
                        <div className="flex justify-between">
                          <span>IGST Tax:</span>
                          <span>₹{(igst !== undefined ? igst : gstAmount).toFixed(2)}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span>CGST Tax:</span>
                            <span>₹{cgst.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>SGST Tax:</span>
                            <span>₹{sgst.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {roundingAdjustment !== undefined && roundingAdjustment !== 0 && (
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>Rounding:</span>
                      <span className="font-mono">{roundingAdjustment > 0 ? '+' : ''}₹{roundingAdjustment.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-black text-base text-slate-850 pt-1">
                    <span>GRAND TOTAL:</span>
                    <span className="font-mono text-blue-600 text-lg">₹{total.toFixed(2)}</span>
                  </div>

                  {amountReceived !== undefined && amountReceived > 0 && (
                    <div className="space-y-1 pt-1.5 mt-1.5 border-t border-gray-200/60 font-mono">
                      <div className="flex justify-between text-[11px] text-gray-500">
                        <span>Cash Received:</span>
                        <span>₹{amountReceived.toFixed(2)}</span>
                      </div>
                      {changeAmount !== undefined && changeAmount > 0 && (
                        <div className="flex justify-between font-bold text-emerald-600">
                          <span>Change Return:</span>
                          <span>₹{changeAmount.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* QR Code */}
                {showQrCode && qrDataUrl && (
                  <div className="text-center py-2 flex flex-col items-center justify-center">
                    <img src={qrDataUrl} alt="Bill QR Code" className="border rounded-lg p-1 bg-white shadow-sm" width="95" height="95" />
                    <p className="text-[8px] text-gray-400 font-mono mt-1.5">Scan to verify purchase details</p>
                  </div>
                )}

                {/* Footer Notes & E2EE Verified Seal */}
                <div className="text-center space-y-3 pt-3 border-t border-dashed border-gray-300">
                  <p className="text-[10px] font-bold text-slate-800 italic">"{customFooter}"</p>
                  
                  {showVerificationStamp && (
                    <div className="border border-emerald-500 border-dashed rounded-lg p-1.5 bg-emerald-500/[0.01] text-emerald-600 inline-block mx-auto text-center">
                      <div className="flex items-center justify-center gap-1 font-bold text-[7px] uppercase">
                        <ShieldCheck size={9} />
                        <span>Cryptosignature verified</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="text-[8px] text-gray-400 font-mono leading-relaxed pt-2">
                    <p>SYSTEM DATE: {currentDate}</p>
                    <p className="font-black text-slate-600 uppercase mt-0.5">THANK YOU FOR YOUR PATRONAGE</p>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Bottom Actions Panel */}
          <div className={`flex gap-3 p-4 border-t print:hidden sticky bottom-0 z-10 transition-colors ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'
          }`}>
            <button
              type="button"
              onClick={() => handlePrint(selectedTemplate)}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/10"
            >
              <Download size={16} />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider shadow-lg shadow-blue-500/10"
            >
              New Bill (ESC)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}