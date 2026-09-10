import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read active sector from file
export function getActiveSector(): string {
  try {
    const sectorFile = path.join(__dirname, '..', 'active_sector.txt');
    if (fs.existsSync(sectorFile)) {
      const savedSector = fs.readFileSync(sectorFile, 'utf-8').trim();
      return savedSector === 'retail' ? savedSector : 'retail';
    }
  } catch (e) {}
  return 'retail';
}

export function getDbPath(sector: string): string {
  const sec = sector === 'retail' ? sector : 'retail';
  return path.join(__dirname, '..', `${sec}.db`);
}

// In-memory pointer to the currently active sqlite connection
let currentDbConnection = new Database(getDbPath(getActiveSector()));
currentDbConnection.pragma('journal_mode = WAL');
currentDbConnection.pragma('foreign_keys = ON');

// Export a Proxy so that all existing modules that import `db` get redirected transparently
export const db = new Proxy({} as any, {
  get(target, prop) {
    const activeConn = currentDbConnection;
    const val = Reflect.get(activeConn, prop);
    if (typeof val === 'function') {
      return val.bind(activeConn);
    }
    return val;
  }
});

// Swaps the active database dynamically on the fly
export function switchDatabase(sector: string) {
  try {
    currentDbConnection.close();
  } catch (e) {}
  
  const newPath = getDbPath(sector);
  currentDbConnection = new Database(newPath);
  currentDbConnection.pragma('journal_mode = WAL');
  currentDbConnection.pragma('foreign_keys = ON');
  
  // Re-initialize schema on this new database file with sector-specific seed data
  initDb(sector);
}

export function initDb(sector?: string) {
  const activeSector = sector || getActiveSector();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      username    TEXT UNIQUE NOT NULL,
      email       TEXT,
      name        TEXT NOT NULL,
      role        TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      permissions TEXT DEFAULT '[]',
      phone       TEXT,
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chats (
      id                  TEXT PRIMARY KEY,
      sender_name         TEXT NOT NULL,
      sender_role         TEXT NOT NULL,
      ciphertext          TEXT NOT NULL,
      iv                  TEXT NOT NULL,
      timestamp           TEXT NOT NULL,
      fingerprint         TEXT NOT NULL,
      recipient_name      TEXT DEFAULT 'All',
      is_bill_transfer    INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id                  TEXT PRIMARY KEY,
      sku                 TEXT UNIQUE,
      name                TEXT NOT NULL,
      price               REAL NOT NULL,
      category            TEXT DEFAULT 'General',
      gst_rate            REAL DEFAULT 0,
      stock               INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 10,
      hsn_code            TEXT DEFAULT '',
      brand               TEXT DEFAULT '',
      uom                 TEXT DEFAULT 'PCS',
      purchase_price      REAL DEFAULT 0,
      wholesale_price     REAL DEFAULT 0,
      mrp                 REAL DEFAULT 0,
      discount_percent    REAL DEFAULT 0,
      batch_number        TEXT DEFAULT '',
      expiry_date         TEXT DEFAULT '',
      status              TEXT DEFAULT 'Active',
      barcode_type        TEXT DEFAULT 'EAN-13',
      moq                 INTEGER DEFAULT 1,
      distributor_price   REAL DEFAULT 0,
      image_url           TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS bills (
      id                  TEXT PRIMARY KEY,
      bill_number         TEXT UNIQUE,
      date                TEXT NOT NULL,
      cashier_id          TEXT,
      cashier_name        TEXT,
      customer_phone      TEXT,
      customer_name       TEXT,
      subtotal            REAL DEFAULT 0,
      gst_amount          REAL DEFAULT 0,
      cgst                REAL DEFAULT 0,
      sgst                REAL DEFAULT 0,
      igst                REAL DEFAULT 0,
      total               REAL NOT NULL,
      payment_mode        TEXT DEFAULT 'cash',
      amount_received     REAL,
      change_amount       REAL,
      rounding_adjustment REAL DEFAULT 0,
      points_earned       INTEGER DEFAULT 0,
      points_redeemed     INTEGER DEFAULT 0,
      items               TEXT NOT NULL,
      shop_details        TEXT,
      gst_enabled         INTEGER DEFAULT 1,
      gst_rate            REAL DEFAULT 18,
      customer_gstin      TEXT,
      pricing_tier        TEXT DEFAULT 'retail'
    );

    CREATE TABLE IF NOT EXISTS customers (
      phone         TEXT PRIMARY KEY,
      name          TEXT,
      loyalty_points INTEGER DEFAULT 0,
      total_spent   REAL DEFAULT 0,
      visit_count   INTEGER DEFAULT 0,
      last_visit    TEXT,
      outstanding_balance REAL DEFAULT 0,
      gstin         TEXT,
      credit_limit  REAL DEFAULT 50000
    );

    CREATE TABLE IF NOT EXISTS login_sessions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      login_time  TEXT,
      logout_time TEXT,
      duration    INTEGER
    );

    CREATE TABLE IF NOT EXISTS break_records (
      id         TEXT PRIMARY KEY,
      user_id    TEXT,
      start_time TEXT,
      end_time   TEXT,
      duration   INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS shift_records (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL,
      user_name           TEXT NOT NULL,
      start_time          TEXT NOT NULL,
      end_time            TEXT,
      initial_cash        REAL NOT NULL,
      system_cash         REAL DEFAULT 0,
      system_upi          REAL DEFAULT 0,
      system_card         REAL DEFAULT 0,
      actual_cash         REAL,
      actual_upi          REAL,
      actual_card         REAL,
      discrepancy_cash    REAL DEFAULT 0,
      status              TEXT DEFAULT 'active',
      notes               TEXT
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      user_name   TEXT,
      date        TEXT NOT NULL,
      type        TEXT NOT NULL,
      status      TEXT DEFAULT 'approved',
      reason      TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id          TEXT PRIMARY KEY,
      name        TEXT UNIQUE NOT NULL,
      code        TEXT UNIQUE NOT NULL,
      address     TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_ledger (
      id            TEXT PRIMARY KEY,
      product_id    TEXT NOT NULL,
      warehouse_id  TEXT NOT NULL,
      change_qty    INTEGER NOT NULL,
      type          TEXT NOT NULL, -- 'purchase', 'sale', 'transfer', 'damaged', 'audit'
      reference_id  TEXT,
      notes         TEXT,
      timestamp     TEXT NOT NULL,
      FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS medicine_batches (
      id                    TEXT PRIMARY KEY,
      product_id            TEXT NOT NULL,
      batch_number          TEXT NOT NULL,
      expiry_date           TEXT NOT NULL, -- YYYY-MM-DD
      manufacturing_date    TEXT,
      stock_quantity        INTEGER DEFAULT 0,
      drug_license          TEXT,
      prescription_required INTEGER DEFAULT 0,
      created_at            TEXT NOT NULL,
      UNIQUE(product_id, batch_number)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id              TEXT PRIMARY KEY,
      customer_name   TEXT NOT NULL,
      customer_phone  TEXT,
      otp             TEXT NOT NULL,
      items           TEXT NOT NULL,
      subtotal        REAL NOT NULL,
      coupon_code     TEXT,
      discount_amount REAL DEFAULT 0,
      total           REAL NOT NULL,
      status          TEXT DEFAULT 'active',
      created_at      TEXT NOT NULL,
      expires_at      TEXT NOT NULL,
      accepted_at     TEXT,
      accepted_by     TEXT
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id               TEXT PRIMARY KEY,
      code             TEXT NOT NULL UNIQUE,
      customer_phone   TEXT,
      discount_amount  REAL NOT NULL,
      description      TEXT,
      is_redeemed      INTEGER DEFAULT 0,
      redeemed_at      TEXT,
      redeemed_bill_id TEXT,
      created_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      id          TEXT PRIMARY KEY,
      token       TEXT UNIQUE NOT NULL,
      role        TEXT NOT NULL DEFAULT 'co-owner',
      name        TEXT,
      email       TEXT,
      phone       TEXT,
      created_by  TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      status      TEXT DEFAULT 'pending'
    );
  `);

  // Safe migrations for existing databases
  try {
    db.prepare('ALTER TABLE bills ADD COLUMN coupon_code TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE bills ADD COLUMN coupon_discount REAL DEFAULT 0').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE coupons ADD COLUMN is_redeemed INTEGER DEFAULT 0').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE coupons ADD COLUMN redeemed_at TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE coupons ADD COLUMN redeemed_bill_id TEXT').run();
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE customers ADD COLUMN outstanding_balance REAL DEFAULT 0').run();
    console.log('✅ Added outstanding_balance column to customers table');
  } catch (e) {
    // Column already exists, safe to ignore
  }

  try {
    db.prepare("ALTER TABLE products ADD COLUMN hsn_code TEXT DEFAULT ''").run();
    console.log('✅ Added hsn_code column to products table');
  } catch (e) {
    // Column already exists, safe to ignore
  }

  // B2B Wholesale migrations
  try {
    db.prepare('ALTER TABLE customers ADD COLUMN gstin TEXT').run();
    console.log('✅ Added gstin column to customers table');
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE customers ADD COLUMN credit_limit REAL DEFAULT 50000').run();
    console.log('✅ Added credit_limit column to customers table');
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE reservations ADD COLUMN cancelled_at TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE reservations ADD COLUMN cancellation_reason TEXT').run();
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE bills ADD COLUMN customer_gstin TEXT').run();
    console.log('✅ Added customer_gstin column to bills table');
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE bills ADD COLUMN igst REAL DEFAULT 0').run();
    console.log('✅ Added igst column to bills table');
  } catch (e) {}

  try {
    db.prepare("ALTER TABLE bills ADD COLUMN pricing_tier TEXT DEFAULT 'retail'").run();
    console.log('✅ Added pricing_tier column to bills table');
  } catch (e) {}

  try {
    db.prepare("ALTER TABLE login_sessions ADD COLUMN last_active_at TEXT").run();
    console.log('✅ Added last_active_at column to login_sessions table');
  } catch (e) {
    // Column already exists, safe to ignore
  }

  try {
    db.prepare("ALTER TABLE login_sessions ADD COLUMN device_type TEXT DEFAULT 'desktop'").run();
    console.log('✅ Added device_type column to login_sessions table');
  } catch (e) {
    // Column already exists, safe to ignore
  }

  try {
    db.prepare("ALTER TABLE login_sessions ADD COLUMN is_attendance INTEGER DEFAULT 1").run();
    console.log('✅ Added is_attendance column to login_sessions table');
  } catch (e) {
    // Column already exists, safe to ignore
  }

  // Indian Retail & Wholesale Billing Product Rules Migration
  const columnsToAdd = [
    { name: 'brand', type: 'TEXT DEFAULT \'\'' },
    { name: 'uom', type: 'TEXT DEFAULT \'PCS\'' },
    { name: 'purchase_price', type: 'REAL DEFAULT 0' },
    { name: 'wholesale_price', type: 'REAL DEFAULT 0' },
    { name: 'mrp', type: 'REAL DEFAULT 0' },
    { name: 'discount_percent', type: 'REAL DEFAULT 0' },
    { name: 'batch_number', type: 'TEXT DEFAULT \'\'' },
    { name: 'expiry_date', type: 'TEXT DEFAULT \'\'' },
    { name: 'status', type: 'TEXT DEFAULT \'Active\'' },
    { name: 'barcode_type', type: 'TEXT DEFAULT \'EAN-13\'' },
    { name: 'moq', type: 'INTEGER DEFAULT 1' },
    { name: 'distributor_price', type: 'REAL DEFAULT 0' },
    { name: 'image_url', type: 'TEXT DEFAULT \'\'' }
  ];

  for (const col of columnsToAdd) {
    try {
      db.prepare(`ALTER TABLE products ADD COLUMN ${col.name} ${col.type}`).run();
      console.log(`✅ Added ${col.name} column to products table`);
    } catch (e: any) {
      // Column already exists, safe to ignore
    }
  }

  // ── Seed default users ──────────────────────────────────────────────────────
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount === 0) {
    const ins = db.prepare(
      'INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?)'
    );
    const allPerms = JSON.stringify([
      'access_billing','edit_product_price','delete_bill_items',
      'apply_discounts','view_analytics','access_inventory',
      'view_transaction_history','generate_reports','access_settings','manage_employees'
    ]);
    const empPerms = JSON.stringify([
      'access_billing','edit_product_price','delete_bill_items','apply_discounts'
    ]);
    const now = new Date().toISOString();
    ins.run('owner_1',   'owner',    'owner@retailpos.com',    'Store Owner',      'owner',    bcrypt.hashSync('owner123',    10), allPerms, null, 1, now);
    ins.run('coowner_1', 'coowner',  'coowner@retailpos.com',  'Co-Owner Partner', 'co-owner', bcrypt.hashSync('coowner123',  10), allPerms, null, 1, now);
    ins.run('emp_1',     'employee', 'employee@retailpos.com', 'John Cashier',     'employee', bcrypt.hashSync('employee123', 10), empPerms, null, 1, now);
    console.log('✅ Default accounts seeded (owner / coowner / employee)');
  }

  // Ensure permanent developer account exists with ID 'developer' and password '251004'
  const devCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE username = 'developer'").get() as { c: number }).c;
  if (devCount === 0) {
    const ins = db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?)');
    const allPerms = JSON.stringify([
      'access_billing','edit_product_price','delete_bill_items',
      'apply_discounts','view_analytics','access_inventory',
      'view_transaction_history','generate_reports','access_settings','manage_employees'
    ]);
    const now = new Date().toISOString();
    ins.run('dev_1', 'developer', 'developer@retailpos.com', 'Developer Account', 'owner', bcrypt.hashSync('251004', 10), allPerms, null, 1, now);
    console.log('✅ Permanent developer account seeded (developer / 251004)');
  }

  // ── Seed default products — UNIFIED RETAIL, GROCERY & WHOLESALE ────────────
  const prodCount = (db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number }).c;
  if (prodCount === 0) {
    const ins = db.prepare('INSERT INTO products (id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code, brand, uom, purchase_price, mrp, wholesale_price, moq) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');

    const combinedProducts: any[][] = [
      // Retail Grocery Staples (id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code, brand, uom, purchase_price, mrp, wholesale_price, moq)
      ['1001','1001','Tata Gold Tea 500g',290,'Beverages',5,80,15,'0902','Tata','PCS',240,310,260,6],
      ['1002','1002','Amul Taaza Milk 1L',65,'Dairy',5,100,20,'0401','Amul','PCS',55,68,60,10],
      ['1003','1003','Aashirvaad Atta 5kg',275,'Grains',5,60,10,'1101','Aashirvaad','PCS',230,285,250,5],
      ['1004','1004','Fortune Sunlite Oil 1L',155,'Cooking',5,50,10,'1512','Fortune','PCS',135,160,142,12],
      ['1005','1005','Britannia Bread Loaf',42,'Bakery',5,40,8,'1905','Britannia','PCS',32,45,36,10],
      ['1006','1006','India Gate Basmati Rice 5kg',450,'Grains',5,45,10,'1006','India Gate','PCS',380,475,410,4],
      ['1007','1007','Parle-G Biscuits 800g',65,'Snacks',18,120,25,'1905','Parle','PCS',50,70,58,16],
      ['1008','1008','Haldiram Bhujia 400g',110,'Snacks',12,60,12,'2106','Haldiram','PCS',85,120,98,12],
      ['1009','1009','Nescafe Classic 200g',450,'Beverages',18,30,5,'2101','Nescafe','PCS',380,475,405,6],
      ['1010','1010','Surf Excel Matic 1kg',270,'Household',18,50,10,'3402','Surf Excel','PCS',220,285,245,8],
      ['1011','1011','Amul Butter 500g',280,'Dairy',12,35,8,'0405','Amul','PCS',240,295,255,10],
      ['1012','1012','Maggi Noodles Pack of 12',120,'Snacks',18,80,15,'1902','Maggi','PCS',100,130,108,8],
      ['1013','1013','Dettol Soap 125g x3',150,'Personal Care',18,40,10,'3401','Dettol','PCS',120,160,135,12],
      ['1014','1014','Colgate MaxFresh 150g',95,'Personal Care',18,55,10,'3306','Colgate','PCS',75,99,84,12],
      ['1015','1015','Farm Fresh Eggs (12 pack)',80,'Dairy',0,30,5,'0407','Local','PCS',65,85,72,5],
      ['1016','1016','Onions 1kg',40,'Produce',0,50,10,'0703','Local','KG',30,45,34,10],
      ['1017','1017','Potatoes 1kg',35,'Produce',0,60,15,'0701','Local','KG',25,40,29,10],
      ['1018','1018','Tomatoes 1kg',50,'Produce',0,40,10,'0702','Local','KG',35,55,42,10],
      ['1019','1019','Bananas 1 Dozen',50,'Produce',0,50,10,'0803','Local','PCS',35,55,42,5],
      ['1020','1020','Chicken Breast 1kg',320,'Meat',0,20,5,'0207','Local','KG',280,340,290,5],

      // Wholesale B2B Bulk Cases & Cartons
      ['W001','W001','Tata Gold Tea 1kg Bulk (x12)',3300,'Bulk & Wholesale',5,200,30,'0902','Tata','BOX',2880,3480,3120,2],
      ['W002','W002','Amul Butter 500g (x20)',5200,'Bulk & Wholesale',12,80,15,'0405','Amul','BOX',4600,5500,4900,2],
      ['W003','W003','Fortune Oil 1L (x12)',1740,'Bulk & Wholesale',5,100,20,'1512','Fortune','BOX',1500,1850,1620,3],
      ['W004','W004','Surf Excel 1kg (x10)',2500,'Bulk & Wholesale',18,60,10,'3402','Surf Excel','BOX',2100,2700,2350,2],
      ['W005','W005','Maggi 12-Pack (x8 Outer)',880,'Bulk & Wholesale',18,150,25,'1902','Nestle','BOX',720,950,810,4],
      ['W006','W006','Colgate 150g (x12)',1080,'Bulk & Wholesale',18,90,15,'3306','Colgate','BOX',850,1140,980,3],
      ['W007','W007','Parle-G 800g (x16)',960,'Bulk & Wholesale',18,180,30,'1905','Parle','BOX',750,1020,870,4],
      ['W008','W008','Dettol Soap 125g (x48)',4800,'Bulk & Wholesale',18,50,8,'3401','Dettol','BOX',3800,5100,4300,1],
      ['W009','W009','Basmati Rice 25kg Premium',2250,'Bulk & Wholesale',5,40,8,'1006','India Gate','BAG',1900,2400,2050,2],
      ['W010','W010','Sugar 50kg (Commercial)',2100,'Bulk & Wholesale',5,30,5,'1701','Local','BAG',1800,2200,1950,2],
      ['W011','W011','Aashirvaad Atta 10kg (x5)',2600,'Bulk & Wholesale',5,55,10,'1101','Aashirvaad','BOX',2200,2750,2420,2],
      ['W012','W012','Nescafe 200g (x6)',2550,'Bulk & Wholesale',18,40,8,'2101','Nescafe','BOX',2100,2700,2380,2],
      ['W013','W013','Haldiram Snacks Assorted (x20)',2000,'Bulk & Wholesale',12,70,12,'2106','Haldiram','BOX',1600,2150,1820,2],
      ['W014','W014','Bisleri Water 1L (x12)',180,'Bulk & Wholesale',18,250,40,'2201','Bisleri','BOX',140,200,160,5],
      ['W015','W015','Vim Dish Bar 600g (x24)',2400,'Bulk & Wholesale',18,45,10,'3402','Vim','BOX',1950,2550,2180,2],
    ];

    for (const p of combinedProducts) ins.run(...p);
    console.log(`✅ Seeded ${combinedProducts.length} Retail, Grocery & Wholesale products into database`);
  } else {
    // Upsert wholesale bulk items into existing products table if absent
    try {
      const insWholesaleMissing = db.prepare(`
        INSERT OR IGNORE INTO products (
          id, sku, name, price, category, gst_rate, stock, low_stock_threshold,
          hsn_code, brand, uom, purchase_price, mrp, wholesale_price, moq
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);

      const wholesaleBulkItems: any[][] = [
        ['W001','W001','Tata Gold Tea 1kg Bulk (x12)',3300,'Bulk & Wholesale',5,200,30,'0902','Tata','BOX',2880,3480,3120,2],
        ['W002','W002','Amul Butter 500g (x20)',5200,'Bulk & Wholesale',12,80,15,'0405','Amul','BOX',4600,5500,4900,2],
        ['W003','W003','Fortune Oil 1L (x12)',1740,'Bulk & Wholesale',5,100,20,'1512','Fortune','BOX',1500,1850,1620,3],
        ['W004','W004','Surf Excel 1kg (x10)',2500,'Bulk & Wholesale',18,60,10,'3402','Surf Excel','BOX',2100,2700,2350,2],
        ['W005','W005','Maggi 12-Pack (x8 Outer)',880,'Bulk & Wholesale',18,150,25,'1902','Nestle','BOX',720,950,810,4],
        ['W006','W006','Colgate 150g (x12)',1080,'Bulk & Wholesale',18,90,15,'3306','Colgate','BOX',850,1140,980,3],
        ['W007','W007','Parle-G 800g (x16)',960,'Bulk & Wholesale',18,180,30,'1905','Parle','BOX',750,1020,870,4],
        ['W008','W008','Dettol Soap 125g (x48)',4800,'Bulk & Wholesale',18,50,8,'3401','Dettol','BOX',3800,5100,4300,1],
        ['W009','W009','Basmati Rice 25kg Premium',2250,'Bulk & Wholesale',5,40,8,'1006','India Gate','BAG',1900,2400,2050,2],
        ['W010','W010','Sugar 50kg (Commercial)',2100,'Bulk & Wholesale',5,30,5,'1701','Local','BAG',1800,2200,1950,2],
        ['W011','W011','Aashirvaad Atta 10kg (x5)',2600,'Bulk & Wholesale',5,55,10,'1101','Aashirvaad','BOX',2200,2750,2420,2],
        ['W012','W012','Nescafe 200g (x6)',2550,'Bulk & Wholesale',18,40,8,'2101','Nescafe','BOX',2100,2700,2380,2],
        ['W013','W013','Haldiram Snacks Assorted (x20)',2000,'Bulk & Wholesale',12,70,12,'2106','Haldiram','BOX',1600,2150,1820,2],
        ['W014','W014','Bisleri Water 1L (x12)',180,'Bulk & Wholesale',18,250,40,'2201','Bisleri','BOX',140,200,160,5],
        ['W015','W015','Vim Dish Bar 600g (x24)',2400,'Bulk & Wholesale',18,45,10,'3402','Vim','BOX',1950,2550,2180,2],
      ];

      for (const w of wholesaleBulkItems) {
        insWholesaleMissing.run(...w);
      }

      // Populate wholesale_price on products where missing
      db.prepare(`
        UPDATE products 
        SET wholesale_price = ROUND(price * 0.88, 2)
        WHERE (wholesale_price IS NULL OR wholesale_price = 0) AND price > 0
      `).run();
    } catch (e) {
      console.warn('[DB] Wholesale product synchronization skipped:', e);
    }
  }

  // Ensure online store catalog products exist in products table
  const insOnline = db.prepare('INSERT OR IGNORE INTO products (id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code, brand, uom, purchase_price, mrp, wholesale_price, moq) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const onlineProducts = [
    ['prod-101', 'DAIRY-MILK-1L', 'Fresh Farm Cow Milk', 64, 'Dairy & Eggs', 5, 28, 10, '0401', 'Heritage', 'L', 52, 68, 58, 10],
    ['prod-102', 'DAIRY-BUTTER-500', 'Pure Salted Butter', 275, 'Dairy & Eggs', 12, 14, 8, '0405', 'Amul', 'PCS', 240, 290, 252, 6],
    ['prod-103', 'DAIRY-PANEER-200', 'Malai Fresh Paneer', 110, 'Dairy & Eggs', 5, 4, 8, '0406', 'MilkyMist', 'PCS', 90, 125, 100, 5],
    ['prod-104', 'DAIRY-EGGS-12', 'Farm Fresh Brown Eggs (Pack of 12)', 135, 'Dairy & Eggs', 0, 12, 5, '0407', 'Eggoz', 'PACK', 110, 150, 120, 5],
    ['prod-201', 'STAPLE-RICE-5KG', 'Royal Aged Basmati Rice (5kg)', 480, 'Staples & Grains', 5, 22, 10, '1006', 'India Gate', 'BAG', 400, 550, 440, 4],
    ['prod-202', 'STAPLE-ATTA-5KG', 'Stoneground Whole Wheat Chakki Atta (5kg)', 260, 'Staples & Grains', 5, 18, 8, '1101', 'Aashirvaad', 'BAG', 220, 295, 238, 5],
    ['prod-203', 'STAPLE-TOORDAL-1KG', 'Unpolished Organic Toor Dal (1kg)', 185, 'Staples & Grains', 5, 3, 10, '0713', 'Tata Sampann', 'KG', 150, 210, 168, 10],
    ['prod-204', 'STAPLE-OIL-1L', 'Cold-Pressed Groundnut Cooking Oil (1L)', 240, 'Staples & Grains', 5, 15, 6, '1508', 'PureRoots', 'L', 200, 280, 218, 8],
    ['prod-301', 'PROD-BANANA-DOZ', 'Farm Fresh Robusta Bananas (1 Dozen)', 60, 'Fruits & Vegetables', 0, 25, 8, '0803', 'Local Farms', 'DOZEN', 40, 75, 52, 5],
    ['prod-302', 'PROD-ONION-1KG', 'Fresh Local Red Onions (1kg)', 45, 'Fruits & Vegetables', 0, 40, 15, '0703', 'Nashik Fresh', 'KG', 30, 55, 38, 10],
    ['prod-303', 'PROD-POTATO-1KG', 'Fresh Country Potatoes (1kg)', 38, 'Fruits & Vegetables', 0, 35, 12, '0701', 'Agra Direct', 'KG', 26, 45, 32, 10],
    ['prod-304', 'PROD-TOMATO-1KG', 'Vine Ripe Hybrid Tomatoes (1kg)', 32, 'Fruits & Vegetables', 0, 20, 10, '0702', 'Local Farms', 'KG', 22, 40, 26, 10],
    ['prod-401', 'SNACK-TEA-500G', 'Assam Gold CTC Premium Leaf Tea (500g)', 310, 'Beverages & Snacks', 5, 30, 8, '0902', 'Tata Tea', 'PACK', 260, 350, 280, 6],
    ['prod-402', 'SNACK-COFFEE-200G', 'Pure Classic Instant Coffee (200g)', 470, 'Beverages & Snacks', 18, 11, 5, '2101', 'Nescafe', 'JAR', 410, 525, 420, 4],
    ['prod-403', 'SNACK-NOODLES-12', 'Instant Masala 2-Minute Noodles (Pack of 12)', 156, 'Beverages & Snacks', 18, 45, 10, '1902', 'Maggi', 'PACK', 130, 168, 140, 6],
    ['prod-404', 'SNACK-BISCUITS-1KG', 'Baked Whole Wheat Digestive Biscuits (1kg)', 140, 'Beverages & Snacks', 18, 19, 6, '1905', 'NutriChoice', 'PACK', 115, 160, 125, 6],
    ['prod-501', 'CARE-SOAP-4X', 'Antibacterial Original Bath Soap (Pack of 4)', 210, 'Personal Care', 18, 24, 8, '3401', 'Dettol', 'PACK', 175, 240, 190, 8],
    ['prod-502', 'CARE-TOOTHPASTE', 'Ayurvedic Gum Protection Toothpaste (150g)', 118, 'Personal Care', 18, 17, 6, '3306', 'Dabur Red', 'TUBE', 95, 130, 105, 8],
    ['prod-601', 'HOME-DISHWASH-750ML', 'Concentrated Lime Dishwash Gel (750ml)', 155, 'Household & Cleaning', 18, 16, 6, '3402', 'Vim', 'BOTTLE', 125, 180, 138, 6],
    ['prod-602', 'HOME-DETERGENT-2KG', 'Matic Front & Top Load Detergent Powder (2kg)', 380, 'Household & Cleaning', 18, 8, 4, '3402', 'Surf Excel', 'PACK', 310, 440, 340, 4],
  ];
  for (const p of onlineProducts) insOnline.run(...p);

  // ── Seed default warehouses ──────────────────────────────────────────────────
  const whCount = (db.prepare('SELECT COUNT(*) as c FROM warehouses').get() as { c: number }).c;
  if (whCount === 0) {
    const insWh = db.prepare('INSERT INTO warehouses (id, name, code, address, created_at) VALUES (?,?,?,?,?)');
    const now = new Date().toISOString();

    const warehousesList: any[][] = [
      ['wh_main', 'Main Store Floor', 'WH-MAIN', '14, 3rd Cross, Malleswaram', now],
      ['wh_cold', 'Cold Storage & Dairy Cabinet', 'WH-COLD', 'Main Store, Rear Room (2-8°C)', now],
      ['wh_depot', 'Wholesale Bulk Supply Depot', 'WH-DEPOT', 'Building 4B, Southern Logistics Hub', now],
    ];

    for (const w of warehousesList) insWh.run(...w);
    console.log(`✅ Seeded ${warehousesList.length} Retail, Grocery & Wholesale warehouses`);
  }

  // ── Seed default settings — RETAIL, GROCERY & WHOLESALE ────────────────────
  const insSettings = db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)');

  const defaultSettings: [string, string][] = [
    ['shopName',             'RETAIL & WHOLESALE MART'],
    ['shopAddress',          '14, 3rd Cross, Malleswaram, Bangalore 560003'],
    ['shopPhone',            '080-23456789'],
    ['shopEmail',            'contact@retailwholesale.com'],
    ['gstEnabled',           'true'],
    ['gstNumber',            '29AAAAA1111A1Z1'],
    ['gstRate',              '18'],
    ['roundingEnabled',      'true'],
    ['loyaltyEnabled',       'true'],
    ['loyaltyPointsPerRupee','0.01'],
    ['loyaltyPointValue',    '1'],
    ['receiptPrinterName',   ''],
    ['autoOpenDrawer',       'true'],
    ['chatEnabled',          'true'],
    ['active_sector',        'retail'],
    ['owner_name',           'Store Owner'],
  ];

  for (const [k, v] of defaultSettings) insSettings.run(k, v);
  console.log(`✅ Seeded Retail, Grocery & Wholesale default settings`);

  // ── Seed default customers if empty ──────────────────────────────────────
  const custCount = (db.prepare('SELECT COUNT(*) as c FROM customers').get() as { c: number }).c;
  if (custCount === 0) {
    const insCust = db.prepare(`
      INSERT INTO customers (phone, name, loyalty_points, total_spent, visit_count, last_visit, outstanding_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    insCust.run('9876543210', 'Ramesh Kumar', 320, 16500, 12, now, 0);
    insCust.run('9841023456', 'Priya Sharma', 150, 8200, 6, now, 0);
    insCust.run('9790123456', 'Karthik Raj', 45, 3100, 3, now, 0);
    insCust.run('9444123456', 'Ananya Sundaram', 680, 42000, 24, now, 0);
    console.log('✅ Seeded default customers into database');
  }

  // ── Seed default coupons if empty ─────────────────────────────────────────
  const couponCount = (db.prepare('SELECT COUNT(*) as c FROM coupons').get() as { c: number }).c;
  if (couponCount === 0) {
    const insCoupon = db.prepare(`
      INSERT INTO coupons (id, code, customer_phone, discount_amount, description, is_redeemed, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `);
    const now = new Date().toISOString();
    insCoupon.run('cpn_1', 'GOLD10', '9876543210', 50, 'Gold Member Special ₹50 off', now);
    insCoupon.run('cpn_2', 'PLATINUM100', '9444123456', 100, 'Platinum Member Exclusive ₹100 discount', now);
    insCoupon.run('cpn_3', 'WELCOME100', null, 100, '₹100 Welcome Cashback Coupon', now);
    insCoupon.run('cpn_4', 'FESTIVE25', null, 25, 'Festive Season ₹25 off', now);
    console.log('✅ Seeded default coupons into database');
  }
}

export function cleanupStaleSessions(broadcast?: (data: any) => void) {
  try {
    const now = new Date().toISOString();
    const activeSessions = db.prepare('SELECT id, login_time, last_active_at, user_id FROM login_sessions WHERE logout_time IS NULL').all() as any[];
    
    const thresholdMs = 2 * 60 * 1000; // 2 minutes
    const nowMs = Date.now();
    
    let changed = false;
    for (const s of activeSessions) {
      const lastActiveTime = s.last_active_at ? new Date(s.last_active_at).getTime() : new Date(s.login_time).getTime();
      if (nowMs - lastActiveTime > thresholdMs) {
        const logoutTime = s.last_active_at || s.login_time;
        const loginTimeMs = new Date(s.login_time).getTime();
        const logoutTimeMs = new Date(logoutTime).getTime();
        const duration = Math.max(0, Math.round((logoutTimeMs - loginTimeMs) / 1000));
        
        db.prepare('UPDATE login_sessions SET logout_time = ?, duration = ? WHERE id = ?')
          .run(logoutTime, duration, s.id);
        changed = true;
        
        // Also end any active breaks for this user
        const activeBreak = db.prepare('SELECT * FROM break_records WHERE user_id = ? AND end_time IS NULL').get(s.user_id) as any;
        if (activeBreak) {
          const breakStartMs = new Date(activeBreak.start_time).getTime();
          const breakEndMs = new Date(logoutTime).getTime();
          const breakDuration = Math.max(0, Math.round((breakEndMs - breakStartMs) / 1000));
          db.prepare('UPDATE break_records SET end_time = ?, duration = ? WHERE id = ?')
            .run(logoutTime, breakDuration, activeBreak.id);
        }
        
        console.log(`[STALE SESSION] Auto-logged out user ${s.user_id} due to inactivity since ${logoutTime}`);
        
        if (broadcast && s.user_id !== 'dev_1') {
          broadcast({ type: 'SESSION_CHANGED', data: { userId: s.user_id } });
        }
      }
    }
    return changed;
  } catch (e: any) {
    console.error('[DATABASE] Failed to clean up stale sessions:', e.message);
    return false;
  }
}
