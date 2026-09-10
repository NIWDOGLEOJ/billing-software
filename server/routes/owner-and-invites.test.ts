import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import { db, initDb } from '../db';
import settingsRoutes from './settings';
import usersRoutes from './users';
import invitesRoutes from './invites';
import { JWT_SECRET } from '../middleware/auth';

describe('Store Owner Privileges & Co-Owner Invites', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  let ownerToken: string;
  let coOwnerToken: string;
  let employeeToken: string;

  const ownerSessionId = `test_owner_sess_${Date.now()}`;
  const coOwnerSessionId = `test_coowner_sess_${Date.now()}`;
  const employeeSessionId = `test_emp_sess_${Date.now()}`;

  beforeAll(async () => {
    initDb();

    // Ensure owner user exists in db
    const existingOwner = db.prepare("SELECT * FROM users WHERE role = 'owner' LIMIT 1").get() as any;
    const ownerId = existingOwner?.id || 'owner_1';

    if (!existingOwner) {
      db.prepare(`
        INSERT INTO users (id, username, email, name, role, password_hash, permissions, is_active, created_at)
        VALUES ('owner_1', 'owner', 'owner@test.com', 'Original Owner', 'owner', 'hash', '[]', 1, ?)
      `).run(new Date().toISOString());
    }

    // Create a test co-owner
    const coOwnerId = 'test_coowner_id_1';
    db.prepare(`
      INSERT OR REPLACE INTO users (id, username, email, name, role, password_hash, permissions, is_active, created_at)
      VALUES (?, 'test_coowner', 'coowner@test.com', 'Test CoOwner', 'co-owner', 'hash', ?, 1, ?)
    `).run(
      coOwnerId,
      JSON.stringify(['access_billing', 'access_settings', 'manage_employees']),
      new Date().toISOString()
    );

    // Create a test employee
    const employeeId = 'test_emp_id_1';
    db.prepare(`
      INSERT OR REPLACE INTO users (id, username, email, name, role, password_hash, permissions, is_active, created_at)
      VALUES (?, 'test_emp', 'emp@test.com', 'Test Cashier', 'employee', 'hash', ?, 1, ?)
    `).run(
      employeeId,
      JSON.stringify(['access_billing']),
      new Date().toISOString()
    );

    // Register active sessions for the 3 test users
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO login_sessions (id, user_id, login_time, logout_time, last_active_at, device_type, is_attendance)
      VALUES (?, ?, ?, NULL, ?, 'desktop', 1)
    `).run(ownerSessionId, ownerId, now, now);

    db.prepare(`
      INSERT OR REPLACE INTO login_sessions (id, user_id, login_time, logout_time, last_active_at, device_type, is_attendance)
      VALUES (?, ?, ?, NULL, ?, 'desktop', 1)
    `).run(coOwnerSessionId, coOwnerId, now, now);

    db.prepare(`
      INSERT OR REPLACE INTO login_sessions (id, user_id, login_time, logout_time, last_active_at, device_type, is_attendance)
      VALUES (?, ?, ?, NULL, ?, 'desktop', 1)
    `).run(employeeSessionId, employeeId, now, now);

    // Generate JWTs
    ownerToken = jwt.sign(
      {
        id: ownerId,
        username: 'owner',
        name: 'Store Owner',
        role: 'owner',
        permissions: ['access_settings', 'manage_employees', 'access_billing'],
        sessionId: ownerSessionId,
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    coOwnerToken = jwt.sign(
      {
        id: coOwnerId,
        username: 'test_coowner',
        name: 'Test CoOwner',
        role: 'co-owner',
        permissions: ['access_settings', 'manage_employees', 'access_billing'],
        sessionId: coOwnerSessionId,
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    employeeToken = jwt.sign(
      {
        id: employeeId,
        username: 'test_emp',
        name: 'Test Cashier',
        role: 'employee',
        permissions: ['access_billing'],
        sessionId: employeeSessionId,
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRoutes);
    app.use('/api/users', usersRoutes);
    app.use('/api/invites', invitesRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  describe('1. Owner Name Protection in Settings', () => {
    it('allows the primary owner to update owner_name and synchronizes users table', async () => {
      const newOwnerName = 'Chief Executive Owner';
      const res = await fetch(`${baseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          owner_name: newOwnerName,
          shop_name: 'Flagship Store',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.settings.owner_name).toBe(newOwnerName);

      // Verify users table was synchronized
      const ownerRow = db.prepare("SELECT name FROM users WHERE role = 'owner' LIMIT 1").get() as any;
      expect(ownerRow.name).toBe(newOwnerName);
    });

    it('blocks co-owner from editing owner_name with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${coOwnerToken}`,
        },
        body: JSON.stringify({
          owner_name: 'Intruder Co-Owner',
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Only the primary store owner can edit the owner name/i);
    });

    it('allows co-owner to edit other non-owner store settings', async () => {
      const res = await fetch(`${baseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${coOwnerToken}`,
        },
        body: JSON.stringify({
          shop_name: 'Metro Hypermarket',
          phone: '9876543210',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.settings.shop_name).toBe('Metro Hypermarket');
    });
  });

  describe('2. User Account Hierarchy & Boundaries', () => {
    it('blocks co-owner from editing the primary owner profile', async () => {
      const ownerRow = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get() as any;

      const res = await fetch(`${baseUrl}/api/users/${ownerRow.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${coOwnerToken}`,
        },
        body: JSON.stringify({
          name: 'Hacked Owner Name',
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Only the store owner can edit the owner profile/i);
    });

    it('blocks co-owner from changing the primary owner password', async () => {
      const ownerRow = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get() as any;

      const res = await fetch(`${baseUrl}/api/users/${ownerRow.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${coOwnerToken}`,
        },
        body: JSON.stringify({
          password: 'newPassword1234!',
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Only the store owner can modify the owner password/i);
    });

    it('blocks deleting the primary owner account', async () => {
      const ownerRow = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get() as any;

      const res = await fetch(`${baseUrl}/api/users/${ownerRow.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Primary store owner cannot be deleted/i);
    });

    it('blocks co-owner from deleting another co-owner', async () => {
      // Create second co-owner
      const secondCoOwnerId = `co2_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const secondUsername = `co2_user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      db.prepare(`
        INSERT INTO users (id, username, email, name, role, password_hash, permissions, is_active, created_at)
        VALUES (?, ?, 'co2@test.com', 'CoOwner Two', 'co-owner', 'hash', '[]', 1, ?)
      `).run(secondCoOwnerId, secondUsername, new Date().toISOString());

      const res = await fetch(`${baseUrl}/api/users/${secondCoOwnerId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${coOwnerToken}`,
        },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Only the store owner can revoke a co-owner/i);
    });

    it('blocks non-owners from creating an account with role = owner', async () => {
      const res = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${coOwnerToken}`,
        },
        body: JSON.stringify({
          username: 'fake_owner',
          password: 'password123',
          name: 'Fake Owner',
          role: 'owner',
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Only the store owner can create an owner account/i);
    });

    it('syncs settings.owner_name when owner updates their name via PUT /api/users/:id', async () => {
      const ownerRow = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get() as any;

      const res = await fetch(`${baseUrl}/api/users/${ownerRow.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: 'Supreme Commander Owner',
        }),
      });

      expect(res.status).toBe(200);

      const settingRow = db.prepare("SELECT value FROM settings WHERE key = 'owner_name'").get() as any;
      expect(settingRow?.value).toBe('Supreme Commander Owner');
    });
  });

  describe('3. Co-Owner Invites Management & Registration', () => {
    let generatedToken: string;
    let inviteId: string;

    it('allows the primary owner to generate a co-owner invite', async () => {
      const res = await fetch(`${baseUrl}/api/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: 'Partner Alice',
          email: 'alice@partner.com',
          phone: '9988776655',
          expiresInDays: 7,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.token.length).toBeGreaterThanOrEqual(16);
      expect(data.status).toBe('pending');
      expect(data.name).toBe('Partner Alice');

      generatedToken = data.token;
      inviteId = data.id;
    });

    it('blocks non-owner from generating an invite (403)', async () => {
      const res = await fetch(`${baseUrl}/api/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${coOwnerToken}`,
        },
        body: JSON.stringify({
          name: 'Should Fail',
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Primary owner access required/i);
    });

    it('publicly validates an active invite token', async () => {
      const res = await fetch(`${baseUrl}/api/invites/validate?token=${generatedToken}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.invite.token).toBe(generatedToken);
      expect(data.invite.name).toBe('Partner Alice');
      expect(data.shopName).toBeDefined();
    });

    it('returns 404 for invalid invite token', async () => {
      const res = await fetch(`${baseUrl}/api/invites/validate?token=NONEXISTENT_CODE_123`);
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.valid).toBe(false);
    });

    it('accepts invite and provisions co-owner with valid session & token', async () => {
      const newUsername = `alice_${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/invites/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: generatedToken,
          username: newUsername,
          name: 'Alice Cooper',
          password: 'superSecretPassword123!',
          phone: '9988776655',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user.role).toBe('co-owner');
      expect(data.user.username).toBe(newUsername);
      expect(data.user.permissions).toContain('access_billing');
      expect(data.user.permissions).toContain('access_settings');

      // Verify db state
      const userInDb = db.prepare('SELECT role, is_active FROM users WHERE username = ?').get(newUsername) as any;
      expect(userInDb).toBeDefined();
      expect(userInDb.role).toBe('co-owner');
      expect(userInDb.is_active).toBe(1);

      // Verify invite status is now 'accepted'
      const inviteInDb = db.prepare('SELECT status FROM invites WHERE id = ?').get(inviteId) as any;
      expect(inviteInDb.status).toBe('accepted');
    });

    it('rejects reusing an already accepted invite token', async () => {
      const res = await fetch(`${baseUrl}/api/invites/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: generatedToken,
          username: 'alice_duplicate',
          name: 'Duplicate Alice',
          password: 'superSecretPassword123!',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/cannot be used/i);
    });

    it('allows primary owner to revoke a pending invite', async () => {
      // Create new invite
      const createRes = await fetch(`${baseUrl}/api/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: 'Bob Pending',
          expiresInDays: 3,
        }),
      });
      const inviteData = await createRes.json();

      // Revoke it
      const deleteRes = await fetch(`${baseUrl}/api/invites/${inviteData.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      expect(deleteRes.status).toBe(200);

      // Verify validate returns revoked error
      const valRes = await fetch(`${baseUrl}/api/invites/validate?token=${inviteData.token}`);
      expect(valRes.status).toBe(400);
      const valData = await valRes.json();
      expect(valData.error).toMatch(/revoked/i);
    });
  });
});
