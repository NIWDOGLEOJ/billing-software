import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.join(__dirname, '..', 'store.db');
export const db = new Database(DB_PATH);
// WAL mode = much faster concurrent reads; essential for multi-PC LAN use
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
export function initDb() {
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

    CREATE TABLE IF NOT EXISTS products (
      id                  TEXT PRIMARY KEY,
      sku                 TEXT UNIQUE,
      name                TEXT NOT NULL,
      price               REAL NOT NULL,
      category            TEXT DEFAULT 'General',
      gst_rate            REAL DEFAULT 0,
      stock               INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 10
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
      gst_rate            REAL DEFAULT 18
    );

    CREATE TABLE IF NOT EXISTS customers (
      phone         TEXT PRIMARY KEY,
      name          TEXT,
      loyalty_points INTEGER DEFAULT 0,
      total_spent   REAL DEFAULT 0,
      visit_count   INTEGER DEFAULT 0,
      last_visit    TEXT
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
  `);
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
    // ── Seed default products ───────────────────────────────────────────────────
    const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
    if (prodCount === 0) {
        const ins = db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?)');
        const defaults = [
            ['1001', '1001', 'Milk 1L', 65, 'Dairy', 5, 50, 10],
            ['1002', '1002', 'Bread Loaf', 40, 'Bakery', 5, 30, 5],
            ['1003', '1003', 'Eggs (12 pack)', 80, 'Dairy', 0, 25, 5],
            ['1004', '1004', 'Rice 5kg', 250, 'Grains', 5, 100, 20],
            ['1005', '1005', 'Chicken Breast 1kg', 180, 'Meat', 0, 15, 5],
            ['1006', '1006', 'Tomatoes 1kg', 50, 'Produce', 0, 40, 10],
            ['1007', '1007', 'Bananas 1kg', 35, 'Produce', 0, 60, 15],
            ['1008', '1008', 'Coffee 500g', 200, 'Beverages', 5, 20, 5],
            ['1009', '1009', 'Butter 250g', 90, 'Dairy', 12, 35, 8],
            ['1010', '1010', 'Orange Juice 1L', 75, 'Beverages', 12, 45, 10],
        ];
        for (const p of defaults)
            ins.run(...p);
        console.log('✅ Default products seeded');
    }
    // ── Seed default settings ──────────────────────────────────────────────────
    const ins = db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)');
    const defaults = [
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
    ];
    for (const [k, v] of defaults)
        ins.run(k, v);
}
