import { useState, useMemo, useEffect } from 'react';
import { SavedBill } from './cashier-billing-advanced';
import { useTheme } from '../contexts/theme-context';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  ShoppingCart,
  Lightbulb,
  AlertTriangle,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Package,
  Target,
  Clock,
  Zap,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

type DateFilter = 'today' | 'week' | 'month' | 'custom';

interface ProductInsight {
  code: string;
  name: string;
  totalQuantity: number;
  totalRevenue: number;
  avgPrice: number;
  trend: number; // percentage change
  daysActive: number;
  lastSold: Date;
}

interface Recommendation {
  id: string;
  type: 'success' | 'warning' | 'info';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  action?: string;
  productCode?: string;
}

interface Event {
  name: string;
  date: Date;
  daysAway: number;
  suggestions: string[];
}

interface InsightsDashboardProps {
  bills: SavedBill[];
  filteredBills: SavedBill[];
}

export function InsightsDashboard({ bills, filteredBills }: InsightsDashboardProps) {
  const { darkMode } = useTheme();

  // Show empty state if no bills
  if (bills.length === 0) {
    return (
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-12 text-center`}>
        <div className="max-w-md mx-auto">
          <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <Sparkles size={40} className="text-white" />
          </div>
          <h3 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-3`}>
            No Sales Data Yet
          </h3>
          <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-6`}>
            Start generating bills to unlock AI-powered insights and recommendations. The system will analyze your sales patterns and provide actionable suggestions to grow your business.
          </p>
          <div className={`${darkMode ? 'bg-blue-900/20' : 'bg-blue-50'} border border-blue-500 rounded-lg p-4 text-left`}>
            <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
              <strong>What you'll get:</strong>
            </p>
            <ul className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-800'} mt-2 space-y-1 ml-4 list-disc`}>
              <li>Sales performance tracking with trend analysis</li>
              <li>Product demand insights and growth opportunities</li>
              <li>AI-powered recommendations to boost revenue</li>
              <li>Event-based inventory planning suggestions</li>
              <li>Smart capital allocation guidance</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // filteredBills is received directly as a prop, keeping in sync with parent dashboard selectors.

  // Calculate comprehensive metrics with period comparisons
  const metrics = useMemo(() => {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Today's data
    const todayBills = bills.filter((b) => {
      const billDate = new Date(b.date);
      billDate.setHours(0, 0, 0, 0);
      return billDate.getTime() === today.getTime();
    });

    // Yesterday's data for comparison
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayBills = bills.filter((b) => {
      const billDate = new Date(b.date);
      billDate.setHours(0, 0, 0, 0);
      return billDate.getTime() === yesterday.getTime();
    });

    // This week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekBills = bills.filter((b) => new Date(b.date) >= weekAgo);

    // Previous week
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const previousWeekBills = bills.filter(
      (b) => new Date(b.date) >= twoWeeksAgo && new Date(b.date) < weekAgo
    );

    // This month
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthBills = bills.filter((b) => new Date(b.date) >= monthAgo);

    // Previous month
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    const previousMonthBills = bills.filter(
      (b) => new Date(b.date) >= twoMonthsAgo && new Date(b.date) < monthAgo
    );

    const totalSalesToday = todayBills.reduce((sum, bill) => sum + bill.total, 0);
    const totalSalesYesterday = yesterdayBills.reduce((sum, bill) => sum + bill.total, 0);
    const totalSalesWeek = weekBills.reduce((sum, bill) => sum + bill.total, 0);
    const totalSalesPreviousWeek = previousWeekBills.reduce((sum, bill) => sum + bill.total, 0);
    const totalSalesMonth = monthBills.reduce((sum, bill) => sum + bill.total, 0);
    const totalSalesPreviousMonth = previousMonthBills.reduce((sum, bill) => sum + bill.total, 0);

    const avgBillValue = weekBills.length > 0 ? totalSalesWeek / weekBills.length : 0;
    const avgBillValuePrevious =
      previousWeekBills.length > 0 ? totalSalesPreviousWeek / previousWeekBills.length : 0;

    // Calculate percentage changes
    const todayChange =
      totalSalesYesterday > 0
        ? ((totalSalesToday - totalSalesYesterday) / totalSalesYesterday) * 100
        : 0;
    const weekChange =
      totalSalesPreviousWeek > 0
        ? ((totalSalesWeek - totalSalesPreviousWeek) / totalSalesPreviousWeek) * 100
        : 0;
    const monthChange =
      totalSalesPreviousMonth > 0
        ? ((totalSalesMonth - totalSalesPreviousMonth) / totalSalesPreviousMonth) * 100
        : 0;
    const avgBillChange =
      avgBillValuePrevious > 0
        ? ((avgBillValue - avgBillValuePrevious) / avgBillValuePrevious) * 100
        : 0;

    return {
      totalSalesToday,
      totalSalesWeek,
      totalSalesMonth,
      avgBillValue,
      totalTransactions: weekBills.length,
      todayChange,
      weekChange,
      monthChange,
      avgBillChange,
      transactionChange:
        previousWeekBills.length > 0
          ? ((weekBills.length - previousWeekBills.length) / previousWeekBills.length) * 100
          : 0,
    };
  }, [bills]);

  // Analyze product performance with trends
  const productInsights = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const productMap: { [key: string]: ProductInsight } = {};
    const recentProductMap: { [key: string]: number } = {};
    const previousProductMap: { [key: string]: number } = {};

    // Analyze all bills
    bills.forEach((bill) => {
      const billDate = new Date(bill.date);
      const isRecent = billDate >= weekAgo;
      const isPrevious = billDate >= twoWeeksAgo && billDate < weekAgo;

      bill.items.forEach((item) => {
        if (!productMap[item.code]) {
          productMap[item.code] = {
            code: item.code,
            name: item.name,
            totalQuantity: 0,
            totalRevenue: 0,
            avgPrice: item.price,
            trend: 0,
            daysActive: 0,
            lastSold: billDate,
          };
        }

        const product = productMap[item.code];
        product.totalQuantity += item.quantity;
        product.totalRevenue += item.price * item.quantity;

        if (billDate > product.lastSold) {
          product.lastSold = billDate;
        }

        // Track recent vs previous periods
        if (isRecent) {
          recentProductMap[item.code] = (recentProductMap[item.code] || 0) + item.quantity;
        }
        if (isPrevious) {
          previousProductMap[item.code] = (previousProductMap[item.code] || 0) + item.quantity;
        }
      });
    });

    // Calculate trends and days active
    Object.values(productMap).forEach((product) => {
      const daysSinceLastSold = Math.floor((now.getTime() - product.lastSold.getTime()) / (1000 * 60 * 60 * 24));
      product.daysActive = daysSinceLastSold;

      const recentQty = recentProductMap[product.code] || 0;
      const previousQty = previousProductMap[product.code] || 0;

      if (previousQty > 0) {
        product.trend = ((recentQty - previousQty) / previousQty) * 100;
      } else if (recentQty > 0) {
        product.trend = 100; // New product
      }
    });

    return Object.values(productMap);
  }, [bills]);

  // Generate AI recommendations
  const recommendations = useMemo(() => {
    const recs: Recommendation[] = [];
    let recId = 0;

    // Sort products by various metrics
    const topSellers = [...productInsights].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);
    const fastestGrowing = [...productInsights].sort((a, b) => b.trend - a.trend).slice(0, 5);
    const slowMoving = [...productInsights].filter(p => p.daysActive > 7).sort((a, b) => b.daysActive - a.daysActive);

    // Recommendations for top sellers
    topSellers.forEach((product, index) => {
      if (index < 3 && product.trend > 20) {
        recs.push({
          id: `rec-${recId++}`,
          type: 'success',
          title: `Increase stock for ${product.name}`,
          description: `Sales increased ${product.trend.toFixed(1)}% this week. This is a top performer generating ₹${product.totalRevenue.toFixed(2)} in revenue.`,
          impact: 'high',
          action: 'Restock Now',
          productCode: product.code,
        });
      }
    });

    // Recommendations for fastest growing
    fastestGrowing.forEach((product, index) => {
      if (product.trend > 50 && index < 2) {
        recs.push({
          id: `rec-${recId++}`,
          type: 'info',
          title: `${product.name} is trending upward`,
          description: `Demand surged ${product.trend.toFixed(1)}% recently. Consider featuring this product prominently.`,
          impact: 'medium',
          action: 'View Trend',
          productCode: product.code,
        });
      }
    });

    // Recommendations for slow-moving items
    slowMoving.forEach((product, index) => {
      if (index < 3 && product.daysActive > 14) {
        recs.push({
          id: `rec-${recId++}`,
          type: 'warning',
          title: `${product.name} has slow movement`,
          description: `No sales in ${product.daysActive} days. Consider reducing inventory or running a promotion.`,
          impact: 'medium',
          action: 'Analyze Product',
          productCode: product.code,
        });
      }
    });

    // Revenue-based insights
    if (metrics.weekChange > 15) {
      recs.push({
        id: `rec-${recId++}`,
        type: 'success',
        title: 'Strong weekly performance',
        description: `Revenue increased ${metrics.weekChange.toFixed(1)}% compared to last week. Maintain current inventory levels.`,
        impact: 'high',
      });
    } else if (metrics.weekChange < -15) {
      recs.push({
        id: `rec-${recId++}`,
        type: 'warning',
        title: 'Revenue decline detected',
        description: `Sales decreased ${Math.abs(metrics.weekChange).toFixed(1)}% this week. Review pricing and promotions.`,
        impact: 'high',
      });
    }

    // Category insights
    const categoryRevenue: { [key: string]: number } = {};
    filteredBills.forEach(bill => {
      bill.items.forEach(item => {
        const category = item.name.split(' ')[0] || 'Other';
        categoryRevenue[category] = (categoryRevenue[category] || 0) + (item.price * item.quantity);
      });
    });

    const topCategory = Object.entries(categoryRevenue).sort((a, b) => b[1] - a[1])[0];
    if (topCategory) {
      const totalRevenue = Object.values(categoryRevenue).reduce((sum, val) => sum + val, 0);
      const percentage = (topCategory[1] / totalRevenue) * 100;
      
      if (percentage > 30) {
        recs.push({
          id: `rec-${recId++}`,
          type: 'info',
          title: `${topCategory[0]} category dominates sales`,
          description: `This category generates ${percentage.toFixed(1)}% of total revenue (₹${topCategory[1].toFixed(2)}). Expanding this category could boost sales.`,
          impact: 'high',
        });
      }
    }

    return recs;
  }, [productInsights, metrics, filteredBills]);

  // Generate upcoming events and opportunities
  const upcomingEvents = useMemo(() => {
    const events: Event[] = [];
    const now = new Date();

    // Define major festivals and events for 2026
    const eventDates = [
      { name: 'Holi', date: new Date('2026-03-14'), tips: ['Stock up on colors, sweets, and snacks', 'Expect higher foot traffic', 'Prepare festive packaging'] },
      { name: 'Ramadan', date: new Date('2026-03-23'), tips: ['Increase dates and traditional foods', 'Extend evening hours', 'Offer bulk discounts'] },
      { name: 'Easter', date: new Date('2026-04-12'), tips: ['Stock chocolates and gift items', 'Prepare Easter-themed displays', 'Offer family packs'] },
      { name: 'Diwali', date: new Date('2026-10-25'), tips: ['Stock sweets, snacks, and gift hampers', 'Sales typically increase 40-60%', 'Prepare for bulk orders'] },
      { name: 'Christmas', date: new Date('2026-12-25'), tips: ['Stock cakes, chocolates, and beverages', 'Offer gift wrapping services', 'Extended hours needed'] },
      { name: 'New Year', date: new Date('2026-12-31'), tips: ['Stock party supplies and beverages', 'Peak sales in evening hours', 'Prepare for high volume'] },
    ];

    eventDates.forEach(event => {
      const daysAway = Math.ceil((event.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAway > 0 && daysAway <= 45) {
        events.push({
          name: event.name,
          date: event.date,
          daysAway,
          suggestions: event.tips,
        });
      }
    });

    // Weekend opportunities
    const nextWeekend = new Date(now);
    const daysUntilWeekend = (6 - now.getDay() + 7) % 7 || 7;
    nextWeekend.setDate(now.getDate() + daysUntilWeekend);

    // Analyze if weekends have higher sales
    const weekendBills = bills.filter(b => {
      const day = new Date(b.date).getDay();
      return day === 0 || day === 6;
    });
    const weekdayBills = bills.filter(b => {
      const day = new Date(b.date).getDay();
      return day > 0 && day < 6;
    });

    const avgWeekendSales = weekendBills.length > 0 
      ? weekendBills.reduce((sum, b) => sum + b.total, 0) / weekendBills.length 
      : 0;
    const avgWeekdaySales = weekdayBills.length > 0 
      ? weekdayBills.reduce((sum, b) => sum + b.total, 0) / weekdayBills.length 
      : 0;

    if (avgWeekendSales > avgWeekdaySales * 1.2) {
      events.push({
        name: 'Weekend Rush',
        date: nextWeekend,
        daysAway: daysUntilWeekend,
        suggestions: [
          `Weekend sales are ${((avgWeekendSales / avgWeekdaySales - 1) * 100).toFixed(0)}% higher than weekdays`,
          'Increase staff and stock before Friday evening',
          'Prepare for peak hours between 6-9 PM',
        ],
      });
    }

    return events.sort((a, b) => a.daysAway - b.daysAway);
  }, [bills]);

  // Capital allocation insights
  const capitalAllocation = useMemo(() => {
    const totalRevenue = productInsights.reduce((sum, p) => sum + p.totalRevenue, 0);
    
    const highPerformers = productInsights
      .filter(p => p.trend > 0 && p.totalRevenue > totalRevenue * 0.05)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5);

    const lowPerformers = productInsights
      .filter(p => p.daysActive > 10 || p.trend < -20)
      .sort((a, b) => a.totalRevenue - b.totalRevenue)
      .slice(0, 5);

    const totalHighPerformerRevenue = highPerformers.reduce((sum, p) => sum + p.totalRevenue, 0);
    const totalLowPerformerRevenue = lowPerformers.reduce((sum, p) => sum + p.totalRevenue, 0);

    return {
      highPerformers,
      lowPerformers,
      suggestedIncrease: totalHighPerformerRevenue,
      suggestedDecrease: totalLowPerformerRevenue,
      highPerformerPercentage: (totalHighPerformerRevenue / totalRevenue) * 100,
    };
  }, [productInsights]);

  // Hourly sales trend data
  const hourlySalesTrend = useMemo(() => {
    const hourlyData: { [key: number]: number } = {};
    for (let i = 0; i < 24; i++) {
      hourlyData[i] = 0;
    }

    filteredBills.forEach(bill => {
      const hour = new Date(bill.date).getHours();
      hourlyData[hour] += bill.total;
    });

    return Object.entries(hourlyData).map(([hour, sales]) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      sales,
    }));
  }, [filteredBills]);

  // Product rankings
  const topProducts = useMemo(() => {
    return [...productInsights].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10);
  }, [productInsights]);

  const fastestGrowingProducts = useMemo(() => {
    return [...productInsights]
      .filter(p => p.trend > 0)
      .sort((a, b) => b.trend - a.trend)
      .slice(0, 10);
  }, [productInsights]);

  const slowMovingProducts = useMemo(() => {
    return [...productInsights]
      .filter(p => p.daysActive > 5)
      .sort((a, b) => b.daysActive - a.daysActive)
      .slice(0, 10);
  }, [productInsights]);

  return (
    <div className={`space-y-6 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
      {/* Sales Performance Overview */}
      <div className="mb-8">
        <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
          <Target className="text-purple-500" size={24} />
          Sales Performance Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <PerformanceCard
            title="Sales Today"
            value={`₹${metrics.totalSalesToday.toFixed(2)}`}
            change={metrics.todayChange}
            icon={<DollarSign size={24} />}
            color="from-blue-500 to-blue-600"
            darkMode={darkMode}
          />
          <PerformanceCard
            title="Weekly Revenue"
            value={`₹${metrics.totalSalesWeek.toFixed(2)}`}
            change={metrics.weekChange}
            icon={<TrendingUp size={24} />}
            color="from-green-500 to-green-600"
            darkMode={darkMode}
          />
          <PerformanceCard
            title="Monthly Revenue"
            value={`₹${metrics.totalSalesMonth.toFixed(2)}`}
            change={metrics.monthChange}
            icon={<Calendar size={24} />}
            color="from-purple-500 to-purple-600"
            darkMode={darkMode}
          />
          <PerformanceCard
            title="Avg Bill Value"
            value={`₹${metrics.avgBillValue.toFixed(2)}`}
            change={metrics.avgBillChange}
            icon={<ShoppingCart size={24} />}
            color="from-orange-500 to-orange-600"
            darkMode={darkMode}
          />
          <PerformanceCard
            title="Transactions"
            value={metrics.totalTransactions.toString()}
            change={metrics.transactionChange}
            icon={<Receipt size={24} />}
            color="from-pink-500 to-pink-600"
            darkMode={darkMode}
          />
        </div>
      </div>

      {/* Sales Trend Analysis */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6 mb-8`}>
        <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
          <TrendingUp className="text-blue-500" size={24} />
          Revenue Trend Analysis
        </h2>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={hourlySalesTrend.filter(d => d.sales > 0)}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
            <XAxis dataKey="hour" stroke={darkMode ? '#9ca3af' : '#6b7280'} />
            <YAxis stroke={darkMode ? '#9ca3af' : '#6b7280'} />
            <Tooltip
              contentStyle={{
                backgroundColor: darkMode ? '#1f2937' : '#fff',
                border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                borderRadius: '8px',
                color: darkMode ? '#fff' : '#000',
              }}
            />
            <Area
              type="monotone"
              dataKey="sales"
              stroke="#8b5cf6"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Product Demand Insights */}
      <div className="mb-8">
        <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
          <Package className="text-green-500" size={24} />
          Product Demand Insights
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Most Sold Items */}
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
              <Zap className="text-yellow-500" size={20} />
              Top Sellers
            </h3>
            <div className="space-y-3">
              {topProducts.slice(0, 5).map((product, index) => (
                <div
                  key={product.code}
                  className={`flex items-center justify-between p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-full font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'} text-sm`}>
                        {product.name}
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {product.totalQuantity} units
                      </p>
                    </div>
                  </div>
                  <p className="font-bold text-green-600 text-sm">₹{product.totalRevenue.toFixed(0)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Fastest Growing */}
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
              <ArrowUpRight className="text-blue-500" size={20} />
              Fastest Growing
            </h3>
            <div className="space-y-3">
              {fastestGrowingProducts.slice(0, 5).map((product, index) => (
                <div
                  key={product.code}
                  className={`flex items-center justify-between p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'} text-sm`}>
                        {product.name}
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {product.totalQuantity} units
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-600 text-sm">↑{product.trend.toFixed(0)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Slow Moving */}
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
              <ArrowDownRight className="text-orange-500" size={20} />
              Slow Moving
            </h3>
            <div className="space-y-3">
              {slowMovingProducts.slice(0, 5).map((product, index) => (
                <div
                  key={product.code}
                  className={`flex items-center justify-between p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-full font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'} text-sm`}>
                        {product.name}
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Last sold {product.daysActive}d ago
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {product.totalQuantity} units
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* AI Recommendations Panel */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6 mb-8`}>
        <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
          <Lightbulb className="text-yellow-500" size={24} />
          Recommended Actions
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {recommendations.map((rec) => (
            <RecommendationCard key={rec.id} recommendation={rec} darkMode={darkMode} />
          ))}
          {recommendations.length === 0 && (
            <p className={`col-span-2 text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              No recommendations at this time. Keep collecting sales data for better insights.
            </p>
          )}
        </div>
      </div>

      {/* Upcoming Opportunities */}
      {upcomingEvents.length > 0 && (
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6 mb-8`}>
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
            <Calendar className="text-indigo-500" size={24} />
            Upcoming Opportunities
          </h2>
          <div className="space-y-4">
            {upcomingEvents.map((event, index) => (
              <div
                key={index}
                className={`p-5 border-l-4 ${
                  event.daysAway <= 7
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : event.daysAway <= 14
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                    : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                } rounded-lg`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                      {event.name}
                    </h3>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                      {event.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${
                      event.daysAway <= 7
                        ? 'text-red-600'
                        : event.daysAway <= 14
                        ? 'text-orange-600'
                        : 'text-blue-600'
                    }`}>
                      {event.daysAway}
                    </p>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>days away</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {event.suggestions.map((suggestion, idx) => (
                    <li
                      key={idx}
                      className={`flex items-start gap-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
                    >
                      <span className="text-green-500 mt-0.5">✓</span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capital Allocation Suggestions */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
        <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
          <DollarSign className="text-green-500" size={24} />
          Capital Allocation Strategy
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Increase Investment */}
          <div className={`p-5 ${darkMode ? 'bg-green-900/20' : 'bg-green-50'} border border-green-500 rounded-lg`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-green-500 rounded-lg">
                <ArrowUpRight className="text-white" size={24} />
              </div>
              <div>
                <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Increase Investment
                </h3>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  High performers generating {capitalAllocation.highPerformerPercentage.toFixed(1)}% of revenue
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {capitalAllocation.highPerformers.map((product, index) => (
                <div
                  key={product.code}
                  className={`flex items-center justify-between p-3 ${darkMode ? 'bg-gray-700' : 'bg-white'} rounded-lg`}
                >
                  <div>
                    <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'} text-sm`}>
                      {product.name}
                    </p>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Trend: {product.trend > 0 ? '+' : ''}{product.trend.toFixed(0)}%
                    </p>
                  </div>
                  <p className="font-bold text-green-600 text-sm">₹{product.totalRevenue.toFixed(0)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Reduce Investment */}
          <div className={`p-5 ${darkMode ? 'bg-orange-900/20' : 'bg-orange-50'} border border-orange-500 rounded-lg`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-orange-500 rounded-lg">
                <ArrowDownRight className="text-white" size={24} />
              </div>
              <div>
                <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Reduce Investment
                </h3>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Consider reducing stock for slow-moving items
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {capitalAllocation.lowPerformers.map((product, index) => (
                <div
                  key={product.code}
                  className={`flex items-center justify-between p-3 ${darkMode ? 'bg-gray-700' : 'bg-white'} rounded-lg`}
                >
                  <div>
                    <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'} text-sm`}>
                      {product.name}
                    </p>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {product.daysActive}d since last sale
                    </p>
                  </div>
                  <p className={`font-medium text-orange-600 text-sm`}>₹{product.totalRevenue.toFixed(0)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`mt-6 p-4 ${darkMode ? 'bg-blue-900/20' : 'bg-blue-50'} border border-blue-500 rounded-lg`}>
          <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-800'} font-medium`}>
            💡 Strategic Tip: Allocate {capitalAllocation.highPerformerPercentage.toFixed(0)}% of your inventory budget to top performers and reduce spending on slow-moving items to optimize cash flow.
          </p>
        </div>
      </div>
    </div>
  );
}

interface PerformanceCardProps {
  title: string;
  value: string;
  change: number;
  icon: React.ReactNode;
  color: string;
  darkMode: boolean;
}

function PerformanceCard({ title, value, change, icon, color, darkMode }: PerformanceCardProps) {
  const isPositive = change >= 0;
  const showChange = !isNaN(change) && isFinite(change) && change !== 0;

  return (
    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`bg-gradient-to-br ${color} text-white p-3 rounded-lg`}>{icon}</div>
        {showChange && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold ${
              isPositive
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}
          >
            {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      <h3 className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>{title}</h3>
      <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{value}</p>
      {showChange && (
        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-2`}>
          vs. previous period
        </p>
      )}
    </div>
  );
}

interface RecommendationCardProps {
  recommendation: Recommendation;
  darkMode: boolean;
}

function RecommendationCard({ recommendation, darkMode }: RecommendationCardProps) {
  const typeConfig = {
    success: {
      bgClass: darkMode ? 'bg-green-900/20' : 'bg-green-50',
      borderClass: 'border-green-500',
      iconBg: 'bg-green-500',
      icon: <TrendingUp size={20} />,
    },
    warning: {
      bgClass: darkMode ? 'bg-orange-900/20' : 'bg-orange-50',
      borderClass: 'border-orange-500',
      iconBg: 'bg-orange-500',
      icon: <AlertTriangle size={20} />,
    },
    info: {
      bgClass: darkMode ? 'bg-blue-900/20' : 'bg-blue-50',
      borderClass: 'border-blue-500',
      iconBg: 'bg-blue-500',
      icon: <Lightbulb size={20} />,
    },
  };

  const config = typeConfig[recommendation.type];
  
  const impactColors = {
    high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    low: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  };

  return (
    <div className={`${config.bgClass} border ${config.borderClass} rounded-lg p-5`}>
      <div className="flex items-start gap-4">
        <div className={`${config.iconBg} text-white p-3 rounded-lg flex-shrink-0`}>
          {config.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              {recommendation.title}
            </h3>
            <span className={`px-2 py-1 rounded text-xs font-bold ${impactColors[recommendation.impact]}`}>
              {recommendation.impact.toUpperCase()}
            </span>
          </div>
          <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-3`}>
            {recommendation.description}
          </p>
          {recommendation.action && (
            <button
              className={`px-4 py-2 ${config.iconBg} text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity`}
            >
              {recommendation.action}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}