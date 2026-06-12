import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth, User, LoginSession, BreakRecord } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { SavedBill } from './cashier-billing-advanced';
import { api } from '../utils/api';
import { useWebSocket } from '../hooks/useWebSocket';
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

  // Summary metrics
  const summaryMetrics = useMemo(() => {
    const activeEmployees = employeeMetrics.filter(m => m.isActive).length;
    const totalBills = employeeMetrics.reduce((sum, m) => sum + m.billsToday, 0);
    const topPerformer = employeeMetrics.reduce((top, current) => 
      current.totalSales > (top?.totalSales || 0) ? current : top
    , employeeMetrics[0]);

    return {
      activeEmployees,
      totalBills,
      topPerformer,
    };
  }, [employeeMetrics]);

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!isOwner()) {
    return (
      <div className={`p-8 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} h-full`}>
        <div className={`${darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'} border rounded-lg p-6 text-center`}>
          <p className={`${darkMode ? 'text-red-400' : 'text-red-700'}`}>
            Access Denied. Only owners can view employee performance.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`p-8 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-800'} h-full flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading employee performance metrics...</p>
        </div>
      </div>
    );
  }

  if (selectedEmployee) {
    const metrics = employeeMetrics.find(m => m.employee.id === selectedEmployee.id);
    if (!metrics) return null;

    // Prepare chart data for employee sales
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
      <div className={`p-8 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} h-full flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className="mb-8 flex-shrink-0">
          <button
            onClick={() => setSelectedEmployee(null)}
            className={`mb-4 px-4 py-2 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'} rounded-lg transition-colors`}
          >
            ← Back to Overview
          </button>
          <h1 className={`text-4xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>
            {metrics.employee.name}
          </h1>
          <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Employee Performance Details
          </p>
        </div>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 min-h-0">
          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <MetricCard
              title="Bills Generated"
              value={metrics.billsToday.toString()}
              icon={<Receipt size={24} />}
              color="from-blue-500 to-blue-600"
              darkMode={darkMode}
            />
            <MetricCard
              title="Total Sales"
              value={`₹${metrics.totalSales.toFixed(2)}`}
              icon={<DollarSign size={24} />}
              color="from-green-500 to-green-600"
              darkMode={darkMode}
            />
            <MetricCard
              title="Working Time"
              value={formatDuration(metrics.workingDuration)}
              icon={<Clock size={24} />}
              color="from-purple-500 to-purple-600"
              darkMode={darkMode}
            />
            <MetricCard
              title="Break Time"
              value={formatDuration(metrics.breakDuration)}
              icon={<Coffee size={24} />}
              color="from-orange-500 to-orange-600"
              darkMode={darkMode}
            />
          </div>

          {/* Sales Chart */}
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6 mb-8`}>
            <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4`}>
              Sales by Hour
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesByHour.filter(d => d.sales > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
                <XAxis dataKey="hour" stroke={darkMode ? '#9ca3af' : '#6b7280'} />
                <YAxis stroke={darkMode ? '#9ca3af' : '#6b7280'} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: darkMode ? '#1f2937' : '#fff',
                    border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="sales" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Today's Login Sessions */}
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6 mb-8`}>
            <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4`}>
              Today's Login Sessions
            </h3>
            <div className="space-y-3">
              {metrics.todaySessions.length === 0 ? (
                <p className={`${darkMode ? 'text-gray-500' : 'text-gray-500'} text-center py-4`}>
                  No login sessions today
                </p>
              ) : (
                metrics.todaySessions.map((session, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}
                  >
                    <div className="flex items-center gap-4">
                      <LogIn className="text-green-500" size={20} />
                      <div>
                        <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                          Login: {formatTime(session.loginTime)}
                        </p>
                        {session.logoutTime && (
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Logout: {formatTime(session.logoutTime)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {session.duration ? (
                        <p className={`font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {formatDuration(session.duration)}
                        </p>
                      ) : (
                        <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                          Active Now
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Today's Breaks */}
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
            <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4`}>
              Today's Breaks
            </h3>
            <div className="space-y-3">
              {metrics.todayBreaks.length === 0 ? (
                <p className={`${darkMode ? 'text-gray-500' : 'text-gray-500'} text-center py-4`}>
                  No breaks taken today
                </p>
              ) : (
                metrics.todayBreaks.map((breakRecord, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}
                  >
                    <div className="flex items-center gap-4">
                      <Coffee className="text-orange-500" size={20} />
                      <div>
                        <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                          Start: {formatTime(breakRecord.startTime)}
                        </p>
                        {breakRecord.endTime && (
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            End: {formatTime(breakRecord.endTime)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {breakRecord.duration ? (
                        <p className={`font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {formatDuration(breakRecord.duration)}
                        </p>
                      ) : (
                        <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full text-xs font-medium">
                          On Break
                        </span>
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
    <div className={`p-8 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} h-full flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className="mb-8 flex-shrink-0">
        <h1 className={`text-4xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>
          Employee Performance
        </h1>
        <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Monitor employee productivity and activity
        </p>
      </div>

      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2 min-h-0">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-lg">
                <Activity size={24} className="text-white" />
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Active Employees
                </p>
                <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  {summaryMetrics.activeEmployees}
                </p>
              </div>
            </div>
          </div>

          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                <Receipt size={24} className="text-white" />
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Total Bills Today
                </p>
                <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  {summaryMetrics.totalBills}
                </p>
              </div>
            </div>
          </div>

          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg">
                <Trophy size={24} className="text-white" />
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Top Performer
                </p>
                <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  {summaryMetrics.topPerformer?.employee.name || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Employee Table */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm overflow-hidden mb-2`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                <tr>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Employee
                  </th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Status
                  </th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Bills Today
                  </th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Total Sales
                  </th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Avg Bill
                  </th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Working Time
                  </th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Break Time
                  </th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {employeeMetrics.map((metrics) => (
                  <tr
                    key={metrics.employee.id}
                    className={`${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} transition-colors`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {summaryMetrics.topPerformer?.employee.id === metrics.employee.id && (
                          <Trophy className="text-yellow-500" size={18} />
                        )}
                        <div>
                          <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                            {metrics.employee.name}
                          </p>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {metrics.employee.username}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          metrics.isOnBreak
                            ? 'bg-amber-105 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 animate-pulse'
                            : metrics.isActive
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {metrics.isOnBreak ? 'On Break' : metrics.isActive ? 'Active' : 'Offline'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {metrics.billsToday}
                    </td>
                    <td className={`px-6 py-4 font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                      ₹{metrics.totalSales.toFixed(2)}
                    </td>
                    <td className={`px-6 py-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      ₹{metrics.avgBillValue.toFixed(2)}
                    </td>
                    <td className={`px-6 py-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {formatDuration(metrics.workingDuration)}
                    </td>
                    <td className={`px-6 py-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {formatDuration(metrics.breakDuration)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedEmployee(metrics.employee)}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
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
                <p className={`${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
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
  darkMode: boolean;
}

function MetricCard({ title, value, icon, color, darkMode }: MetricCardProps) {
  return (
    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
      <div className="flex items-center gap-4">
        <div className={`p-3 bg-gradient-to-br ${color} rounded-lg`}>
          {icon}
        </div>
        <div>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{title}</p>
          <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
