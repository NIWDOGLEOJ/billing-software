import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/auth-context';
import { api } from '../utils/api';
import { toast } from 'sonner';
import {
  SectorPage,
  Panel,
  Pill,
  Button,
  SearchField,
  Th,
  Td,
  Eyebrow,
  MONO,
} from './sector-ui';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Shield,
  User,
  Radio,
} from 'lucide-react';

interface SessionRecord {
  id: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  login_time: string;
  logout_time?: string | null;
  duration?: number | null;
  last_active_at?: string | null;
  device_type?: string;
  is_attendance?: number;
}

interface LeaveRecord {
  id: string;
  user_id: string;
  user_name?: string;
  date: string;
  type: 'leave' | 'holiday';
  reason?: string;
  status: string;
  created_at: string;
}

interface StaffUser {
  id: string;
  name: string;
  username: string;
  role: string;
}

function formatDuration(secs: number | null | undefined, logoutTime?: string | null): string {
  if (!logoutTime) return 'Active Now';
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function AttendancePage() {
  const { user, isOwner } = useAuth();
  const [activeTab, setActiveTab] = useState<'sessions' | 'calendar'>('sessions');

  // Sessions state
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [staffFilter, setStaffFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Calendar & Leaves state
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [employees, setEmployees] = useState<StaffUser[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Leave Form modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newLeaveType, setNewLeaveType] = useState<'leave' | 'holiday'>('holiday');
  const [newLeaveUserId, setNewLeaveUserId] = useState('');
  const [newLeaveReason, setNewLeaveReason] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);

  // Fetch shift sessions
  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const endpoint = isOwner() ? '/users/sessions' : '/users/my-sessions';
      const data = await api.get<SessionRecord[]>(endpoint);
      setSessions(data || []);
    } catch (err: any) {
      console.warn('Failed to load session logs:', err);
    } finally {
      setSessionsLoading(false);
    }
  }, [isOwner]);

  // Fetch leaves and staff directory
  const fetchLeavesAndStaff = useCallback(async () => {
    try {
      const [leavesData, staffData] = await Promise.allSettled([
        api.get<LeaveRecord[]>('/leaves'),
        isOwner() ? api.get<StaffUser[]>('/users') : Promise.resolve([]),
      ]);

      if (leavesData.status === 'fulfilled' && leavesData.value) {
        setLeaves(leavesData.value);
      }
      if (staffData.status === 'fulfilled' && Array.isArray(staffData.value)) {
        setEmployees(staffData.value);
        if (staffData.value.length > 0 && !newLeaveUserId) {
          setNewLeaveUserId(staffData.value[0].id);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch leaves or staff:', err);
    }
  }, [isOwner, newLeaveUserId]);

  useEffect(() => {
    fetchSessions();
    fetchLeavesAndStaff();
  }, [fetchSessions, fetchLeavesAndStaff]);

  // Filtered session records
  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sessions.filter(s => {
      const matchStaff = staffFilter === 'all' || s.user_id === staffFilter;
      const matchQuery =
        !q ||
        (s.user_name && s.user_name.toLowerCase().includes(q)) ||
        (s.user_role && s.user_role.toLowerCase().includes(q)) ||
        s.id.toLowerCase().includes(q);
      return matchStaff && matchQuery;
    });
  }, [sessions, staffFilter, searchQuery]);

  // Active online cashiers count
  const onlineCount = useMemo(
    () => sessions.filter(s => !s.logout_time).length,
    [sessions],
  );

  // Calendar generation helpers
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const calendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells: { day: number | null; dateStr: string | null }[] = [];

    // Previous month padding
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ day: null, dateStr: null });
    }

    // Days of current month
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ day, dateStr });
    }

    return cells;
  }, [currentDate]);

  const leavesForSelectedDate = useMemo(() => {
    if (!selectedDateStr) return [];
    return leaves.filter(l => l.date === selectedDateStr);
  }, [leaves, selectedDateStr]);

  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDateStr) {
      toast.error('Select a date on the calendar first');
      return;
    }

    setSubmittingLeave(true);
    try {
      const selectedEmp = employees.find(emp => emp.id === newLeaveUserId);
      const payload = {
        id: `leave_${Date.now()}`,
        user_id: newLeaveType === 'holiday' ? 'all' : newLeaveUserId,
        user_name: newLeaveType === 'holiday' ? 'Store Wide' : selectedEmp?.name || 'Staff Member',
        date: selectedDateStr,
        type: newLeaveType,
        reason: newLeaveReason.trim() || (newLeaveType === 'holiday' ? 'Store Holiday' : 'Scheduled Leave'),
      };

      await api.post('/leaves', payload);
      toast.success(newLeaveType === 'holiday' ? 'Store holiday scheduled' : 'Staff leave scheduled');
      setNewLeaveReason('');
      setShowScheduleModal(false);
      fetchLeavesAndStaff();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule leave or holiday');
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleRevokeLeave = async (leaveId: string) => {
    try {
      await api.delete(`/leaves/${leaveId}`);
      toast.success('Leave entry revoked');
      fetchLeavesAndStaff();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to revoke leave');
    }
  };

  return (
    <SectorPage
      eyebrow="Retail & Wholesale"
      title="Staff Attendance & Shift Logs"
      meta={`${onlineCount} active till sessions online · ${sessions.length} total recorded shifts`}
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-[3px] rounded-full border border-[var(--border)] bg-[var(--sub)]">
            <button
              type="button"
              onClick={() => setActiveTab('sessions')}
              className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                activeTab === 'sessions'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              style={{ fontFamily: MONO, letterSpacing: '0.08em' }}
            >
              SHIFT LOGS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                activeTab === 'calendar'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              style={{ fontFamily: MONO, letterSpacing: '0.08em' }}
            >
              LEAVE CALENDAR
            </button>
          </div>

          {activeTab === 'calendar' && isOwner() && (
            <Button
              variant="primary"
              onClick={() => setShowScheduleModal(true)}
            >
              <span className="flex items-center gap-1.5">
                <Plus size={14} />
                <span>Schedule Leave / Holiday</span>
              </span>
            </Button>
          )}
        </div>
      }
    >
      {/* ── TAB 1: SHIFT LOGS ──────────────────────────────────────────────── */}
      {activeTab === 'sessions' && (
        <div className="flex flex-col gap-4">
          {/* Summary KPIs */}
          <div className="grid gap-[14px] grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4">
              <Eyebrow>Active cashiers</Eyebrow>
              <div
                className="text-[24px] font-bold tracking-[-0.02em] text-[var(--ok)] mt-2 flex items-center gap-2"
                style={{ fontFamily: MONO }}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--ok)] animate-pulse" />
                {onlineCount} Online
              </div>
            </div>
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4">
              <Eyebrow>Total shifts recorded</Eyebrow>
              <div
                className="text-[24px] font-bold tracking-[-0.02em] text-[var(--text-primary)] mt-2"
                style={{ fontFamily: MONO }}
              >
                {sessions.length}
              </div>
            </div>
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4">
              <Eyebrow>Staff Directory</Eyebrow>
              <div
                className="text-[24px] font-bold tracking-[-0.02em] text-[var(--text-primary)] mt-2"
                style={{ fontFamily: MONO }}
              >
                {employees.length || 1} Accounts
              </div>
            </div>
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4">
              <Eyebrow>System Security</Eyebrow>
              <div
                className="text-[14px] font-bold text-[var(--text-secondary)] mt-3 flex items-center gap-1.5"
                style={{ fontFamily: MONO }}
              >
                <Shield size={16} className="text-[var(--primary)]" />
                Heartbeat Sweeper Active
              </div>
            </div>
          </div>

          <Panel label="Cashier Session Logs">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="w-full sm:w-[280px]">
                <SearchField
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search cashier name or role..."
                />
              </div>

              {isOwner() && employees.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase text-[var(--text-muted)]" style={{ fontFamily: MONO }}>
                    Staff Filter:
                  </span>
                  <select
                    value={staffFilter}
                    onChange={e => setStaffFilter(e.target.value)}
                    className="h-[44px] px-3 rounded-[7px] border border-[var(--border2)] bg-[var(--sub)] text-[13px] font-semibold text-[var(--text-primary)] cursor-pointer"
                  >
                    <option value="all">All Staff Members</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="ml-auto text-[11px] text-[var(--text-muted)]" style={{ fontFamily: MONO }}>
                Showing {filteredSessions.length} logs
              </div>
            </div>

            {/* Sessions Table */}
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full border-collapse min-w-[760px]">
                <thead>
                  <tr>
                    <Th>Cashier / Staff</Th>
                    <Th>Role</Th>
                    <Th>Device</Th>
                    <Th>Login Time</Th>
                    <Th>Logout Time</Th>
                    <Th align="right">Active Duration</Th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsLoading ? (
                    <tr>
                      <Td colSpan={6} className="text-center py-10 text-[var(--text-muted)]">
                        Loading shift sessions...
                      </Td>
                    </tr>
                  ) : filteredSessions.length === 0 ? (
                    <tr>
                      <Td colSpan={6} className="text-center py-12 text-[var(--text-muted)]">
                        No shift session records found.
                      </Td>
                    </tr>
                  ) : (
                    filteredSessions.map(session => {
                      const isOnline = !session.logout_time;
                      return (
                        <tr key={session.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                          <Td>
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-full bg-[var(--sub)] border border-[var(--border2)] flex items-center justify-center text-[var(--text-secondary)]">
                                <User size={14} />
                              </span>
                              <div>
                                <div className="font-semibold text-[13.5px] text-[var(--text-primary)]">
                                  {session.user_name || 'System Cashier'}
                                </div>
                                <div className="text-[10px] text-[var(--text-muted)]" style={{ fontFamily: MONO }}>
                                  #{session.id.slice(-8).toUpperCase()}
                                </div>
                              </div>
                            </div>
                          </Td>
                          <Td>
                            <Pill
                              tone={
                                session.user_role === 'owner' || session.user_role === 'co-owner'
                                  ? 'accent'
                                  : 'neutral'
                              }
                            >
                              {session.user_role || 'employee'}
                            </Pill>
                          </Td>
                          <Td mono className="text-[12px] text-[var(--text-secondary)]">
                            {session.device_type === 'mobile' ? 'Mobile POS' : 'Desktop Till'}
                          </Td>
                          <Td mono className="text-[12px]">
                            {new Date(session.login_time).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Td>
                          <Td mono className="text-[12px]">
                            {isOnline ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase bg-[var(--ok-soft)] border-[var(--ok-line)] text-[var(--ok)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] animate-ping" />
                                Online Now
                              </span>
                            ) : (
                              new Date(session.logout_time!).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            )}
                          </Td>
                          <Td align="right" mono className="font-bold">
                            <span className={isOnline ? 'text-[var(--ok)]' : 'text-[var(--text-primary)]'}>
                              {formatDuration(session.duration, session.logout_time)}
                            </span>
                          </Td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* ── TAB 2: LEAVE CALENDAR ──────────────────────────────────────────── */}
      {activeTab === 'calendar' && (
        <div className="grid gap-[14px] grid-cols-1 lg:grid-cols-[1fr_340px] items-start">
          {/* Calendar Grid */}
          <Panel
            label="Monthly Leave & Store Holiday Grid"
            right={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="w-7 h-7 rounded-md border border-[var(--border2)] bg-[var(--sub)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="Previous month"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-[12.5px] font-bold text-[var(--text-primary)] px-2" style={{ fontFamily: MONO }}>
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="w-7 h-7 rounded-md border border-[var(--border2)] bg-[var(--sub)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="Next month"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            }
          >
            {/* Day of week headers */}
            <div className="grid grid-cols-7 gap-1.5 mb-2 text-center">
              {dayLabels.map(d => (
                <div
                  key={d}
                  className="text-[10px] font-bold uppercase text-[var(--text-muted)] py-1"
                  style={{ fontFamily: MONO, letterSpacing: '0.08em' }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Date cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, idx) => {
                if (cell.day === null || cell.dateStr === null) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="min-h-[76px] rounded-lg border border-transparent bg-transparent opacity-20"
                    />
                  );
                }

                const dayLeaves = leaves.filter(l => l.date === cell.dateStr);
                const isSelected = selectedDateStr === cell.dateStr;
                const isToday =
                  new Date().toISOString().slice(0, 10) === cell.dateStr;

                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => setSelectedDateStr(cell.dateStr!)}
                    className={`min-h-[76px] p-2 rounded-lg border text-left flex flex-col justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : isToday
                          ? 'border-[var(--border2)] bg-[var(--sub)]'
                          : 'border-[var(--rule2)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[12px] font-bold ${
                          isSelected
                            ? 'text-[var(--primary)]'
                            : isToday
                              ? 'text-[var(--ok)] font-extrabold'
                              : 'text-[var(--text-primary)]'
                        }`}
                        style={{ fontFamily: MONO }}
                      >
                        {cell.day}
                      </span>
                      {isToday && (
                        <span className="text-[9px] font-bold uppercase text-[var(--ok)]" style={{ fontFamily: MONO }}>
                          Today
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 mt-1">
                      {dayLeaves.map(leave => (
                        <div
                          key={leave.id}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold truncate ${
                            leave.type === 'holiday'
                              ? 'bg-[var(--accent-soft2)] text-[var(--primary)] border border-[var(--accent-line)]'
                              : 'bg-[var(--warn-soft)] text-[var(--warn)] border border-[var(--warn-line)]'
                          }`}
                          style={{ fontFamily: MONO }}
                          title={`${leave.user_name}: ${leave.reason || leave.type}`}
                        >
                          {leave.type === 'holiday' ? '🎉 Holiday' : `👤 ${leave.user_name}`}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Date Details & Actions Sidebar */}
          <Panel label={`Selected Date: ${selectedDateStr}`}>
            <div className="space-y-4">
              <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--sub)]">
                <div className="text-[11px] font-bold uppercase text-[var(--text-muted)]" style={{ fontFamily: MONO }}>
                  Scheduled for this day
                </div>
                <div className="text-[14px] font-bold text-[var(--text-primary)] mt-1">
                  {selectedDateStr
                    ? new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-IN', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : 'No date selected'}
                </div>
              </div>

              {leavesForSelectedDate.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)] text-[12.5px]">
                  No holidays or leaves scheduled for this date.
                </div>
              ) : (
                <div className="space-y-2">
                  {leavesForSelectedDate.map(l => (
                    <div
                      key={l.id}
                      className="p-3 rounded-lg border border-[var(--border2)] bg-[var(--sub)] flex items-start justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Pill tone={l.type === 'holiday' ? 'accent' : 'warn'}>
                            {l.type === 'holiday' ? 'Store Holiday' : 'Staff Leave'}
                          </Pill>
                          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                            {l.user_name}
                          </span>
                        </div>
                        <p className="text-[12px] text-[var(--text-secondary)] mt-1.5">
                          {l.reason || 'No description provided'}
                        </p>
                      </div>

                      {isOwner() && (
                        <button
                          type="button"
                          onClick={() => handleRevokeLeave(l.id)}
                          className="w-7 h-7 rounded border border-[var(--border2)] flex items-center justify-center text-[var(--danger)] hover:bg-[var(--danger-soft)] cursor-pointer shrink-0"
                          title="Revoke scheduled leave"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isOwner() && (
                <Button
                  variant="primary"
                  full
                  onClick={() => setShowScheduleModal(true)}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <Plus size={14} />
                    <span>Assign on this date</span>
                  </span>
                </Button>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* Schedule Leave / Store Holiday Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-[12px] shadow-2xl overflow-hidden flex flex-col">
            <header className="h-[50px] px-5 bg-[var(--sub)] border-b border-[var(--rule2)] flex items-center justify-between">
              <div className="text-[13px] font-bold text-[var(--text-primary)]">
                Schedule Leave / Holiday
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="text-[18px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                ×
              </button>
            </header>

            <form onSubmit={handleScheduleSubmit} className="p-5 space-y-4">
              {/* Type Selection */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)] mb-2" style={{ fontFamily: MONO }}>
                  Assignment Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewLeaveType('holiday')}
                    className={`h-[42px] px-3 rounded-lg border text-[12.5px] font-bold cursor-pointer transition-colors ${
                      newLeaveType === 'holiday'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--primary)]'
                        : 'border-[var(--border2)] bg-[var(--sub)] text-[var(--text-secondary)]'
                    }`}
                  >
                    🎉 Store Holiday
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewLeaveType('leave')}
                    className={`h-[42px] px-3 rounded-lg border text-[12.5px] font-bold cursor-pointer transition-colors ${
                      newLeaveType === 'leave'
                        ? 'border-[var(--warn-line)] bg-[var(--warn-soft)] text-[var(--warn)]'
                        : 'border-[var(--border2)] bg-[var(--sub)] text-[var(--text-secondary)]'
                    }`}
                  >
                    👤 Staff Leave
                  </button>
                </div>
              </div>

              {/* Staff Selector (if employee leave) */}
              {newLeaveType === 'leave' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)] mb-1.5" style={{ fontFamily: MONO }}>
                    Staff Member
                  </label>
                  <select
                    value={newLeaveUserId}
                    onChange={e => setNewLeaveUserId(e.target.value)}
                    className="w-full h-[44px] px-3 rounded-lg border border-[var(--border2)] bg-[var(--sub)] text-[13.5px] font-semibold text-[var(--text-primary)] cursor-pointer"
                    required
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)] mb-1.5" style={{ fontFamily: MONO }}>
                  Scheduled Date
                </label>
                <input
                  type="date"
                  value={selectedDateStr}
                  onChange={e => setSelectedDateStr(e.target.value)}
                  className="w-full h-[44px] px-3 rounded-lg border border-[var(--border2)] bg-[var(--sub)] text-[13.5px] font-semibold text-[var(--text-primary)]"
                  style={{ fontFamily: MONO }}
                  required
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)] mb-1.5" style={{ fontFamily: MONO }}>
                  Reason / Description
                </label>
                <input
                  type="text"
                  value={newLeaveReason}
                  onChange={e => setNewLeaveReason(e.target.value)}
                  placeholder={newLeaveType === 'holiday' ? 'e.g. Diwali Festival' : 'e.g. Vacation / Medical Leave'}
                  className="w-full h-[44px] px-3 rounded-lg border border-[var(--border2)] bg-[var(--sub)] text-[13.5px] text-[var(--text-primary)]"
                  required
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <Button
                  variant="secondary"
                  full
                  onClick={() => setShowScheduleModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  full
                  disabled={submittingLeave}
                >
                  {submittingLeave ? 'Saving...' : 'Confirm Schedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SectorPage>
  );
}
