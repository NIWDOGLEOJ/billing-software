import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth, User, LoginSession, BreakRecord } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { SavedBill } from './cashier-billing-advanced';
import { api } from '../utils/api';
import { useWebSocket } from '../hooks/useWebSocket';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

function inr(n: number, paise = false): string {
  return (
    '₹' +
    Number(n || 0).toLocaleString('en-IN', {
      minimumFractionDigits: paise ? 2 : 0,
      maximumFractionDigits: paise ? 2 : 0,
    })
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface EmployeeMetrics {
  employee: User;
  billsCount: number;
  totalSales: number;
  avgBillValue: number;
  loginTime: string | null;
  logoutTime: string | null;
  workingDuration: number;
  breakDuration: number;
  isActive: boolean;
  sessions: LoginSession[];
  breaks: BreakRecord[];
}

export function EmployeePerformance() {
  const { isOwner } = useAuth();
  const { theme, setTheme } = useTheme();

  const [selectedId, setSelectedId] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month'>('today');

  const [employees, setEmployees] = useState<User[]>([]);
  const [bills, setBills] = useState<SavedBill[]>([]);
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [breaks, setBreaks] = useState<BreakRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPerformanceData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersData, billsData, sessionsData, breaksData] = await Promise.allSettled([
        api.get<any[]>('/users'),
        api.get<any[]>('/bills'),
        api.get<any[]>('/users/sessions'),
        api.get<any[]>('/users/breaks')
      ]);

      let employeeUsers: User[] = [];
      if (usersData.status === 'fulfilled' && Array.isArray(usersData.value)) {
        employeeUsers = usersData.value.map(u => ({
          id: u.id,
          username: u.username,
          email: u.email || '',
          name: u.name,
          role: u.role,
          permissions: u.permissions || [],
          phone: u.phone || '',
          createdAt: u.created_at || '',
          isActive: u.is_active !== undefined ? Boolean(u.is_active) : true
        }));
      }

      let mappedBills: SavedBill[] = [];
      if (billsData.status === 'fulfilled' && Array.isArray(billsData.value)) {
        mappedBills = billsData.value.map(b => ({
          billNumber: b.bill_number,
          date: b.date,
          items: b.items,
          total: b.total,
          subtotal: b.subtotal,
          gstAmount: b.gst_amount,
          cgst: b.cgst,
          sgst: b.sgst,
          gstRate: b.gst_rate,
          gstEnabled: b.gst_enabled,
          cashierName: b.cashier_name || 'Cashier',
          shopDetails: b.shop_details || { name: '', address: '', phone: '', email: '' },
          customerName: b.customer_name || undefined,
          customerPhone: b.customer_phone || undefined,
          paymentMode: b.payment_mode,
          amountReceived: b.amount_received || undefined,
          changeAmount: b.change_amount || undefined,
          roundedTotal: b.total,
          roundingAdjustment: b.rounding_adjustment || 0,
          generatedBy: b.cashier_id
        }));
      }

      let mappedSessions: LoginSession[] = [];
      if (sessionsData.status === 'fulfilled' && Array.isArray(sessionsData.value)) {
        mappedSessions = sessionsData.value.map(s => ({
          id: s.id,
          userId: s.user_id,
          userName: s.user_name,
          loginTime: s.login_time,
          logoutTime: s.logout_time,
          duration: s.duration ? s.duration * 1000 : null
        }));
      }

      let mappedBreaks: BreakRecord[] = [];
      if (breaksData.status === 'fulfilled' && Array.isArray(breaksData.value)) {
        mappedBreaks = breaksData.value.map(b => ({
          id: b.id,
          userId: b.user_id,
          userName: b.user_name,
          startTime: b.start_time,
          endTime: b.end_time,
          duration: b.duration ? b.duration * 1000 : null
        }));
      }

      setEmployees(employeeUsers);
      setBills(mappedBills);
      setSessions(mappedSessions);
      setBreaks(mappedBreaks);

      if (employeeUsers.length > 0 && !selectedId) {
        setSelectedId(employeeUsers[0].id);
      }
    } catch (err) {
      console.error('Failed to load performance metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadPerformanceData();
  }, [loadPerformanceData]);

  // Real-time WebSocket subscriptions
  useWebSocket({
    BREAK_CHANGED: loadPerformanceData,
    SHIFT_CHANGED: loadPerformanceData,
    SESSION_CHANGED: loadPerformanceData,
    BILL_CREATED: loadPerformanceData
  });

  // Calculate metrics per employee
  const employeeMetricsList = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    if (dateFilter === 'today') {
      cutoff.setHours(0, 0, 0, 0);
    } else if (dateFilter === 'week') {
      cutoff.setDate(now.getDate() - 7);
    } else {
      cutoff.setDate(now.getDate() - 30);
    }

    return employees.map((employee): EmployeeMetrics => {
      // Filter sessions
      const empSessions = sessions.filter(s => {
        try {
          return s.userId === employee.id && new Date(s.loginTime) >= cutoff;
        } catch {
          return s.userId === employee.id;
        }
      });

      // Filter breaks
      const empBreaks = breaks.filter(b => {
        try {
          return b.userId === employee.id && new Date(b.startTime) >= cutoff;
        } catch {
          return b.userId === employee.id;
        }
      });

      // Filter bills
      const empBills = bills.filter(b => {
        try {
          const matchUser = b.generatedBy === employee.id || b.cashierName === employee.name;
          return matchUser && new Date(b.date) >= cutoff;
        } catch {
          return b.generatedBy === employee.id;
        }
      });

      const totalSales = empBills.reduce((sum, b) => sum + (b.total || 0), 0);
      const billsCount = empBills.length;
      const avgBillValue = billsCount > 0 ? totalSales / billsCount : 0;

      // Calculate working duration
      let totalWorkingMs = 0;
      empSessions.forEach(s => {
        if (s.duration) {
          totalWorkingMs += s.duration;
        } else if (s.loginTime && !s.logoutTime) {
          totalWorkingMs += Math.max(0, Date.now() - new Date(s.loginTime).getTime());
        }
      });

      // Calculate break duration
      let totalBreakMs = 0;
      empBreaks.forEach(b => {
        if (b.duration) {
          totalBreakMs += b.duration;
        } else if (b.startTime && !b.endTime) {
          totalBreakMs += Math.max(0, Date.now() - new Date(b.startTime).getTime());
        }
      });

      const latestSession = empSessions[0] || null;
      const isCurrentlyActive = Boolean(latestSession && !latestSession.logoutTime);

      return {
        employee,
        billsCount,
        totalSales,
        avgBillValue,
        loginTime: latestSession?.loginTime || null,
        logoutTime: latestSession?.logoutTime || null,
        workingDuration: Math.max(0, totalWorkingMs - totalBreakMs),
        breakDuration: totalBreakMs,
        isActive: isCurrentlyActive,
        sessions: empSessions,
        breaks: empBreaks
      };
    }).sort((a, b) => b.totalSales - a.totalSales);
  }, [employees, sessions, breaks, bills, dateFilter]);

  const selectedMetrics = useMemo(() => {
    return employeeMetricsList.find(m => m.employee.id === selectedId) || employeeMetricsList[0] || null;
  }, [employeeMetricsList, selectedId]);

  // Aggregate totals
  const overallTotals = useMemo(() => {
    const totalSales = employeeMetricsList.reduce((acc, m) => acc + m.totalSales, 0);
    const totalBills = employeeMetricsList.reduce((acc, m) => acc + m.billsCount, 0);
    const avgBill = totalBills > 0 ? totalSales / totalBills : 0;
    const totalHours = employeeMetricsList.reduce((acc, m) => acc + m.workingDuration, 0);

    return {
      sales: inr(totalSales),
      bills: totalBills.toLocaleString('en-IN'),
      avgBill: inr(avgBill),
      hours: formatDuration(totalHours)
    };
  }, [employeeMetricsList]);

  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

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
            Performance Metrics
          </span>
        </div>

        {/* Date Filter */}
        <div className="flex border border-[var(--border)] rounded-[8px] overflow-hidden bg-[var(--sub)] ml-4">
          {(['today', 'week', 'month'] as const).map((f, i) => {
            const active = dateFilter === f;
            return (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`px-3 py-1.5 text-[12px] font-semibold cursor-pointer border-0 ${
                  i > 0 ? 'border-l border-[var(--rule2)]' : ''
                } ${
                  active
                    ? 'bg-[var(--ink)] text-[var(--panel)] font-bold'
                    : 'bg-transparent text-[var(--ink2)] hover:text-[var(--ink)]'
                }`}
              >
                {f === 'today' ? 'Today' : f === 'week' ? '7 days' : '30 days'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-[14px] flex flex-col gap-[14px] overflow-y-auto">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[14px]">
          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
              Total team sales
            </div>
            <div className="text-[28px] font-bold tabular-nums mt-2" style={{ fontFamily: MONO }}>
              {overallTotals.sales}
            </div>
            <div className="text-[12px] font-semibold text-[var(--ink2)] mt-1">
              settled revenue
            </div>
          </div>

          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
              Bills processed
            </div>
            <div className="text-[28px] font-bold tabular-nums mt-2" style={{ fontFamily: MONO }}>
              {overallTotals.bills}
            </div>
            <div className="text-[12px] font-semibold text-[var(--ink3)] mt-1">
              completed checkouts
            </div>
          </div>

          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
              Average transaction
            </div>
            <div className="text-[28px] font-bold tabular-nums mt-2" style={{ fontFamily: MONO }}>
              {overallTotals.avgBill}
            </div>
            <div className="text-[12px] font-semibold text-[var(--ink2)] mt-1">
              per customer
            </div>
          </div>

          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
              Active logged time
            </div>
            <div className="text-[28px] font-bold tabular-nums mt-2" style={{ fontFamily: MONO }}>
              {overallTotals.hours}
            </div>
            <div className="text-[12px] font-semibold text-[var(--ink3)] mt-1">
              net working hours
            </div>
          </div>
        </div>

        {/* 2-Column Split: Leaderboard & Detailed Inspector */}
        <div className="flex flex-wrap gap-[14px] items-start">
          {/* Staff Leaderboard */}
          <div className="flex-[1_1_480px] min-w-[380px] bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--rule2)] flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                Staff leaderboard
              </span>
              <span className="text-[11px] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                ranked by volume
              </span>
            </div>

            <div className="divide-y divide-[var(--rule)]">
              {employeeMetricsList.map((m, idx) => {
                const isSelected = m.employee.id === selectedId;
                return (
                  <div
                    key={m.employee.id}
                    onClick={() => setSelectedId(m.employee.id)}
                    className={`flex items-center gap-3.5 p-3.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-soft)] border-l-[3px] border-l-[var(--accent)]'
                        : 'border-l-[3px] border-l-transparent hover:bg-[var(--sub)]/50'
                    }`}
                  >
                    <span className="text-[11px] font-bold text-[var(--ink3)] w-5" style={{ fontFamily: MONO }}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold truncate text-[var(--ink)]">{m.employee.name}</div>
                      <div className="text-[11px] text-[var(--ink3)] mt-0.5" style={{ fontFamily: MONO }}>
                        @{m.employee.username} · {m.billsCount} bills · avg {inr(m.avgBillValue)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[15px] font-bold tabular-nums text-[var(--ink)]" style={{ fontFamily: MONO }}>
                        {inr(m.totalSales)}
                      </div>
                      <div className="text-[11px] text-[var(--ink3)] mt-0.5" style={{ fontFamily: MONO }}>
                        {formatDuration(m.workingDuration)} work
                      </div>
                    </div>

                    <span
                      className={`text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-[4px] ml-1.5 ${
                        m.isActive
                          ? 'bg-[var(--ok-soft2)] text-[var(--ok)]'
                          : 'bg-[var(--rule)] text-[var(--ink3)]'
                      }`}
                      style={{ fontFamily: MONO }}
                    >
                      {m.isActive ? 'Active' : 'Offline'}
                    </span>
                  </div>
                );
              })}

              {employeeMetricsList.length === 0 && (
                <div className="p-8 text-center text-[12px] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                  No active employee records
                </div>
              )}
            </div>
          </div>

          {/* Detailed Inspector for Selected Employee */}
          {selectedMetrics && (
            <div className="flex-[1_1_520px] min-w-[420px] flex flex-col gap-[14px]">
              {/* Selected Profile Card */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] p-4 flex items-center justify-between">
                <div>
                  <div className="text-[18px] font-bold text-[var(--ink)]">{selectedMetrics.employee.name}</div>
                  <div className="text-[11.5px] text-[var(--ink3)] mt-1" style={{ fontFamily: MONO }}>
                    @{selectedMetrics.employee.username} · {selectedMetrics.employee.role} · {selectedMetrics.employee.phone || 'No phone'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                    Period sales
                  </div>
                  <div className="text-[20px] font-bold tabular-nums text-[var(--accent)] mt-0.5" style={{ fontFamily: MONO }}>
                    {inr(selectedMetrics.totalSales)}
                  </div>
                </div>
              </div>

              {/* Sessions Table */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--rule2)] flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                    Login sessions
                  </span>
                  <span className="text-[11px] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                    {selectedMetrics.sessions.length} recorded
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[220px]">
                  <div
                    className="grid grid-cols-[140px_140px_100px_1fr] gap-2 px-4 py-2 bg-[var(--sub)] border-b border-[var(--rule2)] text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--ink3)]"
                    style={{ fontFamily: MONO }}
                  >
                    <div>Login</div>
                    <div>Logout</div>
                    <div>Duration</div>
                    <div className="text-right">Status</div>
                  </div>

                  {selectedMetrics.sessions.map((s, idx) => {
                    const loginStr = s.loginTime ? new Date(s.loginTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
                    const logoutStr = s.logoutTime ? new Date(s.logoutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Open session';
                    const durStr = s.duration ? formatDuration(s.duration) : 'In progress';
                    return (
                      <div
                        key={s.id || idx}
                        className="grid grid-cols-[140px_140px_100px_1fr] gap-2 px-4 py-2.5 border-b border-[var(--rule)] text-[12px] items-center"
                        style={{ fontFamily: MONO }}
                      >
                        <div className="text-[var(--ink)]">{loginStr}</div>
                        <div className="text-[var(--ink2)]">{logoutStr}</div>
                        <div className="text-[var(--ink)] font-medium">{durStr}</div>
                        <div className="text-right">
                          <span
                            className={`inline-block text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-[4px] ${
                              !s.logoutTime ? 'bg-[var(--ok-soft2)] text-[var(--ok)]' : 'bg-[var(--rule)] text-[var(--ink3)]'
                            }`}
                          >
                            {!s.logoutTime ? 'Active' : 'Closed'}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {selectedMetrics.sessions.length === 0 && (
                    <div className="p-6 text-center text-[12px] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                      No session records for this period
                    </div>
                  )}
                </div>
              </div>

              {/* Breaks Table */}
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--rule2)] flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                    Break records
                  </span>
                  <span className="text-[11px] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                    {formatDuration(selectedMetrics.breakDuration)} total
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[180px]">
                  <div
                    className="grid grid-cols-[140px_140px_100px_1fr] gap-2 px-4 py-2 bg-[var(--sub)] border-b border-[var(--rule2)] text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--ink3)]"
                    style={{ fontFamily: MONO }}
                  >
                    <div>Start</div>
                    <div>End</div>
                    <div>Duration</div>
                    <div className="text-right">State</div>
                  </div>

                  {selectedMetrics.breaks.map((b, idx) => {
                    const startStr = b.startTime ? new Date(b.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
                    const endStr = b.endTime ? new Date(b.endTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'On break';
                    const durStr = b.duration ? formatDuration(b.duration) : 'Active';
                    return (
                      <div
                        key={b.id || idx}
                        className="grid grid-cols-[140px_140px_100px_1fr] gap-2 px-4 py-2.5 border-b border-[var(--rule)] text-[12px] items-center"
                        style={{ fontFamily: MONO }}
                      >
                        <div className="text-[var(--ink)]">{startStr}</div>
                        <div className="text-[var(--ink2)]">{endStr}</div>
                        <div className="text-[var(--ink)] font-medium">{durStr}</div>
                        <div className="text-right">
                          <span
                            className={`inline-block text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-[4px] ${
                              !b.endTime ? 'bg-[var(--warn-soft)] text-[var(--warn)]' : 'bg-[var(--rule)] text-[var(--ink3)]'
                            }`}
                          >
                            {!b.endTime ? 'Break' : 'Done'}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {selectedMetrics.breaks.length === 0 && (
                    <div className="p-6 text-center text-[12px] text-[var(--ink3)]" style={{ fontFamily: MONO }}>
                      No breaks taken in this period
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
