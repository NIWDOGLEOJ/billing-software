import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/auth-context';
import { useNavigate } from 'react-router';
import { Store, Lock, User, AlertCircle, Eye, EyeOff, Coffee } from 'lucide-react';
import { InteractiveMeshBackground } from './ui/interactive-mesh-background';

/**
 * Styling note: this screen is written entirely against the CSS design tokens
 * in globals.css, with no `darkMode ? … : …` ternaries. It previously hardcoded
 * blue/indigo and Tailwind greys, which meant the owner's chosen accent colour
 * recoloured every page in the app except the first one anybody sees.
 */
export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasActiveBreak, setHasActiveBreak] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Track mouse coordinates for interactive parallax animations
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) - 0.5;
      const y = (e.clientY / window.innerHeight) - 0.5;
      setMousePosition({ x, y });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Check for active breaks on mount
  useEffect(() => {
    let activeBreak: unknown;
    try {
      const breaks = JSON.parse(localStorage.getItem('breakRecords') || '[]');
      activeBreak = Array.isArray(breaks) ? breaks.find((b: any) => !b.endTime) : undefined;
    } catch {
      // Unreadable break history just means we don't show the banner.
    }
    setHasActiveBreak(!!activeBreak);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Per-field messages, so the cashier is told which box to fix rather than
    // getting one combined banner above both of them.
    const nextFieldErrors: { username?: string; password?: string } = {};
    if (!username.trim()) nextFieldErrors.username = 'Enter your username';
    if (!password) nextFieldErrors.password = 'Enter your password';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      document.getElementById(nextFieldErrors.username ? 'username' : 'password')?.focus();
      return;
    }

    setIsLoading(true);
    const result = await login(username, password, rememberDevice);

    if (result.success) {
      // Synchronously request fullscreen mode for all cashiers (except developer)
      if (username !== 'developer') {
        try {
          const el = document.documentElement;
          if (el.requestFullscreen) {
            await el.requestFullscreen();
          } else if ((el as any).webkitRequestFullscreen) {
            await (el as any).webkitRequestFullscreen();
          } else if ((el as any).msRequestFullscreen) {
            await (el as any).msRequestFullscreen();
          }
        } catch (fsErr) {
          console.warn('[Kiosk Immersive Fullscreen Request Failed]', fsErr);
        }
      }
      navigate('/');
    } else {
      setError(result.error ?? 'Invalid username or password');
      setPassword('');
      // Put the cursor where the correction has to happen.
      document.getElementById('password')?.focus();
    }

    setIsLoading(false);
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
    <div className="relative min-h-screen flex items-center justify-center px-4 py-8 overflow-hidden bg-[var(--background)] text-[var(--text-primary)]">
      {/* 🔮 Interactive High-Performance Mesh Background Constellation & Parallax Blobs */}
      <InteractiveMeshBackground />

      {/* 💳 Floating glassmorphic card container */}
      <div
        className={`relative w-full max-w-md z-10 rounded-2xl border p-6 sm:p-8 shadow-2xl backdrop-blur-xl
          bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)]
          transition-all duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
          mounted ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-12'
        }`}
        style={{
          // Parallax tilt is a pointer affordance; skip it on touch/small screens.
          transform: `perspective(1000px) rotateY(${mousePosition.x * 6}deg) rotateX(${mousePosition.y * -6}deg)`
        }}
      >
        {/* Logo/Header */}
        <div className={`text-center mb-8 transition-all duration-700 delay-100 transform ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
        }`}>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-[var(--primary-accent)]/15 hover:rotate-12 transition-transform duration-300">
            <Store size={32} className="text-[var(--primary-accent)]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-2">
            NexusFlow
          </h1>
          <p className="text-[var(--text-muted)]">
            Sign in to your account
          </p>
        </div>

        {/* Break Info Message */}
        {hasActiveBreak && (
          <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 bg-[var(--warning)]/10 border-[var(--warning)]/30 transition-all duration-500 transform ${
            mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}>
            <Coffee className="text-[var(--warning)] flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                Returning from Break
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Log in to resume work and end your break.
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div
            role="alert"
            className={`mb-6 p-4 rounded-lg border flex items-center gap-3 bg-[var(--danger)]/10 border-[var(--danger)]/30 transition-all duration-500 transform ${
              mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
          >
            <AlertCircle className="text-[var(--danger)] flex-shrink-0" size={20} />
            <p className="text-sm text-[var(--text-primary)]">{error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Username Field */}
          <div className={`transition-all duration-700 delay-200 transform ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <label htmlFor="username" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Username or Email
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={20} className="text-[var(--text-muted)] group-focus-within:text-[var(--primary-accent)] transition-colors" />
              </div>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (fieldErrors.username) setFieldErrors(p => ({ ...p, username: undefined }));
                }}
                className={`${fieldClasses(!!fieldErrors.username)} pr-4`}
                placeholder="Enter your username"
                autoComplete="username"
                // The till is a single-purpose machine: the cursor should already
                // be here when the screen appears.
                autoFocus
                aria-invalid={!!fieldErrors.username}
                aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                disabled={isLoading}
              />
            </div>
            {fieldErrors.username && (
              <p id="username-error" className="mt-1.5 text-xs text-[var(--danger)]">
                {fieldErrors.username}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div className={`transition-all duration-700 delay-300 transform ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Password
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={20} className="text-[var(--text-muted)] group-focus-within:text-[var(--primary-accent)] transition-colors" />
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors(p => ({ ...p, password: undefined }));
                }}
                className={`${fieldClasses(!!fieldErrors.password)} pr-12`}
                placeholder="Enter your password"
                autoComplete="current-password"
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-transform"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={isLoading}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {fieldErrors.password && (
              <p id="password-error" className="mt-1.5 text-xs text-[var(--danger)]">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {/* Remember Device */}
          <div className={`flex items-center transition-all duration-700 delay-[350ms] transform ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <input
              type="checkbox"
              id="remember"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--primary-accent)] border-[var(--input-border)] focus:ring-2 focus:ring-[var(--primary-accent)]/30 transition-shadow"
              disabled={isLoading}
            />
            <label htmlFor="remember" className="ml-2 text-sm text-[var(--text-secondary)] hover:cursor-pointer select-none">
              Remember this device
            </label>
          </div>

          {/* Login Button */}
          <div className={`transition-all duration-700 delay-[400ms] transform ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <button
              type="submit"
              disabled={isLoading}
              className="glass-btn glass-btn-accent w-full py-3 px-4 rounded-lg font-semibold
                disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className={`mt-8 text-center transition-all duration-700 delay-500 transform ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}>
          <p className="text-xs text-[var(--text-muted)]">
            © 2026 NexusFlow System. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
