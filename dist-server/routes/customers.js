import { Router } from 'express';
import { db } from '../db';
import { authenticateToken } from '../middleware/auth';
const router = Router();
// GET /api/customers — get all customers
router.get('/', authenticateToken, (req, res) => {
    try {
        const customers = db.prepare('SELECT * FROM customers').all();
        res.json(customers);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/customers/:phone — lookup single customer
router.get('/:phone', authenticateToken, (req, res) => {
    const { phone } = req.params;
    try {
        const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json(customer);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/customers/:phone — update customer details
router.put('/:phone', authenticateToken, (req, res) => {
    const { phone } = req.params;
    const { name, loyalty_points, total_spent, visit_count } = req.body;
    try {
        const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
        if (!customer) {
            // Create new customer
            db.prepare(`
        INSERT INTO customers (phone, name, loyalty_points, total_spent, visit_count, last_visit)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(phone, name || 'Walk-in Customer', Number(loyalty_points || 0), Number(total_spent || 0), Number(visit_count || 1), new Date().toISOString());
        }
        else {
            // Update existing customer
            db.prepare(`
        UPDATE customers
        SET name = ?, loyalty_points = ?, total_spent = ?, visit_count = ?, last_visit = ?
        WHERE phone = ?
      `).run(name !== undefined ? name : customer.name, loyalty_points !== undefined ? Number(loyalty_points) : customer.loyalty_points, total_spent !== undefined ? Number(total_spent) : customer.total_spent, visit_count !== undefined ? Number(visit_count) : customer.visit_count, new Date().toISOString(), phone);
        }
        const updated = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/customers/:phone/pay-balance — Settle outstanding ledger balance
router.post('/:phone/pay-balance', authenticateToken, (req, res) => {
    const { phone } = req.params;
    const { amount, paymentMode } = req.body;
    if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Valid payment amount is required' });
    }
    try {
        const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        const currentBalance = customer.outstanding_balance || 0;
        const newBalance = Math.max(0, currentBalance - Number(amount));
        db.prepare('UPDATE customers SET outstanding_balance = ? WHERE phone = ?').run(newBalance, phone);
        // Save virtual bill to reconcile shifts & Z-reports expected totals!
        const billId = `pay_${Math.random().toString(36).substring(2, 15)}`;
        const billNum = `PAY-${Date.now().toString().slice(-6)}`;
        const dateStr = new Date().toISOString();
        db.prepare(`
      INSERT INTO bills (
        id, bill_number, date, cashier_id, cashier_name,
        customer_phone, customer_name, subtotal, gst_amount, cgst, sgst,
        total, payment_mode, amount_received, change_amount, rounding_adjustment,
        points_earned, points_redeemed, items, shop_details, gst_enabled, gst_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(billId, billNum, dateStr, req.user?.id || null, req.user?.name || null, phone, customer.name, 0, 0, 0, 0, Number(amount), paymentMode || 'cash', Number(amount), 0, 0, 0, 0, JSON.stringify([{ id: 'ledger_payment', name: 'Ledger Balance Settle Payment', price: Number(amount), quantity: 1 }]), null, 0, 0);
        const updated = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
        // Broadcast live update to LAN clients
        const broadcast = req.app.get('broadcast');
        if (broadcast) {
            broadcast({ type: 'CUSTOMER_UPDATED', data: updated });
            const payBill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
            if (payBill) {
                payBill.items = JSON.parse(payBill.items || '[]');
            }
            broadcast({ type: 'BILL_CREATED', data: payBill });
        }
        res.json({ success: true, customer: updated, amountPaid: Number(amount) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
