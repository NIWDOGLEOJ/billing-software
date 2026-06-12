import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, cleanupStaleSessions } from '../db';
import { authenticateToken, requireOwner } from '../middleware/auth';
const router = Router();
// GET /api/users (requires owner/co-owner)
router.get('/', authenticateToken, requireOwner, (req, res) => {
    try {
        const users = db.prepare("SELECT id, username, email, name, role, permissions, phone, is_active, created_at FROM users WHERE username != 'developer' AND id != 'dev_1'").all();
        const parsedUsers = users.map((u) => ({
            ...u,
            permissions: JSON.parse(u.permissions || '[]'),
            is_active: Boolean(u.is_active)
        }));
        res.json(parsedUsers);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/users (requires owner/co-owner)
router.post('/', authenticateToken, requireOwner, (req, res) => {
    const { id, username, email, name, role, password, permissions, phone } = req.body;
    if (!id || !username || !name || !role || !password) {
        return res.status(400).json({ error: 'Missing required fields (id, username, name, role, password)' });
    }
    try {
        const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (existing) {
            return res.status(400).json({ error: `Username "${username}" is already taken` });
        }
        const passwordHash = bcrypt.hashSync(password, 10);
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO users (id, username, email, name, role, password_hash, permissions, phone, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(id, username, email || null, name, role, passwordHash, JSON.stringify(permissions || []), phone || null, now);
        const created = db.prepare('SELECT id, username, email, name, role, permissions, phone, is_active, created_at FROM users WHERE id = ?').get(id);
        created.permissions = JSON.parse(created.permissions || '[]');
        created.is_active = Boolean(created.is_active);
        res.status(201).json(created);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/users/:id (requires owner/co-owner)
router.put('/:id', authenticateToken, requireOwner, (req, res) => {
    const { id } = req.params;
    const { email, name, role, permissions, phone, is_active } = req.body;
    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        db.prepare(`
      UPDATE users
      SET email = ?, name = ?, role = ?, permissions = ?, phone = ?, is_active = ?
      WHERE id = ?
    `).run(email !== undefined ? email : user.email, name !== undefined ? name : user.name, role !== undefined ? role : user.role, permissions !== undefined ? JSON.stringify(permissions) : user.permissions, phone !== undefined ? phone : user.phone, is_active !== undefined ? (is_active ? 1 : 0) : user.is_active, id);
        const updated = db.prepare('SELECT id, username, email, name, role, permissions, phone, is_active, created_at FROM users WHERE id = ?').get(id);
        updated.permissions = JSON.parse(updated.permissions || '[]');
        updated.is_active = Boolean(updated.is_active);
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/users/:id/password (User can update their own password, or owner can update any employee's password)
router.put('/:id/password', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }
    // Permission guard: Only the user themselves OR an owner/co-owner can change this password
    if (req.user?.id !== id && req.user?.role !== 'owner' && req.user?.role !== 'co-owner') {
        return res.status(403).json({ error: 'Permission denied to modify password' });
    }
    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const passwordHash = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
        res.json({ success: true, message: 'Password updated successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/users/:id (requires owner/co-owner)
router.delete('/:id', authenticateToken, requireOwner, (req, res) => {
    const { id } = req.params;
    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        res.json({ success: true, message: 'User permanently deleted' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ── Break Record Endpoints ───────────────────────────────────────────────────
// GET /api/users/breaks - list active/completed breaks
router.get('/breaks', authenticateToken, (req, res) => {
    try {
        const breaks = db.prepare("SELECT b.*, u.name as user_name FROM break_records b JOIN users u ON b.user_id = u.id WHERE u.username != 'developer' AND u.id != 'dev_1' ORDER BY b.start_time DESC").all();
        res.json(breaks);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/users/breaks/start
router.post('/breaks/start', authenticateToken, (req, res) => {
    const { breakId } = req.body;
    if (!req.user)
        return res.status(401).json({ error: 'Authentication required' });
    const id = breakId || Math.random().toString(36).substring(2, 15);
    const now = new Date().toISOString();
    try {
        // End any existing unended breaks just in case
        db.prepare("UPDATE break_records SET end_time = ?, duration = 0 WHERE user_id = ? AND end_time IS NULL")
            .run(now, req.user.id);
        db.prepare('INSERT INTO break_records (id, user_id, start_time) VALUES (?, ?, ?)')
            .run(id, req.user.id, now);
        const broadcast = req.app.get('broadcast');
        if (broadcast && req.user.id !== 'dev_1') {
            broadcast({ type: 'BREAK_CHANGED', data: { userId: req.user.id } });
        }
        res.status(201).json({ id, start_time: now });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/users/breaks/end
router.post('/breaks/end', authenticateToken, (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: 'Authentication required' });
    try {
        const activeBreak = db.prepare('SELECT * FROM break_records WHERE user_id = ? AND end_time IS NULL').get(req.user.id);
        if (!activeBreak) {
            return res.status(404).json({ error: 'No active break found for this user' });
        }
        const now = new Date().toISOString();
        const startTime = new Date(activeBreak.start_time).getTime();
        const endTime = new Date(now).getTime();
        const duration = Math.round((endTime - startTime) / 1000); // duration in seconds
        db.prepare('UPDATE break_records SET end_time = ?, duration = ? WHERE id = ?')
            .run(now, duration, activeBreak.id);
        const broadcast = req.app.get('broadcast');
        if (broadcast && req.user.id !== 'dev_1') {
            broadcast({ type: 'BREAK_CHANGED', data: { userId: req.user.id } });
        }
        res.json({ id: activeBreak.id, end_time: now, duration });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/users/sessions - list login sessions for analytics/employee-performance
router.get('/sessions', authenticateToken, requireOwner, (req, res) => {
    try {
        cleanupStaleSessions(req.app.get('broadcast'));
        const sessions = db.prepare("SELECT s.*, u.name as user_name, u.role as user_role FROM login_sessions s JOIN users u ON s.user_id = u.id WHERE u.username != 'developer' AND u.id != 'dev_1' ORDER BY s.login_time DESC").all();
        res.json(sessions);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/users/my-sessions - list login sessions for the logged-in employee/owner
router.get('/my-sessions', authenticateToken, (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        cleanupStaleSessions(req.app.get('broadcast'));
        const sessions = db.prepare('SELECT s.*, u.name as user_name, u.role as user_role FROM login_sessions s JOIN users u ON s.user_id = u.id WHERE s.user_id = ? ORDER BY s.login_time DESC').all(userId);
        res.json(sessions);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
