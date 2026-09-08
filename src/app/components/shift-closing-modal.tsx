import { useState, useEffect, useMemo } from 'react';
import { useAuth, ShiftRecord } from '../contexts/auth-context';
import { X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { MONO, NUM, EYEBROW, FIELD, CHIP, inr } from '../lib/design-system';

interface ShiftClosingModalProps {
  onClose: () => void;
}

export function ShiftClosingModal({ onClose }: ShiftClosingModalProps) {
  const { activeShift, endShift } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
    billCount: 0,
  });

  const [loading, setLoading] = useState(false);
  const [zReport, setZReport] = useState<ShiftRecord | null>(null);

  useEffect(() => {
    if (!activeShift) return;

    const fetchActiveShiftSales = async () => {
      try {
        const bills = await api.get<any[]>('/bills');
        const shiftBills = bills.filter(
          (b) => b.cashier_id === activeShift.user_id && b.date >= activeShift.start_time
        );

        let cash = 0;
        let upi = 0;
        let card = 0;

        for (const bill of shiftBills) {
          const mode = (bill.payment_mode || bill.paymentMode || 'cash').toLowerCase();
          if (mode === 'cash') cash += bill.total;
          else if (mode === 'upi') upi += bill.total;
          else if (mode === 'card') card += bill.total;
        }

        setSystemTotals({
          cashSales: cash,
          upiSales: upi,
          cardSales: card,
          expectedCash: activeShift.initial_cash + cash,
          billCount: shiftBills.length,
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

  // Elapsed duration string
  const shiftDuration = (() => {
    const start = new Date(activeShift.start_time).getTime();
    const now = Date.now();
    const diffMins = Math.max(0, Math.floor((now - start) / 60000));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      const closed = await endShift(actualCashNum, actualUpiNum, actualCardNum, notes);
      setZReport(closed);
      toast.success('Shift Z-Report generated and drawer closed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reconcile and close shift');
    } finally {
      setLoading(false);
    }
  };

  // Render completed Z-Report summary
  if (zReport) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans">
        <div
          className="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl flex flex-col"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            color: 'var(--ink)',
          }}
        >
          <div
            className="px-6 py-5 flex items-center gap-3.5"
            style={{ borderBottom: '1px solid var(--rule2)' }}
          >
            <CheckCircle size={24} style={{ color: 'var(--ok)' }} className="shrink-0" />
            <div>
              <div style={EYEBROW}>Shift Z-Report · Completed</div>
              <h2 className="text-base font-bold text-[var(--ink)] mt-0.5">
                Drawer Reconciled Successfully
              </h2>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div
              className="p-4 rounded-lg space-y-2.5 text-xs"
              style={{
                background: 'var(--sub)',
                border: '1px solid var(--rule2)',
              }}
            >
              <div className="flex justify-between">
                <span style={{ color: 'var(--ink3)' }}>Cashier</span>
                <span className="font-semibold text-[var(--ink)]">{zReport.user_name}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--ink3)' }}>Shift Started</span>
                <span style={NUM} className="text-[var(--ink)]">
                  {new Date(zReport.start_time).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--ink3)' }}>Shift Ended</span>
                <span style={NUM} className="text-[var(--ink)]">
                  {zReport.end_time
                    ? new Date(zReport.end_time).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : 'N/A'}
                </span>
              </div>
              <div
                className="flex justify-between pt-2.5"
                style={{ borderTop: '1px dashed var(--rule2)' }}
              >
                <span style={{ color: 'var(--ink3)' }}>Initial Cash Float</span>
                <span style={NUM} className="font-bold text-[var(--ink)]">
                  {inr(zReport.initial_cash)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div
                className="p-3.5 rounded-lg"
                style={{
                  background: 'var(--sub)',
                  border: '1px solid var(--rule2)',
                }}
              >
                <span style={EYEBROW} className="block mb-1">
                  Cash Balance
                </span>
                <span style={NUM} className="text-sm font-bold text-[var(--ink)] block">
                  {inr(zReport.actual_cash)}
                </span>
                <span
                  style={NUM}
                  className="text-[10px] font-bold block mt-1"
                  css-color={zReport.discrepancy_cash === 0 ? 'var(--ok)' : 'var(--danger)'}
                >
                  <span
                    style={{
                      color: zReport.discrepancy_cash === 0 ? 'var(--ok)' : 'var(--danger)',
                    }}
                  >
                    {zReport.discrepancy_cash === 0
                      ? 'Match'
                      : (zReport.discrepancy_cash > 0 ? '+' : '') + inr(zReport.discrepancy_cash)}
                  </span>
                </span>
              </div>
              <div
                className="p-3.5 rounded-lg"
                style={{
                  background: 'var(--sub)',
                  border: '1px solid var(--rule2)',
                }}
              >
                <span style={EYEBROW} className="block mb-1">
                  UPI Sales
                </span>
                <span style={NUM} className="text-sm font-bold text-[var(--ink)] block">
                  {inr(zReport.actual_upi)}
                </span>
              </div>
              <div
                className="p-3.5 rounded-lg"
                style={{
                  background: 'var(--sub)',
                  border: '1px solid var(--rule2)',
                }}
              >
                <span style={EYEBROW} className="block mb-1">
                  Card Sales
                </span>
                <span style={NUM} className="text-sm font-bold text-[var(--ink)] block">
                  {inr(zReport.actual_card)}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                window.location.reload();
              }}
              className="w-full h-11 rounded-lg font-bold text-xs cursor-pointer transition-opacity flex items-center justify-center gap-2 hover:opacity-90"
              style={{
                background: 'var(--ink)',
                color: 'var(--panel)',
                border: 0,
              }}
            >
              Finish Shift &amp; Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-7 overflow-y-auto bg-black/60 backdrop-blur-sm font-sans">
      <div
        className="w-full max-w-[860px] my-auto rounded-xl overflow-hidden shadow-2xl flex flex-col"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          color: 'var(--ink)',
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--rule2)' }}
        >
          <div>
            <div style={EYEBROW}>Shift close · Till 2</div>
            <h2 className="text-lg font-bold text-[var(--ink)] mt-0.5">Reconcile the drawer</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-md border flex items-center justify-center cursor-pointer transition-colors"
            style={{
              background: 'var(--sub)',
              borderColor: 'var(--border2)',
              color: 'var(--ink3)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT COLUMN: System Expected */}
            <div className="space-y-4">
              <div
                style={EYEBROW}
                className="pb-2.5"
                css-border-bottom="1px solid var(--rule2)"
              >
                <span style={{ borderBottom: '1px solid var(--rule2)', display: 'block', paddingBottom: 8 }}>
                  System expected
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-baseline">
                  <span style={{ color: 'var(--ink2)' }}>Drawer cash float:</span>
                  <span style={NUM} className="font-semibold text-[var(--ink)]">
                    {inr(activeShift.initial_cash)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span style={{ color: 'var(--ink2)' }}>Cash sales:</span>
                  <span style={NUM} className="font-semibold text-[var(--ink)]">
                    {inr(systemTotals.cashSales)}
                  </span>
                </div>
                <div
                  className="flex justify-between items-baseline pt-2.5"
                  style={{ borderTop: '1px dashed var(--rule2)' }}
                >
                  <span className="font-bold text-[var(--ink)]">Total cash expected:</span>
                  <span style={NUM} className="font-bold text-sm text-[var(--ink)]">
                    {inr(systemTotals.expectedCash)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-1">
                  <span style={{ color: 'var(--ink2)' }}>UPI sales expected:</span>
                  <span style={NUM} className="font-semibold text-[var(--ink)]">
                    {inr(systemTotals.upiSales)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span style={{ color: 'var(--ink2)' }}>Card sales expected:</span>
                  <span style={NUM} className="font-semibold text-[var(--ink)]">
                    {inr(systemTotals.cardSales)}
                  </span>
                </div>
              </div>

              {/* Shift log info card */}
              <div
                className="p-3.5 rounded-lg space-y-2 mt-4"
                style={{
                  background: 'var(--sub)',
                  border: '1px solid var(--rule2)',
                }}
              >
                <div style={EYEBROW}>Shift log</div>
                <div
                  style={{ fontFamily: MONO }}
                  className="text-xs text-[var(--ink2)] leading-relaxed"
                >
                  <div>
                    Opened {new Date(activeShift.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {shiftDuration}
                  </div>
                  <div>Cashier: {activeShift.user_name}</div>
                  <div>{systemTotals.billCount} bills completed this shift</div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Cashier Counts */}
            <div
              className="space-y-4 md:pl-6 md:border-l"
              style={{ borderColor: 'var(--rule2)' }}
            >
              <div style={EYEBROW}>
                <span style={{ borderBottom: '1px solid var(--rule2)', display: 'block', paddingBottom: 8 }}>
                  Counted by cashier
                </span>
              </div>

              {/* Physical Cash */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-[var(--ink2)]">
                    Physical cash in drawer
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDenomCalc(!showDenomCalc)}
                    className="px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors"
                    style={
                      showDenomCalc
                        ? {
                            background: 'var(--accent-soft)',
                            border: '1px solid var(--accent-line)',
                            color: 'var(--accent-hi)',
                          }
                        : {
                            background: 'var(--sub)',
                            border: '1px solid var(--border2)',
                            color: 'var(--ink2)',
                          }
                    }
                  >
                    {showDenomCalc ? 'Hide calculator' : 'Denomination counter'}
                  </button>
                </div>

                <input
                  type="number"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  disabled={showDenomCalc}
                  placeholder="Enter physical cash total"
                  required
                  min="0"
                  step="any"
                  style={{
                    ...FIELD,
                    ...NUM,
                    width: '100%',
                    height: 48,
                    padding: '0 14px',
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                />
                {showDenomCalc && (
                  <p
                    style={{ fontFamily: MONO }}
                    className="text-[11px] text-[var(--ink3)] mt-1"
                  >
                    Locked to denomination count for audit integrity.
                  </p>
                )}
              </div>

              {/* Denomination Counter Card */}
              {showDenomCalc && (
                <div
                  className="p-3.5 rounded-lg space-y-3"
                  style={{
                    background: 'var(--sub)',
                    border: '1px solid var(--rule2)',
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span style={EYEBROW}>Denominations</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDenoms({
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
                        setActualCash('0');
                      }}
                      className="text-xs font-semibold cursor-pointer"
                      style={{ color: 'var(--danger)' }}
                    >
                      Clear
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {[2000, 500, 200, 100, 50, 20, 10, 5, 2, 1].map((val) => (
                      <div key={val} className="flex items-center gap-2 text-xs">
                        <span style={NUM} className="font-bold text-[var(--ink2)] w-11">
                          ₹{val}
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={denoms[val]}
                          onChange={(e) => {
                            const valStr = e.target.value;
                            setDenoms((prev) => ({ ...prev, [val]: valStr }));
                          }}
                          placeholder="0"
                          style={{
                            ...FIELD,
                            ...NUM,
                            width: 44,
                            height: 28,
                            textAlign: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        />
                        <span
                          style={NUM}
                          className="text-[11px] text-[var(--ink3)] ml-auto"
                        >
                          {inr(val * (parseInt(denoms[val]) || 0))}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div
                    className="pt-2.5 flex justify-between items-center text-xs"
                    style={{ borderTop: '1px solid var(--rule2)' }}
                  >
                    <span className="font-semibold text-[var(--ink2)]">Calculated sum:</span>
                    <span style={NUM} className="font-bold text-sm text-[var(--accent)]">
                      {inr(calculatedCashTotal)}
                    </span>
                  </div>
                </div>
              )}

              {/* UPI & Card Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink2)] mb-1.5">
                    Total UPI received
                  </label>
                  <input
                    type="number"
                    value={actualUpi}
                    onChange={(e) => setActualUpi(e.target.value)}
                    required
                    min="0"
                    step="any"
                    style={{
                      ...FIELD,
                      ...NUM,
                      width: '100%',
                      height: 42,
                      padding: '0 12px',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink2)] mb-1.5">
                    Total card slips
                  </label>
                  <input
                    type="number"
                    value={actualCard}
                    onChange={(e) => setActualCard(e.target.value)}
                    required
                    min="0"
                    step="any"
                    style={{
                      ...FIELD,
                      ...NUM,
                      width: '100%',
                      height: 42,
                      padding: '0 12px',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              {/* Variances List */}
              <div className="space-y-2 pt-1">
                {[
                  {
                    label: 'Cash variance',
                    val: cashDiscrepancy,
                  },
                  {
                    label: 'UPI variance',
                    val: upiDiscrepancy,
                  },
                  {
                    label: 'Card variance',
                    val: cardDiscrepancy,
                  },
                ].map((v) => {
                  const isMatch = Math.abs(v.val) < 0.01;
                  const chipStyle = isMatch ? CHIP.ok : CHIP.danger;
                  return (
                    <div
                      key={v.label}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                      style={chipStyle}
                    >
                      <span style={EYEBROW} className="text-[10px]">
                        {v.label}
                      </span>
                      <span style={NUM} className="font-bold text-sm">
                        {isMatch
                          ? 'Match'
                          : (v.val > 0 ? '+' : '') + inr(v.val)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-[var(--ink2)] mb-1.5">
                  Reconciliation notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record any cash difference or audit explanation"
                  style={{
                    ...FIELD,
                    width: '100%',
                    height: 72,
                    padding: '8px 12px',
                    fontSize: 12,
                    lineHeight: 1.5,
                    resize: 'none',
                  }}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-lg font-bold text-xs cursor-pointer transition-opacity flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 mt-3"
                style={{
                  background: 'var(--ink)',
                  color: 'var(--panel)',
                  border: 0,
                }}
              >
                {loading ? 'Reconciling drawer…' : 'Close shift & print Z-report'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}


