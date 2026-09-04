import { useState } from 'react';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { Store, ArrowRight, DollarSign, Wallet, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { updatePointerGlare, SpecularGlareOverlay } from '../utils/glare';

export function ShiftStartModal() {
  const { user, activeShift, startShift, logout } = useAuth();
  const { darkMode, accentColor } = useTheme();
  const [initialCash, setInitialCash] = useState('1000');
  const [loading, setLoading] = useState(false);

  // Owners and co-owners do not need to open shifts to view dashboards
  // Only enforce shift starting on checkout cashiers
  const isCashier = user?.role === 'employee';

  if (!user || activeShift || !isCashier) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const float = parseFloat(initialCash);

    if (isNaN(float) || float < 0) {
      toast.error('❌ Please enter a valid positive cash float');
      return;
    }

    setLoading(true);
    try {
      await startShift(float);
      toast.success(`💼 Drawer opened with ₹${float.toFixed(2)} float cash`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to start drawer shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl backdrop-saturate-200 p-4">
      <div 
        onPointerMove={updatePointerGlare}
        className="group relative w-full max-w-md rounded-2xl border liquid-glass border-[var(--border-glass)] text-[var(--text-primary)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] overflow-hidden transform scale-100 transition-all duration-300"
      >
        <SpecularGlareOverlay />

        {/* Banner header */}
        <div className="liquid-glass-button p-6 text-white text-center relative shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6)]">
          <div className="mx-auto w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mb-3 backdrop-blur-xl backdrop-saturate-200 border border-white/20">
            <Wallet size={28} className="text-white animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Open Cash Drawer</h2>
          <p className="text-white/80 text-sm mt-1">Initialize your cash till for today's shift</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 relative z-10">
          <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-500 text-xs leading-relaxed">
            <ShieldAlert size={20} className="shrink-0 mt-0.5" />
            <p>
              <strong>Security Policy:</strong> You must record the exact floating cash amount present in your physical drawer to unlock checkout features.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium tracking-wide uppercase opacity-85 text-[var(--text-primary)]">
              Initial Floating Cash (₹)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-lg">
                ₹
              </span>
              <input
                type="number"
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value)}
                placeholder="1000"
                className="w-full pl-8 pr-4 py-3.5 text-xl font-bold rounded-xl border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] outline-none focus:border-[var(--primary-accent)] focus:ring-2 focus:ring-[var(--primary-accent)]/20 transition-all"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={loading}
              className="liquid-glass-button w-full disabled:opacity-50 text-white font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer active:scale-[0.97]"
            >
              {loading ? 'Initializing drawer...' : 'Open Till & Start Shift'}
              <ArrowRight size={20} />
            </button>

            <button
              type="button"
              onClick={() => logout()}
              className="w-full py-3 px-6 font-semibold rounded-xl text-center border border-[var(--border-glass)] bg-[var(--bg-glass)] text-muted-foreground hover:text-[var(--text-primary)] transition-all cursor-pointer active:scale-[0.97]"
            >
              Cancel & Exit System
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


