import { useState, useEffect, useMemo } from 'react';
import { useAuth, ShiftRecord } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { Wallet, ShieldAlert, Award, FileText, CheckCircle, ArrowRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../utils/api';

interface ShiftClosingModalProps {
  onClose: () => void;
}

export function ShiftClosingModal({ onClose }: ShiftClosingModalProps) {
  const { activeShift, endShift } = useAuth();
  const { darkMode } = useTheme();

  // Actual cashier inputs
  const [actualCash, setActualCash] = useState('');
  const [actualUpi, setActualUpi] = useState('');
  const [actualCard, setActualCard] = useState('');
  const [notes, setNotes] = useState('');

  // Physical Denomination Calculator States
  const [showDenomCalc, setShowDenomCalc] = useState(false);
  const [denoms, setDenoms] = useState<{ [key: number]: string }>({
    2000: '',
    500: '',
    200: '',
    100: '',
    50: '',
    20: '',
    10: '',
    5: '',
    2: '',
    1: '',
  });

  // Calculate live cumulative sum from active counts
  const calculatedCashTotal = useMemo(() => {
    let sum = 0;
    Object.entries(denoms).forEach(([value, countStr]) => {
      const denomVal = parseInt(value);
      const count = parseInt(countStr) || 0;
      sum += denomVal * count;
    });
    return sum;
  }, [denoms]);

  // Synchronize calculator total dynamically to actualCash state
  useEffect(() => {
    if (showDenomCalc) {
      setActualCash(String(calculatedCashTotal));
    }
  }, [calculatedCashTotal, showDenomCalc]);
  
  // Real-time calculated system totals (fetched from server)
  const [systemTotals, setSystemTotals] = useState({
    cashSales: 0,
    upiSales: 0,
    cardSales: 0,
    expectedCash: 0,
  });

  const [loading, setLoading] = useState(false);
  const [zReport, setZReport] = useState<ShiftRecord | null>(null);

  useEffect(() => {
    if (!activeShift) return;

    // Fetch up-to-date sales sums from backend to show live system expectations
    const fetchActiveShiftSales = async () => {
      try {
        const bills = await api.get<any[]>('/bills');
        // Filter bills checked out by this cashier during this shift window
        const shiftBills = bills.filter(b => b.generatedBy === activeShift.user_id && b.date >= activeShift.start_time);
        
        let cash = 0;
        let upi = 0;
        let card = 0;

        for (const bill of shiftBills) {
          const mode = (bill.paymentMode || 'cash').toLowerCase();
          if (mode === 'cash') cash += bill.total;
          else if (mode === 'upi') upi += bill.total;
          else if (mode === 'card') card += bill.total;
        }

        setSystemTotals({
          cashSales: cash,
          upiSales: upi,
          cardSales: card,
          expectedCash: activeShift.initial_cash + cash,
        });

        // Set default inputs to expected to speed up cashier flow
        setActualCash(String(activeShift.initial_cash + cash));
        setActualUpi(String(upi));
        setActualCard(String(card));
      } catch (err) {
        console.error('Failed to pre-fetch shift sales:', err);
      }
    };

    fetchActiveShiftSales();
  }, [activeShift]);

  if (!activeShift) return null;

  const actualCashNum = parseFloat(actualCash) || 0;
  const actualUpiNum = parseFloat(actualUpi) || 0;
  const actualCardNum = parseFloat(actualCard) || 0;

  const cashDiscrepancy = actualCashNum - systemTotals.expectedCash;
  const upiDiscrepancy = actualUpiNum - systemTotals.upiSales;
  const cardDiscrepancy = actualCardNum - systemTotals.cardSales;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      const closed = await endShift(actualCashNum, actualUpiNum, actualCardNum, notes);
      setZReport(closed);
      toast.success('💼 Shift Z-Report generated and drawer closed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reconcile and close shift');
    } finally {
      setLoading(false);
    }
  };

  // Render completed Z-Report summary
  if (zReport) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <div className={`w-full max-w-lg rounded-2xl border ${
          darkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-800'
        } shadow-2xl overflow-hidden`}>
          <div className="bg-gradient-to-r from-teal-600 to-emerald-700 p-6 text-white text-center">
            <CheckCircle size={48} className="mx-auto mb-2 text-emerald-100" />
            <h2 className="text-2xl font-bold tracking-tight">Shift Z-Report Completed</h2>
            <p className="text-emerald-100/80 text-xs mt-1">Drawer has been reconciled and logged successfully</p>
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold tracking-wide uppercase opacity-75">Shift Breakdown</h3>
              
              <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-800/40 border-gray-800' : 'bg-gray-50 border-gray-100'} space-y-2.5 text-sm`}>
                <div className="flex justify-between">
                  <span className="opacity-75">Cashier Name</span>
                  <span className="font-semibold">{zReport.user_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-75">Shift Started</span>
                  <span>{new Date(zReport.start_time).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-75">Shift Ended</span>
                  <span>{zReport.end_time ? new Date(zReport.end_time).toLocaleString() : 'N/A'}</span>
                </div>
                <div className="flex justify-between border-t border-dashed pt-2.5 mt-2.5">
                  <span className="opacity-75">Initial Cash Float</span>
                  <span className="font-semibold">₹{Number(zReport.initial_cash).toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-gray-800/20 border-gray-800' : 'bg-gray-50/50 border-gray-100'}`}>
                  <span className="text-[10px] uppercase tracking-wider opacity-75 block mb-1">Cash Balance</span>
                  <span className="text-sm font-bold block">₹{Number(zReport.actual_cash).toFixed(0)}</span>
                  <span className={`text-[10px] font-semibold block mt-0.5 ${
                    zReport.discrepancy_cash === 0 ? 'text-emerald-500' : zReport.discrepancy_cash > 0 ? 'text-teal-500' : 'text-rose-500'
                  }`}>
                    {zReport.discrepancy_cash === 0 ? 'Match' : `${zReport.discrepancy_cash > 0 ? '+' : ''}${zReport.discrepancy_cash}`}
                  </span>
                </div>
                <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-gray-800/20 border-gray-800' : 'bg-gray-50/50 border-gray-100'}`}>
                  <span className="text-[10px] uppercase tracking-wider opacity-75 block mb-1">UPI Sales</span>
                  <span className="text-sm font-bold block">₹{Number(zReport.actual_upi).toFixed(0)}</span>
                </div>
                <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-gray-800/20 border-gray-800' : 'bg-gray-50/50 border-gray-100'}`}>
                  <span className="text-[10px] uppercase tracking-wider opacity-75 block mb-1">Card Sales</span>
                  <span className="text-sm font-bold block">₹{Number(zReport.actual_card).toFixed(0)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                window.location.reload(); // trigger fully clean logout/reload cycle
              }}
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 transition-all cursor-pointer"
            >
              Finish Shift & Log Out
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className={`w-full max-w-2xl rounded-2xl border ${
        darkMode ? 'bg-gray-900/95 border-gray-800 text-white' : 'bg-white/95 border-gray-200 text-gray-800'
      } shadow-2xl overflow-hidden`}>
        
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gradient-to-r from-gray-800 to-gray-950 text-white">
          <div className="flex items-center gap-3">
            <Wallet size={24} className="text-emerald-500" />
            <div>
              <h2 className="text-lg font-bold">Shift Z-Report Reconciliation</h2>
              <p className="text-[11px] text-gray-400">Reconcile current cash drawer balance before shift closure</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            
            {/* LEFT SIDE: System Expected */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider opacity-75 border-b border-gray-800 pb-2">System Expected</h3>
              <div className="space-y-3.5">
                <div className="flex justify-between text-sm">
                  <span className="opacity-70">Drawer Cash Float:</span>
                  <span className="font-semibold">₹{Number(activeShift.initial_cash).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-70">Cash Sales:</span>
                  <span className="font-semibold">₹{Number(systemTotals.cashSales).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-dashed border-gray-800 pt-3">
                  <span className="font-bold text-emerald-500">Total Cash Expected:</span>
                  <span className="font-bold text-emerald-500">₹{Number(systemTotals.expectedCash).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1">
                  <span className="opacity-70">UPI Sales Expected:</span>
                  <span className="font-semibold">₹{Number(systemTotals.upiSales).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-70">Card Sales Expected:</span>
                  <span className="font-semibold">₹{Number(systemTotals.cardSales).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* RIGHT SIDE: Cashier Counts */}
            <div className="space-y-4 border-l border-gray-800 pl-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider opacity-75 border-b border-gray-800 pb-2">Actual Counts</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-medium tracking-wide uppercase opacity-75">Physical Cash in Drawer (₹)</label>
                    <button
                      type="button"
                      onClick={() => setShowDenomCalc(!showDenomCalc)}
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-all cursor-pointer ${
                        showDenomCalc
                          ? 'bg-purple-550/15 border-purple-500/35 text-purple-600 dark:text-purple-400 shadow-sm'
                          : darkMode ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white' : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {showDenomCalc ? 'Hide Calculator' : 'Use Denomination Counter'}
                    </button>
                  </div>

                  {showDenomCalc && (
                    <div className={`p-4 rounded-xl border mb-3 ${darkMode ? 'bg-purple-950/15 border-purple-900/30' : 'bg-purple-500/[0.03] border-purple-250/60 shadow-inner shadow-purple-500/5'} animate-scale-in`}>
                      <div className="flex justify-between items-center border-b dark:border-gray-850 pb-2 mb-3">
                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-purple-600 dark:text-purple-400">Denomination Counter</span>
                        <button
                          type="button"
                          onClick={() => {
                            setDenoms({ 2000: '', 500: '', 200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 2: '', 1: '' });
                            setActualCash('');
                          }}
                          className="text-[9px] text-red-500 hover:text-red-650 font-extrabold cursor-pointer"
                        >
                          Clear Counts
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {[2000, 500, 200, 100, 50, 20, 10, 5, 2, 1].map((val) => (
                          <div key={val} className="flex items-center justify-between text-[11px] gap-1">
                            <span className="font-bold opacity-80 min-w-[34px]">₹{val} ×</span>
                            <input
                              type="number"
                              min="0"
                              value={denoms[val]}
                              onChange={(e) => {
                                const valStr = e.target.value;
                                setDenoms(prev => ({ ...prev, [val]: valStr }));
                              }}
                              placeholder="0"
                              className={`w-12 py-0.5 text-center font-bold border rounded text-[10px] ${
                                darkMode ? 'bg-gray-850 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-800'
                              } focus:ring-1 focus:ring-purple-500`}
                            />
                            <span className="font-mono text-[9px] opacity-60 w-12 text-right">
                              ₹{val * (parseInt(denoms[val]) || 0)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 pt-3 border-t dark:border-gray-850 flex justify-between items-center text-[11px]">
                        <span className="font-bold">Total Calculated Sum:</span>
                        <span className="font-black text-purple-600 dark:text-purple-400 text-xs">
                          ₹{calculatedCashTotal.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  )}

                  <input
                    type="number"
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                    className={`w-full px-3 py-2 text-sm font-bold border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                      darkMode ? 'bg-gray-800/50 border-gray-700 focus:border-emerald-500' : 'bg-gray-50 border-gray-200 focus:border-emerald-600'
                    }`}
                    required
                    disabled={showDenomCalc}
                    placeholder="Enter physical cash total"
                  />
                  {showDenomCalc && (
                    <p className="text-[9px] text-purple-500 font-bold mt-1.5 animate-pulse">
                      ⚠️ Manual text input is disabled while the Denomination Counter is active.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium tracking-wide uppercase opacity-75">Total UPI Received (₹)</label>
                  <input
                    type="number"
                    value={actualUpi}
                    onChange={(e) => setActualUpi(e.target.value)}
                    className={`w-full px-3 py-2 text-sm font-bold border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                      darkMode ? 'bg-gray-800/50 border-gray-700 focus:border-emerald-500' : 'bg-gray-50 border-gray-200 focus:border-emerald-600'
                    }`}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium tracking-wide uppercase opacity-75">Total Card Slips (₹)</label>
                  <input
                    type="number"
                    value={actualCard}
                    onChange={(e) => setActualCard(e.target.value)}
                    className={`w-full px-3 py-2 text-sm font-bold border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                      darkMode ? 'bg-gray-800/50 border-gray-700 focus:border-emerald-500' : 'bg-gray-50 border-gray-200 focus:border-emerald-600'
                    }`}
                    required
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Discrepancies live banner */}
          <div className={`p-4 rounded-xl border ${
            cashDiscrepancy === 0 && upiDiscrepancy === 0 && cardDiscrepancy === 0
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
          } flex items-start gap-3 text-xs`}>
            <ShieldAlert size={18} className="shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <strong>Live Reconciliation Discrepancy Status:</strong>
              <div className="grid grid-cols-3 gap-4 mt-1 font-semibold">
                <span>Cash: {cashDiscrepancy === 0 ? 'Perfect' : `₹${cashDiscrepancy.toFixed(2)}`}</span>
                <span>UPI: {upiDiscrepancy === 0 ? 'Perfect' : `₹${upiDiscrepancy.toFixed(2)}`}</span>
                <span>Card: {cardDiscrepancy === 0 ? 'Perfect' : `₹${cardDiscrepancy.toFixed(2)}`}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium tracking-wide uppercase opacity-75">Shift Reconciliation Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record any cash differences or audit explanation here..."
              className={`w-full px-3 py-2 text-xs border rounded-lg outline-none h-20 resize-none ${
                darkMode ? 'bg-gray-800/30 border-gray-700 focus:border-emerald-500 text-white' : 'bg-gray-50 border-gray-200 focus:border-emerald-600 text-gray-800'
              }`}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-all cursor-pointer"
          >
            {loading ? 'Reconciling drawer...' : 'Confirm Drawer counts & End Shift'}
            <ArrowRight size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
