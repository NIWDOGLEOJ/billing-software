import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/auth-context';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { MONO, NUM, EYEBROW, FIELD, inr } from '../lib/design-system';

interface ShiftStartModalProps {
  onClose?: () => void;
  forceOpen?: boolean;
}

export function ShiftStartModal({ onClose, forceOpen = false }: ShiftStartModalProps = {}) {
  const { user, activeShift, startShift, logout } = useAuth();
  const [initialCash, setInitialCash] = useState('1000');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Owners and co-owners do not need to open shifts to view dashboards
  // Only enforce shift starting on checkout cashiers
  const isCashier = user?.role === 'employee';

  if (!forceOpen && (!user || activeShift || !isCashier)) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const float = parseFloat(initialCash);

    if (isNaN(float) || float < 0) {
      toast.error('Please enter a valid positive cash float');
      return;
    }

    setLoading(true);
    try {
      await startShift(float);
      toast.success(`Drawer opened with ${inr(float)} float cash`);
      onClose?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to start drawer shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans">
      <div
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
          <div>
            <div style={EYEBROW}>Shift Start &middot; Till 2</div>
            <h2 className="text-base font-bold text-[var(--ink)] mt-0.5">Open Cash Drawer</h2>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--ink3)] hover:text-[var(--ink)] hover:bg-[var(--surface-hover)] cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div
            className="p-3.5 rounded-lg text-xs leading-relaxed"
            style={{
              background: 'var(--sub)',
              border: '1px solid var(--rule2)',
              color: 'var(--ink2)',
            }}
          >
            Count and verify the physical floating currency present in your cash drawer before starting customer transactions.
          </div>

          <div>
            <label style={EYEBROW} className="block mb-1.5">
              Initial Floating Cash (₹)
            </label>
            <input
              type="number"
              value={initialCash}
              onChange={(e) => setInitialCash(e.target.value)}
              placeholder="1000"
              disabled={loading}
              required
              min="0"
              step="1"
              style={{
                ...FIELD,
                ...NUM,
                height: 48,
                padding: '0 14px',
                fontSize: 18,
                fontWeight: 600,
              }}
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="h-11 rounded-md font-bold text-xs cursor-pointer transition-opacity flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
              style={{
                background: 'var(--ink)',
                color: 'var(--panel)',
                border: 0,
              }}
            >
              {loading ? 'Initializing drawer…' : 'Open Till & Start Shift'}
            </button>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-md font-semibold text-xs cursor-pointer transition-colors"
                style={{
                  background: 'var(--sub)',
                  border: '1px solid var(--border2)',
                  color: 'var(--ink3)',
                }}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => logout()}
                className="h-10 rounded-md font-semibold text-xs cursor-pointer transition-colors"
                style={{
                  background: 'var(--sub)',
                  border: '1px solid var(--border2)',
                  color: 'var(--ink3)',
                }}
              >
                Sign out &amp; Exit
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
