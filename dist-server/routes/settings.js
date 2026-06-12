import { Router } from 'express';
import { db, switchDatabase, getDbPath } from '../db';
import { authenticateToken, requireOwner } from '../middleware/auth';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
// GET /api/settings/network-ip (Fetch host local subnet IP address dynamically)
router.get('/network-ip', authenticateToken, (req, res) => {
    try {
        const interfaces = os.networkInterfaces();
        let localIp = '127.0.0.1';
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIp = iface.address;
                    break;
                }
            }
            if (localIp !== '127.0.0.1')
                break;
        }
        res.json({ ip: localIp });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/settings/install - Dynamically initialize bespoke database and remove other databases from disk
router.post('/install', authenticateToken, (req, res) => {
    const { sector, multiEnabled } = req.body;
    if (!sector) {
        return res.status(400).json({ error: 'Sector profile type is required' });
    }
    try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const sectorFile = path.join(__dirname, '..', 'active_sector.txt');
        // ── STEP 1: Snapshot the active user + session from the OLD database ───
        // Before we switch, grab the logged-in user record and their active session
        // so we can re-insert them into the new sector database. Without this the
        // JWT token becomes invalid (no matching session) and the client auto-logs out.
        const callingUser = req.user;
        let userRow = null;
        let sessionRow = null;
        let activeShiftRow = null;
        if (callingUser) {
            try {
                userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(callingUser.id);
            }
            catch (e) {
                console.warn('[INSTALL] Could not snapshot user:', e);
            }
            try {
                sessionRow = db.prepare('SELECT * FROM login_sessions WHERE id = ? AND logout_time IS NULL').get(callingUser.sessionId);
            }
            catch (e) {
                console.warn('[INSTALL] Could not snapshot session:', e);
            }
            try {
                activeShiftRow = db.prepare("SELECT * FROM shift_records WHERE user_id = ? AND status = 'active'").get(callingUser.id);
            }
            catch (e) { }
        }
        // Write active sector to active_sector.txt
        fs.writeFileSync(sectorFile, sector, 'utf-8');
        // ── STEP 2: Switch to the new sector database ─────────────────────────
        // switchDatabase() closes the old connection, opens a new .db file, and
        // runs initDb() which creates tables and seeds default data.
        switchDatabase(sector);
        // ── STEP 3: Migrate the user + session into the NEW database ──────────
        if (userRow) {
            try {
                // Upsert the user so they exist in the new sector DB
                const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userRow.id);
                if (!existing) {
                    db.prepare('INSERT INTO users (id, username, email, name, role, password_hash, permissions, phone, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(userRow.id, userRow.username, userRow.email, userRow.name, userRow.role, userRow.password_hash, userRow.permissions, userRow.phone, userRow.is_active, userRow.created_at);
                    console.log(`[INSTALL] Migrated user ${userRow.username} into ${sector}.db`);
                }
            }
            catch (e) {
                console.warn('[INSTALL] User migration failed (may already exist):', e);
            }
        }
        if (sessionRow) {
            try {
                const existingSession = db.prepare('SELECT id FROM login_sessions WHERE id = ?').get(sessionRow.id);
                if (!existingSession) {
                    db.prepare('INSERT INTO login_sessions (id, user_id, login_time, logout_time, duration, last_active_at, device_type, is_attendance) VALUES (?,?,?,?,?,?,?,?)').run(sessionRow.id, sessionRow.user_id, sessionRow.login_time, sessionRow.logout_time ?? null, sessionRow.duration ?? null, sessionRow.last_active_at ?? null, sessionRow.device_type ?? 'desktop', sessionRow.is_attendance ?? 1);
                    console.log(`[INSTALL] Migrated active session ${sessionRow.id} into ${sector}.db`);
                }
            }
            catch (e) {
                console.warn('[INSTALL] Session migration failed:', e);
            }
        }
        if (activeShiftRow) {
            try {
                const existingShift = db.prepare('SELECT id FROM shift_records WHERE id = ?').get(activeShiftRow.id);
                if (!existingShift) {
                    db.prepare('INSERT INTO shift_records (id, user_id, user_name, start_time, end_time, initial_cash, system_cash, system_upi, system_card, actual_cash, actual_upi, actual_card, discrepancy_cash, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(activeShiftRow.id, activeShiftRow.user_id, activeShiftRow.user_name, activeShiftRow.start_time, activeShiftRow.end_time ?? null, activeShiftRow.initial_cash, activeShiftRow.system_cash, activeShiftRow.system_upi, activeShiftRow.system_card, activeShiftRow.actual_cash ?? null, activeShiftRow.actual_upi ?? null, activeShiftRow.actual_card ?? null, activeShiftRow.discrepancy_cash, activeShiftRow.status, activeShiftRow.notes ?? null);
                }
            }
            catch (e) { }
        }
        // ── STEP 4: Clean up unwanted database files from disk ────────────────
        const sectors = ['retail', 'pharmacy', 'wholesale', 'restaurant'];
        for (const sec of sectors) {
            if (sec !== sector) {
                try {
                    const dbPath = getDbPath(sec);
                    // Delete main .db file and SQLite journal/WAL files
                    for (const suffix of ['', '-wal', '-shm']) {
                        const filePath = dbPath + suffix;
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            console.log(`[CLEANUP] Deleted: ${sec}.db${suffix}`);
                        }
                    }
                }
                catch (e) {
                    console.warn(`[CLEANUP] Failed to delete: ${sec}.db`, e);
                }
            }
        }
        // Also delete any old legacy store.db and its journal files
        try {
            const storeDbPath = path.join(__dirname, '..', 'store.db');
            for (const suffix of ['', '-wal', '-shm']) {
                const filePath = storeDbPath + suffix;
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[CLEANUP] Deleted legacy store.db${suffix}`);
                }
            }
        }
        catch (e) { }
        res.json({
            success: true,
            message: `Bespoke sector database (${sector}.db) successfully prepared. Unwanted billing databases deleted.`
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
