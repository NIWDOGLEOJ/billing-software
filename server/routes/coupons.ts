import { Router, Response } from 'express';
import { db } from '../db';
import { AuthRequest, authenticateToken, requireOwner } from '../middleware/auth';

const router = Router();

// GET /api/coupons — List coupons (strictly unredeemed only)
//   - With ?phone=...: public, returns only unredeemed coupons for that customer phone (used by website)
//   - Without phone param: admin-only, returns all unredeemed coupons
//   - With ?code=...: public, looks up a single code (used by POS validate flow)
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { phone, code } = req.query;

    // Single-code lookup (used by POS validate step — public read, only unredeemed)
    if (code) {
      const coupon = db.prepare(`
        SELECT id, code, customer_phone, discount_amount, description, is_redeemed, created_at
        FROM coupons
        WHERE UPPER(code) = UPPER(?) AND is_redeemed = 0
      `).get(String(code).trim());
      return res.json(coupon ? [coupon] : []);
    }

    // Phone-scoped public listing (website shows customer's unredeemed coupons)
    if (phone) {
      const cleanPhone = String(phone).trim();
      const coupons = db.prepare(`
        SELECT id, code, customer_phone, discount_amount, description, is_redeemed, created_at
        FROM coupons
        WHERE (customer_phone = ? OR customer_phone IS NULL OR customer_phone = '')
          AND is_redeemed = 0
        ORDER BY discount_amount DESC
      `).all(cleanPhone);
      return res.json(coupons);
    }

    // Full list — admin only
    const auth = req.headers['authorization'];
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required to list all coupons' });
    }
    // Validate token inline (reuse authenticateToken pattern)
    authenticateToken(req, res, () => {
      requireOwner(req, res, () => {
        try {
          const coupons = db.prepare(`
            SELECT id, code, customer_phone, discount_amount, description, is_redeemed, created_at
            FROM coupons
            WHERE is_redeemed = 0
            ORDER BY discount_amount DESC
          `).all();
          res.json(coupons);
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/coupons/validate — Validate a coupon code strictly before applying (does NOT redeem)
router.post('/validate', (req, res: Response) => {
  try {
    const { code, customerPhone, subtotal } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ valid: false, error: 'Coupon code is required.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = db.prepare(`
      SELECT id, code, customer_phone, discount_amount, description, is_redeemed, redeemed_at
      FROM coupons
      WHERE UPPER(code) = ?
    `).get(cleanCode) as any;

    if (!coupon) {
      return res.status(404).json({ valid: false, error: `Coupon code "${code}" is invalid.` });
    }

    if (coupon.is_redeemed) {
      return res.status(400).json({
        valid: false,
        error: `Coupon code "${cleanCode}" has already been redeemed and cannot be used again.`,
      });
    }

    if (coupon.customer_phone && customerPhone) {
      const reqPhone = String(customerPhone).trim();
      const cpnPhone = String(coupon.customer_phone).trim();
      if (reqPhone !== cpnPhone) {
        return res.status(400).json({
          valid: false,
          error: `Coupon "${cleanCode}" is exclusive to phone ${cpnPhone}.`,
        });
      }
    }

    if (subtotal !== undefined && Number(subtotal) > 0 && Number(subtotal) < coupon.discount_amount) {
      return res.status(400).json({
        valid: false,
        error: `Order subtotal (₹${subtotal}) must be at least ₹${coupon.discount_amount} to redeem this coupon.`,
      });
    }

    res.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountAmount: coupon.discount_amount,
        description: coupon.description,
        customerPhone: coupon.customer_phone,
      },
    });
  } catch (error: any) {
    res.status(500).json({ valid: false, error: error.message });
  }
});

// POST /api/coupons/redeem — Mark a coupon redeemed atomically (one-time use, strictly enforced)
// Uses db.transaction() per spec to prevent race conditions.
router.post('/redeem', (req: AuthRequest, res: Response) => {
  try {
    const { code, billId, customerPhone } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Coupon code is required.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const now = new Date().toISOString();

    let redeemedCoupon: any = null;

    // Wrap in transaction per spec to atomically check+update
    const redeemTx = db.transaction(() => {
      const coupon = db.prepare('SELECT * FROM coupons WHERE UPPER(code) = ?').get(cleanCode) as any;

      if (!coupon) {
        throw Object.assign(new Error(`Coupon "${code}" not found.`), { statusCode: 404 });
      }

      if (coupon.is_redeemed) {
        throw Object.assign(new Error(`Coupon "${cleanCode}" has already been redeemed.`), { statusCode: 400 });
      }

      const updateResult = db.prepare(`
        UPDATE coupons
        SET is_redeemed = 1, redeemed_at = ?, redeemed_bill_id = ?
        WHERE UPPER(code) = ? AND is_redeemed = 0
      `).run(now, billId || null, cleanCode);

      if (updateResult.changes === 0) {
        throw Object.assign(new Error(`Coupon "${cleanCode}" has already been redeemed.`), { statusCode: 400 });
      }

      redeemedCoupon = coupon;
    });

    redeemTx();

    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      broadcast({
        type: 'COUPON_REDEEMED',
        data: {
          code: cleanCode,
          customerPhone: redeemedCoupon?.customer_phone || customerPhone || null,
          redeemedAt: now,
          billId: billId || null,
        },
      });
    }

    res.json({
      success: true,
      message: `Coupon "${cleanCode}" redeemed successfully.`,
      code: cleanCode,
    });
  } catch (error: any) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

// POST /api/coupons — Issue a new coupon (admin only)
router.post('/', authenticateToken, requireOwner, (req: AuthRequest, res: Response) => {
  try {
    const { code, customerPhone, discountAmount, description } = req.body;

    if (!code || discountAmount === undefined || isNaN(Number(discountAmount))) {
      return res.status(400).json({ error: 'Valid code and discountAmount are required.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const existing = db.prepare('SELECT id FROM coupons WHERE UPPER(code) = ?').get(cleanCode);
    if (existing) {
      return res.status(400).json({ error: `Coupon code "${cleanCode}" already exists.` });
    }

    const id = `cpn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO coupons (id, code, customer_phone, discount_amount, description, is_redeemed, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      cleanCode,
      customerPhone ? String(customerPhone).trim() : null,
      Number(discountAmount),
      description ? String(description).trim() : null,
      now
    );

    const created = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/coupons/:code — Soft-delete (mark redeemed) a coupon; admin only
router.delete('/:code', authenticateToken, requireOwner, (req: AuthRequest, res: Response) => {
  try {
    const cleanCode = String(req.params.code || '').trim().toUpperCase();
    if (!cleanCode) {
      return res.status(400).json({ error: 'Coupon code is required.' });
    }

    const coupon = db.prepare('SELECT * FROM coupons WHERE UPPER(code) = ?').get(cleanCode) as any;
    if (!coupon) {
      return res.status(404).json({ error: `Coupon "${cleanCode}" not found.` });
    }

    if (coupon.is_redeemed) {
      // Already consumed — idempotent success
      return res.json({ success: true, message: `Coupon "${cleanCode}" was already redeemed/deleted.` });
    }

    // Soft-delete: mark as redeemed so it never appears in any listing again
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE coupons
      SET is_redeemed = 1, redeemed_at = ?
      WHERE UPPER(code) = ? AND is_redeemed = 0
    `).run(now, cleanCode);

    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      broadcast({ type: 'COUPON_DELETED', data: { code: cleanCode } });
    }

    res.json({ success: true, message: `Coupon "${cleanCode}" deleted (soft).` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
