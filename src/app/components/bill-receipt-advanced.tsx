import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/theme-context';

export interface BillItem {
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

export interface ShopDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
  gstin?: string;
}

/** GST state codes for mapping state prefix to place of supply name. */
const GST_STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};

/** Convert a numeric rupee amount to Indian currency English words. */
function amountInWords(num: number): string {
  if (isNaN(num) || num < 0) return 'Zero rupees only';
  const a = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen'
  ];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function convertGroup(n: number): string {
    let out = '';
    if (n >= 100) {
      out += a[Math.floor(n / 100)] + ' hundred ';
      n %= 100;
    }
    if (n >= 20) {
      out += b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '') + ' ';
    } else if (n > 0) {
      out += a[n] + ' ';
    }
    return out.trim();
  }

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  if (intPart === 0 && decPart === 0) return 'Zero rupees only';

  let words = '';
  const crore = Math.floor(intPart / 10000000);
  const lakh = Math.floor((intPart % 10000000) / 100000);
  const thousand = Math.floor((intPart % 100000) / 1000);
  const hundred = intPart % 1000;

  if (crore > 0) words += convertGroup(crore) + ' crore ';
  if (lakh > 0) words += convertGroup(lakh) + ' lakh ';
  if (thousand > 0) words += convertGroup(thousand) + ' thousand ';
  if (hundred > 0) words += convertGroup(hundred) + ' ';

  words = words.trim();
  if (words) {
    words += ' rupees';
  }

  if (decPart > 0) {
    const paiseWords = convertGroup(decPart);
    if (words) {
      words += ' and ' + paiseWords + ' paise';
    } else {
      words = paiseWords + ' paise';
    }
  }

  words += ' only';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface BillReceiptProps {
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
  onFinalizeBill?: () => Promise<void>;
  customerGstin?: string;
  igst?: number;
  pricingTier?: string;
  billLocked?: boolean;
  billDiscount?: number;
  loyaltyDiscount?: number;
  couponDiscount?: number;
  couponCode?: string;
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
  onFinalizeBill,
  customerGstin,
  igst,
  billLocked,
  billDiscount,
  loyaltyDiscount,
  couponDiscount,
  couponCode,
}: BillReceiptProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<'thermal' | 'invoice'>('thermal');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const { theme, setTheme } = useTheme();

  // Extract store state code (first 2 digits of GSTIN)
  const storeState = (shopDetails.gstin || '').substring(0, 2);

  // Interstate supply requires both GSTINs and differing state codes
  const isInterState = useMemo(() => {
    if (!customerGstin || !storeState) return false;
    return storeState !== customerGstin.substring(0, 2);
  }, [customerGstin, storeState]);

  // Formatted date
  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }) + ' \u00b7 ' + new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, []);

  // PAN derived from 15-character GSTIN (characters 3-12)
  const pan = useMemo(() => {
    const gstin = shopDetails.gstin || '';
    if (gstin.length === 15) return gstin.slice(2, 12);
    return 'ABCDE1234F';
  }, [shopDetails.gstin]);

  // Place of supply
  const placeOfSupply = useMemo(() => {
    if (isInterState && customerGstin) {
      const code = customerGstin.substring(0, 2);
      return GST_STATE_NAMES[code] ? `${GST_STATE_NAMES[code]} (${code})` : code;
    }
    if (storeState && GST_STATE_NAMES[storeState]) {
      return `${GST_STATE_NAMES[storeState]} (${storeState})`;
    }
    return 'Karnataka (29)';
  }, [isInterState, customerGstin, storeState]);

  // Total units across all items
  const totalUnits = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  }, [items]);

  // Rate-wise GST extraction breakdown
  const rateWiseBreakdown = useMemo(() => {
    const map = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number; totalTax: number }>();
    items.forEach(item => {
      const lineInclusive = item.price * item.quantity;
      const rate = gstEnabled ? (item.gstRate || 0) : 0;
      const lineTaxable = rate > 0 ? lineInclusive / (1 + rate / 100) : lineInclusive;
      const lineTax = lineInclusive - lineTaxable;
      const lineCgst = isInterState ? 0 : lineTax / 2;
      const lineSgst = isInterState ? 0 : lineTax / 2;
      const lineIgst = isInterState ? lineTax : 0;

      const curr = map.get(rate) || { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
      curr.taxable += lineTaxable;
      curr.cgst += lineCgst;
      curr.sgst += lineSgst;
      curr.igst += lineIgst;
      curr.totalTax += lineTax;
      map.set(rate, curr);
    });

    return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
  }, [items, gstEnabled, isInterState]);

  // Reconciled totals
  const taxableSum = useMemo(() => {
    return rateWiseBreakdown.reduce((sum, r) => sum + r.taxable, 0);
  }, [rateWiseBreakdown]);

  const cgstSum = useMemo(() => {
    return rateWiseBreakdown.reduce((sum, r) => sum + r.cgst, 0);
  }, [rateWiseBreakdown]);

  const sgstSum = useMemo(() => {
    return rateWiseBreakdown.reduce((sum, r) => sum + r.sgst, 0);
  }, [rateWiseBreakdown]);

  const igstSum = useMemo(() => {
    return rateWiseBreakdown.reduce((sum, r) => sum + r.igst, 0);
  }, [rateWiseBreakdown]);

  const finalTotal = roundedTotal !== undefined ? roundedTotal : total;
  const rounding = roundingAdjustment !== undefined
    ? roundingAdjustment
    : Number((finalTotal - (taxableSum + cgstSum + sgstSum + igstSum)).toFixed(2));

  const tendered = amountReceived !== undefined && amountReceived > 0 ? amountReceived : finalTotal;
  const change = changeAmount !== undefined && changeAmount > 0 ? changeAmount : 0;

  // Generate real QR code for the bill
  useEffect(() => {
    let isMounted = true;
    const generateQR = async () => {
      try {
        const QRCode = await import('qrcode');
        const qrPayload = JSON.stringify({
          bill: billNumber,
          date: formattedDate,
          total: finalTotal.toFixed(2),
          items: items.length,
          gstin: shopDetails.gstin || '',
          till: 'T-02',
        });
        const url = await QRCode.toDataURL(qrPayload, {
          width: 144,
          margin: 1,
          color: {
            dark: '#16150f',
            light: '#fffefb',
          },
        });
        if (isMounted) setQrDataUrl(url);
      } catch (err) {
        console.error('Failed to generate bill QR code:', err);
      }
    };
    generateQR();
    return () => { isMounted = false; };
  }, [billNumber, formattedDate, finalTotal, items.length, shopDetails.gstin]);

  // Print function
  const handlePrint = async (template: 'thermal' | 'invoice') => {
    if (isFinalizing) return;
    if (onFinalizeBill && !billLocked) {
      setIsFinalizing(true);
      try {
        await onFinalizeBill();
      } catch (err) {
        console.error('Failed to finalize bill before printing:', err);
        toast.error('Could not save bill before printing');
        return;
      } finally {
        setIsFinalizing(false);
      }
    }
    window.print();
  };

  // Keyboard shortcut listener: F9 prints, Escape closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        handlePrint(selectedTemplate);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTemplate, onClose, isFinalizing]);

  const isThermal = selectedTemplate === 'thermal';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)] text-[var(--ink)] flex flex-col font-sans">
      {/* Dynamic print stylesheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #receipt-print-area, #receipt-print-area * {
            visibility: visible !important;
          }
          #receipt-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fffefb !important;
            color: #16150f !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          ${isThermal ? `
            @page {
              size: 80mm auto !important;
              margin: 0 !important;
            }
            #receipt-print-area {
              width: 72mm !important;
              max-width: 72mm !important;
              padding: 2mm 1mm !important;
            }
          ` : `
            @page {
              size: A4 portrait !important;
              margin: 10mm !important;
            }
            #receipt-print-area {
              width: 100% !important;
              max-width: 100% !important;
              padding: 0 !important;
            }
          `}
        }
      `}</style>

      {/* Top Header Bar per Receipt.dc.html */}
      <div className="no-print flex flex-wrap items-center gap-2 sm:gap-5 px-5 min-h-[58px] bg-[var(--panel)] border-b border-[var(--border)] shrink-0 z-20">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[16px] font-extrabold tracking-[-0.02em]">{shopDetails.name || 'Sunrise Provisions'}</span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink3)]">
            Bill output
          </span>
        </div>

        {/* View toggle segmented control */}
        <div className="flex items-center gap-0.5 p-[3px] border border-[var(--border)] rounded-lg bg-[var(--sub)]">
          <button
            type="button"
            onClick={() => setSelectedTemplate('thermal')}
            className={`px-3 py-1.5 border-0 rounded-[5px] text-[12px] font-semibold transition-colors ${
              isThermal
                ? 'bg-[var(--accent-soft)] text-[var(--accent-hi)]'
                : 'bg-transparent text-[var(--ink3)] hover:text-[var(--ink)]'
            }`}
          >
            Thermal 80&thinsp;mm
          </button>
          <button
            type="button"
            onClick={() => setSelectedTemplate('invoice')}
            className={`px-3 py-1.5 border-0 rounded-[5px] text-[12px] font-semibold transition-colors ${
              !isThermal
                ? 'bg-[var(--accent-soft)] text-[var(--accent-hi)]'
                : 'bg-transparent text-[var(--ink3)] hover:text-[var(--ink)]'
            }`}
          >
            A4 tax invoice
          </button>
        </div>

        <div className="flex-1 min-w-[12px]" />

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              toast.success(`Bill ${billNumber} sent to ${customerName || 'customer email'}`);
            }}
            className="h-8 px-3.5 border border-[var(--border2)] rounded-[7px] bg-[var(--sub)] text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--rule)] transition-colors cursor-pointer"
          >
            Email bill
          </button>

          <button
            type="button"
            disabled={isFinalizing}
            onClick={() => handlePrint(selectedTemplate)}
            className="h-8 px-3.5 border border-[var(--accent-line)] rounded-[7px] bg-[var(--accent-soft)] text-[var(--accent-hi)] text-[12px] font-bold hover:bg-[var(--accent-soft2)] transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>{isFinalizing ? 'Recording…' : 'Print'}</span>
            <span className="font-mono text-[10px] opacity-75">F9</span>
          </button>

          <div className="w-px h-[22px] bg-[var(--border)] mx-1" />

          {/* Light/Dark Toggle */}
          <div className="flex items-center gap-0.5 p-[3px] border border-[var(--border)] rounded-full bg-[var(--sub)]">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`px-2.5 py-1 border-0 rounded-full font-mono text-[10px] font-bold tracking-[0.08em] transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-hi)]'
                  : 'bg-transparent text-[var(--ink3)]'
              }`}
            >
              LIGHT
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`px-2.5 py-1 border-0 rounded-full font-mono text-[10px] font-bold tracking-[0.08em] transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-hi)]'
                  : 'bg-transparent text-[var(--ink3)]'
              }`}
            >
              DARK
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ml-2 text-[12px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hi)] transition-colors cursor-pointer"
          >
            Register &rarr;
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-start justify-center gap-10 p-8 sm:p-10 pb-20 overflow-auto">
        {isThermal ? (
          <>
            {/* THERMAL 80MM VIEW */}
            <div className="flex flex-col items-center gap-3.5">
              <div className="no-print font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--ink4)]">
                72&thinsp;mm printable &middot; ESC/POS graphic mode
              </div>

              {/* Printable Thermal Paper */}
              <div
                id="receipt-print-area"
                className="w-[300px] bg-[#fffefb] text-[#16150f] shadow-[0_24px_48px_-18px_var(--paper-shadow)] p-[20px_18px_0] select-text"
              >
                {/* Store Masthead */}
                <div className="text-center pb-3">
                  <div className="text-[17px] font-extrabold tracking-[0.04em]">
                    {(shopDetails.name || 'SUNRISE PROVISIONS').toUpperCase()}
                  </div>
                  <div className="text-[10.5px] leading-relaxed text-[#55524a] pt-1">
                    {shopDetails.address || '123 Main Street, City, State 12345'}
                    <br />
                    Tel {shopDetails.phone || '(555) 123-4567'}
                  </div>
                  <div className="font-mono text-[10px] font-semibold text-[#16150f] pt-1">
                    GSTIN {shopDetails.gstin || '29ABCDE1234F1Z5'}
                  </div>
                </div>

                {/* TAX INVOICE Band */}
                <div className="border-t border-[#16150f] border-b border-[#d9d5cb] py-1.5 text-center font-mono text-[10px] font-bold tracking-[0.18em]">
                  TAX INVOICE
                </div>

                {/* Meta Grid */}
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-[3px] py-2.5 font-mono text-[10.5px] border-b border-[#d9d5cb]">
                  <span className="text-[#7d7a71]">BILL</span>
                  <span className="font-semibold text-right">{billNumber}</span>

                  <span className="text-[#7d7a71]">DATE</span>
                  <span className="text-right">{formattedDate}</span>

                  <span className="text-[#7d7a71]">TILL</span>
                  <span className="text-right">T-02 &middot; {cashierName}</span>

                  <span className="text-[#7d7a71]">CUST</span>
                  <span className="text-right">{customerPhone || customerName || 'Walk-in'}</span>
                </div>

                {/* Items Column Header */}
                <div className="flex justify-between py-2 pb-1.5 font-mono text-[9px] font-bold tracking-[0.1em] text-[#7d7a71]">
                  <span>ITEM</span>
                  <span>AMOUNT</span>
                </div>

                {/* Items List */}
                <div className="border-t border-[#d9d5cb] flex flex-col">
                  {items.map((item, idx) => {
                    const lineAmount = item.price * item.quantity;
                    return (
                      <div key={idx} className="flex flex-col gap-0.5 py-2 border-b border-[#ece9e0]">
                        <div className="flex justify-between items-baseline gap-2.5">
                          <span className="text-[12.5px] font-semibold leading-tight">
                            {item.name}
                          </span>
                          <span className="font-mono text-[12.5px] font-bold tabular-nums whitespace-nowrap">
                            {lineAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between font-mono text-[10px] text-[#7d7a71]">
                          <span>
                            {item.quantity} &times; {item.price.toFixed(2)}
                          </span>
                          <span>GST {item.gstRate || 0}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Counts Row */}
                <div className="flex justify-between py-2.5 font-mono text-[10px] text-[#7d7a71] border-b border-[#d9d5cb]">
                  <span>{items.length} ITEMS</span>
                  <span>{totalUnits} UNITS</span>
                </div>

                {/* Tax Breakdown Grid */}
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-2.5 font-mono text-[11px] tabular-nums">
                  <span className="text-[#55524a]">Taxable value</span>
                  <span>{taxableSum.toFixed(2)}</span>

                  {isInterState ? (
                    <>
                      <span className="text-[#55524a]">IGST</span>
                      <span>{igstSum.toFixed(2)}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[#55524a]">CGST</span>
                      <span>{cgstSum.toFixed(2)}</span>
                      <span className="text-[#55524a]">SGST</span>
                      <span>{sgstSum.toFixed(2)}</span>
                    </>
                  )}

                  {billDiscount !== undefined && billDiscount > 0 && (
                    <>
                      <span className="text-[#55524a]">Bill discount</span>
                      <span className="text-[#b91c1c]">-₹{billDiscount.toFixed(2)}</span>
                    </>
                  )}

                  {couponDiscount !== undefined && couponDiscount > 0 && (
                    <>
                      <span className="text-[#55524a]">Coupon ({couponCode || 'PROMO'})</span>
                      <span className="text-[#b91c1c]">-₹{couponDiscount.toFixed(2)}</span>
                    </>
                  )}

                  {loyaltyDiscount !== undefined && loyaltyDiscount > 0 && (
                    <>
                      <span className="text-[#55524a]">Loyalty redeemed</span>
                      <span className="text-[#b91c1c]">-₹{loyaltyDiscount.toFixed(2)}</span>
                    </>
                  )}

                  {Math.abs(rounding) >= 0.01 && (
                    <>
                      <span className="text-[#55524a]">Rounding</span>
                      <span>{rounding > 0 ? `+${rounding.toFixed(2)}` : rounding.toFixed(2)}</span>
                    </>
                  )}
                </div>

                {/* Reversed TOTAL Block */}
                <div className="flex justify-between items-center gap-3 px-3.5 py-3 bg-[#16150f] text-[#fffefb]">
                  <span className="text-[11px] font-bold tracking-[0.14em]">TOTAL</span>
                  <span className="font-mono text-[22px] font-bold tabular-nums tracking-[-0.01em]">
                    &#8377;{finalTotal.toFixed(2)}
                  </span>
                </div>

                {/* Tendered & Change */}
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-3 font-mono text-[11px] tabular-nums border-b border-[#d9d5cb]">
                  <span className="text-[#55524a]">
                    {paymentMode ? paymentMode.charAt(0).toUpperCase() + paymentMode.slice(1) : 'Cash'} tendered
                  </span>
                  <span>{tendered.toFixed(2)}</span>

                  <span className="text-[#55524a]">Change given</span>
                  <span className="font-bold">{change.toFixed(2)}</span>
                </div>

                {/* Loyalty Row */}
                <div className="flex justify-between items-baseline py-2.5 font-mono text-[10.5px] border-b border-[#16150f]">
                  <span className="text-[#7d7a71] tracking-[0.1em]">LOYALTY</span>
                  <span>+{Math.max(1, Math.floor(finalTotal / 100))} earned &middot; settled</span>
                </div>

                {/* QR Code & Return Terms */}
                <div className="flex flex-col items-center gap-2.5 pt-4 pb-5 text-center">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Bill QR Code"
                      className="w-[72px] h-[72px] border border-[#d9d5cb] p-0.5"
                    />
                  ) : (
                    <div className="w-[72px] h-[72px] border border-dashed border-[#b9b5aa] flex items-center justify-center font-mono text-[9px] text-[#8b8880] tracking-[0.08em]">
                      QR
                    </div>
                  )}
                  <div className="text-[10px] leading-relaxed text-[#55524a]">
                    Scan to view or return this bill
                    <br />
                    Exchange within 7 days with receipt
                  </div>
                  <div className="text-[11px] font-bold tracking-[0.12em] pt-0.5">
                    THANK YOU &middot; VISIT AGAIN
                  </div>
                </div>

                {/* Bottom Tear-off Perforation */}
                <div
                  className="h-3.5"
                  style={{
                    background: 'repeating-linear-gradient(90deg, #d9d5cb 0 6px, transparent 6px 12px)',
                    backgroundSize: '100% 1px',
                    backgroundPosition: '0 50%',
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              </div>
            </div>

            {/* Print Rules Guidance Card (Hidden in print) */}
            <div className="no-print w-[260px] flex flex-col gap-4 pt-8 text-[12.5px] leading-relaxed text-[var(--ink2)]">
              <div className="font-mono text-[10px] font-bold tracking-[0.14em] uppercase text-[var(--ink4)]">
                Print rules
              </div>
              <div>
                <span className="text-[var(--ink)] font-bold">Monochrome only.</span> Thermal paper has one ink. The blue accent used elsewhere does not exist here &mdash; hierarchy comes from size, weight, and the one reversed total block.
              </div>
              <div>
                <span className="text-[var(--ink)] font-bold">One number per row.</span> Amounts sit on a right rail with tabular figures, so a customer can scan the column cleanly.
              </div>
              <div>
                <span className="text-[var(--ink)] font-bold">Total is the only reversed block.</span> It replaces old rows of ASCII dividers.
              </div>
              <div>
                <span className="text-[var(--ink)] font-bold">Tax per line, not just per bill.</span> Mixed GST rates are standard, so each line carries its own rate and reconciles.
              </div>
              <div>
                <span className="text-[var(--ink)] font-bold">No emoji.</span> Loyalty and ledger are plain label/value rows.
              </div>
            </div>
          </>
        ) : (
          /* A4 TAX INVOICE VIEW */
          <div className="flex flex-col items-center gap-3.5">
            <div className="no-print font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--ink4)]">
              A4 &middot; 210 &times; 297&thinsp;mm &middot; 14&thinsp;mm margins
            </div>

            {/* Printable A4 Sheet */}
            <div
              id="receipt-print-area"
              className="w-[794px] min-h-[1123px] bg-[#fffefb] text-[#16150f] shadow-[0_28px_60px_-20px_var(--paper-shadow)] p-[52px_56px] flex flex-col select-text"
            >
              {/* Masthead */}
              <div className="flex justify-between items-start gap-8 pb-5 border-b-2 border-[#16150f]">
                <div>
                  <div className="text-[24px] font-extrabold tracking-[-0.01em]">
                    {shopDetails.name || 'Sunrise Provisions'}
                  </div>
                  <div className="text-[12px] leading-relaxed text-[#55524a] pt-1.5">
                    {shopDetails.address || '123 Main Street, City, State 12345'}
                    <br />
                    Tel {shopDetails.phone || '(555) 123-4567'} &middot; {shopDetails.email || 'accounts@sunriseprovisions.in'}
                  </div>
                  <div className="font-mono text-[11px] font-semibold pt-1.5">
                    GSTIN {shopDetails.gstin || '29ABCDE1234F1Z5'} &nbsp; PAN {pan}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-[11px] font-bold tracking-[0.2em] text-[#7d7a71]">
                    TAX INVOICE
                  </div>
                  <div className="font-mono text-[15px] font-bold pt-1.5">
                    {billNumber}
                  </div>
                  <div className="text-[12px] text-[#55524a] pt-1">
                    {formattedDate} &middot; Till T-02
                  </div>
                  <div className="text-[11px] text-[#7d7a71] pt-0.5">
                    Original for recipient
                  </div>
                </div>
              </div>

              {/* Billed To & Supply Blocks */}
              <div className="grid grid-cols-2 gap-x-10 py-5 border-b border-[#d9d5cb]">
                <div>
                  <div className="font-mono text-[9.5px] font-bold tracking-[0.14em] text-[#7d7a71] pb-2">
                    BILLED TO
                  </div>
                  <div className="text-[14px] font-bold">
                    {customerName || 'Walk-in Customer'}
                  </div>
                  <div className="text-[12px] leading-relaxed text-[#55524a] pt-1">
                    {customerPhone || '+91 94443 10812'}
                    <br />
                    {customerGstin
                      ? `GSTIN: ${customerGstin} \u2014 B2B supply`
                      : 'Unregistered \u2014 B2C supply'}
                  </div>
                </div>

                <div>
                  <div className="font-mono text-[9.5px] font-bold tracking-[0.14em] text-[#7d7a71] pb-2">
                    SUPPLY
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
                    <span className="text-[#7d7a71]">Place of supply</span>
                    <span>{placeOfSupply}</span>

                    <span className="text-[#7d7a71]">Cashier</span>
                    <span>{cashierName}</span>

                    <span className="text-[#7d7a71]">Payment</span>
                    <span>
                      {paymentMode ? paymentMode.charAt(0).toUpperCase() + paymentMode.slice(1) : 'Cash'} &mdash; settled
                    </span>
                  </div>
                </div>
              </div>

              {/* 7-Column Line Items Table */}
              <div className="pt-6">
                <div className="grid grid-cols-[28px_1fr_74px_44px_84px_56px_92px] gap-x-3 pb-2 border-b border-[#16150f] font-mono text-[9.5px] font-bold tracking-[0.1em] text-[#7d7a71]">
                  <span>#</span>
                  <span>DESCRIPTION</span>
                  <span>HSN</span>
                  <span className="text-right">QTY</span>
                  <span className="text-right">RATE</span>
                  <span className="text-right">GST</span>
                  <span className="text-right">AMOUNT</span>
                </div>

                {items.map((item, idx) => {
                  const lineAmount = item.price * item.quantity;
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-[28px_1fr_74px_44px_84px_56px_92px] gap-x-3 items-baseline py-2.5 border-b border-[#ece9e0] text-[13px]"
                    >
                      <span className="font-mono text-[11px] text-[#7d7a71]">{idx + 1}</span>
                      <span className="font-semibold">{item.name}</span>
                      <span className="font-mono text-[11.5px] text-[#55524a]">{item.hsnCode || '—'}</span>
                      <span className="font-mono tabular-nums text-right">{item.quantity}</span>
                      <span className="font-mono tabular-nums text-right">{item.price.toFixed(2)}</span>
                      <span className="font-mono text-[11.5px] text-right text-[#55524a]">
                        {item.gstRate || 0}%
                      </span>
                      <span className="font-mono font-bold tabular-nums text-right">
                        {lineAmount.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Rate-wise Tax Summary & Totals */}
              <div className="flex justify-between items-start gap-12 pt-7">
                {/* Left: Rate-wise Table + Amount in Words */}
                <div className="flex-1">
                  <div className="font-mono text-[9.5px] font-bold tracking-[0.14em] text-[#7d7a71] pb-2.5">
                    RATE-WISE TAX SUMMARY
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-5 gap-y-1.5 font-mono text-[11.5px] tabular-nums">
                    <span className="text-[#7d7a71] text-[9.5px] tracking-[0.1em] pb-1">RATE</span>
                    <span className="text-[#7d7a71] text-[9.5px] tracking-[0.1em] text-right pb-1">TAXABLE</span>
                    <span className="text-[#7d7a71] text-[9.5px] tracking-[0.1em] text-right pb-1">
                      {isInterState ? 'IGST' : 'CGST'}
                    </span>
                    <span className="text-[#7d7a71] text-[9.5px] tracking-[0.1em] text-right pb-1">
                      {isInterState ? '' : 'SGST'}
                    </span>

                    {rateWiseBreakdown.map((r, i) => (
                      <div key={i} className="contents">
                        <span>{r.rate}%</span>
                        <span className="text-right">{r.taxable.toFixed(2)}</span>
                        <span className="text-right">
                          {isInterState ? r.igst.toFixed(2) : r.cgst.toFixed(2)}
                        </span>
                        <span className="text-right">
                          {isInterState ? '' : r.sgst.toFixed(2)}
                        </span>
                      </div>
                    ))}

                    <span className="border-t border-[#16150f] pt-1.5 font-bold">Total</span>
                    <span className="border-t border-[#16150f] pt-1.5 text-right font-bold">
                      {taxableSum.toFixed(2)}
                    </span>
                    <span className="border-t border-[#16150f] pt-1.5 text-right font-bold">
                      {isInterState ? igstSum.toFixed(2) : cgstSum.toFixed(2)}
                    </span>
                    <span className="border-t border-[#16150f] pt-1.5 text-right font-bold">
                      {isInterState ? '' : sgstSum.toFixed(2)}
                    </span>
                  </div>

                  <div className="pt-5 text-[12px] leading-relaxed text-[#55524a] max-w-[340px]">
                    <span className="font-mono text-[9.5px] font-bold tracking-[0.14em] text-[#7d7a71]">
                      AMOUNT IN WORDS
                    </span>
                    <br />
                    <span className="text-[#16150f] font-semibold">
                      {amountInWords(finalTotal)}
                    </span>
                  </div>
                </div>

                {/* Right: Totals Stack & Reversed Total Block */}
                <div className="w-[280px]">
                  <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-2 text-[13px] tabular-nums">
                    <span className="text-[#55524a]">Taxable value</span>
                    <span className="font-mono text-right">{taxableSum.toFixed(2)}</span>

                    {isInterState ? (
                      <>
                        <span className="text-[#55524a]">IGST</span>
                        <span className="font-mono text-right">{igstSum.toFixed(2)}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[#55524a]">CGST</span>
                        <span className="font-mono text-right">{cgstSum.toFixed(2)}</span>
                        <span className="text-[#55524a]">SGST</span>
                        <span className="font-mono text-right">{sgstSum.toFixed(2)}</span>
                      </>
                    )}

                    {billDiscount !== undefined && billDiscount > 0 && (
                      <>
                        <span className="text-[#55524a]">Bill discount</span>
                        <span className="font-mono text-right text-[#b91c1c]">-₹{billDiscount.toFixed(2)}</span>
                      </>
                    )}

                    {couponDiscount !== undefined && couponDiscount > 0 && (
                      <>
                        <span className="text-[#55524a]">Coupon ({couponCode || 'PROMO'})</span>
                        <span className="font-mono text-right text-[#b91c1c]">-₹{couponDiscount.toFixed(2)}</span>
                      </>
                    )}

                    {loyaltyDiscount !== undefined && loyaltyDiscount > 0 && (
                      <>
                        <span className="text-[#55524a]">Loyalty redeemed</span>
                        <span className="font-mono text-right text-[#b91c1c]">-₹{loyaltyDiscount.toFixed(2)}</span>
                      </>
                    )}

                    {Math.abs(rounding) >= 0.01 && (
                      <>
                        <span className="text-[#55524a]">Rounding</span>
                        <span className="font-mono text-right">
                          {rounding > 0 ? `+${rounding.toFixed(2)}` : rounding.toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Reversed TOTAL Block */}
                  <div className="flex justify-between items-center gap-4 mt-4 px-4 py-3.5 bg-[#16150f] text-[#fffefb]">
                    <span className="text-[11px] font-bold tracking-[0.14em]">TOTAL</span>
                    <span className="font-mono text-[24px] font-bold tabular-nums">
                      &#8377;{finalTotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1.5 pt-3.5 text-[12.5px] tabular-nums">
                    <span className="text-[#55524a]">
                      {paymentMode ? paymentMode.charAt(0).toUpperCase() + paymentMode.slice(1) : 'Cash'} tendered
                    </span>
                    <span className="font-mono text-right">{tendered.toFixed(2)}</span>

                    <span className="text-[#55524a]">Change given</span>
                    <span className="font-mono text-right">{change.toFixed(2)}</span>

                    <span className="text-[#55524a]">Loyalty earned</span>
                    <span className="font-mono text-right">
                      +{Math.max(1, Math.floor(finalTotal / 100))} pts
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-[40px]" />

              {/* Terms & Signature Footer */}
              <div className="flex justify-between items-end gap-10 pt-7 border-t border-[#d9d5cb]">
                <div className="text-[11px] leading-relaxed text-[#7d7a71] max-w-[420px]">
                  Goods once sold are exchangeable within 7 days against this invoice. Tax is charged on the inclusive retail price under CGST/SGST. This is a computer-generated invoice and needs no physical signature.
                </div>
                <div className="text-right">
                  <div className="w-[190px] border-b border-[#16150f] h-10" />
                  <div className="text-[11px] text-[#55524a] pt-1.5">
                    For {shopDetails.name || 'Sunrise Provisions'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}