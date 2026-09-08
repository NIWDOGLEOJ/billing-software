import { Router, Response } from 'express';
import { db } from '../db';
import { AuthRequest, authenticateToken, requirePermission } from '../middleware/auth';
import { processProductImageAsync } from '../services/imageProcessor';

const router = Router();

// GET /api/products/public - Public catalog for customer website without cashier auth token
router.get('/public', (_req, res) => {
  try {
    const products = db.prepare('SELECT id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code, brand, uom, mrp, discount_percent, status, image_url FROM products').all();
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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
router.post('/', authenticateToken, requirePermission('access_inventory'), async (req: AuthRequest, res: Response) => {
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
    distributor_price,
    image,
    image_url
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

    let finalImageUrl = image_url || '';
    if (image && typeof image === 'string' && image.trim()) {
      const trimmed = image.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/uploads/')) {
        finalImageUrl = trimmed;
      } else {
        try {
          finalImageUrl = await processProductImageAsync({
            productId: id,
            imageData: trimmed,
            broadcast: req.app.get('broadcast')
          });
        } catch (imgErr: any) {
          console.error('[Products] Notice starting image processing:', imgErr?.message);
        }
      }
    }

    db.prepare(`
      INSERT INTO products (
        id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code,
        brand, uom, purchase_price, wholesale_price, mrp, discount_percent, 
        batch_number, expiry_date, status, barcode_type, moq, distributor_price, image_url
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
      hsn_code || '',
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
      Number(distributor_price || 0),
      finalImageUrl
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

// POST /api/products/bulk (requires access_inventory permission)
router.post('/bulk', authenticateToken, requirePermission('access_inventory'), (req: AuthRequest, res: Response) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Array of products is required' });
  }

  try {
    const upsertStmt = db.prepare(`
      INSERT INTO products (
        id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code,
        brand, uom, purchase_price, wholesale_price, mrp, discount_percent,
        batch_number, expiry_date, status, barcode_type, moq, distributor_price
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sku) DO UPDATE SET
        name = excluded.name,
        price = excluded.price,
        category = excluded.category,
        gst_rate = excluded.gst_rate,
        stock = excluded.stock,
        low_stock_threshold = excluded.low_stock_threshold,
        hsn_code = excluded.hsn_code,
        brand = excluded.brand,
        uom = excluded.uom,
        purchase_price = excluded.purchase_price,
        wholesale_price = excluded.wholesale_price,
        mrp = excluded.mrp,
        discount_percent = excluded.discount_percent,
        status = excluded.status
    `);

    const transaction = db.transaction((items: any[]) => {
      let count = 0;
      for (const p of items) {
        const sku = (p.sku || p.code || '').trim();
        const name = (p.name || '').trim();
        if (!sku || !name) continue;

        const id = p.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const mrp = Number(p.mrp || p.price || 0);
        const price = Number(p.price !== undefined ? p.price : mrp);
        const category = p.category || p.cat || 'General';
        const gst_rate = Number(p.gst_rate ?? p.gst ?? 0);
        const stock = Number(p.stock || 0);
        const low_stock = Number(p.low_stock_threshold ?? p.reorder ?? 10);
        const hsn = p.hsn_code || p.hsn || '';
        const brand = p.brand || '';
        const uom = (p.uom || 'PCS').toUpperCase();
        const purchase_price = Number(p.purchase_price || (price * 0.7));
        const wholesale_price = Number(p.wholesale_price || (price * 0.9));
        const discount_percent = Number(p.discount_percent || 0);
        const batch_number = p.batch_number || '';
        const expiry_date = p.expiry_date || '';
        const status = p.status || 'Active';
        const barcode_type = p.barcode_type || 'EAN-13';
        const moq = Number(p.moq || 1);
        const distributor_price = Number(p.distributor_price || 0);

        upsertStmt.run(
          id, sku, name, price, category, gst_rate, stock, low_stock, hsn,
          brand, uom, purchase_price, wholesale_price, mrp, discount_percent,
          batch_number, expiry_date, status, barcode_type, moq, distributor_price
        );
        count++;
      }
      return count;
    });

    const importedCount = transaction(products);

    // Broadcast WS update for stock
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      const allProducts = db.prepare('SELECT * FROM products').all();
      broadcast({ type: 'STOCK_UPDATED', data: allProducts });
    }

    res.json({ success: true, count: importedCount, message: `Successfully imported ${importedCount} products` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/products/:id (requires access_inventory permission)
router.put('/:id', authenticateToken, requirePermission('access_inventory'), async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
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
    distributor_price,
    image,
    image_url
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

    let finalImageUrl = image_url !== undefined ? image_url : ((product as any).image_url || '');
    if (image && typeof image === 'string' && image.trim()) {
      const trimmed = image.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/uploads/')) {
        finalImageUrl = trimmed;
      } else {
        try {
          finalImageUrl = await processProductImageAsync({
            productId: id,
            imageData: trimmed,
            broadcast: req.app.get('broadcast')
          });
        } catch (imgErr: any) {
          console.error('[Products] Notice starting image processing:', imgErr?.message);
        }
      }
    }

    db.prepare(`
      UPDATE products
      SET sku = ?, name = ?, price = ?, category = ?, gst_rate = ?, stock = ?, low_stock_threshold = ?, hsn_code = ?,
          brand = ?, uom = ?, purchase_price = ?, wholesale_price = ?, mrp = ?, discount_percent = ?,
          batch_number = ?, expiry_date = ?, status = ?, barcode_type = ?, moq = ?, distributor_price = ?, image_url = ?
      WHERE id = ?
    `).run(
      sku || (product as any).sku,
      name,
      Number(price),
      category || 'General',
      Number(gst_rate || 0),
      Number(stock || 0),
      Number(low_stock_threshold || 10),
      hsn_code || '',
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
      finalImageUrl,
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

// POST /api/products/:id/image - Upload/update product image with automatic white background enhancement
router.post('/:id/image', authenticateToken, requirePermission('access_inventory'), async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'Image base64 data is required' });
  }

  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const imageUrl = await processProductImageAsync({
      productId: id,
      imageData: image,
      broadcast: req.app.get('broadcast')
    });

    db.prepare('UPDATE products SET image_url = ? WHERE id = ?').run(imageUrl, id);
    res.json({ success: true, imageUrl, message: 'Image uploaded and background enhancement started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/products/upload-image - Upload an image before saving product (or standalone)
router.post('/upload-image', authenticateToken, requirePermission('access_inventory'), async (req: AuthRequest, res: Response) => {
  const { image, productId } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Image base64 data is required' });
  }

  try {
    const safeId = productId || `prod_${Date.now()}`;
    const imageUrl = await processProductImageAsync({
      productId: safeId,
      imageData: image,
      broadcast: req.app.get('broadcast')
    });

    res.json({ success: true, imageUrl, productId: safeId, message: 'Image uploaded and background enhancement started' });
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
