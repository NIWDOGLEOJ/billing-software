import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/auth-context';
import { useNavigate } from 'react-router';
import { useTheme } from '../contexts/theme-context';
import { useShopDetails } from '../lib/shop-details';
import { isMobileDevice } from '../lib/device';
import {
  MONO,
  NUM,
  EYEBROW,
  PANEL,
  PANEL_HEAD,
  FIELD,
  KBD,
  KBD_ON_FILL,
} from '../lib/design-system';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const shopDetails = useShopDetails();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Enter a username to continue.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      passwordRef.current?.focus();
      return;
    }

    setIsLoading(true);
    const result = await login(username, password, true);

    if (result.success) {
      // Fullscreen kiosk request strictly for desktop cashier terminals (never on mobile devices)
      if (!isMobileDevice() && username !== 'developer') {
        try {
          const el = document.documentElement;
          const req =
            el.requestFullscreen ||
            (el as any).webkitRequestFullscreen ||
            (el as any).mozRequestFullScreen ||
            (el as any).msRequestFullscreen;
          if (typeof req === 'function') {
            const p = req.call(el);
            if (p && typeof p.catch === 'function') {
              p.catch((fsErr: any) => {
                console.warn('[Kiosk Immersive Fullscreen Request Failed]', fsErr);
              });
            }
          }
        } catch (fsErr) {
          console.warn('[Kiosk Immersive Fullscreen Request Failed]', fsErr);
        }
      }
      navigate('/');
    } else {
      setError(result.error ?? 'Invalid username or password');
      setPassword('');
      passwordRef.current?.focus();
      setIsLoading(false);
    }
  };

  const fieldClasses = (invalid: boolean) =>
    [
      'w-full pl-10 py-3 rounded-lg border transition-all duration-300',
      'bg-[var(--input-bg)] text-[var(--text-primary)]',
      'placeholder:text-[var(--text-muted)]',
      'focus:outline-none focus:ring-2',
      invalid
        ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]/20'
        : 'border-[var(--input-border)] focus:border-[var(--primary-accent)] focus:ring-[var(--primary-accent)]/20',
    ].join(' ');

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)] flex flex-col justify-between font-sans">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-6 h-[58px] border-b border-[var(--border)] bg-[var(--panel)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[16px] font-extrabold tracking-[-0.02em] text-[var(--ink)]">
            {shopDetails.name}
          </span>
          <span style={EYEBROW}>Terminal sign-in</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[var(--ok)]" />
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)' }}>Online</span>
          </div>

          <button
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="h-[30px] px-2.5 rounded-[7px] font-mono text-[11px] font-bold tracking-[0.06em] uppercase cursor-pointer transition-colors"
            style={{ ...FIELD, color: 'var(--ink2)' }}
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
        </div>
      </header>

      {/* Centered Single Login Box */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div
          className="w-full max-w-[420px]"
          style={{
            ...PANEL,
            borderRadius: 12,
            padding: '32px 28px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div className="mb-6">
            <div style={EYEBROW}>Counter Terminal</div>
            <h1 className="text-[24px] font-extrabold tracking-[-0.03em] mt-1.5 mb-1 text-[var(--ink)]">
              Sign in to register
            </h1>
            <p className="text-[13px] leading-relaxed text-[var(--ink2)]">
              Enter your cashier credentials to open your shift.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Username Input */}
            <div>
              <label
                htmlFor="username"
                className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                placeholder="Cashier username"
                autoFocus
                className="w-full text-[15px] px-3.5"
                style={{ ...FIELD, height: 46 }}
              />
            </div>

            {/* Password Input */}
            <div>
              <label
                htmlFor="password"
                className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="••••••••"
                  className="w-full text-[15px] pl-3.5 pr-16"
                  style={{ ...FIELD, ...NUM, height: 46 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1.5 top-1.5 h-[34px] px-2.5 rounded-[5px] text-[11px] font-semibold cursor-pointer transition-colors"
                  style={{ ...FIELD, color: 'var(--ink2)' }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div
                className="p-3 rounded-[8px] text-[12px] font-semibold animate-fadeIn"
                style={{
                  background: 'var(--danger-soft)',
                  border: '1px solid var(--danger-line)',
                  color: 'var(--danger)',
                }}
              >
                {error}
              </div>
            )}

            {/* Primary Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 h-[48px] rounded-[8px] text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50 border-0"
              style={{
                background: 'var(--ink)',
                color: 'var(--panel)',
              }}
            >
              <span>{isLoading ? 'Opening shift…' : 'Start shift'}</span>
              <span style={KBD_ON_FILL}>Enter</span>
            </button>
          </form>

          {/* Footer inside card */}
          <div
            className="flex items-center justify-between text-[11px] mt-6 pt-4 border-t"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink3)' }}
          >
            <span>Need password help? Contact store owner.</span>
            <span style={{ fontFamily: MONO }}>Till 01</span>
          </div>
        </div>
      </main>

      {/* Tiny subtle nexusflow label at the bottom of the screen */}
      <footer className="py-2.5 text-center shrink-0">
        <span
          className="font-mono text-[10px] tracking-wider select-none pointer-events-none"
          style={{ color: 'var(--ink4)', opacity: 0.35 }}
        >
          nexusflow
        </span>
      </footer>
    </div>
  );
}
