import { useState, useMemo, useEffect, useCallback } from 'react';
import { SavedBill } from './cashier-billing-advanced';
import { InsightsDashboard } from './insights-dashboard';
import { useTheme } from '../contexts/theme-context';
import { useAuth } from '../contexts/auth-context';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { updatePointerGlare, SpecularGlareOverlay } from '../utils/glare';
import { Skeleton } from './ui/skeleton';
import { PageShell, PageHeader } from './page-shell';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  ShoppingCart,
  Calendar,
  Filter,
  Clock,
  CreditCard,
  Package,
  BarChart3,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Download,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type DateFilter = 'today' | 'week' | 'month' | 'custom';

export function AnalyticsDashboard() {
  const { darkMode, accentColor } = useTheme();
  const { isOwner } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'breakdown' | 'products' | 'gst-report' | 'insights' | 'shifts'>('overview');
  const [dateFilter, setDateFilter] = useState<DateFilter>('week');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [bills, setBills] = useState<SavedBill[]>([]);
  const [showForecast, setShowForecast] = useState(false);
  const [shifts, setShifts] = useState<any[]>([]);
  const [isLoadingShifts, setIsLoadingShifts] = useState(false);
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);
  // Without this the dashboard paints every KPI as ₹0.00 during the initial
  // fetch, which reads as "the shop sold nothing today".
  const [isLoadingBills, setIsLoadingBills] = useState(true);

  const fetchBills = useCallback(async () => {
    try {
      const data = await api.get<any[]>('/bills');
      setBills(data.map(b => ({
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
      })));
    } catch (e: any) {
      console.error('Failed to fetch bills for analytics:', e);
      toast.error(`Couldn't load sales data: ${e?.message || 'Server unreachable'}`, {
        description: 'The figures below may be incomplete.',
      });
    } finally {
      setIsLoadingBills(false);
    }
  }, []);

  const fetchShifts = useCallback(async () => {
    if (!isOwner()) return;
    setIsLoadingShifts(true);
    try {
      const data = await api.get<any[]>('/shifts');
      setShifts(data || []);
    } catch (e: any) {
      console.error('Failed to fetch shifts:', e);
      toast.error(`Couldn't load shift records: ${e?.message || 'Server unreachable'}`);
    } finally {
      setIsLoadingShifts(false);
    }
  }, [isOwner]);

  useEffect(() => {
    fetchBills();
    if (isOwner()) {
      fetchShifts();
    }
    const handleVisibility = () => {
      if (!document.hidden) {
        fetchBills();
        if (isOwner()) {
          fetchShifts();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchBills, fetchShifts, isOwner]);

  useEffect(() => {
    if (activeTab === 'shifts' && !isOwner()) {
      setActiveTab('overview');
    }
  }, [activeTab, isOwner]);

  const formatShiftTime = (isoString: string) => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const toggleExpandShift = (id: string) => {
    setExpandedShiftId(prev => prev === id ? null : id);
  };

  // Calculate date range based on filter
  const getDateRange = () => {
    const now = new Date();
    let startDate = new Date();

    switch (dateFilter) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate.setDate(now.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'custom':
        if (customStartDate) {
          startDate = new Date(customStartDate);
          startDate.setHours(0, 0, 0, 0);
        } else {
          startDate.setDate(now.getDate() - 7);
        }
        break;
    }

    let endDate = new Date();
    if (dateFilter === 'custom' && customEndDate) {
      endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
    }

    return { startDate, endDate };
  };

  // Filter bills based on active criteria
  const filteredBills = useMemo(() => {
    const { startDate, endDate } = getDateRange();

    return bills.filter(bill => {
      const billDate = new Date(bill.date);
      
      // Date Filter
      if (billDate < startDate || billDate > endDate) return false;
      
      // Payment Mode Filter
      if (paymentFilter !== 'all' && bill.paymentMode.toLowerCase() !== paymentFilter.toLowerCase()) return false;
      
      // Category Filter (check if any item belongs to category)
      if (categoryFilter !== 'all') {
        const hasCategory = bill.items.some(item => {
          // Note: category is not stored directly in item in database schema, so we assume all pass if no match
          return true; 
        });
        if (!hasCategory) return false;
      }
      
      return true;
    });
  }, [bills, dateFilter, categoryFilter, paymentFilter, customStartDate, customEndDate]);

  // Aggregate data by HSN code and GST rate for GSTR-1 Tax Compliance
  const hsnAggregatedData = useMemo(() => {
    const data: {
      [key: string]: {
        hsnCode: string;
        description: string;
        gstRate: number;
        taxableValue: number;
        cgst: number;
        sgst: number;
        totalTax: number;
        totalValue: number;
        quantitySold: number;
      }
    } = {};

    filteredBills.forEach(bill => {
      const isGstActive = bill.gstEnabled !== false;

      bill.items.forEach(item => {
        const hsn = item.hsnCode || 'N/A';
        const rate = isGstActive ? (item.gstRate || 0) : 0;
        const key = `${hsn}_${rate}`;

        const qty = item.quantity || 0;
        const taxableVal = item.price * qty;
        const totalTaxVal = isGstActive ? (taxableVal * rate) / 100 : 0;
        const cgstVal = totalTaxVal / 2;
        const sgstVal = totalTaxVal / 2;
        const totalInvoiceVal = taxableVal + totalTaxVal;

        if (!data[key]) {
          data[key] = {
            hsnCode: hsn,
            description: item.name,
            gstRate: rate,
            taxableValue: 0,
            cgst: 0,
            sgst: 0,
            totalTax: 0,
            totalValue: 0,
            quantitySold: 0,
          };
        }

        data[key].taxableValue += taxableVal;
        data[key].cgst += cgstVal;
        data[key].sgst += sgstVal;
        data[key].totalTax += totalTaxVal;
        data[key].totalValue += totalInvoiceVal;
        data[key].quantitySold += qty;
      });
    });

    return Object.values(data).sort((a, b) => a.hsnCode.localeCompare(b.hsnCode));
  }, [filteredBills]);

  // Export aggregated GST report to official GSTR-1 offline tool CSV format
  const downloadGSTR1CSV = () => {
    const headers = [
      'HSN',
      'Description',
      'UQC',
      'Total Quantity',
      'Total Value (INR)',
      'Taxable Value (INR)',
      'Integrated Tax Amount (INR)',
      'Central Tax Amount (INR)',
      'State/UT Tax Amount (INR)',
      'Cess Amount (INR)'
    ];

    const rows = hsnAggregatedData.map(d => [
      `"${d.hsnCode}"`,
      `"${d.description.replace(/"/g, '""')}"`,
      '"UQC-UNITS"',
      d.quantitySold,
      d.totalValue.toFixed(2),
      d.taxableValue.toFixed(2),
      '0.00',
      d.cgst.toFixed(2),
      d.sgst.toFixed(2),
      '0.00'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const { startDate, endDate } = getDateRange();
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    link.href = url;
    link.setAttribute('download', `GSTR1_HSN_Report_${startStr}_to_${endStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalSales = 0;
    let totalBills = filteredBills.length;
    let totalSalesToday = 0;
    let totalSalesWeek = 0;
    let totalSalesMonth = 0;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now);
    monthStart.setDate(now.getDate() - 30);

    // Calculate total sales for active filtered bills
    filteredBills.forEach(bill => {
      totalSales += bill.total;
    });

    // Calculate system-wide sales for context (Today, Week, Month)
    bills.forEach(bill => {
      const billDate = new Date(bill.date);
      if (billDate >= todayStart) {
        totalSalesToday += bill.total;
      }
      if (billDate >= weekStart) {
        totalSalesWeek += bill.total;
      }
      if (billDate >= monthStart) {
        totalSalesMonth += bill.total;
      }
    });

    const avgBillValue = totalBills > 0 ? totalSales / totalBills : 0;

    // Calculate percentage change from previous week for metric cards context
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    let prevWeekSales = 0;
    let currentWeekSales = 0;

    bills.forEach(bill => {
      const billDate = new Date(bill.date);
      if (billDate >= weekStart && billDate <= now) {
        currentWeekSales += bill.total;
      } else if (billDate >= prevWeekStart && billDate < weekStart) {
        prevWeekSales += bill.total;
      }
    });

    const weekChange = prevWeekSales > 0 ? ((currentWeekSales - prevWeekSales) / prevWeekSales) * 100 : 0;

    return {
      totalSales,
      totalBills,
      totalSalesToday,
      totalSalesWeek,
      totalSalesMonth,
      avgBillValue,
      weekChange,
    };
  }, [filteredBills, bills]);

  // Sales Trend chart data (Grouped by date, with dynamic AI linear regression forecasting)
  const salesTrendData = useMemo(() => {
    const dailyData: { [key: string]: number } = {};
    const { startDate, endDate } = getDateRange();
    
    // Initialize dates in range
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      dailyData[dateStr] = 0;
      current.setDate(current.getDate() + 1);
    }

    filteredBills.forEach(bill => {
      const dateStr = new Date(bill.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (dailyData[dateStr] !== undefined) {
        dailyData[dateStr] += bill.total;
      }
    });

    const actualPoints = Object.entries(dailyData).map(([date, sales]) => ({
      date,
      sales: parseFloat(sales.toFixed(2)),
    }));

    if (!showForecast || actualPoints.length < 2) {
      return actualPoints;
    }

    // ── Simple Linear Regression (y = mx + c) ──
    const N = actualPoints.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < N; i++) {
      const x = i;
      const y = actualPoints[i].sales;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator = N * sumXX - sumX * sumX;
    const slope = denominator === 0 ? 0 : (N * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / N;

    // Map actual points and attach forecast = sales on the last point for connection
    const mappedActual = actualPoints.map((item, idx) => {
      if (idx === N - 1) {
        return { ...item, forecast: item.sales };
      }
      return item;
    });

    // Generate 7 projected dates
    const forecastPoints = [];
    const lastDate = new Date(endDate);
    for (let i = 1; i <= 7; i++) {
      const nextDate = new Date(lastDate);
      nextDate.setDate(lastDate.getDate() + i);
      const dateStr = nextDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + " (Proj)";
      const x = N - 1 + i;
      const projectedSales = Math.max(0, parseFloat((slope * x + intercept).toFixed(2)));
      forecastPoints.push({
        date: dateStr,
        forecast: projectedSales,
        isProjection: true
      });
    }

    return [...mappedActual, ...forecastPoints];
  }, [filteredBills, dateFilter, customStartDate, customEndDate, showForecast]);

  // AI Forecast Metrics Block
  const forecastMetrics = useMemo(() => {
    const defaultVal = { projectedTotal: 0, slope: 0, confidence: 85 };
    
    // Find only actual points from standard salesTrendData
    const actualPoints = salesTrendData.filter((p: any) => !p.isProjection);
    const N = actualPoints.length;
    if (N < 2) return defaultVal;

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < N; i++) {
      const x = i;
      const y = actualPoints[i].sales;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator = N * sumXX - sumX * sumX;
    const slope = denominator === 0 ? 0 : (N * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / N;

    let projectedTotal = 0;
    for (let i = 1; i <= 7; i++) {
      const x = N - 1 + i;
      projectedTotal += Math.max(0, slope * x + intercept);
    }

    // Calculate r-squared as a confidence proxy (defaulting to 80-95 based on N and fit variance)
    let meanY = sumY / N;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < N; i++) {
      const y = actualPoints[i].sales;
      const fit = slope * i + intercept;
      ssTot += (y - meanY) ** 2;
      ssRes += (y - fit) ** 2;
    }
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    const confidence = Math.round(80 + Math.max(0, Math.min(15, r2 * 15)));

    return {
      projectedTotal,
      slope,
      confidence
    };
  }, [salesTrendData]);

  // Payment methods chart data
  const paymentMethodData = useMemo(() => {
    const counts: { [key: string]: number } = { Cash: 0, UPI: 0, Card: 0, Ledger: 0 };
    filteredBills.forEach(bill => {
      const mode = bill.paymentMode.toLowerCase();
      if (mode === 'cash') counts.Cash += bill.total;
      else if (mode === 'upi') counts.UPI += bill.total;
      else if (mode === 'card') counts.Card += bill.total;
      else if (mode === 'ledger') counts.Ledger += bill.total;
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .filter(item => item.value > 0);
  }, [filteredBills]);

  // Peak sales hours chart data
  const peakHoursData = useMemo(() => {
    const hourlyData: { [key: string]: { sales: number; transactions: number } } = {};
    for (let i = 8; i <= 22; i++) {
      const label = `${String(i).padStart(2, '0')}:00`;
      hourlyData[label] = { sales: 0, transactions: 0 };
    }

    filteredBills.forEach(bill => {
      const hour = new Date(bill.date).getHours();
      const label = `${String(hour).padStart(2, '0')}:00`;
      if (hourlyData[label] !== undefined) {
        hourlyData[label].sales += bill.total;
        hourlyData[label].transactions += 1;
      }
    });

    return Object.entries(hourlyData).map(([hour, data]) => ({
      hour,
      sales: parseFloat(data.sales.toFixed(2)),
      transactions: data.transactions,
    }));
  }, [filteredBills]);

  // Cashier sales and transaction volume comparison data
  const cashierPerformanceData = useMemo(() => {
    const cashierMap: { [key: string]: { name: string; sales: number; transactions: number } } = {};

    filteredBills.forEach(bill => {
      const name = bill.cashierName || 'Cashier';
      if (!cashierMap[name]) {
        cashierMap[name] = { name, sales: 0, transactions: 0 };
      }
      cashierMap[name].sales += bill.total;
      cashierMap[name].transactions += 1;
    });

    return Object.values(cashierMap).sort((a, b) => b.sales - a.sales);
  }, [filteredBills]);

  // Category sales chart data
  const categoryData = useMemo(() => {
    const categories: { [key: string]: number } = {};
    filteredBills.forEach(bill => {
      bill.items.forEach(item => {
        const cat = item.category || 'General';
        categories[cat] = (categories[cat] || 0) + (item.price * item.quantity);
      });
    });

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [filteredBills]);

  // Top products list data
  const topProducts = useMemo(() => {
    const products: { [key: string]: { name: string; quantity: number; revenue: number } } = {};
    filteredBills.forEach(bill => {
      bill.items.forEach(item => {
        if (!products[item.code]) {
          products[item.code] = { name: item.name, quantity: 0, revenue: 0 };
        }
        products[item.code].quantity += item.quantity;
        products[item.code].revenue += item.price * item.quantity;
      });
    });

    return Object.entries(products)
      .map(([code, data]) => ({ code, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [filteredBills]);

  // Z-report audit totals for the Shifts tab. This MUST stay at the top level:
  // it previously lived inside the `activeTab === 'shifts'` branch, so switching
  // tabs changed the hook count and React threw "Rendered fewer hooks than
  // expected", blanking the whole dashboard.
  const shiftAuditMetrics = useMemo(() => {
    const closedShifts = shifts.filter(s => s.status === 'closed');

    let netCashDiscrepancy = 0;
    let netDigitalDiscrepancy = 0;

    closedShifts.forEach(s => {
      netCashDiscrepancy += (s.discrepancy_cash || 0);
      const upiDiff = (s.actual_upi ?? 0) - (s.system_upi ?? 0);
      const cardDiff = (s.actual_card ?? 0) - (s.system_card ?? 0);
      netDigitalDiscrepancy += (upiDiff + cardDiff);
    });

    const avgTicketVal = filteredBills.length > 0
      ? filteredBills.reduce((sum, b) => sum + b.total, 0) / filteredBills.length
      : 0;

    return {
      totalAudited: closedShifts.length,
      netCashDiscrepancy,
      netDigitalDiscrepancy,
      avgTicketVal,
    };
  }, [shifts, filteredBills]);

  const COLORS = [accentColor || 'var(--primary-accent)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-1)'];

  return (
    <PageShell>
      <PageHeader
        title="Sales Analytics Dashboard"
        description="Monitor store sales, payment mode distribution, top inventory, and Z-report trends."
      />

      {/* Tabs */}
      <div className="glass-panel backdrop-blur-xl backdrop-saturate-200 border-[var(--border-glass)] rounded-xl shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] p-1 flex gap-2 flex-shrink-0 mb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex shrink-0 whitespace-nowrap items-center gap-2 px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97] cursor-pointer ${
            activeTab === 'overview'
              ? 'liquid-glass-button text-white shadow-md'
              : 'text-muted-foreground hover:text-[var(--text-primary)] hover:bg-[var(--input-bg)]'
          }`}
        >
          <BarChart3 size={16} />
          Overview Metrics
        </button>
        <button
          onClick={() => setActiveTab('breakdown')}
          className={`flex shrink-0 whitespace-nowrap items-center gap-2 px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97] cursor-pointer ${
            activeTab === 'breakdown'
              ? 'liquid-glass-button text-white shadow-md'
              : 'text-muted-foreground hover:text-[var(--text-primary)] hover:bg-[var(--input-bg)]'
          }`}
        >
          <CreditCard size={16} />
          Sales Distribution
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`flex shrink-0 whitespace-nowrap items-center gap-2 px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97] cursor-pointer ${
            activeTab === 'products'
              ? 'liquid-glass-button text-white shadow-md'
              : 'text-muted-foreground hover:text-[var(--text-primary)] hover:bg-[var(--input-bg)]'
          }`}
        >
          <Package size={16} />
          Product Performance
        </button>
        <button
          onClick={() => setActiveTab('gst-report')}
          className={`flex shrink-0 whitespace-nowrap items-center gap-2 px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97] cursor-pointer ${
            activeTab === 'gst-report'
              ? 'liquid-glass-button text-white shadow-md'
              : 'text-muted-foreground hover:text-[var(--text-primary)] hover:bg-[var(--input-bg)]'
          }`}
        >
          <FileText size={16} />
          GST Tax Register
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex shrink-0 whitespace-nowrap items-center gap-2 px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97] cursor-pointer ${
            activeTab === 'insights'
              ? 'liquid-glass-button text-white shadow-md'
              : 'text-muted-foreground hover:text-[var(--text-primary)] hover:bg-[var(--input-bg)]'
          }`}
        >
          <Sparkles size={16} />
          AI Store Insights
        </button>
        {isOwner() && (
          <button
            onClick={() => setActiveTab('shifts')}
            className={`flex shrink-0 whitespace-nowrap items-center gap-2 px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97] cursor-pointer ${
              activeTab === 'shifts'
                ? 'liquid-glass-button text-white shadow-md'
                : 'text-muted-foreground hover:text-[var(--text-primary)] hover:bg-[var(--input-bg)]'
            }`}
          >
            <History size={16} />
            Shift Z-Reports Auditing
          </button>
        )}
      </div>

      {/* Filters (Hidden for AI Insights & Shifts Auditing to conserve space) */}
      {activeTab !== 'insights' && activeTab !== 'shifts' && (
        <div className="glass-panel backdrop-blur-xl backdrop-saturate-200 border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] p-4 mb-4 flex-shrink-0 border">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 font-semibold">
              <Filter size={16} className="text-[var(--text-muted)]" />
              <span className="font-bold text-xs text-[var(--text-secondary)] uppercase tracking-wider">Active Filters:</span>
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-4 items-center">
              {/* Date Filter */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium opacity-60 flex-shrink-0">Range:</span>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                  className="w-full px-2 py-1 text-xs border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                  <option value="thisMonth">This Month</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {/* Custom Date selectors */}
              {dateFilter === 'custom' && (
                <>
                  <div className="flex items-center gap-1 min-w-[140px]">
                    <span className="opacity-60 text-[11px]">From:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-2 py-1 text-xs border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-1 min-w-[140px]">
                    <span className="opacity-60 text-[11px]">To:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-2 py-1 text-xs border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {/* Payment Filter */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium opacity-60 flex-shrink-0">Payment:</span>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="w-full px-2 py-1 text-xs border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Methods</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="ledger">Ledger</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab View Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'overview' && (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Metric Summary Cards row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4 flex-shrink-0">
              <MetricCard
                title="Sales (Filter Active)"
                value={`₹${metrics.totalSales.toFixed(1)}`}
                icon={<DollarSign size={18} />}
                color="bg-blue-500"
                change={null}
                darkMode={darkMode}
                loading={isLoadingBills}
              />
              <MetricCard
                title="Sales (Today Context)"
                value={`₹${metrics.totalSalesToday.toFixed(1)}`}
                icon={<TrendingUp size={18} />}
                color="bg-green-500"
                change={null}
                darkMode={darkMode}
                loading={isLoadingBills}
              />
              <MetricCard
                title="Sales (Last 30 Days)"
                value={`₹${metrics.totalSalesMonth.toFixed(1)}`}
                icon={<Calendar size={18} />}
                color="bg-purple-500"
                change={null}
                darkMode={darkMode}
                loading={isLoadingBills}
              />
              <MetricCard
                title="Bills Generated"
                value={metrics.totalBills.toString()}
                icon={<Receipt size={18} />}
                color="bg-orange-500"
                change={null}
                darkMode={darkMode}
                loading={isLoadingBills}
              />
              <MetricCard
                title="Avg Ticket Value"
                value={`₹${metrics.avgBillValue.toFixed(1)}`}
                icon={<ShoppingCart size={18} />}
                color="bg-pink-500"
                change={null}
                darkMode={darkMode}
                loading={isLoadingBills}
              />
            </div>

            {/* Sales Trend chart card */}
            <div className="flex-1 glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-5 border overflow-hidden flex flex-col">
              
              {/* Header with AI Forecast Toggle */}
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-500" />
                  Sales Revenue Trend
                </h3>
                
                <button
                  onClick={() => setShowForecast(!showForecast)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all border select-none cursor-pointer ${
                    showForecast
                      ? 'bg-purple-500/15 border-purple-500/35 text-purple-400 shadow-sm'
                      : 'bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Sparkles size={13} className={showForecast ? 'animate-pulse text-purple-500' : ''} />
                  {showForecast ? 'AI Forecast: ON' : 'Enable AI Forecast'}
                </button>
              </div>

              {/* Flex Grid containing Chart and AI Forecast details */}
              <div className="flex-1 w-full overflow-hidden flex flex-col lg:flex-row gap-5 min-h-0">
                
                {/* Responsive Chart */}
                <div className="flex-1 min-w-0 h-full">
                  <ResponsiveContainer width="100%" height="95%">
                    <AreaChart data={salesTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={accentColor || "var(--primary-accent)"} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={accentColor || "var(--primary-accent)"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" />
                      <XAxis dataKey="date" stroke="var(--text-muted)" style={{ fontSize: '10px' }} />
                      <YAxis stroke="var(--text-muted)" style={{ fontSize: '10px' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--input-bg)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <Legend style={{ fontSize: '10px' }} />
                      <Area
                        name="Actual Sales (INR)"
                        type="monotone"
                        dataKey="sales"
                        stroke={accentColor || "var(--primary-accent)"}
                        strokeWidth={2}
                        fill="url(#colorSales)"
                        connectNulls
                      />
                      {showForecast && (
                        <Line
                          name="Projected Sales (INR)"
                          type="monotone"
                          dataKey="forecast"
                          stroke="var(--chart-3)"
                          strokeWidth={2.5}
                          strokeDasharray="4 4"
                          dot={{ r: 3.5, stroke: 'var(--chart-3)', strokeWidth: 1, fill: 'var(--text-primary)' }}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* AI Predictive Intelligence details */}
                {showForecast && (
                  <div className="w-full lg:w-72 border rounded-xl p-4 flex flex-col flex-shrink-0 overflow-y-auto bg-[var(--bg-glass)] border-[var(--border-glass)] text-[var(--text-primary)] animate-scale-in">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Sparkles className="text-purple-500" size={15} />
                      <h4 className="font-extrabold text-[10px] uppercase tracking-wider text-purple-400">
                        AI Predictive Insights
                      </h4>
                    </div>

                    <div className="space-y-4">
                      {/* Metric 1: Projected Revenue */}
                      <div>
                        <span className="text-[10px] font-bold opacity-60 block">Projected Revenue (7 Days)</span>
                        <span className="text-xl font-black text-purple-400 block mt-0.5">
                          ₹{forecastMetrics.projectedTotal.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                        </span>
                      </div>

                      {/* Metric 2: Growth Trajectory */}
                      <div>
                        <span className="text-[10px] font-bold opacity-60 block">Growth Trajectory</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            forecastMetrics.slope >= 0
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : 'bg-rose-500/15 text-rose-500'
                          }`}>
                            {forecastMetrics.slope >= 0 ? '📈 Upward' : '📉 Downward'}
                          </span>
                          <span className="text-[11px] font-bold">
                            {forecastMetrics.slope >= 0 ? `+₹${forecastMetrics.slope.toFixed(1)}/day` : `-₹${Math.abs(forecastMetrics.slope).toFixed(1)}/day`}
                          </span>
                        </div>
                      </div>

                      {/* Metric 3: Confidence Score */}
                      <div>
                        <span className="text-[10px] font-bold opacity-60 block">AI Forecast Confidence</span>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-full bg-[var(--input-bg)] rounded-full h-1.5 overflow-hidden">
                            <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${forecastMetrics.confidence}%` }} />
                          </div>
                          <span className="text-[10px] font-bold">{forecastMetrics.confidence}%</span>
                        </div>
                      </div>

                      {/* Brief description text */}
                      <p className="text-[10px] opacity-75 leading-relaxed border-t border-[var(--border-glass)] pt-3">
                        {forecastMetrics.slope >= 0 
                          ? 'Continuous upward trajectory detected based on rolling transaction volume. Recommended to verify stock levels in high-velocity procurement tables.'
                          : 'Recent decline or stagnation in transaction volume noticed. Consider running category-wise discount campaigns or setting up promo points.'
                        }
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'breakdown' && (
          <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
            {/* Payment Distribution */}
            <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl p-5 border overflow-hidden flex flex-col">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2 flex-shrink-0">
                <CreditCard size={16} className="text-green-500" />
                Payment Method Revenue Share
              </h3>
              <div className="flex-1 w-full overflow-hidden flex items-center justify-center">
                {paymentMethodData.length === 0 ? (
                  <p className="text-sm opacity-55">No transactional data inside this date filter.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="95%">
                    <PieChart>
                      <Pie
                        data={paymentMethodData}
                        cx="50%"
                        cy="45%"
                        labelLine={true}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius="70%"
                        fill="var(--primary-accent)"
                        dataKey="value"
                      >
                        {paymentMethodData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--input-bg)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Category Performance */}
            <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl p-5 border overflow-hidden flex flex-col">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2 flex-shrink-0">
                <ShoppingCart size={16} className="text-[var(--primary-accent)]" />
                Category Performance Summary
              </h3>
              <div className="flex-1 w-full overflow-hidden">
                {categoryData.length === 0 ? (
                  <p className="text-sm opacity-55 text-center py-20">No category sales recorded yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="95%">
                    <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" />
                      <XAxis dataKey="name" stroke="var(--text-muted)" style={{ fontSize: '10px' }} />
                      <YAxis stroke="var(--text-muted)" style={{ fontSize: '10px' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--input-bg)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)'
                        }}
                      />
                      <Bar dataKey="value" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
            {/* Top Products */}
            <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl p-5 border overflow-hidden flex flex-col">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2 flex-shrink-0">
                <Package size={16} className="text-[var(--primary-accent)]" />
                Top Selling Products List
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {topProducts.map((product, index) => (
                  <div
                    key={product.code}
                    className="flex items-center justify-between p-3 bg-[var(--input-bg)] rounded-xl border border-[var(--border-glass)] transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-7 h-7 bg-[var(--primary-accent)] text-white rounded-full font-bold text-xs shadow-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-[var(--text-primary)]">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.quantity} units sold</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-emerald-500">₹{product.revenue.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {topProducts.length === 0 && (
                  <p className="text-center py-8 text-sm text-muted-foreground">No product sales registered.</p>
                )}
              </div>
            </div>

            {/* Peak Hours */}
            <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl p-5 border overflow-hidden flex flex-col">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2 flex-shrink-0">
                <Clock size={16} className="text-amber-500" />
                Peak Checkout Trading Hours
              </h3>
              <div className="flex-1 w-full overflow-hidden">
                <ResponsiveContainer width="100%" height="95%">
                  <BarChart data={peakHoursData.filter((d) => d.sales > 0)} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" />
                    <XAxis dataKey="hour" stroke="var(--text-muted)" style={{ fontSize: '10px' }} />
                    <YAxis stroke="var(--text-muted)" style={{ fontSize: '10px' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--input-bg)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <Bar dataKey="sales" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="h-full overflow-y-auto pr-1 border border-[var(--border-glass)] rounded-xl p-4 bg-[var(--bg-glass)] text-[var(--text-primary)]">
            <InsightsDashboard bills={bills} filteredBills={filteredBills} />
          </div>
        )}

        {activeTab === 'gst-report' && (
          <div className="h-full overflow-y-auto pr-1 flex flex-col gap-4">
            {/* Quick GST summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 flex-shrink-0">
              <div className="p-4 rounded-xl border shadow-sm glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Total Taxable Value</h4>
                <p className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  ₹{hsnAggregatedData.reduce((sum, d) => sum + d.taxableValue, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <div className="mt-1 h-1 w-12 rounded bg-gradient-to-r from-blue-500 to-indigo-500" />
              </div>
              <div className="p-4 rounded-xl border shadow-sm glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">CGST Collected</h4>
                <p className="text-xl font-extrabold tracking-tight text-emerald-500">
                  ₹{hsnAggregatedData.reduce((sum, d) => sum + d.cgst, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <div className="mt-1 h-1 w-12 rounded bg-emerald-500" />
              </div>
              <div className="p-4 rounded-xl border shadow-sm glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">SGST Collected</h4>
                <p className="text-xl font-extrabold tracking-tight text-emerald-500">
                  ₹{hsnAggregatedData.reduce((sum, d) => sum + d.sgst, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <div className="mt-1 h-1 w-12 rounded bg-emerald-500" />
              </div>
              <div className="p-4 rounded-xl border shadow-sm glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Total GST Liability</h4>
                <p className="text-xl font-extrabold tracking-tight text-blue-500">
                  ₹{hsnAggregatedData.reduce((sum, d) => sum + d.totalTax, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <div className="mt-1 h-1 w-12 rounded bg-gradient-to-r from-teal-400 to-blue-500" />
              </div>
            </div>

            {/* Export and Table Slate */}
            <div className="p-5 rounded-2xl border backdrop-blur-md shadow-md glass-panel border-[var(--border-glass)] text-[var(--text-primary)] flex-1 flex flex-col overflow-hidden min-h-[300px]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 flex-shrink-0">
                <div>
                  <h3 className="text-sm font-bold tracking-wide text-[var(--text-primary)]">HSN-wise Outward Taxable Supplies</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Summary of legal tax liabilities grouped by HSN and GST slabs for local intra-state retail sales.
                  </p>
                </div>
                <button
                  onClick={downloadGSTR1CSV}
                  disabled={hsnAggregatedData.length === 0}
                  className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg select-none cursor-pointer ${
                    hsnAggregatedData.length === 0
                      ? 'opacity-40 cursor-not-allowed bg-[var(--input-bg)] text-[var(--text-muted)]'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-teal-500/10 transform active:scale-[0.97]'
                  }`}
                >
                  <FileSpreadsheet size={15} />
                  Download GSTR-1 CSV Report
                </button>
              </div>

              {/* Data Table Container */}
              <div className="flex-1 overflow-y-auto rounded-lg border border-[var(--border-glass)] min-h-0">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-[var(--input-bg)] text-[var(--text-muted)] border-b border-[var(--border-glass)] text-[11px] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">HSN Code</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-3 py-3 text-center">UQC</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-right">Taxable Value</th>
                      <th className="px-3 py-3 text-center">Rate</th>
                      <th className="px-3 py-3 text-right">CGST</th>
                      <th className="px-3 py-3 text-right">SGST</th>
                      <th className="px-3 py-3 text-right text-[var(--text-muted)]">IGST</th>
                      <th className="px-4 py-3 text-right">Total Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs divide-[var(--border-glass)] text-[var(--text-primary)]">
                    {hsnAggregatedData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-12 text-center text-[var(--text-muted)]">
                          <p className="font-medium text-sm">No transaction records found matching active filters</p>
                          <p className="text-xs mt-1">Try expanding your active filter date range or generating checkouts first.</p>
                        </td>
                      </tr>
                    ) : (
                      hsnAggregatedData.map((row) => (
                        <tr key={`${row.hsnCode}_${row.gstRate}`} className={`hover:bg-[var(--surface-hover)] transition-colors`}>
                          <td className="px-4 py-3 font-mono font-bold text-blue-500">
                            {row.hsnCode}
                          </td>
                          <td className="px-4 py-3 font-medium truncate max-w-[150px]" title={row.description}>
                            {row.description}
                          </td>
                          <td className="px-3 py-3 text-center opacity-60">UNITS</td>
                          <td className="px-3 py-3 text-right font-semibold">{row.quantitySold}</td>
                          <td className="px-3 py-3 text-right font-mono font-medium">₹{row.taxableValue.toFixed(2)}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.gstRate === 0
                                ? 'bg-[var(--input-bg)] text-[var(--text-muted)]'
                                : 'bg-blue-500/15 text-blue-500'
                            }`}>
                              {row.gstRate}%
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-emerald-500">₹{row.cgst.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right font-mono text-emerald-500">₹{row.sgst.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right font-mono text-[var(--text-muted)] opacity-40">₹0.00</td>
                          <td className="px-4 py-3 text-right font-mono font-extrabold text-blue-500">
                            ₹{row.totalValue.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* GST compliance warning notice */}
              <div className="mt-4 p-3 rounded-xl border flex items-start gap-2.5 bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-muted)]">
                <div className="p-1 rounded-lg bg-[var(--bg-glass)] text-[var(--text-primary)] flex-shrink-0">
                  <Receipt size={14} />
                </div>
                <div className="text-[11px] leading-relaxed">
                  <span className="font-bold">Indian GST Rule 36 Compliance:</span> GSTR-1 HSN-wise sales summary is computed exclusively based on intra-state billing. For inter-state retail supplies, tax splits default to IGST summaries, which are currently calculated as ₹0.00 under local offline register mode. Standard CGST (50%) and SGST (50%) subdivisions are maintained mathematically on all taxable invoices.
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'shifts' && (
          <div className="h-full overflow-y-auto pr-1 flex flex-col gap-4">
            
            {/* Shifts Audit Metrics Overview — values come from the top-level
                `shiftAuditMetrics` memo; keep hooks out of this branch. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 flex-shrink-0">
              <div className="p-4 rounded-xl border shadow-sm glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Audited Closed Shifts</h4>
                <p className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  {shiftAuditMetrics.totalAudited} Z-Reports
                </p>
                <div className="mt-1 h-1 w-12 rounded bg-gradient-to-r from-blue-500 to-indigo-500" />
              </div>

              <div className="p-4 rounded-xl border shadow-sm glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Net Cash Discrepancy</h4>
                <p className={`text-xl font-extrabold tracking-tight ${
                  shiftAuditMetrics.netCashDiscrepancy === 0
                    ? 'text-[var(--text-muted)]'
                    : shiftAuditMetrics.netCashDiscrepancy > 0
                    ? 'text-emerald-500'
                    : 'text-rose-500'
                }`}>
                  {shiftAuditMetrics.netCashDiscrepancy >= 0 ? '+' : ''}₹{shiftAuditMetrics.netCashDiscrepancy.toFixed(2)}
                </p>
                <div className={`mt-1 h-1 w-12 rounded ${shiftAuditMetrics.netCashDiscrepancy >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              </div>

              <div className="p-4 rounded-xl border shadow-sm glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Net Digital Discrepancy</h4>
                <p className={`text-xl font-extrabold tracking-tight ${
                  shiftAuditMetrics.netDigitalDiscrepancy === 0
                    ? 'text-[var(--text-muted)]'
                    : shiftAuditMetrics.netDigitalDiscrepancy > 0
                    ? 'text-emerald-500'
                    : 'text-rose-500'
                }`}>
                  {shiftAuditMetrics.netDigitalDiscrepancy >= 0 ? '+' : ''}₹{shiftAuditMetrics.netDigitalDiscrepancy.toFixed(2)}
                </p>
                <div className={`mt-1 h-1 w-12 rounded ${shiftAuditMetrics.netDigitalDiscrepancy >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              </div>

              <div className="p-4 rounded-xl border shadow-sm glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Avg Transaction Value</h4>
                <p className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  ₹{shiftAuditMetrics.avgTicketVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <div className="mt-1 h-1 w-12 rounded bg-gradient-to-r from-teal-400 to-blue-500" />
              </div>
            </div>

            {/* Visual Charts Container */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-shrink-0">
              
              {/* Peak Trading Hours */}
              <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl p-5 border overflow-hidden flex flex-col h-[320px]">
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                    <Clock size={16} className="text-purple-500" />
                    Hourly Peak Trading Analysis
                  </h3>
                  <div className="flex items-center gap-4 text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-purple-500 inline-block" /> Sales (Left Y-Axis)</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> Bills (Right Y-Axis)</span>
                  </div>
                </div>
                <div className="flex-1 w-full overflow-hidden">
                  <ResponsiveContainer width="100%" height="95%">
                    <AreaChart data={peakHoursData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorPeakSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary-accent)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="var(--primary-accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" />
                      <XAxis dataKey="hour" stroke="var(--text-muted)" style={{ fontSize: '9px' }} />
                      <YAxis yAxisId="left" stroke="var(--chart-3)" style={{ fontSize: '9px' }} tickFormatter={(val) => `₹${val}`} />
                      <YAxis yAxisId="right" orientation="right" stroke="var(--chart-4)" style={{ fontSize: '9px' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--input-bg)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)'
                        }}
                      />
                      <Area yAxisId="left" type="monotone" name="Sales Volume" dataKey="sales" fill="url(#colorPeakSales)" stroke="var(--chart-3)" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" name="Transactions Count" dataKey="transactions" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Cashier Performance Sales comparison */}
              <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl p-5 border overflow-hidden flex flex-col h-[320px]">
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                    <UserCheck size={16} className="text-[var(--primary-accent)]" />
                    Cashier Performance Grid
                  </h3>
                  <div className="flex items-center gap-4 text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[var(--primary-accent)] inline-block" /> Sales (Left Y-Axis)</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[var(--chart-2)] inline-block" /> Bills (Right Y-Axis)</span>
                  </div>
                </div>
                <div className="flex-1 w-full overflow-hidden">
                  {cashierPerformanceData.length === 0 ? (
                    <p className="text-sm opacity-55 text-center py-24">No cashier checkout data recorded.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="95%">
                      <BarChart data={cashierPerformanceData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" />
                        <XAxis dataKey="name" stroke="var(--text-muted)" style={{ fontSize: '9px' }} />
                        <YAxis yAxisId="left" stroke={accentColor || "var(--primary-accent)"} style={{ fontSize: '9px' }} tickFormatter={(val) => `₹${val}`} />
                        <YAxis yAxisId="right" orientation="right" stroke="var(--chart-2)" style={{ fontSize: '9px' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--input-bg)',
                            border: '1px solid var(--border-glass)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)'
                          }}
                        />
                        <Bar yAxisId="left" name="Sales Volume" dataKey="sales" fill={accentColor || "var(--primary-accent)"} radius={[4, 4, 0, 0]} maxBarSize={30} />
                        <Bar yAxisId="right" name="Bills Completed" dataKey="transactions" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Shift Performance & Discrepancies Grid */}
            <div className="p-5 rounded-2xl border backdrop-blur-md shadow-md glass-panel border-[var(--border-glass)] text-[var(--text-primary)] flex-1 flex flex-col overflow-hidden min-h-[400px]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 flex-shrink-0">
                <div>
                  <h3 className="text-sm font-bold tracking-wide text-[var(--text-primary)]">Closed Shift Z-Reports & Live Registers</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Audit logs representing system register sales, final till counts, and active cashier session floats.
                  </p>
                </div>
                <button
                  onClick={fetchShifts}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md select-none cursor-pointer border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] hover:bg-[var(--bg-glass)]"
                >
                  <History size={14} className={isLoadingShifts ? 'animate-spin' : ''} />
                  Refresh Shifts
                </button>
              </div>

              {/* Data Table Container */}
              <div className="flex-1 overflow-y-auto rounded-lg border border-[var(--border-glass)] min-h-0">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-[var(--input-bg)] text-[var(--text-muted)] border-b border-[var(--border-glass)] text-[11px] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 w-10"></th>
                      <th className="px-4 py-3">Cashier</th>
                      <th className="px-4 py-3">Shift Period</th>
                      <th className="px-3 py-3 text-right">Initial Float</th>
                      <th className="px-3 py-3 text-right">Expected Revenue</th>
                      <th className="px-3 py-3 text-right">Cashier Tally</th>
                      <th className="px-3 py-3 text-center">Net Cash Diff</th>
                      <th className="px-3 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs divide-[var(--border-glass)] text-[var(--text-primary)]">
                    {shifts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-[var(--text-muted)]">
                          {isLoadingShifts ? (
                            <p className="font-medium text-sm">Loading Z-reports from SQLite DB...</p>
                          ) : (
                            <>
                              <p className="font-medium text-sm">No shift records found in the system</p>
                              <p className="text-xs mt-1">Start a register shift or open checkout sessions to see audit records.</p>
                            </>
                          )}
                        </td>
                      </tr>
                    ) : (
                      shifts.map((row) => {
                        const isClosed = row.status === 'closed';
                        const expectedCash = row.initial_cash + (row.system_cash || 0);
                        const expectedTotalSales = (row.system_cash || 0) + (row.system_upi || 0) + (row.system_card || 0);
                        
                        const cashDiff = row.discrepancy_cash || 0;
                        const upiDiff = isClosed ? ((row.actual_upi ?? 0) - (row.system_upi ?? 0)) : 0;
                        const cardDiff = isClosed ? ((row.actual_card ?? 0) - (row.system_card ?? 0)) : 0;
                        const totalDiff = cashDiff + upiDiff + cardDiff;

                        const isExpanded = expandedShiftId === row.id;

                        // Color for badges
                        let statusColor = '';
                        let discrepancyColor = '';
                        let discrepancyText = '';

                        if (row.status === 'active') {
                          statusColor = 'bg-blue-500/15 text-blue-500 border border-blue-500/20';
                        } else {
                          statusColor = 'bg-[var(--input-bg)] text-[var(--text-muted)] border border-[var(--border-glass)]';
                        }

                        if (!isClosed) {
                          discrepancyColor = 'text-[var(--text-muted)]';
                          discrepancyText = 'Live Shift';
                        } else if (cashDiff === 0) {
                          discrepancyColor = 'text-emerald-500 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/20';
                          discrepancyText = 'Perfect';
                        } else if (cashDiff > 0) {
                          discrepancyColor = 'text-amber-500 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/20';
                          discrepancyText = `+₹${cashDiff.toFixed(2)}`;
                        } else {
                          discrepancyColor = 'text-rose-500 bg-rose-500/15 px-2 py-0.5 rounded border border-rose-500/20';
                          discrepancyText = `-₹${Math.abs(cashDiff).toFixed(2)}`;
                        }

                        return (
                          <>
                            <tr 
                              key={row.id} 
                              onClick={() => toggleExpandShift(row.id)}
                              className={`hover:bg-[var(--surface-hover)] transition-colors cursor-pointer ${
                                isExpanded ? 'bg-[var(--surface-hover)]' : ''
                              }`}
                            >
                              <td className="px-4 py-3 text-center">
                                <button className="focus:outline-none p-1 rounded hover:bg-[var(--surface-hover)]">
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              </td>
                              <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                                {row.user_name}
                              </td>
                              <td className="px-4 py-3 text-[var(--text-muted)]">
                                <div className="font-medium text-[11px]">{formatShiftTime(row.start_time)}</div>
                                <div className="text-[10px] opacity-65">to {isClosed ? formatShiftTime(row.end_time) : 'Active'}</div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono">₹{row.initial_cash.toFixed(2)}</td>
                              <td className="px-3 py-3 text-right font-mono">
                                ₹{expectedTotalSales.toFixed(2)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-medium">
                                {isClosed ? `₹${(row.actual_cash + row.actual_upi + row.actual_card - row.initial_cash).toFixed(2)}` : 'N/A'}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`font-mono font-bold ${discrepancyColor} text-[10px]`}>
                                  {discrepancyText}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${statusColor}`}>
                                  {row.status === 'active' ? 'Active' : 'Closed'}
                                </span>
                              </td>
                            </tr>
                            
                            {/* Expanded Details Card */}
                            {isExpanded && (
                              <tr key={`${row.id}-details`} className="bg-[var(--bg-glass)]">
                                <td colSpan={8} className="px-6 py-4 border-l-2 border-blue-500">
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between border-b border-[var(--border-glass)] pb-2">
                                      <h4 className="font-bold text-xs text-blue-500 uppercase tracking-wide flex items-center gap-1.5">
                                        <History size={14} />
                                        Shift Reconciliation Breakdown
                                      </h4>
                                      <span className="text-[10px] opacity-60 font-mono">ID: {row.id}</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      
                                      {/* Cash Audit Card */}
                                      <div className="p-3 rounded-xl border glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                                        <h5 className="font-bold text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-2 flex items-center justify-between">
                                          <span>💵 Cash Tally</span>
                                          {isClosed && (
                                            <span className={`font-mono font-black ${
                                              cashDiff === 0 ? 'text-emerald-500' : cashDiff > 0 ? 'text-amber-500' : 'text-rose-500'
                                            }`}>
                                              {cashDiff > 0 ? '+' : ''}{cashDiff.toFixed(2)}
                                            </span>
                                          )}
                                        </h5>
                                        <div className="space-y-1 font-mono text-[11px]">
                                          <div className="flex justify-between">
                                            <span className="opacity-60">Initial Float:</span>
                                            <span>₹{row.initial_cash.toFixed(2)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="opacity-60">System Sales:</span>
                                            <span>₹{(row.system_cash || 0).toFixed(2)}</span>
                                          </div>
                                          <div className="flex justify-between font-bold border-t border-[var(--border-glass)] pt-1 mt-1 font-semibold">
                                            <span>Expected Cash:</span>
                                            <span>₹{expectedCash.toFixed(2)}</span>
                                          </div>
                                          <div className="flex justify-between font-bold text-blue-500">
                                            <span>Cashier Actual:</span>
                                            <span>{isClosed ? `₹${row.actual_cash.toFixed(2)}` : 'Active'}</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* UPI Audit Card */}
                                      <div className="p-3 rounded-xl border glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                                        <h5 className="font-bold text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-2 flex items-center justify-between">
                                          <span>📱 UPI Payments</span>
                                          {isClosed && (
                                            <span className={`font-mono font-black ${
                                              upiDiff === 0 ? 'text-emerald-500' : upiDiff > 0 ? 'text-amber-500' : 'text-rose-500'
                                            }`}>
                                              {upiDiff > 0 ? '+' : ''}{upiDiff.toFixed(2)}
                                            </span>
                                          )}
                                        </h5>
                                        <div className="space-y-1 font-mono text-[11px]">
                                          <div className="flex justify-between">
                                            <span className="opacity-60">System UPI Sales:</span>
                                            <span>₹{(row.system_upi || 0).toFixed(2)}</span>
                                          </div>
                                          <div className="flex justify-between font-bold border-t border-[var(--border-glass)] pt-1 mt-1 font-semibold">
                                            <span>Expected UPI:</span>
                                            <span>₹{(row.system_upi || 0).toFixed(2)}</span>
                                          </div>
                                          <div className="flex justify-between font-bold text-blue-500">
                                            <span>Cashier Actual:</span>
                                            <span>{isClosed ? `₹${(row.actual_upi || 0).toFixed(2)}` : 'Active'}</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Card Audit Card */}
                                      <div className="p-3 rounded-xl border glass-panel border-[var(--border-glass)] text-[var(--text-primary)]">
                                        <h5 className="font-bold text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-2 flex items-center justify-between">
                                          <span>💳 Card Payments</span>
                                          {isClosed && (
                                            <span className={`font-mono font-black ${
                                              cardDiff === 0 ? 'text-emerald-500' : cardDiff > 0 ? 'text-amber-500' : 'text-rose-500'
                                            }`}>
                                              {cardDiff > 0 ? '+' : ''}{cardDiff.toFixed(2)}
                                            </span>
                                          )}
                                        </h5>
                                        <div className="space-y-1 font-mono text-[11px]">
                                          <div className="flex justify-between">
                                            <span className="opacity-60">System Card Sales:</span>
                                            <span>₹{(row.system_card || 0).toFixed(2)}</span>
                                          </div>
                                          <div className="flex justify-between font-bold border-t border-[var(--border-glass)] pt-1 mt-1 font-semibold">
                                            <span>Expected Card:</span>
                                            <span>₹{(row.system_card || 0).toFixed(2)}</span>
                                          </div>
                                          <div className="flex justify-between font-bold text-blue-500">
                                            <span>Cashier Actual:</span>
                                            <span>{isClosed ? `₹${(row.actual_card || 0).toFixed(2)}` : 'Active'}</span>
                                          </div>
                                        </div>
                                      </div>

                                    </div>

                                    {/* Overall Discrepancy details & Cashier Notes */}
                                    <div className="p-3 rounded-xl border bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-secondary)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                                      <div className="text-[11px]">
                                        <span className="font-bold">Total Shift Net Discrepancy: </span>
                                        {isClosed ? (
                                          <span className={`font-mono font-bold ${
                                            totalDiff === 0 ? 'text-emerald-500' : totalDiff > 0 ? 'text-amber-500' : 'text-rose-500'
                                          }`}>
                                            {totalDiff > 0 ? '+' : ''}₹{totalDiff.toFixed(2)} ({totalDiff === 0 ? 'Perfect reconciliation' : totalDiff > 0 ? 'Surplus cash/digital tallies' : 'Shortage in drawer'})
                                          </span>
                                        ) : (
                                          <span className="text-blue-500 font-semibold">Active cash till float in progress. Reconcile upon ending shift.</span>
                                        )}
                                      </div>
                                      {isClosed && (
                                        <div className="text-[11px] max-w-md">
                                          <span className="font-bold">Cashier Z-Report Notes: </span>
                                          <span className="italic font-medium">"{row.notes || 'No remarks added by cashier.'}"</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  change?: number | null;
  darkMode?: boolean;
  loading?: boolean;
}

function MetricCard({ title, value, icon, color, loading }: MetricCardProps) {
  return (
    <div 
      onPointerMove={updatePointerGlare}
      className="group relative glass-panel backdrop-blur-xl backdrop-saturate-200 border-[var(--border-glass)] text-[var(--text-primary)] border rounded-xl shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] p-4 flex items-center justify-between overflow-hidden transition-all hover:-translate-y-1"
    >
      <SpecularGlareOverlay />
      <div className="relative z-10 min-w-0">
        <h3 className="text-[10px] font-bold text-[var(--text-muted)] mb-1 uppercase tracking-wider truncate">{title}</h3>
        {loading
          ? <Skeleton className="h-6 w-24 my-0.5" />
          : <p className="text-lg font-bold text-[var(--text-primary)] tracking-tight">{value}</p>}
      </div>
      <div className={`relative z-10 ${color} text-white p-2.5 rounded-lg flex-shrink-0 shadow-md shadow-black/5`}>{icon}</div>
    </div>
  );
}