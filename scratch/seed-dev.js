import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'store.db');
console.log('Connecting to database:', DB_PATH);
const db = new Database(DB_PATH);

const devExists = db.prepare("SELECT COUNT(*) as c FROM users WHERE username = 'developer'").get().c;
const passwordHash = bcrypt.hashSync('251004', 10);
const allPerms = JSON.stringify([
  'access_billing','edit_product_price','delete_bill_items',
  'apply_discounts','view_analytics','access_inventory',
  'view_transaction_history','generate_reports','access_settings','manage_employees'
]);
const now = new Date().toISOString();

if (devExists === 0) {
  const ins = db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?)');
  ins.run('dev_1', 'developer', 'developer@retailpos.com', 'Developer Account', 'owner', passwordHash, allPerms, null, 1, now);
  console.log('✅ Success: Permanent developer account created (developer / 251004)');
} else {
  // Update password and permissions to ensure they are 100% correct
  db.prepare("UPDATE users SET password_hash = ?, role = 'owner', permissions = ? WHERE username = 'developer'").run(passwordHash, allPerms);
  console.log('🔄 Success: Developer account password reset and updated to 251004');
}
db.close();
