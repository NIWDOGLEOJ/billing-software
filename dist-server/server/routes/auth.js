import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { JWT_SECRET } from '../middleware/auth';
const router = Router();
// POST /api/auth/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    try {
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        const sessionId = Math.random().toString(36).substring(2, 15);
        const loginTime = new Date().toISOString();
        db.prepare('INSERT INTO login_sessions (id, user_id, login_time) VALUES (?, ?, ?)')
            .run(sessionId, user.id, loginTime);
        const payload = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            permissions: JSON.parse(user.permissions || '[]'),
            sessionId
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: payload });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/auth/logout
router.post('/logout', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
    }
    try {
        const now = new Date().toISOString();
        const session = db.prepare('SELECT * FROM login_sessions WHERE id = ?').get(sessionId);
        if (session) {
            const loginTime = new Date(session.login_time).getTime();
            const logoutTime = new Date(now).getTime();
            const duration = Math.round((logoutTime - loginTime) / 1000); // duration in seconds
            db.prepare('UPDATE login_sessions SET logout_time = ?, duration = ? WHERE id = ?')
                .run(now, duration, sessionId);
        }
        // End any active breaks
        if (req.user) {
            const activeBreak = db.prepare('SELECT * FROM break_records WHERE user_id = ? AND end_time IS NULL').get(req.user.id);
            if (activeBreak) {
                const startTime = new Date(activeBreak.start_time).getTime();
                const endTime = new Date(now).getTime();
                const duration = Math.round((endTime - startTime) / 1000);
                db.prepare('UPDATE break_records SET end_time = ?, duration = ? WHERE id = ?')
                    .run(now, duration, activeBreak.id);
            }
        }
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
