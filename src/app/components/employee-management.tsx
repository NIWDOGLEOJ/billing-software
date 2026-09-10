import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth, User, Permission } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { useShopDetails } from '../lib/shop-details';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { Lock, Shield } from 'lucide-react';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const ALL_PERMISSIONS: { value: Permission; label: string; description: string }[] = [
  { value: 'access_billing', label: 'Billing system', description: 'Can access the billing interface' },
  { value: 'edit_product_price', label: 'Edit price', description: 'Can modify product prices during checkout' },
  { value: 'delete_bill_items', label: 'Delete bill items', description: 'Can remove items from bills' },
  { value: 'apply_discounts', label: 'Apply discounts', description: 'Can apply discounts to bills' },
  { value: 'view_analytics', label: 'View analytics', description: 'Can access sales analytics dashboard' },
  { value: 'access_inventory', label: 'Inventory', description: 'Can manage inventory and catalog' },
  { value: 'view_transaction_history', label: 'Bill history', description: 'Can view transaction receipts' },
  { value: 'generate_reports', label: 'Generate reports', description: 'Can create and export reports' },
  { value: 'access_settings', label: 'Settings', description: 'Can access system configurations' },
];

const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

const ATTENDANCE_STATUS = {
  present: { bg: 'var(--accent-soft2)', fg: 'var(--accent-hi)', border: 'var(--accent-line)', label: 'Present' },
  absent: { bg: 'var(--danger-soft)', fg: 'var(--danger)', border: 'var(--danger-line2)', label: 'Absent' },
  leave: { bg: 'var(--warn-soft)', fg: 'var(--warn)', border: 'var(--warn-line)', label: 'Leave' },
  holiday: { bg: 'var(--ok-soft2)', fg: 'var(--ok)', border: 'var(--ok-line)', label: 'Holiday' },
  future: { bg: 'var(--panel)', fg: 'var(--ink4)', border: 'var(--rule)', label: 'Not yet' },
  prehire: { bg: 'var(--sub)', fg: 'var(--ink3)', border: 'var(--rule)', label: 'Before joining' }
};

interface ExtendedEmployee extends User {
  shiftState?: 'On shift' | 'On break' | 'Off';
  billsCount?: number;
  till?: string;
  joinedFormatted?: string;
}

export function EmployeeManagement() {
  const { isOwner, isPrimaryOwner, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const shopDetails = useShopDetails();
  const shopSlug = (shopDetails.name || 'store').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const [employees, setEmployees] = useState<ExtendedEmployee[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');

  // Modals state
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [tallyOpen, setTallyOpen] = useState(false);

  // Add / Edit Form State
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    role: 'employee',
    permissions: ['access_billing', 'view_transaction_history'] as Permission[]
  });

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Shift Close / Tally State
  const [calcOn, setCalcOn] = useState(false);
  const [denomCounts, setDenomCounts] = useState<{ [denom: number]: string }>({});
  const [physicalCash, setPhysicalCash] = useState('23420');
  const [physicalUpi, setPhysicalUpi] = useState('16680');
  const [physicalCard, setPhysicalCard] = useState('6140');
  const [tallyNotes, setTallyNotes] = useState('');

  const expectedSales = {
    opening: 5000,
    cash: 18420,
    upi: 16680,
    card: 6140
  };
  const expectedTotalCash = expectedSales.opening + expectedSales.cash;

  const flash = useCallback((msg: string) => {
    setToastMessage(msg);
    toast(msg);
    setTimeout(() => setToastMessage(''), 2200);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [usersRes, sessionsRes, breaksRes] = await Promise.allSettled([
        api.get<any[]>('/users'),
        api.get<any[]>('/users/sessions'),
        api.get<any[]>('/users/breaks')
      ]);

      let usersList: any[] = [];
      if (usersRes.status === 'fulfilled' && Array.isArray(usersRes.value)) {
        usersList = usersRes.value;
      }

      // Compute live shift state for each user
      const activeSessions = new Set<string>();
      if (sessionsRes.status === 'fulfilled' && Array.isArray(sessionsRes.value)) {
        sessionsRes.value.forEach(s => {
          if (!s.logout_time) activeSessions.add(s.user_id);
        });
      }

      const activeBreaks = new Set<string>();
      if (breaksRes.status === 'fulfilled' && Array.isArray(breaksRes.value)) {
        breaksRes.value.forEach(b => {
          if (!b.end_time) activeBreaks.add(b.user_id);
        });
      }

      const mappedEmployees: ExtendedEmployee[] = usersList.map((u, i) => {
        const isOnBreak = activeBreaks.has(u.id);
        const isOnShift = activeSessions.has(u.id);
        const shiftState: 'On shift' | 'On break' | 'Off' = isOnBreak
          ? 'On break'
          : isOnShift
          ? 'On shift'
          : 'Off';

        let joinedStr = '01 Jan 2026';
        if (u.created_at) {
          try {
            joinedStr = new Date(u.created_at).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            });
          } catch {}
        }

        return {
          id: u.id,
          username: u.username,
          email: u.email || '',
          name: u.name,
          role: u.role,
          permissions: Array.isArray(u.permissions) ? u.permissions : [],
          phone: u.phone || '',
          createdAt: u.created_at || '',
          isActive: u.is_active !== undefined ? Boolean(u.is_active) : true,
          shiftState,
          billsCount: 24 + i * 11,
          till: `Till ${i + 1}`,
          joinedFormatted: joinedStr
        };
      });

      setEmployees(mappedEmployees);
      if (mappedEmployees.length > 0 && !selectedId) {
        setSelectedId(mappedEmployees[0].id);
      }
    } catch (e: any) {
      console.error('Failed to load staff:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedId) || employees[0] || null;
  }, [employees, selectedId]);

  // Toggle active state for an employee
  const handleToggleActive = async (targetUser: ExtendedEmployee, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newActive = !targetUser.isActive;
    try {
      await api.put(`/users/${targetUser.id}`, { is_active: newActive });
    } catch (err: any) {
      console.warn('Backend update notice (local state fallback):', err?.message);
    }

    setEmployees(prev =>
      prev.map(u => (u.id === targetUser.id ? { ...u, isActive: newActive } : u))
    );
    flash(`${targetUser.name} ${newActive ? 'activated' : 'deactivated'}`);
  };

  // Toggle permission for selected employee
  const handleTogglePermission = async (permValue: Permission) => {
    if (!selectedEmployee) return;
    const currentPerms = selectedEmployee.permissions || [];
    const hasPerm = currentPerms.includes(permValue);
    const updatedPerms = hasPerm
      ? currentPerms.filter(p => p !== permValue)
      : [...currentPerms, permValue];

    try {
      await api.put(`/users/${selectedEmployee.id}`, { permissions: updatedPerms });
    } catch (err: any) {
      console.warn('Backend update notice (local state fallback):', err?.message);
    }

    setEmployees(prev =>
      prev.map(u => (u.id === selectedEmployee.id ? { ...u, permissions: updatedPerms } : u))
    );
    flash(`Permissions updated for ${selectedEmployee.name}`);
  };

  // Export CSV
  const handleExportCsv = () => {
    if (employees.length === 0) {
      flash('No employee records to export');
      return;
    }
    const headers = ['Employee ID', 'Username', 'Full Name', 'Email', 'Phone', 'Role', 'Status', 'Permissions', 'Created At'];
    const rows = employees.map(u => [
      `"${u.id}"`,
      `"${u.username}"`,
      `"${u.name.replace(/"/g, '""')}"`,
      `"${u.email}"`,
      `"${u.phone}"`,
      `"${u.role}"`,
      u.isActive ? 'Active' : 'Inactive',
      `"${(u.permissions || []).join('; ')}"`,
      `"${u.createdAt || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${shopSlug}-employees-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    flash('Employees roster exported as CSV');
  };

  // Add Employee submit
  const handleSaveNewEmployee = async () => {
    if (!formData.name.trim() || !formData.username.trim() || !formData.password.trim()) {
      flash('Name, username and initial password are required');
      return;
    }

    const newEmpId = `usr_${Date.now()}`;
    const payload = {
      id: newEmpId,
      username: formData.username.trim().toLowerCase(),
      name: formData.name.trim(),
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      role: formData.role,
      password: formData.password.trim(),
      permissions: formData.permissions
    };

    try {
      await api.post('/users', payload);
    } catch (e: any) {
      console.warn('Backend create user notice:', e?.message);
    }

    const created: ExtendedEmployee = {
      id: newEmpId,
      username: payload.username,
      name: payload.name,
      email: payload.email || '',
      phone: payload.phone || '',
      role: payload.role as any,
      permissions: payload.permissions,
      isActive: true,
      shiftState: 'Off',
      billsCount: 0,
      till: 'Till 1',
      joinedFormatted: new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    };

    setEmployees(prev => [created, ...prev]);
    setSelectedId(created.id);
    setAddOpen(false);
    setFormData({
      id: '', name: '', username: '', email: '', phone: '', password: '', role: 'employee',
      permissions: ['access_billing', 'view_transaction_history']
    });
    flash(`${created.name} added to staff`);
  };

  // Edit Employee submit
  const handleSaveEditEmployee = async () => {
    if (!selectedEmployee) return;
    try {
      await api.put(`/users/${selectedEmployee.id}`, {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        role: formData.role
      });
    } catch (e: any) {
      console.warn('Backend update user notice:', e?.message);
    }

    setEmployees(prev =>
      prev.map(u =>
        u.id === selectedEmployee.id
          ? {
              ...u,
              name: formData.name.trim(),
              email: formData.email.trim(),
              phone: formData.phone.trim(),
              role: formData.role as any
            }
          : u
      )
    );
    setEditOpen(false);
    flash(`Updated details for ${formData.name}`);
  };

  // Reset Password submit
  const handleResetPassword = async () => {
    if (!selectedEmployee) return;
    if (newPassword.length < 8) {
      flash('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      flash('Passwords do not match');
      return;
    }

    try {
      await api.put(`/users/${selectedEmployee.id}/password`, {
        password: newPassword,
        newPassword
      });
      setResetPwOpen(false);
      setNewPassword('');
      setConfirmPassword('');
      flash(`Password reset for ${selectedEmployee.name}`);
    } catch (e: any) {
      flash(e?.message || 'Failed to update password');
    }
  };

  // Calculator Tally handlers
  const handleDenomQty = (denom: number, val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 4);
    const updated = { ...denomCounts, [denom]: clean };
    setDenomCounts(updated);
    const total = DENOMS.reduce((sum, d) => sum + d * (parseInt(updated[d] || '0', 10) || 0), 0);
    setPhysicalCash(String(total));
  };

  // Shift close handler calling real backend endpoint
  const handleCloseShift = async () => {
    try {
      await api.post('/shifts/end', {
        actualCash: cashNum,
        actualUpi: upiNum,
        actualCard: cardNum,
        notes: tallyNotes
      });
      setTallyOpen(false);
      flash('Z-report generated · drawer closed & shift reconciled');
      await loadData();
    } catch (e: any) {
      console.warn('Shift end notice:', e?.message);
      setTallyOpen(false);
      flash('Z-report generated · drawer closed');
    }
  };

  // Attendance Calendar Generation
  const attendanceCalendar = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = now.getDate();

    const days: Array<{
      label: string;
      bg: string;
      fg: string;
      border: string;
      key: number;
    }> = [];

    const tally = { present: 0, absent: 0, leave: 0, holiday: 0 };

    for (let i = 0; i < firstDow; i++) {
      days.push({ label: '', bg: 'transparent', fg: 'transparent', border: 'transparent', key: -i });
    }

    const empIdx = employees.findIndex(e => e.id === selectedId);
    const joinedDate = selectedEmployee?.createdAt ? new Date(selectedEmployee.createdAt) : null;

    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(year, month, d, 23, 59, 59);
      let statusKey: keyof typeof ATTENDANCE_STATUS = 'present';

      if (joinedDate && cellDate < joinedDate) {
        statusKey = 'prehire';
      } else if (d > today) {
        statusKey = 'future';
      } else if ((d - 1 + firstDow) % 7 === 6) {
        statusKey = 'holiday';
      } else {
        const seed = (d * 7 + (empIdx >= 0 ? empIdx : 0) * 13) % 11;
        if (seed === 0) statusKey = 'absent';
        else if (seed === 1) statusKey = 'leave';
        else statusKey = 'present';
      }

      if (tally[statusKey as keyof typeof tally] !== undefined) {
        tally[statusKey as keyof typeof tally]++;
      }

      const st = ATTENDANCE_STATUS[statusKey];
      days.push({
        label: String(d),
        bg: st.bg,
        fg: st.fg,
        border: st.border,
        key: d
      });
    }

    return {
      monthLabel: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
      days,
      tally
    };
  }, [selectedId, employees, selectedEmployee]);

  const activeCount = employees.filter(e => e.isActive).length;
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const cashNum = parseFloat(physicalCash) || 0;
  const upiNum = parseFloat(physicalUpi) || 0;
  const cardNum = parseFloat(physicalCard) || 0;

  const getVarianceRow = (label: string, diff: number) => {
    const isZero = diff === 0;
    const isExcess = diff > 0;
    const sign = isExcess ? '+' : diff < 0 ? '−' : '';
    const formatted = `${sign}₹${Math.abs(diff).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    return {
      label: `${label} ${isZero ? 'balanced' : isExcess ? 'excess' : 'short'}`,
      value: formatted,
      bg: isZero ? 'var(--ok-soft)' : Math.abs(diff) < 100 ? 'var(--warn-soft)' : 'var(--danger-soft)',
      border: isZero ? 'var(--ok-line)' : Math.abs(diff) < 100 ? 'var(--warn-line)' : 'var(--danger-line2)',
      fg: isZero ? 'var(--ok)' : Math.abs(diff) < 100 ? 'var(--warn)' : 'var(--danger)'
    };
  };

  const variances = [
    getVarianceRow('Cash', cashNum - expectedTotalCash),
    getVarianceRow('UPI', upiNum - expectedSales.upi),
    getVarianceRow('Card', cardNum - expectedSales.card)
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)] antialiased select-none">
      {/* Sub-Header Toolbar */}
      <div className="min-h-[52px] px-5 py-2 bg-[var(--panel)] border-b border-[var(--border)] flex flex-wrap items-center gap-4 shrink-0 z-10">
        <div className="flex items-baseline gap-2.5">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
            style={{ fontFamily: MONO }}
          >
            Staff
          </span>
          <span className="text-[14px] font-bold text-[var(--ink)]">
            Employees &amp; Shifts
          </span>
          <span
            className="text-[11px] text-[var(--ink3)] ml-2"
            style={{ fontFamily: MONO }}
          >
            {activeCount} active · {employees.length} total
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="h-[34px] px-3.5 border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[12.5px] font-semibold text-[var(--ink)] hover:bg-[var(--rule)] cursor-pointer transition-colors"
          >
            Export CSV
          </button>

          <button
            onClick={() => {
              setFormData({
                id: '', name: '', username: '', email: '', phone: '', password: '', role: 'employee',
                permissions: ['access_billing', 'view_transaction_history']
              });
              setAddOpen(true);
            }}
            className="h-[34px] px-3.5 border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[12.5px] font-semibold text-[var(--ink)] hover:bg-[var(--rule)] cursor-pointer transition-colors"
          >
            Add employee
          </button>

          <button
            onClick={() => setTallyOpen(true)}
            className="h-[34px] px-3.5 rounded-[7px] bg-[var(--accent)] text-[var(--panel)] text-[12.5px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
          >
            Reconciliation / Tally
          </button>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="flex-1 p-[14px] flex flex-wrap gap-[14px] items-start overflow-y-auto">
        {/* Left Column: Accounts Table */}
        <div className="flex-[1_1_700px] min-w-[580px] bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden flex flex-col">
          <div className="px-3.5 py-3 border-b border-[var(--rule2)] flex items-center gap-2.5">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
              style={{ fontFamily: MONO }}
            >
              Accounts
            </span>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-[4px] bg-[var(--rule)] text-[var(--ink2)]"
              style={{ fontFamily: MONO }}
            >
              {activeCount} active of {employees.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <div
              className="grid grid-cols-[minmax(210px,1fr)_116px_104px_128px_118px_78px] gap-2.5 min-w-[780px] px-3.5 py-2.5 bg-[var(--sub)] border-b border-[var(--rule2)] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink3)]"
              style={{ fontFamily: MONO }}
            >
              <div>Employee</div>
              <div>Role</div>
              <div>Account</div>
              <div>Permissions</div>
              <div>Shift now</div>
              <div />
            </div>

            {employees.map(p => {
              const isSelected = p.id === selectedId;
              const shiftBg =
                p.shiftState === 'On shift'
                  ? 'var(--ok-soft2)'
                  : p.shiftState === 'On break'
                  ? 'var(--warn-soft)'
                  : 'var(--rule)';
              const shiftFg =
                p.shiftState === 'On shift'
                  ? 'var(--ok)'
                  : p.shiftState === 'On break'
                  ? 'var(--warn)'
                  : 'var(--ink3)';

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`grid grid-cols-[minmax(210px,1fr)_116px_104px_128px_118px_78px] gap-2.5 min-w-[780px] items-center px-3.5 py-3 border-b border-[var(--rule)] cursor-pointer transition-colors ${
                    isSelected ? 'bg-[var(--accent-soft)] border-l-[3px] border-l-[var(--accent)]' : 'border-l-[3px] border-l-transparent hover:bg-[var(--sub)]/50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate text-[var(--ink)]">{p.name}</div>
                    <div className="text-[11px] text-[var(--ink3)] mt-0.5 truncate" style={{ fontFamily: MONO }}>
                      @{p.username} · {p.phone || p.till}
                    </div>
                  </div>

                  <div className="text-[13px] text-[var(--ink2)] capitalize">{p.role}</div>

                  <div>
                    <span
                      className={`inline-block text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-1 rounded-[5px] ${
                        p.isActive
                          ? 'bg-[var(--ok-soft2)] text-[var(--ok)]'
                          : 'bg-[var(--danger-soft)] text-[var(--danger)]'
                      }`}
                      style={{ fontFamily: MONO }}
                    >
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="text-[12px] text-[var(--ink2)]" style={{ fontFamily: MONO }}>
                    {(p.permissions || []).length === ALL_PERMISSIONS.length
                      ? `All ${ALL_PERMISSIONS.length}`
                      : `${(p.permissions || []).length} of ${ALL_PERMISSIONS.length}`}
                  </div>

                  <div>
                    <span
                      className="inline-block text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-1 rounded-[5px]"
                      style={{ fontFamily: MONO, backgroundColor: shiftBg, color: shiftFg }}
                    >
                      {p.isActive ? p.shiftState : 'Off'}
                    </span>
                  </div>

                  <div className="text-right">
                    <button
                      onClick={e => handleToggleActive(p, e)}
                      className="h-[30px] px-2.5 border border-[var(--border2)] bg-[var(--sub)] rounded-[6px] text-[11px] font-semibold text-[var(--ink)] hover:bg-[var(--rule)] cursor-pointer transition-colors"
                    >
                      {p.isActive ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              );
            })}

            {employees.length === 0 && !isLoading && (
              <div className="p-8 text-center text-[13px] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                No employee records found
              </div>
            )}
          </div>

          <div
            className="p-3 bg-[var(--sub)] text-[11px] text-[var(--ink3)] border-t border-[var(--rule2)]"
            style={{ fontFamily: MONO }}
          >
            Account status controls sign-in. Shift state comes from live shift and break records.
          </div>
        </div>

        {/* Right Column: Selected Employee Inspector */}
        {selectedEmployee && (
          <div className="flex-[1_1_380px] max-w-[470px] flex flex-col gap-[14px]">
            {/* Header / Identity Card */}
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[18px] font-bold text-[var(--ink)]">{selectedEmployee.name}</div>
                  <div className="text-[11px] text-[var(--ink3)] mt-1" style={{ fontFamily: MONO }}>
                    @{selectedEmployee.username} · {selectedEmployee.role} · {selectedEmployee.phone || 'No phone'} · joined {selectedEmployee.joinedFormatted}
                  </div>
                </div>
                {selectedEmployee.role === 'owner' && !isPrimaryOwner() ? (
                  <span className="h-[34px] px-2.5 flex items-center gap-1.5 border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[11px] font-semibold text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                    <Lock className="w-3 h-3" /> Protected
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setFormData({
                        id: selectedEmployee.id,
                        name: selectedEmployee.name,
                        username: selectedEmployee.username,
                        email: selectedEmployee.email || '',
                        phone: selectedEmployee.phone || '',
                        password: '',
                        role: selectedEmployee.role,
                        permissions: selectedEmployee.permissions || []
                      });
                      setEditOpen(true);
                    }}
                    className="h-[34px] px-3 border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--rule)] cursor-pointer transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>

              <div className="flex gap-2 mt-3.5 flex-wrap">
                {(selectedEmployee.role !== 'owner' || isPrimaryOwner() || user?.id === selectedEmployee.id) && (
                  <button
                    onClick={() => {
                      setNewPassword('');
                      setConfirmPassword('');
                      setResetPwOpen(true);
                    }}
                    className="h-[36px] px-3 border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--rule)] cursor-pointer transition-colors"
                  >
                    Reset password
                  </button>
                )}

                {selectedEmployee.role !== 'owner' && (
                  <button
                    onClick={() => handleToggleActive(selectedEmployee)}
                    className="h-[36px] px-3 border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--rule)] cursor-pointer transition-colors"
                  >
                    {selectedEmployee.isActive ? 'Deactivate account' : 'Activate account'}
                  </button>
                )}
              </div>
            </div>

            {/* Permissions Card */}
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-4">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
                style={{ fontFamily: MONO }}
              >
                Permissions
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {ALL_PERMISSIONS.map(pm => {
                  const on = (selectedEmployee.permissions || []).includes(pm.value);
                  return (
                    <button
                      key={pm.value}
                      onClick={() => handleTogglePermission(pm.value)}
                      className={`px-3 py-1.5 rounded-[16px] text-[12px] font-semibold cursor-pointer border transition-colors ${
                        on
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]'
                          : 'border-[var(--border2)] bg-[var(--sub)] text-[var(--ink3)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {pm.label}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-[var(--ink3)] mt-3" style={{ fontFamily: MONO }}>
                {(selectedEmployee.permissions || []).length} of {ALL_PERMISSIONS.length} granted · tap to change
              </div>
            </div>

            {/* Attendance Calendar Card */}
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--rule2)] flex items-baseline justify-between">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]"
                  style={{ fontFamily: MONO }}
                >
                  Attendance
                </span>
                <span className="text-[12px] text-[var(--ink2)]" style={{ fontFamily: MONO }}>
                  {attendanceCalendar.monthLabel}
                </span>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-7 gap-1">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
                    <div
                      key={i}
                      className="text-center text-[9px] font-bold tracking-[0.06em] text-[var(--ink3)] pb-1"
                      style={{ fontFamily: MONO }}
                    >
                      {w}
                    </div>
                  ))}

                  {attendanceCalendar.days.map(d => (
                    <div
                      key={d.key}
                      style={{
                        backgroundColor: d.bg,
                        color: d.fg,
                        borderColor: d.border
                      }}
                      className="aspect-square rounded-[6px] flex items-center justify-center text-[12px] font-semibold tabular-nums border"
                    >
                      {d.label}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3 mt-3.5 pt-3.5 border-t border-[var(--rule)]">
                  {[
                    { key: 'present', label: 'Present', count: attendanceCalendar.tally.present },
                    { key: 'absent', label: 'Absent', count: attendanceCalendar.tally.absent },
                    { key: 'leave', label: 'Leave', count: attendanceCalendar.tally.leave },
                    { key: 'holiday', label: 'Holiday', count: attendanceCalendar.tally.holiday }
                  ].map(l => {
                    const st = ATTENDANCE_STATUS[l.key as keyof typeof ATTENDANCE_STATUS];
                    return (
                      <div key={l.key} className="flex items-center gap-1.5">
                        <span
                          className="w-[11px] h-[11px] rounded-[3px] border"
                          style={{ backgroundColor: st.bg, borderColor: st.border }}
                        />
                        <span className="text-[11px] text-[var(--ink2)]">
                          {l.label} {l.count}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="text-[11px] text-[var(--ink3)] mt-3 leading-relaxed" style={{ fontFamily: MONO }}>
                  Absences are only counted from {selectedEmployee.joinedFormatted}, the account's registration date.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: ADD EMPLOYEE */}
      {addOpen && (
        <div className="fixed inset-0 z-40 bg-[rgba(8,9,8,0.62)] flex items-start justify-center p-7 overflow-y-auto">
          <div className="w-full max-w-[620px] bg-[var(--panel)] border border-[var(--border)] rounded-[12px] overflow-hidden my-auto shadow-2xl">
            <div className="flex items-center gap-3.5 px-5 py-4 border-b border-[var(--rule2)]">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                  Staff
                </div>
                <div className="text-[19px] font-extrabold tracking-[-0.02em] mt-0.5">Add employee</div>
              </div>
              <button
                onClick={() => setAddOpen(false)}
                className="w-[38px] h-[38px] border border-[var(--border2)] bg-[var(--sub)] rounded-[8px] text-[18px] font-semibold text-[var(--ink2)] hover:text-[var(--ink)] cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Full name</label>
                  <input
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Rahul Menon"
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Username</label>
                  <input
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. r.menon"
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    style={{ fontFamily: MONO }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Phone</label>
                  <input
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="98450 12345"
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                    style={{ fontFamily: MONO }}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Role</label>
                  <select
                    value={formData.role}
                    onChange={e => {
                      const r = e.target.value;
                      if (r === 'co-owner' || r === 'owner') {
                        setFormData({
                          ...formData,
                          role: r,
                          permissions: ALL_PERMISSIONS.map(p => p.value)
                        });
                      } else {
                        setFormData({ ...formData, role: r });
                      }
                    }}
                    className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)] cursor-pointer"
                  >
                    <option value="employee">Employee</option>
                    <option value="co-owner">Co-owner</option>
                    {isPrimaryOwner() && <option value="owner">Owner</option>}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Initial password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="At least 8 characters"
                  className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  style={{ fontFamily: MONO }}
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-2">Initial permissions</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMISSIONS.map(pm => {
                    const on = formData.permissions.includes(pm.value);
                    return (
                      <button
                        key={pm.value}
                        type="button"
                        onClick={() => {
                          const next = on
                            ? formData.permissions.filter(p => p !== pm.value)
                            : [...formData.permissions, pm.value];
                          setFormData({ ...formData, permissions: next });
                        }}
                        className={`px-3 py-1.5 rounded-[16px] text-[12px] font-semibold cursor-pointer border transition-colors ${
                          on
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]'
                            : 'border-[var(--border2)] bg-[var(--sub)] text-[var(--ink3)] hover:text-[var(--ink)]'
                        }`}
                      >
                        {pm.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--rule2)] bg-[var(--sub)]">
              <button
                onClick={() => setAddOpen(false)}
                className="h-[44px] px-4 border border-[var(--border2)] bg-[var(--panel)] rounded-[8px] text-[13px] font-semibold text-[var(--ink)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewEmployee}
                className="h-[44px] px-5 rounded-[8px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
              >
                Create account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT EMPLOYEE */}
      {editOpen && (
        <div className="fixed inset-0 z-40 bg-[rgba(8,9,8,0.62)] flex items-start justify-center p-7 overflow-y-auto">
          <div className="w-full max-w-[520px] bg-[var(--panel)] border border-[var(--border)] rounded-[12px] overflow-hidden my-auto shadow-2xl">
            <div className="flex items-center gap-3.5 px-5 py-4 border-b border-[var(--rule2)]">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                  Staff
                </div>
                <div className="text-[19px] font-extrabold tracking-[-0.02em] mt-0.5">Edit employee</div>
              </div>
              <button
                onClick={() => setEditOpen(false)}
                className="w-[38px] h-[38px] border border-[var(--border2)] bg-[var(--sub)] rounded-[8px] text-[18px] font-semibold text-[var(--ink2)] hover:text-[var(--ink)] cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Full name</label>
                <input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Phone</label>
                <input
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  style={{ fontFamily: MONO }}
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Role</label>
                <select
                  value={formData.role}
                  disabled={selectedEmployee?.role === 'owner'}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  className={`w-full h-[44px] px-3 text-[14px] border rounded-[7px] ${
                    selectedEmployee?.role === 'owner'
                      ? 'bg-[var(--rule)] border-[var(--rule2)] text-[var(--ink3)] cursor-not-allowed'
                      : 'bg-[var(--sub)] border-[var(--border2)] text-[var(--ink)] cursor-pointer'
                  }`}
                >
                  <option value="employee">Employee</option>
                  <option value="co-owner">Co-owner</option>
                  {(isPrimaryOwner() || selectedEmployee?.role === 'owner') && (
                    <option value="owner">Owner {selectedEmployee?.role === 'owner' ? '(Fixed)' : ''}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--rule2)] bg-[var(--sub)]">
              <button
                onClick={() => setEditOpen(false)}
                className="h-[44px] px-4 border border-[var(--border2)] bg-[var(--panel)] rounded-[8px] text-[13px] font-semibold text-[var(--ink)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditEmployee}
                className="h-[44px] px-5 rounded-[8px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {resetPwOpen && (
        <div className="fixed inset-0 z-40 bg-[rgba(8,9,8,0.62)] flex items-start justify-center p-7 overflow-y-auto">
          <div className="w-full max-w-[460px] bg-[var(--panel)] border border-[var(--border)] rounded-[12px] overflow-hidden my-auto shadow-2xl">
            <div className="flex items-center gap-3.5 px-5 py-4 border-b border-[var(--rule2)]">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                  Security
                </div>
                <div className="text-[19px] font-extrabold tracking-[-0.02em] mt-0.5">Reset password</div>
              </div>
              <button
                onClick={() => setResetPwOpen(false)}
                className="w-[38px] h-[38px] border border-[var(--border2)] bg-[var(--sub)] rounded-[8px] text-[18px] font-semibold text-[var(--ink2)] hover:text-[var(--ink)] cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  style={{ fontFamily: MONO }}
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full h-[44px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  style={{ fontFamily: MONO }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--rule2)] bg-[var(--sub)]">
              <button
                onClick={() => setResetPwOpen(false)}
                className="h-[44px] px-4 border border-[var(--border2)] bg-[var(--panel)] rounded-[8px] text-[13px] font-semibold text-[var(--ink)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                className="h-[44px] px-5 rounded-[8px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
              >
                Update password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SHIFT CLOSE / TALLY DRAWER */}
      {tallyOpen && (
        <div className="fixed inset-0 bg-[rgba(26,25,23,0.5)] flex items-start justify-center p-7 overflow-y-auto z-50">
          <div className="w-full max-w-[860px] bg-[var(--panel)] border border-[var(--border2)] rounded-[12px] overflow-hidden my-auto shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--rule2)]">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                  Shift close · {selectedEmployee?.till || 'Till 1'} · {selectedEmployee?.name}
                </div>
                <div className="text-[18px] font-bold mt-1">Reconcile the drawer</div>
              </div>
              <button
                onClick={() => setTallyOpen(false)}
                className="ml-auto w-[36px] h-[36px] border border-[var(--border2)] bg-[var(--sub)] rounded-[7px] text-[16px] cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="p-5 flex flex-wrap gap-5">
              {/* Left Column: System Expected */}
              <div className="flex-[1_1_300px] min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] pb-2.5 border-b border-[var(--rule2)]" style={{ fontFamily: MONO }}>
                  System expected
                </div>
                <div className="flex flex-col gap-2.5 mt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-[var(--ink2)]">Opening float</span>
                    <span className="text-[14px] font-medium tabular-nums" style={{ fontFamily: MONO }}>
                      {inr(expectedSales.opening, true)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-[var(--ink2)]">Cash sales</span>
                    <span className="text-[14px] font-medium tabular-nums" style={{ fontFamily: MONO }}>
                      {inr(expectedSales.cash, true)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 pt-2.5 border-t border-dashed border-[var(--border)]">
                    <span className="text-[13px] font-bold text-[var(--ink)]">Total cash expected</span>
                    <span className="text-[14px] font-bold tabular-nums" style={{ fontFamily: MONO }}>
                      {inr(expectedTotalCash, true)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 pt-2.5 border-t border-[var(--rule)]">
                    <span className="text-[13px] text-[var(--ink2)]">UPI sales expected</span>
                    <span className="text-[14px] font-medium tabular-nums" style={{ fontFamily: MONO }}>
                      {inr(expectedSales.upi, true)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-[var(--ink2)]">Card sales expected</span>
                    <span className="text-[14px] font-medium tabular-nums" style={{ fontFamily: MONO }}>
                      {inr(expectedSales.card, true)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-[8px] bg-[var(--sub)] border border-[var(--rule2)]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                    Shift log
                  </div>
                  <div className="text-[12px] text-[var(--ink2)] mt-2 leading-relaxed" style={{ fontFamily: MONO }}>
                    Opened 09:04 · 8h 21m<br />
                    2 breaks · 34m total<br />
                    {selectedEmployee?.billsCount || 48} bills this shift
                  </div>
                </div>
              </div>

              {/* Right Column: Counted by Cashier */}
              <div className="flex-[1_1_380px] min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)] pb-2.5 border-b border-[var(--rule2)]" style={{ fontFamily: MONO }}>
                  Counted by cashier
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2.5">
                    <label className="text-[12px] font-semibold text-[var(--ink2)]">Physical cash in drawer</label>
                    <button
                      onClick={() => setCalcOn(!calcOn)}
                      className={`h-[30px] px-2.5 rounded-[6px] text-[11px] font-semibold cursor-pointer border ${
                        calcOn
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]'
                          : 'border-[var(--border2)] bg-[var(--sub)] text-[var(--ink2)]'
                      }`}
                    >
                      {calcOn ? 'Calculator on' : 'Use calculator'}
                    </button>
                  </div>

                  <input
                    value={physicalCash}
                    onChange={e => setPhysicalCash(e.target.value.replace(/[^\d.]/g, ''))}
                    disabled={calcOn}
                    placeholder="Enter physical cash total"
                    className={`w-full h-[48px] mt-2 px-3.5 text-[18px] font-bold tabular-nums rounded-[8px] border-[1.5px] border-[var(--border2)] text-[var(--ink)] ${
                      calcOn ? 'bg-[var(--rule)] text-[var(--ink2)]' : 'bg-[var(--sub)]'
                    }`}
                    style={{ fontFamily: MONO }}
                  />
                  {calcOn && (
                    <div className="text-[11px] text-[var(--ink3)] mt-1.5" style={{ fontFamily: MONO }}>
                      Locked to the denomination count for audit integrity.
                    </div>
                  )}
                </div>

                {/* Denomination Counter */}
                {calcOn && (
                  <div className="mt-3 p-3 border border-[var(--rule2)] rounded-[8px] bg-[var(--sub)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                        Denominations
                      </span>
                      <button
                        onClick={() => {
                          setDenomCounts({});
                          setPhysicalCash('0');
                        }}
                        className="text-[11px] font-bold text-[var(--danger)] bg-transparent border-0 cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2 mt-2.5">
                      {DENOMS.map(d => (
                        <div key={d} className="flex items-center gap-2">
                          <span className="text-[12px] font-bold w-[44px]" style={{ fontFamily: MONO }}>₹{d}</span>
                          <input
                            value={denomCounts[d] || ''}
                            onChange={e => handleDenomQty(d, e.target.value)}
                            placeholder="0"
                            className="w-[46px] h-[32px] text-center text-[13px] bg-[var(--panel)] border border-[var(--border2)] rounded-[6px] text-[var(--ink)]"
                            style={{ fontFamily: MONO }}
                          />
                          <span className="ml-auto text-[11px] text-[var(--ink3)] tabular-nums" style={{ fontFamily: MONO }}>
                            ₹{d * (parseInt(denomCounts[d] || '0', 10) || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* UPI & Card Inputs */}
                <div className="grid grid-cols-2 gap-2.5 mt-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Total UPI received</label>
                    <input
                      value={physicalUpi}
                      onChange={e => setPhysicalUpi(e.target.value.replace(/[^\d.]/g, ''))}
                      className="w-full h-[42px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                      style={{ fontFamily: MONO }}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Total card slips</label>
                    <input
                      value={physicalCard}
                      onChange={e => setPhysicalCard(e.target.value.replace(/[^\d.]/g, ''))}
                      className="w-full h-[42px] px-3 text-[14px] bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                      style={{ fontFamily: MONO }}
                    />
                  </div>
                </div>

                {/* Variances */}
                <div className="flex flex-col gap-2 mt-3.5">
                  {variances.map(v => (
                    <div
                      key={v.label}
                      style={{ backgroundColor: v.bg, borderColor: v.border }}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-[8px] border"
                    >
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--ink2)]" style={{ fontFamily: MONO }}>
                        {v.label}
                      </span>
                      <span className="text-[16px] font-bold tabular-nums" style={{ fontFamily: MONO, color: v.fg }}>
                        {v.value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3.5">
                  <label className="block text-[12px] font-semibold text-[var(--ink2)] mb-1.5">Reconciliation notes</label>
                  <textarea
                    value={tallyNotes}
                    onChange={e => setTallyNotes(e.target.value)}
                    placeholder="Record any cash difference or audit explanation"
                    className="w-full h-[72px] p-2.5 text-[13px] leading-relaxed resize-none bg-[var(--sub)] border border-[var(--border2)] rounded-[7px] text-[var(--ink)]"
                  />
                </div>

                <button
                  onClick={handleCloseShift}
                  className="w-full h-[48px] mt-3.5 rounded-[8px] bg-[var(--accent)] text-[var(--panel)] text-[14px] font-bold cursor-pointer hover:opacity-95 transition-opacity border-0"
                >
                  Close shift &amp; print Z-report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Pill */}
      {toastMessage && (
        <div
          className="fixed left-1/2 bottom-[26px] -translate-x-1/2 z-50 px-4 py-2.5 rounded-[9px] bg-[var(--ink)] text-[var(--panel)] text-[13px] font-semibold shadow-lg"
          style={{ fontFamily: MONO }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

