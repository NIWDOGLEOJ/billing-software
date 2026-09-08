import { Link, useLocation, useNavigate } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import {
  LogOut,
  Coffee,
  Clock,
  Keyboard,
  AlertTriangle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ShiftClosingModal } from './shift-closing-modal';
import { ShiftStartModal } from './shift-start-modal';
import { KeyboardShortcutsModal } from './keyboard-shortcuts-modal';
import { useShopDetails } from '../lib/shop-details';

/**
 * The top nav.
 *
 * Designed using the NexusFlow instrument panel design system:
 * - Ink, paper, and one accent
 * - All numbers, timestamps, and eyebrow tags in IBM Plex Mono
 * - UI prose in Public Sans
 * - Sector identity: Unified "Retail & Wholesale" (combining retail grocery & wholesale B2B)
 * - Navigation includes GST ledger and Khata as first-class destinations
 * - Immediate cashier controls: Shortcuts, Chat, Theme, Break toggle, Drawer Shift, and Logout
 */

export type Sector = 'retail';

type SectorDef = {
  id: Sector;
  /** Shown in the identity block. Kept short — it sits above the store line. */
  short: string;
  /** Shown on the picker chip. */
  label: string;
  /** Hue only. Lightness and chroma come from the theme, so the dot reads at
   *  the same strength in both themes. */
  hue: number;
  links: { to: string; label: string }[];
};

const SECTORS: SectorDef[] = [
  {
    id: 'retail',
    short: 'Retail & Wholesale',
    label: 'Retail, Grocery & Wholesale',
    hue: 250,
    links: [
      { to: '/gst', label: 'GST ledger' },
      { to: '/khata', label: 'Khata' },
    ],
  },
];

export const CORE_LINKS = [
  { to: '/', label: 'Register' },
  { to: '/analytics', label: 'Back office' },
  { to: '/employees', label: 'Staff' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/employee-performance', label: 'Performance' },
  { to: '/config', label: 'Settings' },
];

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const EYEBROW = {
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
};

export function SectorNav({
  unreadChats = 0,
  onOpenChat,
  showSectorPicker = false,
}: {
  unreadChats?: number;
  onOpenChat?: () => void;
  showSectorPicker?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isOnBreak, startBreak, endBreak, activeShift } = useAuth();
  const { theme, setTheme } = useTheme();
  const shopDetails = useShopDetails();

  const [sectorId, setSectorId] = useState<Sector>('retail');
  const [showShiftClose, setShowShiftClose] = useState(false);
  const [showShiftStart, setShowShiftStart] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('activeSector', 'retail');
    } catch {
      // Storage blocked or unavailable
    }
  }, []);

  const sector = useMemo(
    () => SECTORS.find(s => s.id === sectorId) ?? SECTORS[0],
    [sectorId],
  );

  const isDark = theme === 'dark';
  const dot = `oklch(${isDark ? '0.74 0.13' : '0.58 0.14'} ${sector.hue})`;

  // Listen for global custom events to open modals
  useEffect(() => {
    const handleOpenShortcuts = () => setShowShortcuts(true);
    const handleOpenShiftClose = () => setShowShiftClose(true);
    const handleOpenShiftStart = () => setShowShiftStart(true);

    window.addEventListener('open-shortcuts', handleOpenShortcuts);
    window.addEventListener('open-shift-close', handleOpenShiftClose);
    window.addEventListener('open-shift-start', handleOpenShiftStart);

    const handleGlobalKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isInput) return;

      if (e.key === '?' && (e.shiftKey || (!e.ctrlKey && !e.metaKey))) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);

    return () => {
      window.removeEventListener('open-shortcuts', handleOpenShortcuts);
      window.removeEventListener('open-shift-close', handleOpenShiftClose);
      window.removeEventListener('open-shift-start', handleOpenShiftStart);
      window.removeEventListener('keydown', handleGlobalKey);
    };
  }, []);

  const handleStartBreak = async () => {
    try {
      await startBreak();
      toast.info('Break started · Billing protection active');
    } catch (err: any) {
      toast.error(err.message || 'Failed to start break');
    }
  };

  const handleEndBreak = async () => {
    try {
      await endBreak();
      toast.success('Break ended · Shift resumed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to end break');
    }
  };

  const executeLogout = () => {
    logout();
    toast.success('Signed out successfully');
    navigate('/login');
  };

  const handleLogoutClick = () => {
    if (user?.role === 'employee' && activeShift) {
      setShowLogoutConfirm(true);
    } else {
      executeLogout();
    }
  };

  return (
    <header className="flex-shrink-0">
      <div className="flex items-stretch h-[58px] bg-[var(--surface)] border-b border-[var(--border)]">
        {/* Identity block. Unified Retail & Wholesale */}
        <button
          type="button"
          onClick={() => {
            if (location.pathname !== '/') navigate('/');
          }}
          title="Retail & Wholesale unified terminal"
          className="flex items-center gap-2.5 px-4 flex-shrink-0 text-left bg-[var(--sub)] border-r border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: dot }}
          />
          <span>
            <span className="block text-sm font-bold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">
              {shopDetails.name}
            </span>
            <span
              className="block text-[10px] font-semibold mt-px text-[var(--text-muted)]"
              style={{ fontFamily: MONO, letterSpacing: '0.08em' }}
            >
              {sector.short}
            </span>
          </span>
        </button>

        {/* Core links, then a rule, then sector links. */}
        <nav className="flex items-center gap-0.5 px-3 min-w-0 overflow-x-auto">
          {CORE_LINKS.map(link => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`h-9 px-3 inline-flex items-center rounded-md text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          {sector.links.length > 0 && (
            <span className="w-px h-5 mx-2 bg-[var(--border)] flex-shrink-0" />
          )}

          {sector.links.map(link => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`h-9 px-3 inline-flex items-center gap-2 rounded-md border text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--primary)]'
                    : 'bg-transparent border-[var(--border2)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 min-w-[8px]" />

        {/* Right Action Bar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 flex-shrink-0">
          {/* Keyboard Shortcuts button */}
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts (Shift + ?)"
            className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--border2)] bg-[var(--sub)] text-[12.5px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <Keyboard size={14} className="text-[var(--text-muted)]" />
            <span className="hidden sm:inline">Keys</span>
          </button>

          {/* Chat drawer trigger */}
          <button
            type="button"
            onClick={onOpenChat}
            className="h-9 px-2.5 sm:px-3 inline-flex items-center gap-2 rounded-md border border-[var(--border2)] bg-[var(--sub)] text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <span>Chat</span>
            {unreadChats > 0 && (
              <span
                className="min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-bold"
                style={{ fontFamily: MONO }}
              >
                {unreadChats}
              </span>
            )}
          </button>

          {/* Theme switcher */}
          <div className="flex items-center gap-0.5 p-[3px] rounded-full border border-[var(--border)] bg-[var(--sub)]">
            {(['light', 'dark'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setTheme(mode)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                  theme === mode
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                style={{ fontFamily: MONO, letterSpacing: '0.08em' }}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>

          <span className="w-px h-6 bg-[var(--border)]" />

          {/* Cashier shift and break controls */}
          {user?.role === 'employee' && (
            <>
              {isOnBreak ? (
                <button
                  type="button"
                  onClick={handleEndBreak}
                  title="Currently on break · Click to resume shift"
                  className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--warn-line)] bg-[var(--warn-soft)] text-[12px] font-bold text-[var(--warn-hi)] hover:bg-[var(--warn-soft2)] transition-colors cursor-pointer animate-pulse"
                >
                  <Coffee size={14} />
                  <span>End Break</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartBreak}
                  title="Pause shift and start break"
                  className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--border2)] bg-[var(--sub)] text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                >
                  <Coffee size={14} className="text-[var(--text-muted)]" />
                  <span className="hidden md:inline">Break</span>
                </button>
              )}

              {activeShift ? (
                <button
                  type="button"
                  onClick={() => setShowShiftClose(true)}
                  title="End shift & reconcile drawer float"
                  className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--border2)] bg-[var(--sub)] text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-hi)] hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] transition-colors cursor-pointer"
                >
                  <Clock size={14} className="text-[var(--text-muted)]" />
                  <span>End Shift</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowShiftStart(true)}
                  title="Open cash drawer float"
                  className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--border2)] bg-[var(--sub)] text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-hi)] hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] transition-colors cursor-pointer"
                >
                  <Clock size={14} className="text-[var(--text-muted)]" />
                  <span className="hidden md:inline">Open Drawer</span>
                </button>
              )}

              <span className="w-px h-6 bg-[var(--border)]" />
            </>
          )}

          {/* User ID & Role */}
          <div className="text-right hidden sm:block">
            <div className="text-[12.5px] font-semibold leading-tight text-[var(--text-primary)] max-w-[120px] truncate">
              {user?.name ?? 'Signed out'}
            </div>
            <div
              className="text-[10px] text-[var(--text-muted)]"
              style={{ fontFamily: MONO }}
            >
              {(user?.role ?? '').toUpperCase()}
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={handleLogoutClick}
            title={user?.role === 'employee' && activeShift ? "End shift or sign out" : "Sign out of terminal"}
            className="h-9 px-2.5 sm:px-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--border2)] bg-[var(--sub)] text-[12.5px] font-semibold text-[var(--text-secondary)] hover:text-[var(--danger)] hover:border-[var(--danger-line)] hover:bg-[var(--danger-soft)] transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Sector picker strip: only rendered if multiple sectors exist */}
      {showSectorPicker && SECTORS.length > 1 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--sub)] border-b border-[var(--rule2)]">
          <span
            className="text-[10px] font-bold uppercase text-[var(--text-muted)] flex-shrink-0"
            style={{ fontFamily: MONO, letterSpacing: '0.14em' }}
          >
            Try a sector
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SECTORS.map(s => {
              const active = s.id === sectorId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSectorId(s.id)}
                  className={`h-[30px] px-3 rounded-full border text-xs font-semibold cursor-pointer transition-colors ${
                    active
                      ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--primary)]'
                      : 'bg-transparent border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Shift Closing Modal */}
      {showShiftClose && (
        <ShiftClosingModal onClose={() => setShowShiftClose(false)} />
      )}

      {/* Shift Start Modal */}
      {showShiftStart && (
        <ShiftStartModal onClose={() => setShowShiftStart(false)} forceOpen={true} />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}

      {/* Logout Active Shift Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
          <div
            className="w-full max-w-md rounded-xl overflow-hidden flex flex-col shadow-2xl"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--rule2)' }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: 'var(--warn-soft)',
                    border: '1px solid var(--warn-line)',
                    color: 'var(--warn)',
                  }}
                >
                  <AlertTriangle size={15} />
                </div>
                <div>
                  <div style={{ ...EYEBROW, color: 'var(--warn)' }}>Shift in Progress</div>
                  <h3 className="text-base font-bold text-[var(--ink)]">Active Drawer Shift</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--ink3)] hover:text-[var(--ink)] hover:bg-[var(--surface-hover)] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-[13px] leading-relaxed text-[var(--ink2)]">
              <p>
                You have an active cashier shift running on this terminal with drawer cash float.
              </p>
              <div
                className="p-3 rounded-lg border text-xs"
                style={{ background: 'var(--sub)', borderColor: 'var(--border)' }}
              >
                <div className="flex justify-between font-semibold text-[var(--ink)]">
                  <span>Active Cashier</span>
                  <span style={{ fontFamily: MONO }}>{user?.name}</span>
                </div>
                <div className="flex justify-between text-[var(--ink3)] mt-1">
                  <span>Recommendation</span>
                  <span>End shift & reconcile cash</span>
                </div>
              </div>
              <p className="text-xs text-[var(--ink3)]">
                Closing your shift compiles the Z-Report and records cash discrepancies. Signing out directly leaves the drawer shift open on this till.
              </p>
            </div>

            <div
              className="px-5 py-4 flex flex-col sm:flex-row gap-2.5 justify-end"
              style={{ borderTop: '1px solid var(--rule2)', background: 'var(--sub)' }}
            >
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[var(--border2)] text-[var(--ink2)] hover:text-[var(--ink)] hover:bg-[var(--surface-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  executeLogout();
                }}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[var(--danger-line)] text-[var(--danger)] bg-[var(--danger-soft)] hover:bg-[var(--danger-soft2)] cursor-pointer"
              >
                Sign Out Anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  setShowShiftClose(true);
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--ink)] text-[var(--panel)] hover:opacity-90 cursor-pointer"
              >
                End Shift & Count
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export { SECTORS };
