import { Router, Response } from 'express';
import { db } from '../db';
import { AuthRequest, authenticateToken, requirePermission } from '../middleware/auth';

const router = Router();

// GET /api/batches - List all active batches
router.get('/', authenticateToken, (req, res) => {
  const { product_id } = req.query;
  try {
    let query = `
      SELECT mb.*, p.name as product_name, p.sku as product_sku
      FROM medicine_batches mb
      JOIN products p ON mb.product_id = p.id
    `;
    const params: any[] = [];
    if (product_id) {
      query += ' WHERE mb.product_id = ?';
      params.push(product_id);
    }
    query += ' ORDER BY mb.expiry_date ASC';
    const batches = db.prepare(query).all(...params);
    res.json(batches);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/batches/expiries - Get batches near/past expiry
router.get('/expiries', authenticateToken, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const warningHorizonDate = new Date();
    warningHorizonDate.setDate(warningHorizonDate.getDate() + 90);
    const horizonStr = warningHorizonDate.toISOString().split('T')[0];

    const expiries = db.prepare(`
      SELECT mb.*, p.name as product_name, p.sku as product_sku
      FROM medicine_batches mb
      JOIN products p ON mb.product_id = p.id
      WHERE mb.expiry_date <= ?
      ORDER BY mb.expiry_date ASC
    `).all(horizonStr);
    
    res.json(expiries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/batches - Inward stock into a specific batch
router.post('/', authenticateToken, requirePermission('access_inventory'), (req: AuthRequest, res: Response) => {
  const { product_id, batch_number, expiry_date, manufacturing_date, stock_quantity, drug_license, prescription_required } = req.body;
  if (!product_id || !batch_number || !expiry_date || stock_quantity === undefined) {
    return res.status(400).json({ error: 'Missing required pharmacy batch inwarding fields' });
  }

  try {
    // Check if batch number is already taken for this product
    const existing = db.prepare('SELECT * FROM medicine_batches WHERE product_id = ? AND batch_number = ?')
      .get(product_id, batch_number) as any;

    const now = new Date().toISOString();

    if (existing) {
      // Update stock instead of insert
      db.prepare(`
        UPDATE medicine_batches 
        SET stock_quantity = stock_quantity + ?, expiry_date = ?, manufacturing_date = ?, drug_license = ?, prescription_required = ?
        WHERE product_id = ? AND batch_number = ?
      `).run(
        Number(stock_quantity),
        expiry_date,
        manufacturing_date || '',
        drug_license || null,
        Number(prescription_required || 0),
        product_id,
        batch_number
      );
    } else {
      const id = `b_${Date.now()}`;
      db.prepare(`
        INSERT INTO medicine_batches (id, product_id, batch_number, expiry_date, manufacturing_date, stock_quantity, drug_license, prescription_required, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        product_id,
        batch_number,
        expiry_date,
        manufacturing_date || '',
        Number(stock_quantity),
        drug_license || null,
        Number(prescription_required || 0),
        now
      );
    }

    // Increase general product table stock count as well
    db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?')
      .run(Number(stock_quantity), product_id);

    // Write to inventory ledger
    const logId = `log_${Date.now()}`;
    db.prepare(`
      INSERT INTO inventory_ledger (id, product_id, warehouse_id, change_qty, type, notes, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(logId, product_id, 'wh_main', Number(stock_quantity), 'purchase', `Inwarded batch: ${batch_number}`, now);

    // Broadcast WS update for stock
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      const allProducts = db.prepare('SELECT * FROM products').all();
      broadcast({ type: 'STOCK_UPDATED', data: allProducts });
    }

    res.status(201).json({ success: true, message: 'Pharmacy batch inwarded successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/batches/:id - Update batch stock or details
router.put('/:id', authenticateToken, requirePermission('access_inventory'), (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { stock_quantity, expiry_date, manufacturing_date, drug_license, prescription_required } = req.body;

  try {
    const batch = db.prepare('SELECT * FROM medicine_batches WHERE id = ?').get(id) as any;
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const currentStock = batch.stock_quantity;
    const diff = Number(stock_quantity) - currentStock;

    db.prepare(`
      UPDATE medicine_batches
      SET stock_quantity = ?, expiry_date = ?, manufacturing_date = ?, drug_license = ?, prescription_required = ?
      WHERE id = ?
    `).run(
      Number(stock_quantity),
      expiry_date || batch.expiry_date,
      manufacturing_date || batch.manufacturing_date,
      drug_license || batch.drug_license,
      Number(prescription_required !== undefined ? prescription_required : batch.prescription_required),
      id
    );

    if (diff !== 0) {
      // Adjust overall products table stock count
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?')
        .run(diff, batch.product_id);

      // Log in ledger
      const logId = `log_${Date.now()}`;
      db.prepare(`
        INSERT INTO inventory_ledger (id, product_id, warehouse_id, change_qty, type, notes, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(logId, batch.product_id, 'wh_main', diff, 'audit', `Updated batch: ${batch.batch_number} quantity to ${stock_quantity}`, new Date().toISOString());
    }

    // Broadcast update
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      const allProducts = db.prepare('SELECT * FROM products').all();
      broadcast({ type: 'STOCK_UPDATED', data: allProducts });
    }

    res.json({ success: true, message: 'Batch details updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/batches/:id - Remove batch
router.delete('/:id', authenticateToken, requirePermission('access_inventory'), (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const batch = db.prepare('SELECT * FROM medicine_batches WHERE id = ?').get(id) as any;
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Deduct stock from overall products table
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
      .run(batch.stock_quantity, batch.product_id);

    // Delete batch
    db.prepare('DELETE FROM medicine_batches WHERE id = ?').run(id);

    // Log ledger
    const logId = `log_${Date.now()}`;
    db.prepare(`
      INSERT INTO inventory_ledger (id, product_id, warehouse_id, change_qty, type, notes, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(logId, batch.product_id, 'wh_main', -batch.stock_quantity, 'audit', `Deleted batch: ${batch.batch_number}`, new Date().toISOString());

    // Broadcast update
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      const allProducts = db.prepare('SELECT * FROM products').all();
      broadcast({ type: 'STOCK_UPDATED', data: allProducts });
    }

    res.json({ success: true, message: 'Batch removed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
