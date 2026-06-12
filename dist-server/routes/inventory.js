import { Router } from 'express';
import { db } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
const router = Router();
// GET /api/inventory/warehouses - List all warehouses
router.get('/warehouses', authenticateToken, (req, res) => {
    try {
        const warehouses = db.prepare('SELECT * FROM warehouses').all();
        res.json(warehouses);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/inventory/warehouses - Create a new warehouse
router.post('/warehouses', authenticateToken, requirePermission('access_inventory'), (req, res) => {
    const { name, code, address } = req.body;
    if (!name || !code) {
        return res.status(400).json({ error: 'Missing warehouse name or code' });
    }
    try {
        const id = `wh_${Date.now()}`;
        const now = new Date().toISOString();
        db.prepare('INSERT INTO warehouses (id, name, code, address, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(id, name, code, address || '', now);
        const warehouse = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
        res.status(201).json(warehouse);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/inventory/ledger - Get chronological stock variation log
router.get('/ledger', authenticateToken, (req, res) => {
    try {
        const ledger = db.prepare(`
      SELECT il.*, p.name as product_name, p.sku as product_sku, wh.name as warehouse_name
      FROM inventory_ledger il
      JOIN products p ON il.product_id = p.id
      LEFT JOIN warehouses wh ON il.warehouse_id = wh.id
      ORDER BY il.timestamp DESC
    `).all();
        res.json(ledger);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/inventory/log - Create manual adjustment, damage, or audit log
router.post('/log', authenticateToken, requirePermission('access_inventory'), (req, res) => {
    const { product_id, warehouse_id, change_qty, type, notes, reference_id } = req.body;
    if (!product_id || !warehouse_id || change_qty === undefined || !type) {
        return res.status(400).json({ error: 'Missing required inventory ledger parameters' });
    }
    try {
        const id = `log_${Date.now()}`;
        const timestamp = new Date().toISOString();
        // Insert into ledger
        db.prepare(`
      INSERT INTO inventory_ledger (id, product_id, warehouse_id, change_qty, type, reference_id, notes, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, product_id, warehouse_id, Number(change_qty), type, reference_id || '', notes || '', timestamp);
        // Update main product stock level
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?')
            .run(Number(change_qty), product_id);
        const logEntry = db.prepare('SELECT * FROM inventory_ledger WHERE id = ?').get(id);
        // Broadcast update
        const broadcast = req.app.get('broadcast');
        if (broadcast) {
            const allProducts = db.prepare('SELECT * FROM products').all();
            broadcast({ type: 'STOCK_UPDATED', data: allProducts });
        }
        res.status(201).json(logEntry);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/inventory/transfer - Internal transfer between warehouses
router.post('/transfer', authenticateToken, requirePermission('access_inventory'), (req, res) => {
    const { product_id, from_warehouse_id, to_warehouse_id, quantity, notes } = req.body;
    if (!product_id || !from_warehouse_id || !to_warehouse_id || !quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Invalid transfer details' });
    }
    try {
        const timestamp = new Date().toISOString();
        // Log outbound from source
        const outId = `log_${Date.now()}_out`;
        db.prepare(`
      INSERT INTO inventory_ledger (id, product_id, warehouse_id, change_qty, type, notes, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(outId, product_id, from_warehouse_id, -Number(quantity), 'transfer', `Transfer to warehouse: ${to_warehouse_id}. ${notes || ''}`, timestamp);
        // Log inbound to destination
        const inId = `log_${Date.now()}_in`;
        db.prepare(`
      INSERT INTO inventory_ledger (id, product_id, warehouse_id, change_qty, type, notes, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(inId, product_id, to_warehouse_id, Number(quantity), 'transfer', `Transfer from warehouse: ${from_warehouse_id}. ${notes || ''}`, timestamp);
        res.json({ success: true, message: 'Stock transfer completed successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
