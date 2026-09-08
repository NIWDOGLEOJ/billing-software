import { useState, useEffect } from 'react';
import { X, Search, Eye } from 'lucide-react';
import type { SavedBill } from './cashier-billing-advanced';
import { MONO, NUM, EYEBROW, inr } from '../lib/design-system';

interface BillHistoryModalProps {
  billHistory: SavedBill[];
  onViewBill: (bill: SavedBill) => void;
  onClose: () => void;
  darkMode?: boolean;
}

export function BillHistoryModal({
  billHistory,
  onViewBill,
  onClose,
}: BillHistoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredBills = billHistory.filter((bill) =>
    bill.billNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (bill.customerPhone && bill.customerPhone.includes(searchQuery)) ||
    (bill.customerName && bill.customerName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => Math.min(prev + 1, Math.max(0, filteredBills.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        if (filteredBills[selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          onViewBill(filteredBills[selectedIndex]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, filteredBills, selectedIndex, onViewBill]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const totalRevenue = billHistory.reduce((sum, b) => sum + (Number(b.total) || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
      <div
        className="rounded-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          color: 'var(--ink)',
        }}
      >
        {/* Header */}
        <div
          className="flex justify-between items-center px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--rule2)' }}
        >
          <div>
            <div style={EYEBROW}>Sales Audit Trail</div>
            <div className="flex items-baseline gap-2.5 mt-0.5">
              <h2 className="text-base font-bold text-[var(--ink)]">Bill History</h2>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'var(--rule)',
                  color: 'var(--ink2)',
                }}
              >
                {billHistory.length} {billHistory.length === 1 ? 'bill' : 'bills'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors"
            style={{
              background: 'var(--sub)',
              border: '1px solid var(--border2)',
              color: 'var(--ink3)',
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div
          className="px-5 py-3 shrink-0"
          style={{ background: 'var(--sub)', borderBottom: '1px solid var(--rule2)' }}
        >
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2"
              size={15}
              style={{ color: 'var(--ink3)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bill number, customer name or phone..."
              className="w-full pl-9 pr-4 text-xs rounded-md focus:outline-none"
              style={{
                height: 38,
                background: 'var(--panel)',
                border: '1px solid var(--border2)',
                color: 'var(--ink)',
                fontFamily: MONO,
              }}
            />
          </div>
        </div>

        {/* Bill List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
          {filteredBills.length === 0 ? (
            <div
              className="text-center py-12 rounded-lg"
              style={{ border: '1px dashed var(--border2)', color: 'var(--ink3)' }}
            >
              <p style={{ fontFamily: MONO, fontSize: 12 }}>
                {billHistory.length === 0
                  ? 'No bills recorded in this register session yet'
                  : `No bills matching "${searchQuery}"`}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredBills.map((bill, index) => {
                const totalUnits = (bill.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
                const isSelected = selectedIndex === index;
                return (
                  <div
                    key={bill.billNumber}
                    tabIndex={0}
                    onClick={() => {
                      setSelectedIndex(index);
                      onViewBill(bill);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onViewBill(bill);
                      }
                    }}
                    className={`rounded-lg p-3.5 transition-colors flex flex-col gap-2.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                      isSelected ? 'ring-1 ring-[var(--primary)] border-[var(--primary)]' : ''
                    }`}
                    style={{
                      background: isSelected ? 'var(--surface-hover)' : 'var(--sub)',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--rule2)',
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                            {bill.billNumber}
                          </span>
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: 'var(--rule)',
                              color: 'var(--ink2)',
                            }}
                          >
                            {bill.paymentMode || 'cash'}
                          </span>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                          {formatDate(bill.date)} &middot; Cashier: {bill.cashierName || 'Cashier'}
                          {bill.customerPhone ? ` · Cust: ${bill.customerPhone}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div style={{ ...NUM, fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                          {inr(bill.total)}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                          {bill.items?.length || 0} lines &middot; {totalUnits} units
                        </div>
                      </div>
                    </div>

                    {/* Items snippet */}
                    {bill.items && bill.items.length > 0 && (
                      <div
                        className="pt-2 flex items-center justify-between gap-3 text-xs"
                        style={{ borderTop: '1px solid var(--rule)' }}
                      >
                        <div className="truncate flex-1" style={{ color: 'var(--ink3)', fontSize: 11.5 }}>
                          {bill.items.map(i => `${i.name} (${i.quantity})`).join(', ')}
                        </div>
                        <button
                          type="button"
                          onClick={() => onViewBill(bill)}
                          className="h-7 px-3 rounded text-[11px] font-semibold cursor-pointer shrink-0 flex items-center gap-1 transition-colors"
                          style={{
                            background: 'var(--panel)',
                            border: '1px solid var(--border2)',
                            color: 'var(--ink2)',
                          }}
                        >
                          <Eye size={12} />
                          <span>View Receipt</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 shrink-0 flex justify-between items-center text-xs"
          style={{
            background: 'var(--sub)',
            borderTop: '1px solid var(--rule2)',
            fontFamily: MONO,
          }}
        >
          <span style={{ color: 'var(--ink3)' }}>
            Total bills: <strong style={{ color: 'var(--ink)' }}>{billHistory.length}</strong>
          </span>
          <span style={{ color: 'var(--ink3)' }}>
            Total revenue: <strong style={{ color: 'var(--accent)' }}>{inr(totalRevenue)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
