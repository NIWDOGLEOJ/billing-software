import { Router } from 'express';
import { db } from '../db';
import { authenticateToken, requireOwner } from '../middleware/auth';
const router = Router();
// GET /api/leaves - Retrieve all leaves/holidays
router.get('/', authenticateToken, (req, res) => {
    try {
        const leaves = db.prepare("SELECT * FROM leaves WHERE user_id != 'dev_1' ORDER BY date DESC").all();
        res.json(leaves);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/leaves - Create/Assign a leave or store-wide holiday (requires owner/co-owner)
router.post('/', authenticateToken, requireOwner, (req, res) => {
    const { id, user_id, user_name, date, type, reason } = req.body;
    if (!id || !date || !type) {
        return res.status(400).json({ error: 'Missing required fields (id, date, type)' });
    }
    try {
        const now = new Date().toISOString();
        // Check if leave already exists for this date + user combination to avoid duplicate assignments
        const existing = db.prepare('SELECT COUNT(*) as c FROM leaves WHERE date = ? AND (user_id = ? OR (user_id = \'all\' AND ? = \'holiday\'))')
            .get(date, user_id || 'all', type);
        if (existing.c > 0) {
            return res.status(409).json({ error: 'A leave or holiday is already scheduled for this entity on this date.' });
        }
        db.prepare(`
      INSERT INTO leaves (id, user_id, user_name, date, type, status, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user_id || 'all', // Default 'all' represents a store-wide holiday
        user_name || 'Store Wide', date, // YYYY-MM-DD
        type, // 'leave' or 'holiday'
        'approved', reason || null, now);
        const createdLeave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
        // Broadcast WebSocket updates to all register clients so calendar updates in real time
        const broadcast = req.app.get('broadcast');
        if (broadcast && user_id !== 'dev_1') {
            broadcast({ type: 'LEAVES_UPDATED', data: createdLeave });
        }
        res.status(201).json(createdLeave);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/leaves/:id - Delete/Revoke a leave or holiday (requires owner/co-owner)
router.delete('/:id', authenticateToken, requireOwner, (req, res) => {
    const { id } = req.params;
    try {
        const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
        if (!leave) {
            return res.status(404).json({ error: 'Record not found' });
        }
        db.prepare('DELETE FROM leaves WHERE id = ?').run(id);
        const broadcast = req.app.get('broadcast');
        if (broadcast) {
            broadcast({ type: 'LEAVES_UPDATED', data: { id, deleted: true } });
        }
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
