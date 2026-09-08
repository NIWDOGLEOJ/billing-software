import { useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Check } from 'lucide-react';
import { MONO, NUM, EYEBROW, inr } from '../lib/design-system';

interface CompletionModalProps {
  billNumber: string;
  itemCount: number;
  total: number;
  paymentMode: string;
  changeAmount: number;
  onClose: () => void;
  onNewBill: () => void;
}

export function CompletionModal({
  billNumber,
  itemCount,
  total,
  paymentMode,
  changeAmount,
  onClose,
  onNewBill,
}: CompletionModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'F5' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onNewBill();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNewBill]);
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 font-sans">
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
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--rule2)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--ok-soft)', border: '1px solid var(--ok-line)', color: 'var(--ok)' }}
            >
              <Check size={16} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ ...EYEBROW, color: 'var(--ok)' }}>Settled &middot; Sale Recorded</div>
              <h2 className="text-lg font-bold tracking-tight text-[var(--ink)]">
                Bill {billNumber}
              </h2>
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

        {/* Body */}
        <div className="p-5 space-y-4">
          <div
            className="rounded-lg p-4 space-y-2.5"
            style={{
              background: 'var(--sub)',
              border: '1px solid var(--rule2)',
            }}
          >
            <div className="flex justify-between items-center text-xs">
              <span style={{ color: 'var(--ink2)' }}>Items Count</span>
              <span style={{ ...NUM, fontWeight: 600 }}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span style={{ color: 'var(--ink2)' }}>Payment Mode</span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'var(--rule)',
                  color: 'var(--ink)',
                }}
              >
                {paymentMode}
              </span>
            </div>

            <div
              className="flex justify-between items-baseline pt-2"
              style={{ borderTop: '1px solid var(--rule)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Amount Paid</span>
              <span style={{ ...NUM, fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
                {inr(total)}
              </span>
            </div>

            {changeAmount > 0 && (
              <div
                className="flex justify-between items-center p-3 rounded-md mt-2"
                style={{
                  background: 'var(--ok-soft)',
                  border: '1px solid var(--ok-line)',
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--ok)',
                  }}
                >
                  Change returned
                </span>
                <span style={{ ...NUM, fontSize: 18, fontWeight: 700, color: 'var(--ok)' }}>
                  {inr(changeAmount)}
                </span>
              </div>
            )}
          </div>

          <div
            className="rounded-lg p-3 text-center text-xs leading-relaxed"
            style={{
              background: 'var(--panel)',
              border: '1px dashed var(--border2)',
              color: 'var(--ink3)',
              fontFamily: MONO,
            }}
          >
            Bill print output armed &middot; Press <strong className="text-[var(--ink)]">ESC</strong> or <strong className="text-[var(--ink)]">F5</strong> for next customer
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className="px-5 py-3.5 flex items-center justify-end gap-2.5"
          style={{
            background: 'var(--sub)',
            borderTop: '1px solid var(--rule2)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-md text-xs font-semibold cursor-pointer transition-colors"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border2)',
              color: 'var(--ink2)',
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={onNewBill}
            className="h-10 px-5 rounded-md text-xs font-bold cursor-pointer transition-opacity flex items-center gap-2 hover:opacity-90"
            style={{
              background: 'var(--ink)',
              color: 'var(--panel)',
              border: 0,
            }}
          >
            <span>New Bill</span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 5px',
                borderRadius: 4,
                background: 'var(--panel)',
                color: 'var(--ink)',
              }}
            >
              F5
            </span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
