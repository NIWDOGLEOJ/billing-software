import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import fs from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Read active sector from file
export function getActiveSector() {
    try {
        const sectorFile = path.join(__dirname, '..', 'active_sector.txt');
        if (fs.existsSync(sectorFile)) {
            return fs.readFileSync(sectorFile, 'utf-8').trim();
        }
    }
    catch (e) { }
    return 'retail';
}
export function getDbPath(sector) {
    const sec = sector || 'retail';
    return path.join(__dirname, '..', `${sec}.db`);
}
// In-memory pointer to the currently active sqlite connection
let currentDbConnection = new Database(getDbPath(getActiveSector()));
currentDbConnection.pragma('journal_mode = WAL');
currentDbConnection.pragma('foreign_keys = ON');
// Export a Proxy so that all existing modules that import `db` get redirected transparently
export const db = new Proxy({}, {
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
export function switchDatabase(sector) {
    try {
        currentDbConnection.close();
    }
    catch (e) { }
    const newPath = getDbPath(sector);
    currentDbConnection = new Database(newPath);
    currentDbConnection.pragma('journal_mode = WAL');
    currentDbConnection.pragma('foreign_keys = ON');
    // Re-initialize schema on this new database file with sector-specific seed data
    initDb(sector);
}
export function initDb(sector) {
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
      distributor_price   REAL DEFAULT 0
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
  `);
    // Safe migrations for existing databases
    try {
        db.prepare('ALTER TABLE customers ADD COLUMN outstanding_balance REAL DEFAULT 0').run();
        console.log('✅ Added outstanding_balance column to customers table');
    }
    catch (e) {
        // Column already exists, safe to ignore
    }
    try {
        db.prepare("ALTER TABLE products ADD COLUMN hsn_code TEXT DEFAULT ''").run();
        console.log('✅ Added hsn_code column to products table');
    }
    catch (e) {
        // Column already exists, safe to ignore
    }
    // B2B Wholesale migrations
    try {
        db.prepare('ALTER TABLE customers ADD COLUMN gstin TEXT').run();
        console.log('✅ Added gstin column to customers table');
    }
    catch (e) { }
    try {
        db.prepare('ALTER TABLE customers ADD COLUMN credit_limit REAL DEFAULT 50000').run();
        console.log('✅ Added credit_limit column to customers table');
    }
    catch (e) { }
    try {
        db.prepare('ALTER TABLE bills ADD COLUMN customer_gstin TEXT').run();
        console.log('✅ Added customer_gstin column to bills table');
    }
    catch (e) { }
    try {
        db.prepare('ALTER TABLE bills ADD COLUMN igst REAL DEFAULT 0').run();
        console.log('✅ Added igst column to bills table');
    }
    catch (e) { }
    try {
        db.prepare("ALTER TABLE bills ADD COLUMN pricing_tier TEXT DEFAULT 'retail'").run();
        console.log('✅ Added pricing_tier column to bills table');
    }
    catch (e) { }
    try {
        db.prepare("ALTER TABLE login_sessions ADD COLUMN last_active_at TEXT").run();
        console.log('✅ Added last_active_at column to login_sessions table');
    }
    catch (e) {
        // Column already exists, safe to ignore
    }
    try {
        db.prepare("ALTER TABLE login_sessions ADD COLUMN device_type TEXT DEFAULT 'desktop'").run();
        console.log('✅ Added device_type column to login_sessions table');
    }
    catch (e) {
        // Column already exists, safe to ignore
    }
    try {
        db.prepare("ALTER TABLE login_sessions ADD COLUMN is_attendance INTEGER DEFAULT 1").run();
        console.log('✅ Added is_attendance column to login_sessions table');
    }
    catch (e) {
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
        { name: 'distributor_price', type: 'REAL DEFAULT 0' }
    ];
    for (const col of columnsToAdd) {
        try {
            db.prepare(`ALTER TABLE products ADD COLUMN ${col.name} ${col.type}`).run();
            console.log(`✅ Added ${col.name} column to products table`);
        }
        catch (e) {
            // Column already exists, safe to ignore
        }
    }
    // ── Seed default users ──────────────────────────────────────────────────────
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (userCount === 0) {
        const ins = db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?)');
        const allPerms = JSON.stringify([
            'access_billing', 'edit_product_price', 'delete_bill_items',
            'apply_discounts', 'view_analytics', 'access_inventory',
            'view_transaction_history', 'generate_reports', 'access_settings', 'manage_employees'
        ]);
        const empPerms = JSON.stringify([
            'access_billing', 'edit_product_price', 'delete_bill_items', 'apply_discounts'
        ]);
        const now = new Date().toISOString();
        ins.run('owner_1', 'owner', 'owner@retailpos.com', 'Store Owner', 'owner', bcrypt.hashSync('owner123', 10), allPerms, null, 1, now);
        ins.run('coowner_1', 'coowner', 'coowner@retailpos.com', 'Co-Owner Partner', 'co-owner', bcrypt.hashSync('coowner123', 10), allPerms, null, 1, now);
        ins.run('emp_1', 'employee', 'employee@retailpos.com', 'John Cashier', 'employee', bcrypt.hashSync('employee123', 10), empPerms, null, 1, now);
        console.log('✅ Default accounts seeded (owner / coowner / employee)');
    }
    // Ensure permanent developer account exists with ID 'developer' and password '251004'
    const devCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE username = 'developer'").get().c;
    if (devCount === 0) {
        const ins = db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?)');
        const allPerms = JSON.stringify([
            'access_billing', 'edit_product_price', 'delete_bill_items',
            'apply_discounts', 'view_analytics', 'access_inventory',
            'view_transaction_history', 'generate_reports', 'access_settings', 'manage_employees'
        ]);
        const now = new Date().toISOString();
        ins.run('dev_1', 'developer', 'developer@retailpos.com', 'Developer Account', 'owner', bcrypt.hashSync('251004', 10), allPerms, null, 1, now);
        console.log('✅ Permanent developer account seeded (developer / 251004)');
    }
    // ── Seed default products — SECTOR-SPECIFIC CATALOGS ────────────────────────
    const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
    if (prodCount === 0) {
        const ins = db.prepare('INSERT INTO products (id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code, brand, uom, purchase_price, mrp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        const sectorProducts = {
            retail: [
                // id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code, brand, uom, purchase_price, mrp
                ['1001', '1001', 'Tata Gold Tea 500g', 290, 'Beverages', 5, 80, 15, '0902', 'Tata', 'PCS', 240, 310],
                ['1002', '1002', 'Amul Taaza Milk 1L', 65, 'Dairy', 5, 100, 20, '0401', 'Amul', 'PCS', 55, 68],
                ['1003', '1003', 'Aashirvaad Atta 5kg', 275, 'Grains', 5, 60, 10, '1101', 'Aashirvaad', 'PCS', 230, 285],
                ['1004', '1004', 'Fortune Sunlite Oil 1L', 155, 'Cooking', 5, 50, 10, '1512', 'Fortune', 'PCS', 135, 160],
                ['1005', '1005', 'Britannia Bread Loaf', 42, 'Bakery', 5, 40, 8, '1905', 'Britannia', 'PCS', 32, 45],
                ['1006', '1006', 'India Gate Basmati Rice 5kg', 450, 'Grains', 5, 45, 10, '1006', 'India Gate', 'PCS', 380, 475],
                ['1007', '1007', 'Parle-G Biscuits 800g', 65, 'Snacks', 18, 120, 25, '1905', 'Parle', 'PCS', 50, 70],
                ['1008', '1008', 'Haldiram Bhujia 400g', 110, 'Snacks', 12, 60, 12, '2106', 'Haldiram', 'PCS', 85, 120],
                ['1009', '1009', 'Nescafe Classic 200g', 450, 'Beverages', 18, 30, 5, '2101', 'Nescafe', 'PCS', 380, 475],
                ['1010', '1010', 'Surf Excel Matic 1kg', 270, 'Household', 18, 50, 10, '3402', 'Surf Excel', 'PCS', 220, 285],
                ['1011', '1011', 'Amul Butter 500g', 280, 'Dairy', 12, 35, 8, '0405', 'Amul', 'PCS', 240, 295],
                ['1012', '1012', 'Maggi Noodles Pack of 12', 120, 'Snacks', 18, 80, 15, '1902', 'Maggi', 'PCS', 100, 130],
                ['1013', '1013', 'Dettol Soap 125g x3', 150, 'Personal Care', 18, 40, 10, '3401', 'Dettol', 'PCS', 120, 160],
                ['1014', '1014', 'Colgate MaxFresh 150g', 95, 'Personal Care', 18, 55, 10, '3306', 'Colgate', 'PCS', 75, 99],
                ['1015', '1015', 'Farm Fresh Eggs (12 pack)', 80, 'Dairy', 0, 30, 5, '0407', 'Local', 'PCS', 65, 85],
                ['1016', '1016', 'Onions 1kg', 40, 'Produce', 0, 50, 10, '0703', 'Local', 'KG', 30, 45],
                ['1017', '1017', 'Potatoes 1kg', 35, 'Produce', 0, 60, 15, '0701', 'Local', 'KG', 25, 40],
                ['1018', '1018', 'Tomatoes 1kg', 50, 'Produce', 0, 40, 10, '0702', 'Local', 'KG', 35, 55],
                ['1019', '1019', 'Bananas 1 Dozen', 50, 'Produce', 0, 50, 10, '0803', 'Local', 'PCS', 35, 55],
                ['1020', '1020', 'Chicken Breast 1kg', 320, 'Meat', 0, 20, 5, '0207', 'Local', 'KG', 280, 340],
            ],
            pharmacy: [
                ['P001', 'P001', 'Paracetamol 500mg (10 Tab)', 30, 'OTC', 12, 200, 30, '3004', 'Cipla', 'STRIP', 18, 32],
                ['P002', 'P002', 'Amoxicillin 500mg (10 Cap)', 120, 'Prescription', 12, 80, 15, '3004', 'Sun Pharma', 'STRIP', 85, 130],
                ['P003', 'P003', 'Ibuprofen 400mg (10 Tab)', 45, 'OTC', 12, 150, 20, '3004', 'Abbott', 'STRIP', 30, 48],
                ['P004', 'P004', 'Azithromycin 500mg (3 Tab)', 95, 'Prescription', 12, 60, 10, '3004', 'Zydus', 'STRIP', 65, 100],
                ['P005', 'P005', 'Cetirizine 10mg (10 Tab)', 25, 'OTC', 12, 180, 25, '3004', 'Dr Reddy', 'STRIP', 15, 28],
                ['P006', 'P006', 'Pantoprazole 40mg (15 Tab)', 85, 'Prescription', 12, 70, 12, '3004', 'Sun Pharma', 'STRIP', 55, 90],
                ['P007', 'P007', 'Metformin 500mg (20 Tab)', 55, 'Prescription', 12, 100, 18, '3004', 'USV', 'STRIP', 35, 60],
                ['P008', 'P008', 'Atorvastatin 10mg (10 Tab)', 70, 'Prescription', 12, 90, 15, '3004', 'Cipla', 'STRIP', 45, 75],
                ['P009', 'P009', 'Cough Syrup Benadryl 150ml', 110, 'OTC', 12, 50, 10, '3004', 'Johnson', 'BOTTLE', 80, 120],
                ['P010', 'P010', 'Betadine Antiseptic 100ml', 90, 'OTC', 18, 40, 8, '3004', 'Win Medicare', 'BOTTLE', 65, 95],
                ['P011', 'P011', 'Band-Aid Flexible Fabric 100s', 180, 'Surgical', 18, 25, 5, '3005', 'Johnson', 'BOX', 140, 195],
                ['P012', 'P012', 'ORS Electral Powder (21.8g)', 15, 'OTC', 5, 300, 50, '3004', 'FDC', 'PCS', 8, 18],
                ['P013', 'P013', 'Volini Pain Relief Spray 100g', 220, 'OTC', 18, 35, 8, '3004', 'Sun Pharma', 'PCS', 170, 240],
                ['P014', 'P014', 'Multivitamin Becosules-Z (20 Tab)', 85, 'Vitamins', 12, 60, 12, '2936', 'Pfizer', 'STRIP', 55, 90],
                ['P015', 'P015', 'Insulin Glargine 3ml Pen', 650, 'Prescription', 5, 15, 3, '3004', 'Sanofi', 'PCS', 500, 680],
                ['P016', 'P016', 'Crocin Advance 500mg (15 Tab)', 40, 'OTC', 12, 250, 40, '3004', 'GSK', 'STRIP', 25, 42],
                ['P017', 'P017', 'Surgical Mask N95 (Pack of 10)', 120, 'Medical Devices', 18, 100, 20, '6307', '3M', 'BOX', 80, 130],
                ['P018', 'P018', 'Digital Thermometer', 250, 'Medical Devices', 18, 20, 5, '9025', 'Omron', 'PCS', 180, 270],
                ['P019', 'P019', 'Blood Glucose Strips (50s)', 550, 'Medical Devices', 12, 25, 5, '3822', 'Accu-Chek', 'BOX', 420, 580],
                ['P020', 'P020', 'Diclofenac Gel 30g', 65, 'OTC', 12, 45, 10, '3004', 'Novartis', 'PCS', 40, 70],
            ],
            wholesale: [
                ['W001', 'W001', 'Tata Gold Tea 1kg Bulk (x12)', 3300, 'FMCG', 5, 200, 30, '0902', 'Tata', 'BOX', 2880, 3480],
                ['W002', 'W002', 'Amul Butter 500g (x20)', 5200, 'Dairy', 12, 80, 15, '0405', 'Amul', 'BOX', 4600, 5500],
                ['W003', 'W003', 'Fortune Oil 1L (x12)', 1740, 'FMCG', 5, 100, 20, '1512', 'Fortune', 'BOX', 1500, 1850],
                ['W004', 'W004', 'Surf Excel 1kg (x10)', 2500, 'Household', 18, 60, 10, '3402', 'Surf Excel', 'BOX', 2100, 2700],
                ['W005', 'W005', 'Maggi 12-Pack (x8 Outer)', 880, 'FMCG', 18, 150, 25, '1902', 'Nestle', 'BOX', 720, 950],
                ['W006', 'W006', 'Colgate 150g (x12)', 1080, 'Personal Care', 18, 90, 15, '3306', 'Colgate', 'BOX', 850, 1140],
                ['W007', 'W007', 'Parle-G 800g (x16)', 960, 'FMCG', 18, 180, 30, '1905', 'Parle', 'BOX', 750, 1020],
                ['W008', 'W008', 'Dettol Soap 125g (x48)', 4800, 'Personal Care', 18, 50, 8, '3401', 'Dettol', 'BOX', 3800, 5100],
                ['W009', 'W009', 'Basmati Rice 25kg Premium', 2250, 'Bulk Grains', 5, 40, 8, '1006', 'India Gate', 'BAG', 1900, 2400],
                ['W010', 'W010', 'Sugar 50kg (Commercial)', 2100, 'Bulk Grains', 5, 30, 5, '1701', 'Local', 'BAG', 1800, 2200],
                ['W011', 'W011', 'Aashirvaad Atta 10kg (x5)', 2600, 'Bulk Grains', 5, 55, 10, '1101', 'Aashirvaad', 'BOX', 2200, 2750],
                ['W012', 'W012', 'Nescafe 200g (x6)', 2550, 'Beverages', 18, 40, 8, '2101', 'Nescafe', 'BOX', 2100, 2700],
                ['W013', 'W013', 'Haldiram Snacks Assorted (x20)', 2000, 'FMCG', 12, 70, 12, '2106', 'Haldiram', 'BOX', 1600, 2150],
                ['W014', 'W014', 'Bisleri Water 1L (x12)', 180, 'Beverages', 18, 250, 40, '2201', 'Bisleri', 'BOX', 140, 200],
                ['W015', 'W015', 'Vim Dish Bar 600g (x24)', 2400, 'Household', 18, 45, 10, '3402', 'Vim', 'BOX', 1950, 2550],
            ],
            restaurant: [
                ['R001', 'R001', 'Butter Chicken (Full)', 380, 'Main Course', 5, 999, 5, '', "Chef's", 'PCS', 120, 420],
                ['R002', 'R002', 'Paneer Tikka (8 pcs)', 320, 'Starters', 5, 999, 5, '', "Chef's", 'PCS', 90, 350],
                ['R003', 'R003', 'Dal Makhani', 240, 'Main Course', 5, 999, 5, '', "Chef's", 'PCS', 60, 260],
                ['R004', 'R004', 'Tandoori Roti', 30, 'Breads', 5, 999, 5, '', "Chef's", 'PCS', 8, 35],
                ['R005', 'R005', 'Garlic Naan', 50, 'Breads', 5, 999, 5, '', "Chef's", 'PCS', 12, 55],
                ['R006', 'R006', 'Chicken Biryani', 320, 'Rice', 5, 999, 5, '', "Chef's", 'PCS', 100, 350],
                ['R007', 'R007', 'Veg Fried Rice', 180, 'Rice', 5, 999, 5, '', "Chef's", 'PCS', 45, 200],
                ['R008', 'R008', 'Fresh Lime Soda', 60, 'Beverages', 18, 999, 5, '2202', '', "PCS", 15, 65],
                ['R009', 'R009', 'Masala Chai', 30, 'Beverages', 5, 999, 5, '', "Local", 'PCS', 8, 35],
                ['R010', 'R010', 'Gulab Jamun (2 pcs)', 80, 'Desserts', 5, 999, 5, '', "Chef's", 'PCS', 20, 90],
                ['R011', 'R011', 'Samosa (2 pcs)', 60, 'Starters', 5, 999, 5, '', "Chef's", 'PCS', 15, 65],
                ['R012', 'R012', 'Veg Thali (Combo)', 220, 'Combo Meals', 5, 999, 5, '', "Chef's", 'PCS', 70, 240],
                ['R013', 'R013', 'Non-Veg Thali (Combo)', 320, 'Combo Meals', 5, 999, 5, '', "Chef's", 'PCS', 110, 350],
                ['R014', 'R014', 'Chole Bhature', 180, 'Main Course', 5, 999, 5, '', "Chef's", 'PCS', 45, 200],
                ['R015', 'R015', 'Raita (Bowl)', 60, 'Sides', 5, 999, 5, '', "Chef's", 'PCS', 15, 65],
                ['R016', 'R016', 'Papad (2 pcs)', 30, 'Sides', 5, 999, 5, '', "Chef's", 'PCS', 5, 35],
                ['R017', 'R017', 'Cold Coffee', 120, 'Beverages', 18, 999, 5, '', '', "PCS", 30, 130],
                ['R018', 'R018', 'Mineral Water 1L', 20, 'Beverages', 18, 999, 10, '2201', 'Bisleri', 'PCS', 10, 20],
                ['R019', 'R019', 'Manchurian (Dry)', 200, 'Starters', 5, 999, 5, '', "Chef's", 'PCS', 55, 220],
                ['R020', 'R020', 'Lassi (Sweet/Salt)', 70, 'Beverages', 5, 999, 5, '', '', "PCS", 20, 75],
            ]
        };
        const items = sectorProducts[activeSector] || sectorProducts.retail;
        for (const p of items)
            ins.run(...p);
        console.log(`✅ Seeded ${items.length} ${activeSector} products into database`);
    }
    // ── Seed default warehouses ──────────────────────────────────────────────────
    const whCount = db.prepare('SELECT COUNT(*) as c FROM warehouses').get().c;
    if (whCount === 0) {
        const insWh = db.prepare('INSERT INTO warehouses (id, name, code, address, created_at) VALUES (?,?,?,?,?)');
        const now = new Date().toISOString();
        const sectorWarehouses = {
            retail: [
                ['wh_main', 'Main Store Warehouse', 'WH-MAIN', '123 Main Street, City', now],
                ['wh_depot', 'Secondary Depot', 'WH-DEPOT', '456 Warehouse Blvd, Suburb', now],
            ],
            pharmacy: [
                ['wh_main', 'Main Pharmacy Store', 'PH-MAIN', '123 Medical Complex, City', now],
                ['wh_cold', 'Cold Storage Unit', 'PH-COLD', '123 Medical Complex, Basement', now],
            ],
            wholesale: [
                ['wh_main', 'Central Distribution Center', 'WH-CDC', '100 Industrial Area, City', now],
                ['wh_depot', 'Regional Depot - North', 'WH-NORTH', '200 APMC Market Yard', now],
                ['wh_south', 'Regional Depot - South', 'WH-SOUTH', '300 Trade Center', now],
            ],
            restaurant: [
                ['wh_main', 'Kitchen Pantry', 'KT-MAIN', 'Main Kitchen, Ground Floor', now],
                ['wh_cold', 'Walk-in Cold Room', 'KT-COLD', 'Basement Level', now],
            ],
        };
        const whs = sectorWarehouses[activeSector] || sectorWarehouses.retail;
        for (const w of whs)
            insWh.run(...w);
        console.log(`✅ Seeded ${whs.length} ${activeSector} warehouses`);
    }
    // ── Seed default medicine batches (PHARMACY ONLY) ───────────────────────────
    if (activeSector === 'pharmacy') {
        const batchCount = db.prepare('SELECT COUNT(*) as c FROM medicine_batches').get().c;
        if (batchCount === 0) {
            const insBatch = db.prepare('INSERT INTO medicine_batches (id, product_id, batch_number, expiry_date, manufacturing_date, stock_quantity, drug_license, prescription_required, created_at) VALUES (?,?,?,?,?,?,?,?,?)');
            const now = new Date().toISOString();
            // Active batches with healthy expiry dates
            insBatch.run('b1', 'P001', 'PCM-2027-A', '2027-12-31', '2025-12-01', 120, null, 0, now);
            insBatch.run('b2', 'P002', 'AMX-2027-B', '2027-06-30', '2025-06-01', 50, 'DL-27-12345', 1, now);
            insBatch.run('b3', 'P003', 'IBU-2028-A', '2028-09-15', '2026-03-15', 100, null, 0, now);
            insBatch.run('b4', 'P004', 'AZI-2027-C', '2027-11-20', '2025-11-20', 40, 'DL-27-67890', 1, now);
            insBatch.run('b5', 'P005', 'CET-2028-A', '2028-03-01', '2026-03-01', 150, null, 0, now);
            insBatch.run('b6', 'P006', 'PAN-2027-D', '2027-08-15', '2025-08-15', 60, 'DL-27-11111', 1, now);
            insBatch.run('b7', 'P007', 'MET-2028-B', '2028-02-28', '2026-02-01', 80, 'DL-27-22222', 1, now);
            insBatch.run('b8', 'P008', 'ATV-2027-E', '2027-10-30', '2025-10-01', 70, 'DL-27-33333', 1, now);
            insBatch.run('b9', 'P009', 'BEN-2027-F', '2027-07-15', '2025-07-15', 40, null, 0, now);
            insBatch.run('b10', 'P015', 'INS-2027-A', '2027-04-30', '2025-10-01', 12, 'DL-27-44444', 1, now);
            // Near-expiry batch (45 days from now)
            const closeDate = new Date();
            closeDate.setDate(closeDate.getDate() + 45);
            const closeDateStr = closeDate.toISOString().split('T')[0];
            insBatch.run('b11', 'P001', 'PCM-NEAR-EXP', closeDateStr, '2025-01-01', 30, null, 0, now);
            insBatch.run('b12', 'P002', 'AMX-NEAR-EXP', closeDateStr, '2025-01-01', 20, 'DL-27-12345', 1, now);
            // Expired batch (10 days ago)
            const expiredDate = new Date();
            expiredDate.setDate(expiredDate.getDate() - 10);
            const expiredDateStr = expiredDate.toISOString().split('T')[0];
            insBatch.run('b13', 'P001', 'PCM-EXPIRED', expiredDateStr, '2024-05-01', 80, null, 0, now);
            console.log('✅ Seeded pharmacy medicine batches (active + near-expiry + expired)');
        }
    }
    // ── Seed default settings — SECTOR-SPECIFIC ────────────────────────────────
    const insSettings = db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)');
    const sectorSettings = {
        retail: [
            ['shopName', 'RETAIL SUPERMARKET'],
            ['shopAddress', '123 Main Street, City, State 12345'],
            ['shopPhone', '(555) 123-4567'],
            ['shopEmail', 'info@retailstore.com'],
            ['gstEnabled', 'true'],
            ['gstNumber', ''],
            ['gstRate', '18'],
            ['roundingEnabled', 'true'],
            ['loyaltyEnabled', 'true'],
            ['loyaltyPointsPerRupee', '0.01'],
            ['loyaltyPointValue', '1'],
            ['receiptPrinterName', ''],
            ['autoOpenDrawer', 'true'],
            ['chatEnabled', 'true'],
        ],
        pharmacy: [
            ['shopName', 'PHARMACY & WELLNESS'],
            ['shopAddress', '45 Medical Complex, Healthcare District, City 400001'],
            ['shopPhone', '(555) 987-6543'],
            ['shopEmail', 'dispensary@pharmawell.com'],
            ['gstEnabled', 'true'],
            ['gstNumber', ''],
            ['gstRate', '12'],
            ['roundingEnabled', 'true'],
            ['loyaltyEnabled', 'true'],
            ['loyaltyPointsPerRupee', '0.01'],
            ['loyaltyPointValue', '1'],
            ['receiptPrinterName', ''],
            ['autoOpenDrawer', 'true'],
            ['chatEnabled', 'true'],
        ],
        wholesale: [
            ['shopName', 'WHOLESALE DISTRIBUTION CENTER'],
            ['shopAddress', '100 APMC Market Yard, Industrial Area, City 400093'],
            ['shopPhone', '(555) 456-7890'],
            ['shopEmail', 'orders@wholesalemart.com'],
            ['gstEnabled', 'true'],
            ['gstNumber', '27AAAAA1111A1Z1'],
            ['gstRate', '18'],
            ['roundingEnabled', 'false'],
            ['loyaltyEnabled', 'false'],
            ['loyaltyPointsPerRupee', '0'],
            ['loyaltyPointValue', '0'],
            ['receiptPrinterName', ''],
            ['autoOpenDrawer', 'false'],
            ['chatEnabled', 'true'],
        ],
        restaurant: [
            ['shopName', 'RESTAURANT & KITCHEN'],
            ['shopAddress', '88 Food Street, Culinary Lane, City 110001'],
            ['shopPhone', '(555) 222-3333'],
            ['shopEmail', 'dine@ourkitchen.com'],
            ['gstEnabled', 'true'],
            ['gstNumber', ''],
            ['gstRate', '5'],
            ['roundingEnabled', 'true'],
            ['loyaltyEnabled', 'true'],
            ['loyaltyPointsPerRupee', '0.01'],
            ['loyaltyPointValue', '1'],
            ['receiptPrinterName', ''],
            ['autoOpenDrawer', 'true'],
            ['chatEnabled', 'true'],
        ],
    };
    const settingsToSeed = sectorSettings[activeSector] || sectorSettings.retail;
    for (const [k, v] of settingsToSeed)
        insSettings.run(k, v);
    console.log(`✅ Seeded ${activeSector} default settings`);
}
export function cleanupStaleSessions(broadcast) {
    try {
        const now = new Date().toISOString();
        const activeSessions = db.prepare('SELECT id, login_time, last_active_at, user_id FROM login_sessions WHERE logout_time IS NULL').all();
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
                const activeBreak = db.prepare('SELECT * FROM break_records WHERE user_id = ? AND end_time IS NULL').get(s.user_id);
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
    }
    catch (e) {
        console.error('[DATABASE] Failed to clean up stale sessions:', e.message);
        return false;
    }
}
