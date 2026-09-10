import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { JWT_SECRET, AuthRequest, authenticateToken, requireStrictOwner } from '../middleware/auth';

const router = Router();

// GET /api/invites - List invites (requires primary owner)
router.get('/', authenticateToken, requireStrictOwner, (req: AuthRequest, res: Response) => {
  try {
    const invites = db.prepare(`
      SELECT id, token, role, name, email, phone, created_by, created_at, expires_at, status
      FROM invites
      ORDER BY created_at DESC
    `).all();

    const now = Date.now();
    // Auto-update expired pending invites in view
    const parsed = invites.map((inv: any) => {
      const isExpired = inv.status === 'pending' && new Date(inv.expires_at).getTime() < now;
      return {
        ...inv,
        status: isExpired ? 'expired' : inv.status
      };
    });

    res.json(parsed);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/invites - Create a new co-owner invite (requires primary owner)
router.post('/', authenticateToken, requireStrictOwner, (req: AuthRequest, res: Response) => {
  const { name, email, phone, role = 'co-owner', expiresInDays = 7 } = req.body;

  try {
    const id = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    // Generate secure 16-character alphanumeric uppercase token (clean for copy-pasting)
    const token = crypto.randomBytes(8).toString('hex').toUpperCase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO invites (id, token, role, name, email, phone, created_by, created_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      id,
      token,
      role,
      name ? name.trim() : null,
      email ? email.trim() : null,
      phone ? phone.trim() : null,
      req.user?.id || 'owner_1',
      now.toISOString(),
      expiresAt
    );

    const created = db.prepare('SELECT * FROM invites WHERE id = ?').get(id) as any;
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/invites/:id - Revoke an invite (requires primary owner)
router.delete('/:id', authenticateToken, requireStrictOwner, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(id) as any;
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    db.prepare("UPDATE invites SET status = 'revoked' WHERE id = ?").run(id);
    res.json({ success: true, message: 'Invite revoked successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/invites/validate?token=... - Validate an invite token (Public)
router.get('/validate', (req: Request, res: Response) => {
  const token = (req.query.token as string || '').trim().toUpperCase();
  if (!token) {
    return res.status(400).json({ valid: false, error: 'Token is required' });
  }

  try {
    const invite = db.prepare('SELECT * FROM invites WHERE UPPER(token) = ?').get(token) as any;
    if (!invite) {
      return res.status(404).json({ valid: false, error: 'Invalid invite code or token' });
    }

    if (invite.status === 'revoked') {
      return res.status(400).json({ valid: false, error: 'This invitation has been revoked by the store owner' });
    }

    if (invite.status === 'accepted') {
      return res.status(400).json({ valid: false, error: 'This invitation has already been used' });
    }

    const now = Date.now();
    if (new Date(invite.expires_at).getTime() < now) {
      return res.status(400).json({ valid: false, error: 'This invitation has expired' });
    }

    // Retrieve store name
    const shopRow = db.prepare("SELECT value FROM settings WHERE key IN ('shopName', 'shop_name') LIMIT 1").get() as any;
    const shopName = shopRow?.value || 'J MART';

    res.json({
      valid: true,
      shopName,
      invite: {
        id: invite.id,
        token: invite.token,
        role: invite.role,
        name: invite.name,
        email: invite.email,
        phone: invite.phone,
        expires_at: invite.expires_at
      }
    });
  } catch (error: any) {
    res.status(500).json({ valid: false, error: error.message });
  }
});

// POST /api/invites/accept - Accept an invite and register co-owner account (Public)
router.post('/accept', (req: Request, res: Response) => {
  const { token, username, name, password, phone, email } = req.body;

  if (!token || !username || !name || !password) {
    return res.status(400).json({ error: 'Missing required fields (token, username, name, password)' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  const cleanToken = token.trim().toUpperCase();
  const cleanUsername = username.trim().toLowerCase();

  try {
    const invite = db.prepare('SELECT * FROM invites WHERE UPPER(token) = ?').get(cleanToken) as any;
    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: `This invite is ${invite.status} and cannot be used` });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'This invite has expired' });
    }

    // Check username uniqueness
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return res.status(400).json({ error: `Username "${cleanUsername}" is already taken. Please pick another username.` });
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const passwordHash = bcrypt.hashSync(password.trim(), 10);
    const now = new Date().toISOString();

    // Full administrative permissions for co-owners
    const allPerms = JSON.stringify([
      'access_billing','edit_product_price','delete_bill_items',
      'apply_discounts','view_analytics','access_inventory',
      'view_transaction_history','generate_reports','access_settings','manage_employees'
    ]);

    const transaction = db.transaction(() => {
      // 1. Create user account
      db.prepare(`
        INSERT INTO users (id, username, email, name, role, password_hash, permissions, phone, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        userId,
        cleanUsername,
        (email || invite.email || null),
        name.trim(),
        invite.role || 'co-owner',
        passwordHash,
        allPerms,
        (phone || invite.phone || null),
        now
      );

      // 2. Mark invite accepted
      db.prepare("UPDATE invites SET status = 'accepted' WHERE id = ?").run(invite.id);
    });

    transaction();

    // Generate login session and JWT so the user is directly logged in
    const sessionId = Math.random().toString(36).substring(2, 15);
    db.prepare('INSERT INTO login_sessions (id, user_id, login_time, last_active_at, device_type, is_attendance) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sessionId, userId, now, now, 'desktop', 1);

    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      broadcast({ type: 'SESSION_CHANGED', data: { userId } });
    }

    const payload = {
      id: userId,
      username: cleanUsername,
      name: name.trim(),
      role: invite.role || 'co-owner',
      permissions: JSON.parse(allPerms),
      sessionId
    };

    const jwtToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      success: true,
      message: 'Co-owner account successfully created',
      token: jwtToken,
      user: payload
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
