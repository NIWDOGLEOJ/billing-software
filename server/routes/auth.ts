import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { JWT_SECRET, AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password, deviceType } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const sessionId = Math.random().toString(36).substring(2, 15);
    const loginTime = new Date().toISOString();

    // Enforce single active session rule: Locate and invalidate any older active sessions for this user
    try {
      const activeSessions = db.prepare('SELECT id, login_time FROM login_sessions WHERE user_id = ? AND logout_time IS NULL').all(user.id) as any[];
      
      for (const s of activeSessions) {
        const startMs = new Date(s.login_time).getTime();
        const endMs = new Date(loginTime).getTime();
        const duration = Math.max(0, Math.round((endMs - startMs) / 1000));
        
        db.prepare('UPDATE login_sessions SET logout_time = ?, duration = ? WHERE id = ?')
          .run(loginTime, duration, s.id);
          
        const broadcast = req.app.get('broadcast');
        if (broadcast && user.username !== 'developer' && user.id !== 'dev_1') {
          broadcast({ type: 'SESSION_INVALIDATED', data: { sessionId: s.id, userId: user.id } });
        }
      }
    } catch (e: any) {
      console.error('[AUTH] Failed to invalidate concurrent sessions:', e.message);
    }

    const deviceTypeVal = deviceType === 'mobile' ? 'mobile' : 'desktop';
    const isAttendanceVal = deviceTypeVal === 'mobile' ? 0 : 1;

    db.prepare('INSERT INTO login_sessions (id, user_id, login_time, last_active_at, device_type, is_attendance) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sessionId, user.id, loginTime, loginTime, deviceTypeVal, isAttendanceVal);

    const broadcast = req.app.get('broadcast');
    if (broadcast && user.username !== 'developer' && user.id !== 'dev_1') {
      broadcast({ type: 'SESSION_CHANGED', data: { userId: user.id } });
    }

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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req: AuthRequest, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const now = new Date().toISOString();
    const session = db.prepare('SELECT * FROM login_sessions WHERE id = ?').get(sessionId) as any;

    if (session) {
      const loginTime = new Date(session.login_time).getTime();
      const logoutTime = new Date(now).getTime();
      const duration = Math.round((logoutTime - loginTime) / 1000); // duration in seconds

      db.prepare('UPDATE login_sessions SET logout_time = ?, duration = ? WHERE id = ?')
        .run(now, duration, sessionId);
    }

    // End any active breaks
    if (req.user) {
      const activeBreak = db.prepare('SELECT * FROM break_records WHERE user_id = ? AND end_time IS NULL').get(req.user.id) as any;
      if (activeBreak) {
        const startTime = new Date(activeBreak.start_time).getTime();
        const endTime = new Date(now).getTime();
        const duration = Math.round((endTime - startTime) / 1000);
        db.prepare('UPDATE break_records SET end_time = ?, duration = ? WHERE id = ?')
          .run(now, duration, activeBreak.id);
      }
    }

    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      const userId = session ? session.user_id : (req.user ? req.user.id : null);
      if (userId !== 'dev_1') {
        broadcast({ type: 'SESSION_CHANGED', data: { userId } });
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/heartbeat - Keep active session alive
router.post('/heartbeat', authenticateToken, (req: AuthRequest, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const now = new Date().toISOString();
    db.prepare('UPDATE login_sessions SET last_active_at = ? WHERE id = ? AND logout_time IS NULL')
      .run(now, sessionId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/session/:id - Retrieve active login session metadata
router.get('/session/:id', authenticateToken, (req: AuthRequest, res) => {
  try {
    const session = db.prepare('SELECT * FROM login_sessions WHERE id = ?').get(req.params.id) as any;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
