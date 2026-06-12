import { Router } from 'express';
import { db } from '../db';
import { authenticateToken, requireOwner } from '../middleware/auth';
const router = Router();
// GET /api/settings
router.get('/', authenticateToken, (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM settings').all();
        const settingsObj = {};
        for (const row of rows) {
            settingsObj[row.key] = row.value;
        }
        res.json(settingsObj);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/settings (requires owner/co-owner)
router.put('/', authenticateToken, requireOwner, (req, res) => {
    const settingsObj = req.body;
    if (!settingsObj || typeof settingsObj !== 'object') {
        return res.status(400).json({ error: 'Settings object is required' });
    }
    const transaction = db.transaction(() => {
        const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(settingsObj)) {
            upsert.run(key, String(value));
        }
    });
    try {
        transaction();
        // Query all to return updated set
        const rows = db.prepare('SELECT * FROM settings').all();
        const updatedObj = {};
        for (const row of rows) {
            updatedObj[row.key] = row.value;
        }
        res.json({
            settings: updatedObj,
            triggerBroadcast: true // flag for the server to broadcast WS sync
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/settings/backup (Backup all tables to JSON)
router.get('/backup', authenticateToken, requireOwner, (req, res) => {
    try {
        const users = db.prepare('SELECT * FROM users').all();
        const products = db.prepare('SELECT * FROM products').all();
        const bills = db.prepare('SELECT * FROM bills').all();
        const customers = db.prepare('SELECT * FROM customers').all();
        const settings = db.prepare('SELECT * FROM settings').all();
        const login_sessions = db.prepare('SELECT * FROM login_sessions').all();
        const break_records = db.prepare('SELECT * FROM break_records').all();
        const backupData = {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            data: {
                users,
                products,
                bills,
                customers,
                settings,
                login_sessions,
                break_records
            }
        };
        res.setHeader('Content-disposition', `attachment; filename=retail_pos_backup_${Date.now()}.json`);
        res.setHeader('Content-type', 'application/json');
        res.write(JSON.stringify(backupData, null, 2), 'utf-8');
        res.end();
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/settings/restore (Restore all tables from JSON)
router.post('/restore', authenticateToken, requireOwner, (req, res) => {
    const backup = req.body;
    if (!backup || !backup.data || typeof backup.data !== 'object') {
        return res.status(400).json({ error: 'Invalid backup JSON file' });
    }
    const { users, products, bills, customers, settings, login_sessions, break_records } = backup.data;
    const transaction = db.transaction(() => {
        // Helper to insert records cleanly
        const restoreTable = (tableName, dataArray, columns) => {
            if (!Array.isArray(dataArray) || dataArray.length === 0)
                return;
            db.prepare(`DELETE FROM ${tableName}`).run();
            const placeHolders = columns.map(() => '?').join(',');
            const insert = db.prepare(`INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeHolders})`);
            for (const item of dataArray) {
                const values = columns.map(col => item[col]);
                insert.run(...values);
            }
        };
        // Restore table by table with exact match of columns
        restoreTable('users', users || [], [
            'id', 'username', 'email', 'name', 'role', 'password_hash', 'permissions', 'phone', 'is_active', 'created_at'
        ]);
        restoreTable('products', products || [], [
            'id', 'sku', 'name', 'price', 'category', 'gst_rate', 'stock', 'low_stock_threshold'
        ]);
        restoreTable('bills', bills || [], [
            'id', 'bill_number', 'date', 'cashier_id', 'cashier_name', 'customer_phone', 'customer_name', 'subtotal',
            'gst_amount', 'cgst', 'sgst', 'total', 'payment_mode', 'amount_received', 'change_amount', 'rounding_adjustment',
            'points_earned', 'points_redeemed', 'items', 'shop_details', 'gst_enabled', 'gst_rate'
        ]);
        restoreTable('customers', customers || [], [
            'phone', 'name', 'loyalty_points', 'total_spent', 'visit_count', 'last_visit'
        ]);
        restoreTable('settings', settings || [], ['key', 'value']);
        restoreTable('login_sessions', login_sessions || [], ['id', 'user_id', 'login_time', 'logout_time', 'duration']);
        restoreTable('break_records', break_records || [], ['id', 'user_id', 'start_time', 'end_time', 'duration']);
    });
    try {
        transaction();
        res.json({ success: true, message: 'Store database successfully restored' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
