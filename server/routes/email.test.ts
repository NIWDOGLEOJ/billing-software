import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import emailRoutes from './email';
import { emailManager } from '../services/emailManager';
import { db, initDb } from '../db';
import { JWT_SECRET } from '../middleware/auth';

describe('Store Outgoing Email & SMTP Tax Invoice Dispatch', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;
  let authToken: string;
  const testSessionId = `test_email_session_${Date.now()}`;

  beforeAll(async () => {
    initDb();

    // Register active login session for authentication middleware
    db.prepare(`
      INSERT OR REPLACE INTO login_sessions (id, user_id, login_time, logout_time, last_active_at, device_type, is_attendance)
      VALUES (?, ?, ?, NULL, ?, ?, ?)
    `).run(testSessionId, 'owner_1', new Date().toISOString(), new Date().toISOString(), 'desktop', 1);

    authToken = jwt.sign(
      {
        id: 'owner_1',
        username: 'owner',
        name: 'Store Owner',
        role: 'owner',
        permissions: ['access_inventory', 'access_billing'],
        sessionId: testSessionId,
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    app = express();
    app.use(express.json());
    app.use('/api/email', emailRoutes);

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

  describe('HTML & Monospace Receipt Template Generation', () => {
    const sampleInvoiceData = {
      toEmail: 'customer@test.com',
      customerName: 'Anand Kumar',
      customerPhone: '9845012345',
      billNumber: 'BILL-8821',
      items: [
        { name: 'Aashirvaad Atta 5kg', quantity: 2, price: 245.0, uom: 'PKT' },
        { name: 'Tata Tea Gold 500g', quantity: 1, price: 320.0, uom: 'PKT' },
      ],
      total: 810.0,
      subtotal: 771.43,
      gstAmount: 38.57,
      cgst: 19.28,
      sgst: 19.28,
      paymentMode: 'UPI',
      dateTime: '2026-10-08T18:00:00.000Z',
      shopDetails: {
        name: 'J MART SUPERSTORE',
        address: '100 Feet Road, Chennai 600042',
        phone: '7708800220',
        gstin: '33AAAAA0000A1Z5',
        email: 'billing@jmart.com',
      },
    };

    it('generates compliant, responsive HTML invoice with GST breakdown and store branding', () => {
      const html = emailManager.generateHtmlReceipt(sampleInvoiceData);

      expect(html).toContain('J MART SUPERSTORE');
      expect(html).toContain('BILL-8821');
      expect(html).toContain('33AAAAA0000A1Z5');
      expect(html).toContain('Aashirvaad Atta 5kg');
      expect(html).toContain('Tata Tea Gold 500g');
      expect(html).toContain('810.00');
      expect(html).toContain('UPI');
      expect(html).toContain('Anand Kumar');
      expect(html).toContain('CGST');
      expect(html).toContain('SGST');
      expect(html).toContain('Save paper, protect nature');
    });

    it('generates clean monospace text receipt fallback', () => {
      const text = emailManager.generateTextReceipt(sampleInvoiceData);

      expect(text).toContain('J MART SUPERSTORE');
      expect(text).toContain('TAX INVOICE #BILL-8821');
      expect(text).toContain('Aashirvaad Atta 5kg');
      expect(text).toContain('TOTAL: ₹810.00');
      expect(text).toContain('Payment Mode: UPI');
    });
  });

  describe('API Endpoints & Configuration Security', () => {
    it('requires authentication for config retrieval', async () => {
      const res = await fetch(`${baseUrl}/api/email/config`);
      expect(res.status).toBe(401);
    });

    it('fetches email configuration with password masked', async () => {
      const res = await fetch(`${baseUrl}/api/email/config`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('host');
      expect(data).toHaveProperty('port');
      expect(data).toHaveProperty('user');
      expect(data).toHaveProperty('pass');
      expect(data).toHaveProperty('enabled');
      expect(data).toHaveProperty('autoSend');

      // Password must be masked or empty, never raw plaintext
      if (data.pass) {
        expect(data.pass).toBe('••••••••');
        expect(data.hasPass).toBe(true);
      }
    });

    it('updates email configuration and preserves password when masked placeholder is submitted', async () => {
      // 1. Set credentials with a real password
      const initialSave = await fetch(`${baseUrl}/api/email/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          user: 'pos.billing@gmail.com',
          pass: 'mysecretapppassword123',
          senderName: 'J Mart Retail Test',
          senderEmail: 'pos.billing@gmail.com',
          enabled: true,
          autoSend: true,
        }),
      });
      expect(initialSave.status).toBe(200);

      // Verify internal manager stored the real password
      expect(emailManager.getConfig().pass).toBe('mysecretapppassword123');

      // 2. Update only senderName, passing the masked password placeholder back
      const updateRes = await fetch(`${baseUrl}/api/email/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          senderName: 'J Mart Express Chennai',
          pass: '••••••••',
        }),
      });
      expect(updateRes.status).toBe(200);

      // Verify that the original password was not overwritten with bullets
      expect(emailManager.getConfig().pass).toBe('mysecretapppassword123');
      expect(emailManager.getConfig().senderName).toBe('J Mart Express Chennai');
    });

    it('automatically sanitizes spaces from Gmail app passwords', async () => {
      const res = await fetch(`${baseUrl}/api/email/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          host: 'smtp.gmail.com',
          user: 'myretail@gmail.com',
          pass: 'abcd efgh ijkl mnop',
        }),
      });
      expect(res.status).toBe(200);
      expect(emailManager.getConfig().pass).toBe('abcdefghijklmnop');
    });

    it('rejects test email dispatch without a valid recipient', async () => {
      const res = await fetch(`${baseUrl}/api/email/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ targetEmail: '' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/recipient test email/i);
    });

    it('rejects bill dispatch without customer email or bill number', async () => {
      const missingEmail = await fetch(`${baseUrl}/api/email/send-bill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          billNumber: 'BILL-101',
          total: 100,
        }),
      });
      expect(missingEmail.status).toBe(400);

      const missingBillNo = await fetch(`${baseUrl}/api/email/send-bill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          toEmail: 'customer@example.com',
          total: 100,
        }),
      });
      expect(missingBillNo.status).toBe(400);
    });
  });
});
