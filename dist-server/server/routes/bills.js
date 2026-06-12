import { Router } from 'express';
import { db } from '../db';
import { authenticateToken } from '../middleware/auth';
const router = Router();
// GET /api/bills (query history)
router.get('/', authenticateToken, (req, res) => {
    try {
        const bills = db.prepare('SELECT * FROM bills ORDER BY date DESC').all();
        // Parse items JSON in each bill
        const parsedBills = bills.map((b) => ({
            ...b,
            items: JSON.parse(b.items || '[]'),
            shop_details: b.shop_details ? JSON.parse(b.shop_details) : null,
            gst_enabled: Boolean(b.gst_enabled)
        }));
        res.json(parsedBills);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/bills (save completed checkout)
router.post('/', authenticateToken, (req, res) => {
    const { id, bill_number, date, customer_phone, customer_name, subtotal, gst_amount, cgst, sgst, total, payment_mode, amount_received, change_amount, rounding_adjustment, points_earned, points_redeemed, items, shop_details, gst_enabled, gst_rate } = req.body;
    if (!id || !bill_number || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Missing required fields (id, bill_number, items)' });
    }
    // Database transaction for stock updates and bill generation
    const transaction = db.transaction(() => {
        // 1. Insert bill
        db.prepare(`
      INSERT INTO bills (
        id, bill_number, date, cashier_id, cashier_name,
        customer_phone, customer_name, subtotal, gst_amount, cgst, sgst,
        total, payment_mode, amount_received, change_amount, rounding_adjustment,
        points_earned, points_redeemed, items, shop_details, gst_enabled, gst_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, bill_number, date || new Date().toISOString(), req.user?.id || null, req.user?.name || null, customer_phone || null, customer_name || null, Number(subtotal || 0), Number(gst_amount || 0), Number(cgst || 0), Number(sgst || 0), Number(total), payment_mode || 'cash', amount_received !== undefined ? Number(amount_received) : null, change_amount !== undefined ? Number(change_amount) : null, Number(rounding_adjustment || 0), Number(points_earned || 0), Number(points_redeemed || 0), JSON.stringify(items), shop_details ? JSON.stringify(shop_details) : null, gst_enabled ? 1 : 0, Number(gst_rate || 0));
        // 2. Deduct product stock
        for (const item of items) {
            const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.id);
            if (prod) {
                const newStock = Math.max(0, prod.stock - item.quantity);
                db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, item.id);
            }
        }
        // 3. Update customer details/loyalty if phone provided
        if (customer_phone) {
            const existingCust = db.prepare('SELECT * FROM customers WHERE phone = ?').get(customer_phone);
            const earned = Number(points_earned || 0);
            const redeemed = Number(points_redeemed || 0);
            const netPoints = earned - redeemed;
            if (existingCust) {
                const newPoints = Math.max(0, existingCust.loyalty_points + netPoints);
                const newTotalSpent = existingCust.total_spent + Number(total);
                const newVisitCount = existingCust.visit_count + 1;
                db.prepare(`
          UPDATE customers
          SET name = ?, loyalty_points = ?, total_spent = ?, visit_count = ?, last_visit = ?
          WHERE phone = ?
        `).run(customer_name || existingCust.name, newPoints, newTotalSpent, newVisitCount, date || new Date().toISOString(), customer_phone);
            }
            else {
                db.prepare(`
          INSERT INTO customers (phone, name, loyalty_points, total_spent, visit_count, last_visit)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(customer_phone, customer_name || 'Walk-in Customer', Math.max(0, netPoints), Number(total), 1, date || new Date().toISOString());
            }
        }
    });
    try {
        transaction();
        const createdBill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
        if (createdBill) {
            createdBill.items = JSON.parse(createdBill.items || '[]');
            createdBill.shop_details = createdBill.shop_details ? JSON.parse(createdBill.shop_details) : null;
            createdBill.gst_enabled = Boolean(createdBill.gst_enabled);
        }
        // Broadcast WS update for stock and bills to all connected LAN clients
        const broadcast = req.app.get('broadcast');
        if (broadcast) {
            const allProducts = db.prepare('SELECT * FROM products').all();
            broadcast({ type: 'STOCK_UPDATED', data: allProducts });
            broadcast({ type: 'BILL_CREATED', data: createdBill });
        }
        res.status(201).json({
            bill: createdBill,
            triggerBroadcast: true
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
