import { Router } from 'express';
import { db } from '../db';
import { authenticateToken, requireOwner, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/summary', authenticateToken, (req: AuthRequest, res) => {
  // If employee, verify view_analytics permission
  if (req.user?.role === 'employee' && !req.user.permissions.includes('view_analytics')) {
    return res.status(403).json({ error: 'Permission required: view_analytics' });
  }

  try {
    const bills = db.prepare('SELECT * FROM bills').all() as any[];
    const products = db.prepare('SELECT * FROM products').all() as any[];

    let totalRevenue = 0;
    let totalTransactions = bills.length;
    let totalItemsSold = 0;
    let gstCollected = 0;
    const categorySales: { [key: string]: number } = {};
    const topProductsMap: { [key: string]: { name: string; sku: string; quantity: number; sales: number } } = {};

    for (const bill of bills) {
      totalRevenue += bill.total;
      gstCollected += bill.gst_amount || 0;

      let items: any[] = [];
      try {
        items = JSON.parse(bill.items || '[]');
      } catch {}

      for (const item of items) {
        totalItemsSold += item.quantity || 1;
        const itemTotal = (item.price * item.quantity) || 0;

        // Top products
        if (!topProductsMap[item.id]) {
          topProductsMap[item.id] = {
            name: item.name || 'Unknown',
            sku: item.sku || '',
            quantity: 0,
            sales: 0
          };
        }
        topProductsMap[item.id].quantity += item.quantity || 1;
        topProductsMap[item.id].sales += itemTotal;

        // Category sales
        const cat = item.category || 'General';
        categorySales[cat] = (categorySales[cat] || 0) + itemTotal;
      }
    }

    // Sort top products
    const topProducts = Object.values(topProductsMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Format category sales
    const formattedCategorySales = Object.keys(categorySales).map(name => ({
      name,
      value: Number(categorySales[name].toFixed(2))
    }));

    // Low stock count
    const lowStockCount = products.filter(p => p.stock <= p.low_stock_threshold).length;

    res.json({
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalTransactions,
      averageOrderValue: totalTransactions > 0 ? Number((totalRevenue / totalTransactions).toFixed(2)) : 0,
      totalItemsSold,
      gstCollected: Number(gstCollected.toFixed(2)),
      lowStockCount,
      topProducts,
      categorySales: formattedCategorySales
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/sales (time series data for charts)
router.get('/sales', authenticateToken, (req: AuthRequest, res) => {
  // If employee, verify view_analytics permission
  if (req.user?.role === 'employee' && !req.user.permissions.includes('view_analytics')) {
    return res.status(403).json({ error: 'Permission required: view_analytics' });
  }

  const { range } = req.query; // 'today' | 'week' | 'month' | 'year'

  try {
    const bills = db.prepare('SELECT total, date FROM bills ORDER BY date ASC').all() as any[];

    // Let's bucket bills based on selected range
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const isToday = range === 'today';
    const isWeek = range === 'week';
    const isMonth = range === 'month';

    const result: { [key: string]: { date: string; sales: number; transactions: number } } = {};

    for (const b of bills) {
      const bDate = new Date(b.date);
      const bDateStr = b.date.split('T')[0];

      let key = bDateStr; // default key is date

      if (isToday) {
        // Hour-based bucket for today
        if (bDateStr !== todayStr) continue;
        const hour = bDate.getHours();
        key = `${hour.toString().padStart(2, '0')}:00`;
      } else if (isWeek) {
        // Last 7 days filter
        const diffTime = Math.abs(now.getTime() - bDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 7) continue;
        key = bDate.toLocaleDateString('en-US', { weekday: 'short' });
      } else if (isMonth) {
        // Last 30 days filter
        const diffTime = Math.abs(now.getTime() - bDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 30) continue;
        // Keep key as YYYY-MM-DD
      } else {
        // Year filter (group by month)
        if (bDate.getFullYear() !== now.getFullYear()) continue;
        key = bDate.toLocaleDateString('en-US', { month: 'short' });
      }

      if (!result[key]) {
        result[key] = { date: key, sales: 0, transactions: 0 };
      }
      result[key].sales += b.total;
      result[key].transactions += 1;
    }

    // Format sales numbers
    const finalData = Object.values(result).map(r => ({
      ...r,
      sales: Number(r.sales.toFixed(2))
    }));

    res.json(finalData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/employee-performance (requires owner/co-owner)
router.get('/employee-performance', authenticateToken, requireOwner, (req, res) => {
  try {
    const bills = db.prepare("SELECT cashier_id, cashier_name, total FROM bills WHERE cashier_id != 'dev_1'").all() as any[];
    const sessions = db.prepare("SELECT user_id, duration FROM login_sessions WHERE user_id != 'dev_1'").all() as any[];
    const breaks = db.prepare("SELECT user_id, duration FROM break_records WHERE duration IS NOT NULL AND user_id != 'dev_1'").all() as any[];
    const users = db.prepare("SELECT id, name, role FROM users WHERE username != 'developer' AND id != 'dev_1'").all() as any[];

    const statsMap: { [key: string]: { id: string; name: string; role: string; sales: number; transactions: number; shiftMinutes: number; breakMinutes: number } } = {};

    for (const u of users) {
      statsMap[u.id] = {
        id: u.id,
        name: u.name,
        role: u.role,
        sales: 0,
        transactions: 0,
        shiftMinutes: 0,
        breakMinutes: 0
      };
    }

    // Aggregate bills
    for (const b of bills) {
      if (b.cashier_id && statsMap[b.cashier_id]) {
        statsMap[b.cashier_id].sales += b.total;
        statsMap[b.cashier_id].transactions += 1;
      }
    }

    // Aggregate shift duration (seconds to minutes)
    for (const s of sessions) {
      if (s.user_id && statsMap[s.user_id]) {
        statsMap[s.user_id].shiftMinutes += Math.round((s.duration || 0) / 60);
      }
    }

    // Aggregate break duration (seconds to minutes)
    for (const br of breaks) {
      if (br.user_id && statsMap[br.user_id]) {
        statsMap[br.user_id].breakMinutes += Math.round((br.duration || 0) / 60);
      }
    }

    const performance = Object.values(statsMap).map(p => ({
      ...p,
      sales: Number(p.sales.toFixed(2))
    }));

    res.json(performance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
