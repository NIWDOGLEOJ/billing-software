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
export default router;
