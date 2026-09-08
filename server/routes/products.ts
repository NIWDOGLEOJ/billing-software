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

  const finalId = (id && String(id).trim()) || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const finalSku = (sku !== undefined && sku !== null) ? String(sku).trim() : '';
  const finalName = (name !== undefined && name !== null) ? String(name).trim() : '';

  if (
    !finalSku ||
    !finalName ||
    price === undefined ||
    price === null ||
    price === '' ||
    isNaN(Number(price)) ||
    Number(price) < 0 ||
    gst_rate === undefined ||
    gst_rate === null ||
    gst_rate === '' ||
    isNaN(Number(gst_rate)) ||
    Number(gst_rate) < 0
  ) {
    return res.status(400).json({ error: 'Missing required Indian GST billing fields (id, sku, name, price, gst_rate, uom)' });
  }

  const finalUom = (uom && String(uom).trim()) ? String(uom).trim().toUpperCase() : 'PCS';

  try {
    // Check if sku is already taken
    const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(finalSku);
    if (existing) {
      return res.status(400).json({ error: `Product with SKU "${finalSku}" already exists` });
    }

    const existingId = db.prepare('SELECT id FROM products WHERE id = ?').get(finalId);
    if (existingId) {
      return res.status(400).json({ error: `Product with ID "${finalId}" already exists` });
    }

    let finalImageUrl = image_url || '';
    if (image && typeof image === 'string' && image.trim()) {
      const trimmed = image.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/uploads/')) {
        finalImageUrl = trimmed;
      } else {
        try {
          finalImageUrl = await processProductImageAsync({
            productId: finalId,
            imageData: trimmed,
            broadcast: req.app.get('broadcast')
          });
        } catch (imgErr: any) {
          console.error('[Products] Notice starting image processing:', imgErr?.message);
        }
      }
    }

    const numericPrice = Number(price);
    const numericGstRate = Number(gst_rate || 0);
    const numericStock = Number(stock || 0);
    const numericLowStock = Number(low_stock_threshold !== undefined && low_stock_threshold !== null && low_stock_threshold !== '' ? low_stock_threshold : 10);
    const numericPurchasePrice = Number(purchase_price || 0);
    const numericWholesalePrice = Number(wholesale_price || 0);
    const parsedMrp = Number(mrp !== undefined && mrp !== null && mrp !== '' ? mrp : 0);
    const numericMrp = parsedMrp > 0 ? parsedMrp : (numericPrice > 0 ? numericPrice : 0);
    const numericDiscount = Number(discount_percent || 0);
    const numericMoq = Number(moq || 1);
    const numericDistributorPrice = Number(distributor_price || 0);
    const cleanHsn = (hsn_code && String(hsn_code).trim() !== '—') ? String(hsn_code).trim() : '';

    db.prepare(`
      INSERT INTO products (
        id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code,
        brand, uom, purchase_price, wholesale_price, mrp, discount_percent, 
        batch_number, expiry_date, status, barcode_type, moq, distributor_price, image_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalId,
      finalSku,
      finalName,
      numericPrice,
      (category && String(category).trim()) || 'General',
      numericGstRate,
      numericStock,
      numericLowStock,
      cleanHsn,
      (brand && String(brand).trim()) || '',
      finalUom,
      numericPurchasePrice,
      numericWholesalePrice,
      numericMrp,
      numericDiscount,
      (batch_number && String(batch_number).trim()) || '',
      (expiry_date && String(expiry_date).trim()) || '',
      (status && String(status).trim()) || 'Active',
      (barcode_type && String(barcode_type).trim()) || 'EAN-13',
      numericMoq,
      numericDistributorPrice,
      finalImageUrl
    );

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(finalId);

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
        batch_number, expiry_date, status, barcode_type, moq, distributor_price, image_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        batch_number = excluded.batch_number,
        expiry_date = excluded.expiry_date,
        status = excluded.status,
        barcode_type = excluded.barcode_type,
        moq = excluded.moq,
        distributor_price = excluded.distributor_price,
        image_url = CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE products.image_url END
    `);

    const transaction = db.transaction((items: any[]) => {
      let count = 0;
      for (const p of items) {
        const sku = (p.sku || p.code || '').trim();
        const name = (p.name || '').trim();
        if (!sku || !name) continue;

        const id = p.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const price = Number(p.price !== undefined && p.price !== null && p.price !== '' ? p.price : (p.mrp || 0));
        const rawMrp = Number(p.mrp !== undefined && p.mrp !== null && p.mrp !== '' ? p.mrp : 0);
        const mrp = rawMrp > 0 ? rawMrp : (price > 0 ? price : 0);
        const category = p.category || p.cat || 'General';
        const gst_rate = Number(p.gst_rate ?? p.gst ?? 0);
        const stock = Number(p.stock || 0);
        const low_stock = Number(p.low_stock_threshold ?? p.reorder ?? 10);
        const hsn = (p.hsn_code || p.hsn || '').replace(/^—$/, '').trim();
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
        const image_url = p.image_url || p.image || '';

        upsertStmt.run(
          id, sku, name, price, category, gst_rate, stock, low_stock, hsn,
          brand, uom, purchase_price, wholesale_price, mrp, discount_percent,
          batch_number, expiry_date, status, barcode_type, moq, distributor_price, image_url
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

  const trimmedName = (name !== undefined && name !== null) ? String(name).trim() : '';
  if (
    !trimmedName ||
    price === undefined ||
    price === null ||
    price === '' ||
    isNaN(Number(price)) ||
    Number(price) < 0 ||
    gst_rate === undefined ||
    gst_rate === null ||
    gst_rate === '' ||
    isNaN(Number(gst_rate)) ||
    Number(gst_rate) < 0
  ) {
    return res.status(400).json({ error: 'Missing required Indian GST billing fields (name, price, gst_rate, uom)' });
  }

  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const trimmedSku = (sku !== undefined && sku !== null) ? String(sku).trim() : '';
    // Check if sku is being updated to a duplicate
    if (trimmedSku && trimmedSku !== (product as any).sku) {
      const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(trimmedSku);
      if (existing) {
        return res.status(400).json({ error: `SKU "${trimmedSku}" is already in use by another product` });
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

    const effectivePrice = Number(price);
    const parsedMrp = Number(mrp !== undefined && mrp !== null && mrp !== '' ? mrp : 0);
    const effectiveMrp = parsedMrp > 0 ? parsedMrp : (effectivePrice > 0 ? effectivePrice : ((product as any).mrp || 0));
    const finalUom = (uom !== undefined && String(uom).trim()) ? String(uom).trim().toUpperCase() : ((product as any).uom || 'PCS');
    const cleanHsn = hsn_code !== undefined ? String(hsn_code).replace(/^—$/, '').trim() : (product as any).hsn_code;

    db.prepare(`
      UPDATE products
      SET sku = ?, name = ?, price = ?, category = ?, gst_rate = ?, stock = ?, low_stock_threshold = ?, hsn_code = ?,
          brand = ?, uom = ?, purchase_price = ?, wholesale_price = ?, mrp = ?, discount_percent = ?,
          batch_number = ?, expiry_date = ?, status = ?, barcode_type = ?, moq = ?, distributor_price = ?, image_url = ?
      WHERE id = ?
    `).run(
      trimmedSku || (product as any).sku,
      trimmedName,
      effectivePrice,
      category !== undefined ? (String(category).trim() || 'General') : (product as any).category,
      Number(gst_rate || 0),
      stock !== undefined ? Number(stock || 0) : (product as any).stock,
      low_stock_threshold !== undefined ? Number(low_stock_threshold || 10) : (product as any).low_stock_threshold,
      cleanHsn || '',
      brand !== undefined ? String(brand).trim() : ((product as any).brand || ''),
      finalUom,
      purchase_price !== undefined ? Number(purchase_price) : ((product as any).purchase_price || 0),
      wholesale_price !== undefined ? Number(wholesale_price) : ((product as any).wholesale_price || 0),
      effectiveMrp,
      discount_percent !== undefined ? Number(discount_percent) : ((product as any).discount_percent || 0),
      batch_number !== undefined ? String(batch_number).trim() : ((product as any).batch_number || ''),
      expiry_date !== undefined ? String(expiry_date).trim() : ((product as any).expiry_date || ''),
      status !== undefined ? String(status).trim() : ((product as any).status || 'Active'),
      barcode_type !== undefined ? String(barcode_type).trim() : ((product as any).barcode_type || 'EAN-13'),
      moq !== undefined ? Number(moq || 1) : ((product as any).moq || 1),
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
