import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import whatsappRoutes from './whatsapp';
import { whatsappManager } from '../services/whatsappManager';
import { db, initDb } from '../db';
import { JWT_SECRET } from '../middleware/auth';
import {
  sanitizeWhatsAppPhone,
  formatWhatsAppReceipt,
  formatWhatsAppReminder,
  generateWhatsAppLink,
} from '../../src/app/utils/whatsapp';

describe('WhatsApp Multi-Device Web QR & Automated Bill Dispatch', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;
  let authToken: string;
  const testSessionId = `test_wa_session_${Date.now()}`;

  beforeAll(async () => {
    initDb();

    // Register active login session for authentication middleware
    db.prepare(`
      INSERT OR REPLACE INTO login_sessions (id, user_id, login_time, logout_time, last_active_at, device_type, is_attendance)
      VALUES (?, ?, ?, NULL, ?, ?, ?)
    `).run(testSessionId, 'owner_1', new Date().toISOString(), new Date().toISOString(), 'mobile', 1);

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
    app.use('/api/whatsapp', whatsappRoutes);

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

  describe('Phone Sanitization & Formatting Standard', () => {
    it('normalizes 10-digit Indian numbers with +91 country code', () => {
      expect(sanitizeWhatsAppPhone('9845012345')).toBe('919845012345');
      expect(sanitizeWhatsAppPhone('98450 12345')).toBe('919845012345');
      expect(sanitizeWhatsAppPhone('+91 98450-12345')).toBe('919845012345');
    });

    it('strips leading 0 from 11-digit numbers', () => {
      expect(sanitizeWhatsAppPhone('09845012345')).toBe('919845012345');
    });

    it('preserves existing 91 prefix on 12-digit numbers', () => {
      expect(sanitizeWhatsAppPhone('919845012345')).toBe('919845012345');
    });

    it('formats tax invoice receipt with monospace and emojis', () => {
      const receipt = formatWhatsAppReceipt({
        shopDetails: {
          name: 'J MART RETAIL',
          address: 'Chennai 600089',
          phone: '7708800220',
          gstin: '33AAAAA0000A1Z5',
        },
        billNumber: 'BILL-9001',
        items: [
          { name: 'Parle-G 800g', quantity: 2, price: 50, uom: 'PKT' },
        ],
        total: 100,
        subtotal: 95.24,
        gstAmount: 4.76,
        customerName: 'Karthik',
        customerPhone: '9845012345',
        paymentMode: 'UPI',
      });

      expect(receipt).toContain('🧾 *J MART RETAIL*');
      expect(receipt).toContain('*TAX INVOICE #BILL-9001*');
      expect(receipt).toContain('Parle-G 800g');
      expect(receipt).toContain('TOTAL AMOUNT: ₹100.00');
      expect(receipt).toContain('Payment Mode: *UPI*');
    });

    it('formats Khata payment reminder with outstanding balance and UPI instructions', () => {
      const reminder = formatWhatsAppReminder({
        shopName: 'J MART',
        customerName: 'Suresh Kumar',
        customerPhone: '9845012345',
        outstanding: 1540,
        upiId: 'jmart@okicici',
      });

      expect(reminder).toContain('PAYMENT REMINDER — J MART');
      expect(reminder).toContain('Suresh Kumar');
      expect(reminder).toContain('₹1,540');
      expect(reminder).toContain('jmart@okicici');
    });

    it('generates standard wa.me deep link', () => {
      const link = generateWhatsAppLink('9845012345', 'Hello Customer');
      expect(link).toBe('https://wa.me/919845012345?text=Hello%20Customer');
    });
  });

  describe('REST Endpoints (/api/whatsapp)', () => {
    it('GET /api/whatsapp/status returns current Baileys state', async () => {
      const res = await fetch(`${baseUrl}/api/whatsapp/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('status');
      expect(data.provider).toBe('baileys_web');
      expect(['disconnected', 'connecting', 'qr_ready', 'connected']).toContain(data.status);
    });

    it('POST /api/whatsapp/send-bill returns automated dispatch or fallback link', async () => {
      const res = await fetch(`${baseUrl}/api/whatsapp/send-bill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          phone: '9845012345',
          billNumber: 'BILL-9002',
          message: 'Tax invoice content',
          total: 250,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.phone).toBe('919845012345');
      // If connected: automated; if not connected: fallback_link with direct WhatsApp URL
      if (data.mode === 'automated') {
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('shopPhone');
      } else {
        expect(data.fallbackUrl).toContain('https://wa.me/919845012345');
      }
    });

    it('POST /api/whatsapp/send-reminder returns reminder dispatch status', async () => {
      const res = await fetch(`${baseUrl}/api/whatsapp/send-reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          phone: '9845012345',
          customerName: 'Rajesh',
          outstanding: 850,
          message: 'Friendly reminder',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.phone).toBe('919845012345');
      if (data.mode === 'automated') {
        expect(data.success).toBe(true);
      } else {
        expect(data.fallbackUrl).toContain('https://wa.me/919845012345');
      }
    });

    it('POST /api/whatsapp/test validates phone and returns test response', async () => {
      const res = await fetch(`${baseUrl}/api/whatsapp/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          testPhone: '9845012345',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.targetPhone).toBe('919845012345');
    });

    it('rejects missing phone number with 400', async () => {
      const res = await fetch(`${baseUrl}/api/whatsapp/send-bill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          phone: '',
          billNumber: 'BILL-9003',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Customer phone number is required');
    });
  });

  describe('WhatsApp Manager Baileys State Machine', () => {
    it('initializes state correctly', () => {
      const state = whatsappManager.getState();
      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('qrDataUrl');
      expect(state).toHaveProperty('connectedNumber');
    });

    it('sanitizes phone numbers accurately', () => {
      expect(whatsappManager.sanitizePhone('9845012345')).toBe('919845012345');
      expect(whatsappManager.sanitizePhone('+919845012345')).toBe('919845012345');
    });
  });
});
