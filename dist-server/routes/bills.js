import { Router } from 'express';
import { db } from '../db';
import { authenticateToken } from '../middleware/auth';
const router = Router();
// GET /api/bills (query history)
router.get('/', authenticateToken, (req, res) => {
    try {
        const bills = db.prepare("SELECT * FROM bills WHERE cashier_id != 'dev_1' ORDER BY date DESC").all();
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
    const { id, bill_number, date, customer_phone, customer_name, subtotal, gst_amount, cgst, sgst, igst, total, payment_mode, amount_received, change_amount, rounding_adjustment, points_earned, points_redeemed, items, shop_details, gst_enabled, gst_rate, customer_gstin, pricing_tier } = req.body;
    if (!id || !bill_number || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Missing required fields (id, bill_number, items)' });
    }
    // Database transaction for stock updates and bill generation
    const transaction = db.transaction(() => {
        // 1. Insert bill
        db.prepare(`
      INSERT INTO bills (
        id, bill_number, date, cashier_id, cashier_name,
        customer_phone, customer_name, subtotal, gst_amount, cgst, sgst, igst,
        total, payment_mode, amount_received, change_amount, rounding_adjustment,
        points_earned, points_redeemed, items, shop_details, gst_enabled, gst_rate,
        customer_gstin, pricing_tier
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, bill_number, date || new Date().toISOString(), req.user?.id || null, req.user?.name || null, customer_phone || null, customer_name || null, Number(subtotal || 0), Number(gst_amount || 0), Number(cgst || 0), Number(sgst || 0), Number(igst || 0), Number(total), payment_mode || 'cash', amount_received !== undefined ? Number(amount_received) : null, change_amount !== undefined ? Number(change_amount) : null, Number(rounding_adjustment || 0), Number(points_earned || 0), Number(points_redeemed || 0), JSON.stringify(items), shop_details ? JSON.stringify(shop_details) : null, gst_enabled ? 1 : 0, Number(gst_rate || 0), customer_gstin || null, pricing_tier || 'retail');
        // 2. Deduct product stock & update inventory ledgers / batches
        for (const item of items) {
            const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.id);
            if (prod) {
                const newStock = Math.max(0, prod.stock - item.quantity);
                db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, item.id);
            }
            // Deduct from pharmacy batch if applicable
            if (item.selectedBatch) {
                db.prepare('UPDATE medicine_batches SET stock_quantity = MAX(0, stock_quantity - ?) WHERE product_id = ? AND batch_number = ?')
                    .run(item.quantity, item.id, item.selectedBatch);
            }
            // Record transaction movement in inventory ledger
            const ledgerId = `log_${Date.now()}_${item.id}_${Math.random().toString(36).substring(2, 6)}`;
            db.prepare(`
        INSERT INTO inventory_ledger (id, product_id, warehouse_id, change_qty, type, reference_id, notes, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ledgerId, item.id, 'wh_main', -item.quantity, 'sale', bill_number, `Sold via bill #${bill_number}${item.selectedBatch ? ` (Batch: ${item.selectedBatch})` : ''}`, date || new Date().toISOString());
        }
        // 3. Update customer details/loyalty/gstin if phone provided
        if (customer_phone) {
            const existingCust = db.prepare('SELECT * FROM customers WHERE phone = ?').get(customer_phone);
            const earned = Number(points_earned || 0);
            const redeemed = Number(points_redeemed || 0);
            const netPoints = earned - redeemed;
            if (existingCust) {
                const newPoints = Math.max(0, existingCust.loyalty_points + netPoints);
                const newTotalSpent = existingCust.total_spent + Number(total);
                const newVisitCount = existingCust.visit_count + 1;
                let newOutstanding = existingCust.outstanding_balance || 0;
                if (payment_mode === 'ledger') {
                    newOutstanding += Number(total);
                }
                db.prepare(`
          UPDATE customers
          SET name = ?, loyalty_points = ?, total_spent = ?, visit_count = ?, last_visit = ?, outstanding_balance = ?, gstin = COALESCE(?, gstin)
          WHERE phone = ?
        `).run(customer_name || existingCust.name, newPoints, newTotalSpent, newVisitCount, date || new Date().toISOString(), newOutstanding, customer_gstin || null, customer_phone);
            }
            else {
                const newOutstanding = payment_mode === 'ledger' ? Number(total) : 0;
                db.prepare(`
          INSERT INTO customers (phone, name, loyalty_points, total_spent, visit_count, last_visit, outstanding_balance, gstin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(customer_phone, customer_name || 'Walk-in Customer', Math.max(0, netPoints), Number(total), 1, date || new Date().toISOString(), newOutstanding, customer_gstin || null);
            }
        }
        // If cashier is on a mobile session, logging in doesn't count for attendance/session actively UNLESS they checkout/bill!
        // So we mark the session as a valid active attendance session immediately upon bill generation.
        if (req.user && req.user.sessionId) {
            db.prepare("UPDATE login_sessions SET is_attendance = 1 WHERE id = ?").run(req.user.sessionId);
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
            if (req.user && req.user.id !== 'dev_1') {
                broadcast({ type: 'BILL_CREATED', data: createdBill });
            }
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
