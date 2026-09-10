import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { api } from '../utils/api';
import jmartLogo from '../../assets/logos/jmart_logo_transparent.png';
import {
  MONO,
  NUM,
  EYEBROW,
  PANEL,
  FIELD,
  KBD_ON_FILL,
} from '../lib/design-system';

interface InviteValidation {
  valid: boolean;
  shopName?: string;
  invite?: {
    id: string;
    token: string;
    role: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    expires_at: string;
  };
  error?: string;
}

export function InvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken, isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();

  const [tokenInput, setTokenInput] = useState(searchParams.get('token') || '');
  const [hasSearchedToken, setHasSearchedToken] = useState(Boolean(searchParams.get('token')));
  
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<InviteValidation | null>(null);
  const [validationError, setValidationError] = useState('');

  // Form fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // If already authenticated, allow them to view or navigate home
  useEffect(() => {
    if (isAuthenticated && !isSuccess) {
      // User is logged in; we don't force redirect immediately in case they want to accept an invite under another account,
      // but if needed they can proceed
    }
  }, [isAuthenticated, isSuccess]);

  const validateToken = async (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setValidationError('Please enter an invite code');
      setValidationResult(null);
      return;
    }

    setIsValidating(true);
    setValidationError('');
    setFormError('');

    try {
      const res = await api.get<InviteValidation>(`/invites/validate?token=${encodeURIComponent(clean)}`);
      setValidationResult(res);
      if (res.valid && res.invite) {
        if (res.invite.name) setFullName(res.invite.name);
        if (res.invite.email) setEmail(res.invite.email);
        if (res.invite.phone) setPhone(res.invite.phone);
      }
    } catch (err: any) {
      setValidationError(err.message || 'Invalid or expired invite token');
      setValidationResult({ valid: false, error: err.message });
    } finally {
      setIsValidating(false);
      setHasSearchedToken(true);
    }
  };

  // Auto-validate if token exists in URL param on mount
  useEffect(() => {
    const paramToken = searchParams.get('token');
    if (paramToken) {
      setTokenInput(paramToken);
      validateToken(paramToken);
    }
  }, [searchParams]);

  const handleManualValidate = (e: React.FormEvent) => {
    e.preventDefault();
    validateToken(tokenInput);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!validationResult?.valid || !validationResult.invite) {
      setFormError('No valid invitation loaded');
      return;
    }

    if (!fullName.trim()) {
      setFormError('Please enter your full name');
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      setFormError('Username must be at least 3 characters long');
      return;
    }

    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      setFormError('Username can only contain lowercase letters, numbers, dots, and hyphens');
      return;
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.post<{
        success: boolean;
        message: string;
        token: string;
        user: any;
      }>('/invites/accept', {
        token: validationResult.invite.token,
        username: cleanUsername,
        name: fullName.trim(),
        password,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });

      if (res.success && res.token && res.user) {
        setIsSuccess(true);
        loginWithToken(res.token, res.user);
        setTimeout(() => {
          navigate('/');
        }, 1200);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to accept invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)] flex flex-col justify-between font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 h-[58px] border-b border-[var(--border)] bg-[var(--panel)] shrink-0">
        <div className="flex items-center gap-3">
          <img src={jmartLogo} alt="J MART" className="w-8 h-8 object-contain" />
          <span className="text-[16px] font-black tracking-[-0.02em] text-[var(--ink)]">
            {validationResult?.shopName || 'J MART'}
          </span>
          <span style={EYEBROW}>Co-Owner Onboarding</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="h-[30px] px-2.5 rounded-[7px] font-mono text-[11px] font-bold tracking-[0.06em] uppercase cursor-pointer transition-colors"
            style={{ ...FIELD, color: 'var(--ink2)' }}
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          <Link
            to="/login"
            className="h-[30px] px-3 rounded-[7px] text-[12px] font-semibold flex items-center justify-center border hover:opacity-80 transition-colors"
            style={{ ...FIELD, color: 'var(--ink2)' }}
          >
            Back to Sign In
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div
          className="w-full max-w-[480px]"
          style={{
            ...PANEL,
            borderRadius: 12,
            padding: '32px 28px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* Header Title */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold text-lg">
                👑
              </div>
              <div>
                <div style={EYEBROW}>Store Partnership</div>
                <div className="text-[18px] font-black tracking-tight text-[var(--ink)]">
                  Co-Owner Invitation
                </div>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--ink2)]">
              You have been invited to join as a co-owner with full administrative and management access.
            </p>
          </div>

          {/* Success State */}
          {isSuccess && (
            <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center animate-fadeIn">
              <div className="text-3xl mb-2">🎉</div>
              <h2 className="text-[17px] font-black text-emerald-700 dark:text-emerald-400 mb-1">
                Account Created Successfully!
              </h2>
              <p className="text-[13px] text-[var(--ink2)] mb-3">
                Logging you into {validationResult?.shopName || 'your store'}…
              </p>
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {/* Code input form if no token or token is invalid */}
          {(!validationResult?.valid || !hasSearchedToken) && !isSuccess && (
            <div>
              <form onSubmit={handleManualValidate} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="tokenCode" className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">
                    Invitation Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="tokenCode"
                      type="text"
                      value={tokenInput}
                      onChange={(e) => {
                        setTokenInput(e.target.value.toUpperCase());
                        setValidationError('');
                      }}
                      placeholder="e.g. 8A3F9C4B2E1D05A7"
                      maxLength={32}
                      className="flex-1 text-[15px] px-3.5 tracking-wider uppercase"
                      style={{ ...FIELD, fontFamily: MONO, height: 46 }}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={isValidating || !tokenInput.trim()}
                      className="px-4 h-[46px] rounded-[8px] text-[13px] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ background: 'var(--ink)', color: 'var(--panel)' }}
                    >
                      {isValidating ? 'Checking…' : 'Verify'}
                    </button>
                  </div>
                </div>

                {validationError && (
                  <div
                    className="p-3 rounded-[8px] text-[12px] font-semibold animate-fadeIn"
                    style={{
                      background: 'var(--danger-soft)',
                      border: '1px solid var(--danger-line)',
                      color: 'var(--danger)',
                    }}
                  >
                    {validationError}
                  </div>
                )}
              </form>

              <div className="mt-6 pt-4 border-t border-[var(--rule)] text-center">
                <p className="text-[12px] text-[var(--ink3)]">
                  Already have an active login?{' '}
                  <Link to="/login" className="font-semibold text-[var(--ink)] hover:underline">
                    Sign in to register
                  </Link>
                </p>
              </div>
            </div>
          )}

          {/* Registration Form when token is valid */}
          {validationResult?.valid && validationResult.invite && !isSuccess && (
            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              {/* Badge showing store verified */}
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Store Partner Invite
                  </div>
                  <div className="text-[14px] font-extrabold text-[var(--ink)]">
                    {validationResult.shopName}
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-700 dark:text-blue-300 font-mono text-[11px] font-bold">
                  CO-OWNER
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label htmlFor="fullName" className="block text-[12px] font-semibold text-[var(--ink2)] mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full text-[14px] px-3.5"
                  style={{ ...FIELD, height: 42 }}
                />
              </div>

              {/* Username */}
              <div>
                <label htmlFor="regUsername" className="block text-[12px] font-semibold text-[var(--ink2)] mb-1">
                  Desired Username <span className="text-red-500">*</span>
                </label>
                <input
                  id="regUsername"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                  placeholder="e.g. john.coowner"
                  className="w-full text-[14px] px-3.5"
                  style={{ ...FIELD, fontFamily: MONO, height: 42 }}
                />
                <span className="text-[11px] text-[var(--ink3)] mt-0.5 block">
                  Used to sign into terminals and manage the store.
                </span>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="regPassword" className="block text-[12px] font-semibold text-[var(--ink2)] mb-1">
                  Password <span className="text-red-500">*</span> (min. 8 characters)
                </label>
                <div className="relative">
                  <input
                    id="regPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full text-[14px] pl-3.5 pr-16"
                    style={{ ...FIELD, ...NUM, height: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1.5 top-1 h-[30px] px-2 rounded text-[11px] font-semibold cursor-pointer"
                    style={{ ...FIELD, color: 'var(--ink2)' }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-[12px] font-semibold text-[var(--ink2)] mb-1">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full text-[14px] px-3.5"
                  style={{ ...FIELD, ...NUM, height: 42 }}
                />
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="regPhone" className="block text-[12px] font-semibold text-[var(--ink2)] mb-1">
                    Phone (optional)
                  </label>
                  <input
                    id="regPhone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full text-[13px] px-3"
                    style={{ ...FIELD, height: 38 }}
                  />
                </div>
                <div>
                  <label htmlFor="regEmail" className="block text-[12px] font-semibold text-[var(--ink2)] mb-1">
                    Email (optional)
                  </label>
                  <input
                    id="regEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    className="w-full text-[13px] px-3"
                    style={{ ...FIELD, height: 38 }}
                  />
                </div>
              </div>

              {/* Form Error Banner */}
              {formError && (
                <div
                  className="p-3 rounded-[8px] text-[12px] font-semibold animate-fadeIn"
                  style={{
                    background: 'var(--danger-soft)',
                    border: '1px solid var(--danger-line)',
                    color: 'var(--danger)',
                  }}
                >
                  {formError}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 h-[48px] rounded-[8px] text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50 border-0"
                style={{
                  background: 'var(--ink)',
                  color: 'var(--panel)',
                }}
              >
                <span>{isSubmitting ? 'Creating Co-Owner Account…' : 'Accept & Open Store Dashboard'}</span>
                <span style={KBD_ON_FILL}>Enter</span>
              </button>

              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setValidationResult(null);
                    setHasSearchedToken(false);
                  }}
                  className="text-[12px] text-[var(--ink3)] hover:text-[var(--ink)] cursor-pointer"
                >
                  Use a different invitation code
                </button>
              </div>
            </form>
          )}

          {/* Footer inside card */}
          <div
            className="flex items-center justify-between text-[11px] mt-6 pt-4 border-t"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink3)' }}
          >
            <span>Role: Co-Owner (Full Admin Access)</span>
            <span style={{ fontFamily: MONO }}>Secure Provisioning</span>
          </div>
        </div>
      </main>

      {/* Brand Footer */}
      <footer className="py-2.5 text-center shrink-0">
        <span
          className="font-mono text-[10px] tracking-wider select-none pointer-events-none uppercase font-bold"
          style={{ color: 'var(--ink4)', opacity: 0.35 }}
        >
          j mart pos co-owner portal
        </span>
      </footer>
    </div>
  );
}
