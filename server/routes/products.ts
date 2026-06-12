import { Router, Response } from 'express';
import { db } from '../db';
import { AuthRequest, authenticateToken, requirePermission } from '../middleware/auth';

const router = Router();

// GET /api/products
router.get('/', authenticateToken, (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products').all();
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/products (requires access_inventory permission)
router.post('/', authenticateToken, requirePermission('access_inventory'), (req: AuthRequest, res: Response) => {
  const {
    id,
    sku,
    name,
    price,
    category,
    gst_rate,
    stock,
    low_stock_threshold,
    hsn_code,
    brand,
    uom,
    purchase_price,
    wholesale_price,
    mrp,
    discount_percent,
    batch_number,
    expiry_date,
    status,
    barcode_type,
    moq,
    distributor_price
  } = req.body;

  if (!id || !sku || !name || price === undefined || gst_rate === undefined || !uom) {
    return res.status(400).json({ error: 'Missing required Indian GST billing fields (id, sku, name, price, gst_rate, uom)' });
  }

  try {
    // Check if sku is already taken
    const existing = db.prepare('SELECT * FROM products WHERE sku = ?').get(sku);
    if (existing) {
      return res.status(400).json({ error: `Product with SKU "${sku}" already exists` });
    }

    db.prepare(`
      INSERT INTO products (
        id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code,
        brand, uom, purchase_price, wholesale_price, mrp, discount_percent, 
        batch_number, expiry_date, status, barcode_type, moq, distributor_price
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sku,
      name,
      Number(price),
      category || 'General',
      Number(gst_rate || 0),
      Number(stock || 0),
      Number(low_stock_threshold || 10),
      hsn_code,
      brand || '',
      uom || 'PCS',
      Number(purchase_price || 0),
      Number(wholesale_price || 0),
      Number(mrp || 0),
      Number(discount_percent || 0),
      batch_number || '',
      expiry_date || '',
      status || 'Active',
      barcode_type || 'EAN-13',
      Number(moq || 1),
      Number(distributor_price || 0)
    );

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

    // Broadcast WS update for stock
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      const allProducts = db.prepare('SELECT * FROM products').all();
      broadcast({ type: 'STOCK_UPDATED', data: allProducts });
    }

    res.status(201).json(product);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/products/:id (requires access_inventory permission)
router.put('/:id', authenticateToken, requirePermission('access_inventory'), (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    sku,
    name,
    price,
    category,
    gst_rate,
    stock,
    low_stock_threshold,
    hsn_code,
    brand,
    uom,
    purchase_price,
    wholesale_price,
    mrp,
    discount_percent,
    batch_number,
    expiry_date,
    status,
    barcode_type,
    moq,
    distributor_price
  } = req.body;

  if (!name || price === undefined || gst_rate === undefined || !uom) {
    return res.status(400).json({ error: 'Missing required Indian GST billing fields (name, price, gst_rate, uom)' });
  }

  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if sku is being updated to a duplicate
    if (sku && sku !== (product as any).sku) {
      const existing = db.prepare('SELECT * FROM products WHERE sku = ?').get(sku);
      if (existing) {
        return res.status(400).json({ error: `SKU "${sku}" is already in use by another product` });
      }
    }

    db.prepare(`
      UPDATE products
      SET sku = ?, name = ?, price = ?, category = ?, gst_rate = ?, stock = ?, low_stock_threshold = ?, hsn_code = ?,
          brand = ?, uom = ?, purchase_price = ?, wholesale_price = ?, mrp = ?, discount_percent = ?,
          batch_number = ?, expiry_date = ?, status = ?, barcode_type = ?, moq = ?, distributor_price = ?
      WHERE id = ?
    `).run(
      sku || (product as any).sku,
      name,
      Number(price),
      category || 'General',
      Number(gst_rate || 0),
      Number(stock || 0),
      Number(low_stock_threshold || 10),
      hsn_code,
      brand !== undefined ? brand : ((product as any).brand || ''),
      uom !== undefined ? uom : ((product as any).uom || 'PCS'),
      purchase_price !== undefined ? Number(purchase_price) : ((product as any).purchase_price || 0),
      wholesale_price !== undefined ? Number(wholesale_price) : ((product as any).wholesale_price || 0),
      mrp !== undefined ? Number(mrp) : ((product as any).mrp || 0),
      discount_percent !== undefined ? Number(discount_percent) : ((product as any).discount_percent || 0),
      batch_number !== undefined ? batch_number : ((product as any).batch_number || ''),
      expiry_date !== undefined ? expiry_date : ((product as any).expiry_date || ''),
      status !== undefined ? status : ((product as any).status || 'Active'),
      barcode_type !== undefined ? barcode_type : ((product as any).barcode_type || 'EAN-13'),
      moq !== undefined ? Number(moq) : ((product as any).moq || 1),
      distributor_price !== undefined ? Number(distributor_price) : ((product as any).distributor_price || 0),
      id
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

    // Broadcast WS update for stock
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      const allProducts = db.prepare('SELECT * FROM products').all();
      broadcast({ type: 'STOCK_UPDATED', data: allProducts });
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/products/:id (requires access_inventory permission)
router.delete('/:id', authenticateToken, requirePermission('access_inventory'), (req: AuthRequest, res: Response) => {
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
