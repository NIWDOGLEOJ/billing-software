import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db, cleanupStaleSessions } from '../db';
import { AuthRequest, authenticateToken, requireOwner } from '../middleware/auth';

const router = Router();

// GET /api/users (requires owner/co-owner)
router.get('/', authenticateToken, requireOwner, (req, res) => {
  try {
    const users = db.prepare("SELECT id, username, email, name, role, permissions, phone, is_active, created_at FROM users WHERE username != 'developer' AND id != 'dev_1'").all();
    const parsedUsers = users.map((u: any) => ({
      ...u,
      permissions: JSON.parse(u.permissions || '[]'),
      is_active: Boolean(u.is_active)
    }));
    res.json(parsedUsers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/users (requires owner/co-owner)
router.post('/', authenticateToken, requireOwner, (req: AuthRequest, res: Response) => {
  const { id, username, email, name, role, password, permissions, phone } = req.body;

  // Only the primary owner can create an owner account
  if (role === 'owner' && req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Only the store owner can create an owner account' });
  }

  if (!username || !name || !role || !password) {
    return res.status(400).json({ error: 'Missing required fields (username, name, role, password)' });
  }

  const finalId = id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  try {
    const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: `Username "${username}" is already taken` });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const now = new Date().toISOString();

    // Default full permissions for co-owners if not explicitly specified
    let userPermissions = permissions || [];
    if (role === 'co-owner' && (!permissions || permissions.length === 0)) {
      userPermissions = [
        'access_billing','edit_product_price','delete_bill_items',
        'apply_discounts','view_analytics','access_inventory',
        'view_transaction_history','generate_reports','access_settings','manage_employees'
      ];
    }

    db.prepare(`
      INSERT INTO users (id, username, email, name, role, password_hash, permissions, phone, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      finalId,
      username,
      email || null,
      name,
      role,
      passwordHash,
      JSON.stringify(userPermissions),
      phone || null,
      now
    );

    const created = db.prepare('SELECT id, username, email, name, role, permissions, phone, is_active, created_at FROM users WHERE id = ?').get(finalId) as any;
    created.permissions = JSON.parse(created.permissions || '[]');
    created.is_active = Boolean(created.is_active);

    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/users/:id (requires owner/co-owner)
router.put('/:id', authenticateToken, requireOwner, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { email, name, role, permissions, phone, is_active } = req.body;

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Security guard: Only the primary store owner can edit an owner account
    if (user.role === 'owner') {
      if (req.user?.role !== 'owner') {
        return res.status(403).json({ error: 'Only the store owner can edit the owner profile' });
      }
      if (role && role !== 'owner') {
        return res.status(400).json({ error: 'Cannot change the primary owner role' });
      }
      if (is_active === false) {
        return res.status(400).json({ error: 'Cannot deactivate the primary owner' });
      }
    }

    // Only the primary owner can promote a user to owner
    if (role === 'owner' && user.role !== 'owner' && req.user?.role !== 'owner') {
      return res.status(403).json({ error: 'Only an owner can grant owner privileges' });
    }

    const newName = name !== undefined ? name.trim() : user.name;
    const newRole = role !== undefined ? role : user.role;
    const newEmail = email !== undefined ? email : user.email;
    const newPhone = phone !== undefined ? phone : user.phone;
    const newActive = is_active !== undefined ? (is_active ? 1 : 0) : user.is_active;
    const newPermissions = permissions !== undefined ? JSON.stringify(permissions) : user.permissions;

    db.prepare(`
      UPDATE users
      SET email = ?, name = ?, role = ?, permissions = ?, phone = ?, is_active = ?
      WHERE id = ?
    `).run(
      newEmail,
      newName,
      newRole,
      newPermissions,
      newPhone,
      newActive,
      id
    );

    // If owner name was updated by the owner, sync to settings.owner_name
    if (user.role === 'owner' && name !== undefined && req.user?.role === 'owner') {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('owner_name', ?)").run(newName);
    }

    const updated = db.prepare('SELECT id, username, email, name, role, permissions, phone, is_active, created_at FROM users WHERE id = ?').get(id) as any;
    updated.permissions = JSON.parse(updated.permissions || '[]');
    updated.is_active = Boolean(updated.is_active);

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/users/:id/password (User can update their own password, or owner can update any employee's password)
router.put('/:id/password', authenticateToken, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const password = req.body.password || req.body.newPassword;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Permission guard: Only the user themselves OR an owner/co-owner can change this password
  if (req.user?.id !== id && req.user?.role !== 'owner' && req.user?.role !== 'co-owner') {
    return res.status(403).json({ error: 'Permission denied to modify password' });
  }

  // Co-owners cannot change the primary owner's password
  const targetUser = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as any;
  if (targetUser && targetUser.role === 'owner' && req.user?.id !== id && req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Only the store owner can modify the owner password' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/users/:id (requires owner/co-owner)
router.delete('/:id', authenticateToken, requireOwner, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Owner can never be deleted
    if (user.role === 'owner') {
      return res.status(403).json({ error: 'Primary store owner cannot be deleted' });
    }

    // Only the primary owner can revoke/delete a co-owner
    if (user.role === 'co-owner' && req.user?.role !== 'owner') {
      return res.status(403).json({ error: 'Only the store owner can revoke a co-owner' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ success: true, message: 'User permanently deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Break Record Endpoints ───────────────────────────────────────────────────

// GET /api/users/breaks - list active/completed breaks
router.get('/breaks', authenticateToken, (req, res) => {
  try {
    const breaks = db.prepare("SELECT b.*, u.name as user_name FROM break_records b JOIN users u ON b.user_id = u.id WHERE u.username != 'developer' AND u.id != 'dev_1' ORDER BY b.start_time DESC").all();
    res.json(breaks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/users/breaks/start
router.post('/breaks/start', authenticateToken, (req: AuthRequest, res: Response) => {
  const { breakId } = req.body;
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/users/breaks/end
router.post('/breaks/end', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  try {
    const activeBreak = db.prepare('SELECT * FROM break_records WHERE user_id = ? AND end_time IS NULL').get(req.user.id) as any;
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/sessions - list login sessions for analytics/employee-performance
router.get('/sessions', authenticateToken, requireOwner, (req, res) => {
  try {
    cleanupStaleSessions(req.app.get('broadcast'));
    const sessions = db.prepare("SELECT s.*, u.name as user_name, u.role as user_role FROM login_sessions s JOIN users u ON s.user_id = u.id WHERE u.username != 'developer' AND u.id != 'dev_1' ORDER BY s.login_time DESC").all();
    res.json(sessions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/my-sessions - list login sessions for the logged-in employee/owner
router.get('/my-sessions', authenticateToken, (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    cleanupStaleSessions(req.app.get('broadcast'));
    const sessions = db.prepare('SELECT s.*, u.name as user_name, u.role as user_role FROM login_sessions s JOIN users u ON s.user_id = u.id WHERE s.user_id = ? ORDER BY s.login_time DESC').all(userId);
    res.json(sessions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
