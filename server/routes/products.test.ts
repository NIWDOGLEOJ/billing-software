import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import { db, initDb } from '../db';
import productRoutes from './products';
import billsRoutes from './bills';
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
    app.use('/api/bills', billsRoutes);

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

  it('auto-generates product id and defaults UOM to PCS when omitted', async () => {
    const testSku = `NO_ID_${Date.now()}`;
    const payload = {
      sku: testSku,
      name: 'Item Without ID or UOM',
      price: 88,
      gst_rate: 5,
    };

    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.id).toMatch(/^prod_/);
    expect(body.uom).toBe('PCS');
    expect(body.mrp).toBe(88); // defaults to price

    // Clean up
    db.prepare('DELETE FROM products WHERE id = ?').run(body.id);
  });

  it('defaults MRP to price when mrp is passed as 0 or empty string', async () => {
    const testSku = `ZERO_MRP_${Date.now()}`;
    const payload = {
      sku: testSku,
      name: 'Zero MRP Product',
      price: 199,
      mrp: 0,
      gst_rate: 12,
    };

    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.mrp).toBe(199);

    // Clean up
    db.prepare('DELETE FROM products WHERE id = ?').run(body.id);
  });

  it('updates all columns on conflict during bulk upsert including batch, expiry, barcode_type, moq, distributor_price', async () => {
    const testSku = `CONFLICT_TEST_${Date.now()}`;
    const initialId = `prod_init_${Date.now()}`;

    // 1. Initial insert
    db.prepare(`
      INSERT INTO products (
        id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code,
        brand, uom, purchase_price, wholesale_price, mrp, discount_percent,
        batch_number, expiry_date, status, barcode_type, moq, distributor_price, image_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      initialId, testSku, 'Initial Name', 100, 'General', 18, 10, 5, '1111',
      'OldBrand', 'PCS', 70, 90, 110, 0,
      'BATCH_OLD', '2025-01-01', 'Active', 'EAN-13', 1, 85, ''
    );

    // 2. Bulk update with new batch, expiry, barcode_type, moq, distributor_price
    const bulkPayload = {
      products: [
        {
          sku: testSku,
          name: 'Updated Name',
          price: 120,
          mrp: 130,
          purchase_price: 80,
          wholesale_price: 105,
          distributor_price: 95,
          category: 'Grocery',
          gst_rate: 5,
          stock: 50,
          low_stock_threshold: 15,
          hsn_code: '2222',
          brand: 'NewBrand',
          uom: 'KG',
          batch_number: 'BATCH_NEW',
          expiry_date: '2027-12-31',
          status: 'Active',
          barcode_type: 'CODE-128',
          moq: 10,
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

    expect(res.status).toBe(200);

    const updated = db.prepare('SELECT * FROM products WHERE sku = ?').get(testSku) as any;
    expect(updated).toBeDefined();
    expect(updated.name).toBe('Updated Name');
    expect(updated.price).toBe(120);
    expect(updated.mrp).toBe(130);
    expect(updated.batch_number).toBe('BATCH_NEW');
    expect(updated.expiry_date).toBe('2027-12-31');
    expect(updated.barcode_type).toBe('CODE-128');
    expect(updated.moq).toBe(10);
    expect(updated.distributor_price).toBe(95);
    expect(updated.hsn_code).toBe('2222');

    // Clean up
    db.prepare('DELETE FROM products WHERE sku = ?').run(testSku);
  });

  it('updates product via PUT /api/products/:id correctly across all 22 columns', async () => {
    const testSku = `PUT_TEST_${Date.now()}`;
    const testId = `prod_put_${Date.now()}`;

    // 1. Create product
    db.prepare(`
      INSERT INTO products (
        id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code,
        brand, uom, purchase_price, wholesale_price, mrp, discount_percent,
        batch_number, expiry_date, status, barcode_type, moq, distributor_price, image_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testId, testSku, 'Pre-Edit Item', 50, 'General', 5, 20, 5, '3333',
      'OldBrand', 'PCS', 35, 45, 55, 0,
      'B01', '2026-01-01', 'Active', 'EAN-13', 1, 40, ''
    );

    // 2. PUT update
    const updatePayload = {
      name: 'Post-Edit Item',
      price: 60,
      mrp: 65,
      gst_rate: 12,
      uom: 'BOX',
      brand: 'EditedBrand',
      batch_number: 'B02',
      distributor_price: 48,
    };

    const res = await fetch(`${baseUrl}/api/products/${testId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(updatePayload),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.name).toBe('Post-Edit Item');
    expect(body.price).toBe(60);
    expect(body.mrp).toBe(65);
    expect(body.gst_rate).toBe(12);
    expect(body.uom).toBe('BOX');
    expect(body.brand).toBe('EditedBrand');
    expect(body.batch_number).toBe('B02');
    expect(body.distributor_price).toBe(48);

    // Clean up
    db.prepare('DELETE FROM products WHERE id = ?').run(testId);
  });

  it('rejects duplicate SKU creation with 400', async () => {
    const testSku = `DUP_${Date.now()}`;
    const id1 = `prod_dup_1_${Date.now()}`;
    const id2 = `prod_dup_2_${Date.now()}`;

    // First insert succeeds
    const res1 = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        id: id1,
        sku: testSku,
        name: 'Original',
        price: 10,
        gst_rate: 5,
      }),
    });
    expect(res1.status).toBe(201);

    // Duplicate insert fails with 400
    const res2 = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        id: id2,
        sku: testSku,
        name: 'Duplicate',
        price: 20,
        gst_rate: 5,
      }),
    });
    const body2 = await res2.json();
    expect(res2.status).toBe(400);
    expect(body2.error).toContain('already exists');

    // Clean up
    db.prepare('DELETE FROM products WHERE sku = ?').run(testSku);
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

  it('rejects product creation when price is negative or non-numeric', async () => {
    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        sku: `BAD_PRICE_${Date.now()}`,
        name: 'Negative Price Item',
        price: -10,
        gst_rate: 5,
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('Missing required Indian GST billing fields');
  });

  it('deducts stock accurately when a bill is finalized for a mobile quick-added product', async () => {
    const testSku = `MOBILE_STOCK_${Date.now()}`;
    const testId = `prod_mob_${Date.now()}`;

    // 1. Create product via mobile Quick Add payload
    const createRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        id: testId,
        sku: testSku,
        name: 'Mobile Quick Add Stock Test',
        price: 50,
        gst_rate: 18,
        stock: 25,
        uom: 'PCS',
      }),
    });
    expect(createRes.status).toBe(201);

    const billId = `BILL_TEST_${Date.now()}`;
    // 2. Finalize a bill selling 3 units where item uses code / sku as id
    const billRes = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        id: billId,
        bill_number: billId,
        date: new Date().toISOString(),
        subtotal: 150,
        gst_amount: 27,
        cgst: 13.5,
        sgst: 13.5,
        total: 177,
        payment_mode: 'cash',
        items: [
          {
            id: testId,
            sku: testSku,
            name: 'Mobile Quick Add Stock Test',
            price: 50,
            quantity: 3,
            gstRate: 18,
            uom: 'PCS',
          },
        ],
      }),
    });

    expect(billRes.status).toBe(201);

    // 3. Verify stock in SQLite database is reduced from 25 to 22
    const updated = db.prepare('SELECT stock FROM products WHERE id = ?').get(testId) as any;
    expect(updated).toBeDefined();
    expect(updated.stock).toBe(22);

    // Clean up
    db.prepare('DELETE FROM bills WHERE id = ?').run(billId);
    db.prepare('DELETE FROM products WHERE id = ?').run(testId);
  });
});
