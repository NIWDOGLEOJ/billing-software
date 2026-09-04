import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth, User, LoginSession, BreakRecord } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { SavedBill } from './cashier-billing-advanced';
import { api } from '../utils/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { updatePointerGlare, SpecularGlareOverlay } from '../utils/glare';
import {
  Trophy,
  TrendingUp,
  Clock,
  Coffee,
  DollarSign,
  Receipt,
  ShoppingCart,
  User as UserIcon,
  LogIn,
  LogOut,
  Award,
  Activity,
  Calendar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface EmployeeMetrics {
  employee: User;
  billsToday: number;
  totalSales: number;
  avgBillValue: number;
  loginTime: string;
  logoutTime: string | null;
  workingDuration: number;
  breakDuration: number;
  isActive: boolean;
  todaySessions: LoginSession[];
  todayBreaks: BreakRecord[];
}

export function EmployeePerformance() {
  const { isOwner } = useAuth();
  const { darkMode } = useTheme();
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month'>('today');

  // React State variables to store backend database synchronizations
  const [employees, setEmployees] = useState<User[]>([]);
  const [bills, setBills] = useState<SavedBill[]>([]);
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [breaks, setBreaks] = useState<BreakRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all employee performance data from local Express LAN server
  const loadPerformanceData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersData, billsData, sessionsData, breaksData] = await Promise.all([
        api.get<any[]>('/users'),
        api.get<any[]>('/bills'),
        api.get<any[]>('/users/sessions'),
        api.get<any[]>('/users/breaks')
      ]);

      const employeeUsers = usersData
        .filter(u => u.role === 'employee' && u.is_active)
        .map(u => ({
          id: u.id,
          username: u.username,
          email: u.email || '',
          name: u.name,
          role: u.role,
          permissions: u.permissions || [],
          phone: u.phone || '',
          createdAt: u.created_at || '',
          isActive: u.is_active
        }));

      const mappedBills = billsData.map(b => ({
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

      const mappedSessions = sessionsData.map(s => ({
        id: s.id,
        userId: s.user_id,
        userName: s.user_name,
        loginTime: s.login_time,
        logoutTime: s.logout_time,
        duration: s.duration ? s.duration * 1000 : null // Convert seconds to milliseconds
      }));

      const mappedBreaks = breaksData.map(b => ({
        id: b.id,
        userId: b.user_id,
        userName: b.user_name,
        startTime: b.start_time,
        endTime: b.end_time,
        duration: b.duration ? b.duration * 1000 : null // Convert seconds to milliseconds
      }));

      setEmployees(employeeUsers);
      setBills(mappedBills);
      setSessions(mappedSessions);
      setBreaks(mappedBreaks);
    } catch (err) {
      console.error('Failed to load employee performance metrics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner()) {
      loadPerformanceData();
    } else {
      setLoading(false);
    }
  }, [isOwner, loadPerformanceData]);

  // Real-time WebSocket updates for shifts, breaks, sessions, and sales
  useWebSocket({
    BREAK_CHANGED: () => {
      loadPerformanceData();
    },
    SHIFT_CHANGED: () => {
      loadPerformanceData();
    },
    SESSION_CHANGED: () => {
      loadPerformanceData();
    },
    BILL_CREATED: () => {
      loadPerformanceData();
    }
  });

  // Calculate metrics for each employee
  const employeeMetrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return employees.map((employee): EmployeeMetrics => {
      // Filter today's sessions
      const todaySessions = sessions.filter(s => {
        const sessionDate = new Date(s.loginTime);
        sessionDate.setHours(0, 0, 0, 0);
        return s.userId === employee.id && sessionDate.getTime() === today.getTime();
      });

      // Filter today's breaks
      const todayBreaks = breaks.filter(b => {
        const breakDate = new Date(b.startTime);
        breakDate.setHours(0, 0, 0, 0);
        return b.userId === employee.id && breakDate.getTime() === today.getTime();
      });

      // Filter today's bills (bills created by this employee)
      const todayBills = bills.filter(bill => {
        const billDate = new Date(bill.date);
        billDate.setHours(0, 0, 0, 0);
        return bill.generatedBy === employee.id && billDate.getTime() === today.getTime();
      });

      // Calculate metrics
      const totalSales = todayBills.reduce((sum, bill) => sum + bill.total, 0);
      const avgBillValue = todayBills.length > 0 ? totalSales / todayBills.length : 0;

      // Working duration
      const workingDuration = todaySessions.reduce((sum, session) => {
        if (session.duration) {
          return sum + session.duration;
        } else if (!session.logoutTime) {
          // Still logged in
          return sum + (new Date().getTime() - new Date(session.loginTime).getTime());
        }
        return sum;
      }, 0);

      // Break duration
      const breakDuration = todayBreaks.reduce((sum, breakRecord) => {
        if (breakRecord.duration) {
          return sum + breakRecord.duration;
        } else if (!breakRecord.endTime) {
          // Currently on break
          return sum + (new Date().getTime() - new Date(breakRecord.startTime).getTime());
        }
        return sum;
      }, 0);

      // Current status
      const activeSession = todaySessions.find(s => !s.logoutTime);
      const isActive = !!activeSession;
      const isOnBreak = todayBreaks.some(b => !b.endTime);

      return {
        employee,
        billsToday: todayBills.length,
        totalSales,
        avgBillValue,
        loginTime: todaySessions[0]?.loginTime || '',
        logoutTime: todaySessions[todaySessions.length - 1]?.logoutTime || null,
        workingDuration,
        breakDuration,
        isActive,
        isOnBreak,
        todaySessions,
        todayBreaks,
      };
    });
  }, [employees, bills, sessions, breaks]);

  const summaryMetrics = useMemo(() => {
    const activeEmployees = employeeMetrics.filter((m) => m.isActive).length;
    const totalBills = employeeMetrics.reduce((acc, m) => acc + m.billsToday, 0);
    const topPerformer = [...employeeMetrics].sort((a, b) => b.totalSales - a.totalSales)[0];

    return {
      activeEmployees,
      totalBills,
      topPerformer,
    };
  }, [employeeMetrics]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (!isOwner()) {
    return (
      <div className="p-8 bg-[var(--bg-glass)] text-[var(--text-primary)] h-full">
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-6 text-center text-rose-500 font-bold">
          <p>
            Access Denied. Only owners can view employee performance.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 bg-[var(--bg-glass)] text-[var(--text-primary)] h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--primary-accent)] mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading employee performance metrics...</p>
        </div>
      </div>
    );
  }

  if (selectedEmployee) {
    const metrics = employeeMetrics.find(m => m.employee.id === selectedEmployee.id);
    if (!metrics) return null;

    const salesByHour = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      sales: 0,
    }));

    bills
      .filter(b => b.generatedBy === selectedEmployee.id)
      .forEach(bill => {
        const hour = new Date(bill.date).getHours();
        salesByHour[hour].sales += bill.total;
      });

    return (
      <div className="p-8 bg-[var(--bg-glass)] text-[var(--text-primary)] h-full flex flex-col overflow-hidden">
        <div className="mb-8 flex-shrink-0">
          <button
            onClick={() => setSelectedEmployee(null)}
            className="mb-4 px-4 py-2 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] hover:bg-[var(--bg-glass)] rounded-lg transition-all font-medium active:scale-[0.97] cursor-pointer shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6)]"
          >
            ← Back to Overview
          </button>
          <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-2">
            {metrics.employee.name}
          </h1>
          <p className="text-muted-foreground">
            Employee Performance Details
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <MetricCard
              title="Bills Generated"
              value={metrics.billsToday.toString()}
              icon={<Receipt size={24} />}
              color="from-blue-500 to-blue-600"
            />
            <MetricCard
              title="Total Sales"
              value={`₹${metrics.totalSales.toFixed(2)}`}
              icon={<DollarSign size={24} />}
              color="from-emerald-500 to-teal-600"
            />
            <MetricCard
              title="Working Time"
              value={formatDuration(metrics.workingDuration)}
              icon={<Clock size={24} />}
              color="from-purple-500 to-purple-600"
            />
            <MetricCard
              title="Break Time"
              value={formatDuration(metrics.breakDuration)}
              icon={<Coffee size={24} />}
              color="from-amber-500 to-amber-600"
            />
          </div>

          <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-6 mb-8">
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-4">
              Sales by Hour
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesByHour.filter(d => d.sales > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" />
                <XAxis dataKey="hour" stroke="var(--text-muted)" />
                <YAxis stroke="var(--text-muted)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                  }}
                />
                <Bar dataKey="sales" fill={accentColor || "var(--primary-accent)"} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-6 mb-8">
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-4">
              Today's Login Sessions
            </h3>
            <div className="space-y-3">
              {metrics.todaySessions.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No login sessions today
                </p>
              ) : (
                metrics.todaySessions.map((session, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-[var(--input-bg)] border border-[var(--border-glass)] rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <LogIn className="text-emerald-500" size={20} />
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          Login: {new Date(session.loginTime).toLocaleTimeString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {session.logoutTime
                            ? `Logout: ${new Date(session.logoutTime).toLocaleTimeString()}`
                            : 'Currently Active'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-[var(--text-primary)]">
                        Duration: {session.duration ? formatDuration(session.duration) : 'Active'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.breaks ? `${session.breaks.length} breaks` : 'No breaks'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-6">
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-4">
              Break Details
            </h3>
            <div className="space-y-3">
              {metrics.todaySessions.flatMap((s) => s.breaks || []).length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No breaks taken today
                </p>
              ) : (
                metrics.todaySessions
                  .flatMap((s) => s.breaks || [])
                  .map((breakItem, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-[var(--input-bg)] border border-[var(--border-glass)] rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <Coffee className="text-amber-500" size={20} />
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">
                            Start: {new Date(breakItem.startTime).toLocaleTimeString()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {breakItem.endTime
                              ? `End: ${new Date(breakItem.endTime).toLocaleTimeString()}`
                              : 'Ongoing Break'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-[var(--text-primary)]">
                          Duration: {breakItem.duration ? formatDuration(breakItem.duration) : 'Ongoing'}
                        </p>
                        {breakItem.reason && (
                          <p className="text-sm text-muted-foreground">
                            Reason: {breakItem.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[var(--bg-glass)] text-[var(--text-primary)] h-full flex flex-col overflow-hidden">
      <div className="mb-8 flex-shrink-0">
        <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-2">
          Employee Performance
        </h1>
        <p className="text-muted-foreground">
          Monitor employee productivity and activity
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2 min-h-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div 
            onPointerMove={updatePointerGlare}
            className="group relative glass-panel backdrop-blur-xl backdrop-saturate-200 border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] p-6 overflow-hidden transition-all hover:-translate-y-1"
          >
            <SpecularGlareOverlay />
            <div className="relative z-10 flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg">
                <Activity size={24} className="text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Active Employees
                </p>
                <p className="text-3xl font-bold text-[var(--text-primary)]">
                  {summaryMetrics.activeEmployees}
                </p>
              </div>
            </div>
          </div>

          <div 
            onPointerMove={updatePointerGlare}
            className="group relative glass-panel backdrop-blur-xl backdrop-saturate-200 border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] p-6 overflow-hidden transition-all hover:-translate-y-1"
          >
            <SpecularGlareOverlay />
            <div className="relative z-10 flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                <Receipt size={24} className="text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Total Bills Today
                </p>
                <p className="text-3xl font-bold text-[var(--text-primary)]">
                  {summaryMetrics.totalBills}
                </p>
              </div>
            </div>
          </div>

          <div 
            onPointerMove={updatePointerGlare}
            className="group relative glass-panel backdrop-blur-xl backdrop-saturate-200 border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] p-6 overflow-hidden transition-all hover:-translate-y-1"
          >
            <SpecularGlareOverlay />
            <div className="relative z-10 flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg">
                <Trophy size={24} className="text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Top Performer
                </p>
                <p className="text-xl font-bold text-[var(--text-primary)]">
                  {summaryMetrics.topPerformer?.employee.name || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel backdrop-blur-xl backdrop-saturate-200 border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] overflow-hidden mb-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--input-bg)] border-b border-[var(--border-glass)] text-[var(--text-primary)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6)]">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold">
                    Employee
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">
                    Bills Today
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">
                    Total Sales
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">
                    Avg Bill
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">
                    Working Time
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">
                    Break Time
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-glass)]">
                {employeeMetrics.map((metrics) => (
                  <tr
                    key={metrics.employee.id}
                    className="hover:bg-[var(--input-bg)]/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {summaryMetrics.topPerformer?.employee.id === metrics.employee.id && (
                          <Trophy className="text-amber-500" size={18} />
                        )}
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">
                            {metrics.employee.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {metrics.employee.username}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          metrics.isOnBreak
                            ? 'bg-amber-500/20 text-amber-500 animate-pulse'
                            : metrics.isActive
                              ? 'bg-emerald-500/20 text-emerald-500'
                              : 'bg-[var(--input-bg)] text-muted-foreground'
                        }`}
                      >
                        {metrics.isOnBreak ? 'On Break' : metrics.isActive ? 'Active' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[var(--text-primary)]">
                      {metrics.billsToday}
                    </td>
                    <td className="px-6 py-4 font-medium text-[var(--text-primary)]">
                      ₹{metrics.totalSales.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-[var(--text-primary)]">
                      ₹{metrics.avgBillValue.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-[var(--text-primary)]">
                      {formatDuration(metrics.workingDuration)}
                    </td>
                    <td className="px-6 py-4 text-[var(--text-primary)]">
                      {formatDuration(metrics.breakDuration)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedEmployee(metrics.employee)}
                        className="liquid-glass-button text-white text-sm font-medium px-4 py-2 rounded-lg transition-all shadow-sm active:scale-[0.97] cursor-pointer"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {employeeMetrics.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No active employees found
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

function MetricCard({ title, value, icon, color }: MetricCardProps) {
  return (
    <div 
      onPointerMove={updatePointerGlare}
      className="group relative glass-panel backdrop-blur-xl backdrop-saturate-200 border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] p-6 overflow-hidden transition-all hover:-translate-y-1"
    >
      <SpecularGlareOverlay />
      <div className="relative z-10 flex items-center gap-4">
        <div className={`p-3 bg-gradient-to-br ${color} rounded-lg text-white shadow-md`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
        </div>
      </div>
    </div>
  );
}
