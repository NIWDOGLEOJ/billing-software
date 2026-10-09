import React, { ReactNode } from 'react';
import { Navigate, useNavigate, Outlet } from 'react-router';
import { useAuth } from '../contexts/auth-context';
import { Permission, ALL_PERMISSIONS, ROLE_LABELS } from '../lib/permissions';
import { ShieldAlert, ArrowLeft, Store } from 'lucide-react';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

interface PermissionGuardProps {
  permission: Permission | Permission[];
  mode?: 'any' | 'all';
  children?: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

export function PermissionGuard({
  permission,
  mode = 'any',
  children,
  fallbackTitle,
  fallbackDescription,
}: PermissionGuardProps) {
  const { user, isAuthenticated, hasPermission, isOwner } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Owners and co-owners bypass all permission guards
  if (isOwner()) {
    return children ? <>{children}</> : <Outlet />;
  }

  const permissionsList = Array.isArray(permission) ? permission : [permission];
  const isAuthorized =
    mode === 'all'
      ? permissionsList.every(p => hasPermission(p))
      : permissionsList.some(p => hasPermission(p));

  if (isAuthorized) {
    return children ? <>{children}</> : <Outlet />;
  }

  const roleInfo = user?.role ? (ROLE_LABELS as any)[user.role] : null;
  const roleDisplay = roleInfo ? roleInfo.label : (user?.role || 'Staff');

  const requiredLabels = permissionsList
    .map(p => ALL_PERMISSIONS.find(def => def.value === p)?.label || p)
    .join(mode === 'all' ? ' & ' : ' or ');

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-[var(--bg)] min-h-[70vh]">
      <div className="w-full max-w-[520px] bg-[var(--panel)] border border-[var(--border)] rounded-[12px] p-8 shadow-xl text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-line)] flex items-center justify-center">
          <ShieldAlert size={28} />
        </div>

        <div
          className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--danger)] mb-2"
          style={{ fontFamily: MONO }}
        >
          403 · Access Restricted
        </div>

        <h1 className="text-[20px] font-black text-[var(--ink)] mb-2">
          {fallbackTitle || 'Permission Required'}
        </h1>

        <p className="text-[13px] leading-relaxed text-[var(--ink2)] mb-6">
          {fallbackDescription || (
            <>
              Your account (<strong className="text-[var(--ink)]">{user?.name}</strong> ·{' '}
              <span className="capitalize">{roleDisplay}</span>) does not have access to this screen.
              <br />
              This view requires <strong className="text-[var(--ink)]">{requiredLabels}</strong> permission.
            </>
          )}
        </p>

        <div className="p-3 bg-[var(--sub)] border border-[var(--border2)] rounded-[8px] text-[12px] text-[var(--ink3)] mb-6 text-left space-y-1.5" style={{ fontFamily: MONO }}>
          <div className="flex justify-between">
            <span>Signed in as:</span>
            <span className="font-bold text-[var(--ink)]">@{user?.username}</span>
          </div>
          <div className="flex justify-between">
            <span>Role:</span>
            <span className="font-bold capitalize text-[var(--ink)]">{roleDisplay}</span>
          </div>
          <div className="flex justify-between">
            <span>Required permission:</span>
            <span className="text-[var(--danger)] font-bold">{requiredLabels}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="h-10 px-4 rounded-[7px] border border-[var(--border2)] bg-[var(--panel)] text-[var(--ink2)] hover:text-[var(--ink)] text-[13px] font-semibold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <ArrowLeft size={15} />
            <span>Go Back</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="h-10 px-5 rounded-[7px] bg-[var(--accent)] text-[var(--panel)] text-[13px] font-bold flex items-center gap-2 cursor-pointer hover:opacity-95 transition-opacity"
          >
            <Store size={15} />
            <span>Go to Register</span>
          </button>
        </div>
      </div>
    </div>
  );
}
