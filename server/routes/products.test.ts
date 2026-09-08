import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import { db, initDb } from '../db';
import productRoutes from './products';
import { JWT_SECRET } from '../middleware/auth';

describe('Product Insertion & Route Column Matching', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;
  let ownerToken: string;
  const testSessionId = `test_session_${Date.now()}`;

  beforeAll(async () => {
    initDb();

    // Create a mock active session in login_sessions for authenticateToken
    db.prepare(`
      INSERT OR REPLACE INTO login_sessions (id, user_id, login_time, logout_time, last_active_at, device_type, is_attendance)
      VALUES (?, ?, ?, NULL, ?, ?, ?)
    `).run(testSessionId, 'owner_1', new Date().toISOString(), new Date().toISOString(), 'mobile', 1);

    // Generate valid owner JWT
    ownerToken = jwt.sign(
      {
        id: 'owner_1',
        username: 'owner',
        name: 'Store Owner',
        role: 'owner',
        permissions: ['access_inventory', 'access_billing'],
        sessionId: testSessionId,
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    app = express();
    app.use(express.json());
    app.use('/api/products', productRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });

    try {
      db.prepare('DELETE FROM login_sessions WHERE id = ?').run(testSessionId);
    } catch {}
  });

  it('verifies products table has all 22 required columns', () => {
    const columns = db.prepare("PRAGMA table_info(products)").all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);
    
    const expectedColumns = [
      'id', 'sku', 'name', 'price', 'category', 'gst_rate', 'stock',
      'low_stock_threshold', 'hsn_code', 'brand', 'uom', 'purchase_price',
      'wholesale_price', 'mrp', 'discount_percent', 'batch_number',
      'expiry_date', 'status', 'barcode_type', 'moq', 'distributor_price', 'image_url'
    ];

    expect(expectedColumns).toHaveLength(22);
    for (const col of expectedColumns) {
      expect(columnNames).toContain(col);
    }
  });

  it('successfully creates product via mobile Quick Add payload without 21 vs 22 column mismatch error', async () => {
    const testSku = `MOBILE_${Date.now()}`;
    const testId = `prod_${Date.now()}`;

    // Exact payload structure sent by Mobile Quick Add modal
    const mobileQuickAddPayload = {
      id: testId,
      sku: testSku,
      name: 'Mobile Quick Add Item',
      price: 149.50,
      mrp: 149.50,
      category: 'Snacks',
      gst_rate: 18,
      stock: 50,
      low_stock_threshold: 10,
      hsn_code: '2106',
      uom: 'PCS',
    };

    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(mobileQuickAddPayload),
    });

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body).toBeDefined();
    expect(body.id).toBe(testId);
    expect(body.sku).toBe(testSku);
    expect(body.price).toBe(149.50);
    expect(body.mrp).toBe(149.50);
    expect(body.uom).toBe('PCS');

    // Verify row in database
    const saved = db.prepare('SELECT * FROM products WHERE id = ?').get(testId) as any;
    expect(saved).toBeDefined();
    expect(saved.sku).toBe(testSku);
    expect(saved.mrp).toBe(149.50);

    // Clean up
    db.prepare('DELETE FROM products WHERE id = ?').run(testId);
  });

  it('successfully creates product via full Analytics Dashboard payload with all 22 fields', async () => {
    const testSku = `DASH_${Date.now()}`;
    const testId = `prod_dash_${Date.now()}`;

    const dashboardPayload = {
      id: testId,
      sku: testSku,
      name: 'Dashboard Complete Item',
      price: 200,
      mrp: 220,
      purchase_price: 150,
      wholesale_price: 180,
      distributor_price: 170,
      discount_percent: 5,
      category: 'Beverages',
      gst_rate: 12,
      stock: 100,
      low_stock_threshold: 20,
      hsn_code: '0902',
      brand: 'TeaBrand',
      uom: 'BOX',
      batch_number: 'BATCH001',
      status: 'Active',
      barcode_type: 'EAN-13',
      moq: 2,
    };

    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(dashboardPayload),
    });

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.id).toBe(testId);
    expect(body.brand).toBe('TeaBrand');
    expect(body.moq).toBe(2);

    // Clean up
    db.prepare('DELETE FROM products WHERE id = ?').run(testId);
  });

  it('successfully executes bulk upsert with 22 columns and image_url', async () => {
    const sku1 = `BULK_1_${Date.now()}`;
    const sku2 = `BULK_2_${Date.now()}`;

    const bulkPayload = {
      products: [
        {
          sku: sku1,
          name: 'Bulk Item 1',
          price: 10,
          category: 'General',
          gst_rate: 5,
          stock: 20,
          uom: 'PCS',
          image_url: '/uploads/products/bulk1.webp',
        },
        {
          sku: sku2,
          name: 'Bulk Item 2',
          price: 25,
          category: 'Snacks',
          gst_rate: 12,
          stock: 40,
          uom: 'PKT',
        },
      ],
    };

    const res = await fetch(`${baseUrl}/api/products/bulk`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(bulkPayload),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);

    const p1 = db.prepare('SELECT * FROM products WHERE sku = ?').get(sku1) as any;
    expect(p1).toBeDefined();
    expect(p1.image_url).toBe('/uploads/products/bulk1.webp');

    // Clean up
    db.prepare('DELETE FROM products WHERE sku IN (?, ?)').run(sku1, sku2);
  });

  it('rejects product creation when required fields are missing', async () => {
    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ name: 'Incomplete' }),
    });

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('Missing required Indian GST billing fields');
  });
});
