import { Router } from 'express';
import { db } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
const router = Router();
// GET /api/products
router.get('/', authenticateToken, (req, res) => {
    try {
        const products = db.prepare('SELECT * FROM products').all();
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/products (requires access_inventory permission)
router.post('/', authenticateToken, requirePermission('access_inventory'), (req, res) => {
    const { id, sku, name, price, category, gst_rate, stock, low_stock_threshold } = req.body;
    if (!id || !sku || !name || price === undefined) {
        return res.status(400).json({ error: 'Missing required fields (id, sku, name, price)' });
    }
    try {
        // Check if sku is already taken
        const existing = db.prepare('SELECT * FROM products WHERE sku = ?').get(sku);
        if (existing) {
            return res.status(400).json({ error: `Product with SKU "${sku}" already exists` });
        }
        db.prepare(`
      INSERT INTO products (id, sku, name, price, category, gst_rate, stock, low_stock_threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sku, name, Number(price), category || 'General', Number(gst_rate || 0), Number(stock || 0), Number(low_stock_threshold || 10));
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        // Broadcast WS update for stock
        const broadcast = req.app.get('broadcast');
        if (broadcast) {
            const allProducts = db.prepare('SELECT * FROM products').all();
            broadcast({ type: 'STOCK_UPDATED', data: allProducts });
        }
        res.status(201).json(product);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/products/:id (requires access_inventory permission)
router.put('/:id', authenticateToken, requirePermission('access_inventory'), (req, res) => {
    const { id } = req.params;
    const { sku, name, price, category, gst_rate, stock, low_stock_threshold } = req.body;
    if (!name || price === undefined) {
        return res.status(400).json({ error: 'Missing required fields (name, price)' });
    }
    try {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        // Check if sku is being updated to a duplicate
        if (sku && sku !== product.sku) {
            const existing = db.prepare('SELECT * FROM products WHERE sku = ?').get(sku);
            if (existing) {
                return res.status(400).json({ error: `SKU "${sku}" is already in use by another product` });
            }
        }
        db.prepare(`
      UPDATE products
      SET sku = ?, name = ?, price = ?, category = ?, gst_rate = ?, stock = ?, low_stock_threshold = ?
      WHERE id = ?
    `).run(sku || product.sku, name, Number(price), category || 'General', Number(gst_rate || 0), Number(stock || 0), Number(low_stock_threshold || 10), id);
        const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        // Broadcast WS update for stock
        const broadcast = req.app.get('broadcast');
        if (broadcast) {
            const allProducts = db.prepare('SELECT * FROM products').all();
            broadcast({ type: 'STOCK_UPDATED', data: allProducts });
        }
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/products/:id (requires access_inventory permission)
router.delete('/:id', authenticateToken, requirePermission('access_inventory'), (req, res) => {
    const { id } = req.params;
    try {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
        // Broadcast WS update for stock
        const broadcast = req.app.get('broadcast');
        if (broadcast) {
            const allProducts = db.prepare('SELECT * FROM products').all();
            broadcast({ type: 'STOCK_UPDATED', data: allProducts });
        }
        res.json({ success: true, message: 'Product deleted' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
