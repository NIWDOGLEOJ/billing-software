import { useState } from 'react';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { Store, ArrowRight, DollarSign, Wallet, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export function ShiftStartModal() {
  const { user, activeShift, startShift, logout } = useAuth();
  const { darkMode } = useTheme();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className={`w-full max-w-md rounded-2xl border ${
        darkMode ? 'bg-gray-900/90 border-gray-800 text-white' : 'bg-white/95 border-gray-200 text-gray-800'
      } shadow-2xl overflow-hidden transform scale-100 transition-all duration-300`}>
        
        {/* Banner header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center relative">
          <div className="mx-auto w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm border border-white/20">
            <Wallet size={28} className="text-emerald-100 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Open Cash Drawer</h2>
          <p className="text-emerald-100/80 text-sm mt-1">Initialize your cash till for today's shift</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-500 text-xs leading-relaxed">
            <ShieldAlert size={20} className="shrink-0 mt-0.5" />
            <p>
              <strong>Security Policy:</strong> You must record the exact floating cash amount present in your physical drawer to unlock checkout features.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium tracking-wide uppercase text-xs opacity-85">
              Initial Floating Cash (₹)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-lg">
                ₹
              </span>
              <input
                type="number"
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value)}
                placeholder="1000"
                className={`w-full pl-8 pr-4 py-3.5 text-xl font-bold rounded-xl border outline-none transition-all ${
                  darkMode
                    ? 'bg-gray-800/50 border-gray-700 focus:border-emerald-500 text-white focus:ring-2 focus:ring-emerald-500/20'
                    : 'bg-gray-50 border-gray-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20'
                }`}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all cursor-pointer"
            >
              {loading ? 'Initializing drawer...' : 'Open Till & Start Shift'}
              <ArrowRight size={20} />
            </button>

            <button
              type="button"
              onClick={() => logout()}
              className={`w-full py-3 px-6 font-semibold rounded-xl text-center border transition-all cursor-pointer ${
                darkMode
                  ? 'border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-800'
              }`}
            >
              Cancel & Exit System
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
