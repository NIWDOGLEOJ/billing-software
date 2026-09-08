import { Router, Response } from 'express';
import { db } from '../db';
import crypto from 'crypto';

const router = Router();

function getOnlineSenderName(): string {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'shopName'").get() as { value: string } | undefined;
    if (row?.value) {
      return `${row.value} Online`;
    }
  } catch {}
  return 'Sunrise Provisions Online';
}

// POST /api/reservations - Customer reserves items from the online store
router.post('/', (req, res: Response) => {
  try {
    const { customerName, customerPhone, items, couponCode, discountAmount } = req.body;

    if (!customerName || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Customer name and at least one item are required.' });
    }

    const reservationId = 'RES-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString(); // 30 mins
    const createdAt = now.toISOString();

    let subtotal = 0;
    const validatedItems: any[] = [];

    // Database transaction to validate stock, decrement inventory, and save reservation
    const transaction = db.transaction(() => {
      // 1. Verify available stock for every item
      for (const reqItem of items) {
        const itemId = String(reqItem.id || '');
        const itemSku = String(reqItem.sku || '');
        const itemName = String(reqItem.name || '');
        let product: any = null;
        if (itemId) {
          product = db.prepare('SELECT id, name, sku, price, stock, uom FROM products WHERE id = ?').get(itemId);
        }
        if (!product && itemSku) {
          product = db.prepare('SELECT id, name, sku, price, stock, uom FROM products WHERE sku = ?').get(itemSku);
        }
        if (!product && itemName) {
          product = db.prepare('SELECT id, name, sku, price, stock, uom FROM products WHERE LOWER(name) = LOWER(?)').get(itemName.trim());
        }

        if (!product) {
          throw new Error(`Product "${reqItem.name || reqItem.id}" not found.`);
        }

        const qty = Number(reqItem.quantity) || 1;
        if (product.stock < qty) {
          throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${qty}`);
        }

        subtotal += product.price * qty;
        validatedItems.push({
          id: product.id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          quantity: qty,
          uom: product.uom || 'PCS',
        });
      }

      let cleanCouponCode = couponCode ? String(couponCode).trim().toUpperCase() : null;
      if (cleanCouponCode) {
        const cpn = db.prepare('SELECT * FROM coupons WHERE UPPER(code) = ?').get(cleanCouponCode) as any;
        if (cpn && cpn.is_redeemed) {
          throw new Error(`Coupon "${cleanCouponCode}" has already been redeemed and cannot be used again.`);
        }
      }

      const discount = Math.max(0, Number(discountAmount) || 0);
      const finalTotal = Math.max(0, subtotal - discount);

      // 2. Decrement stock immediately in database
      for (const item of validatedItems) {
        db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(item.quantity, item.id);
      }

      // 3. Insert reservation record
      db.prepare(`
        INSERT INTO reservations (
          id, customer_name, customer_phone, otp, items, subtotal,
          coupon_code, discount_amount, total, status, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        reservationId,
        customerName.trim(),
        customerPhone ? customerPhone.trim() : null,
        otp,
        JSON.stringify(validatedItems),
        subtotal,
        cleanCouponCode || null,
        discount,
        finalTotal,
        createdAt,
        expiresAt
      );

      // 4. Inject into chats table for cashier bill counter display
      const billTransferPayload = {
        type: 'ONLINE_RESERVATION',
        isBillTransfer: true,
        reservationId,
        customerName: customerName.trim(),
        customerPhone: customerPhone ? customerPhone.trim() : null,
        requiresOtp: true,
        otp, // stored on the card for cashier prompt comparison
        items: validatedItems,
        subtotal,
        discountAmount: discount,
        couponCode: couponCode || null,
        total: finalTotal,
        expiresAt,
        createdAt,
      };

      const chatId = 'msg_res_' + Date.now();
      const senderName = getOnlineSenderName();
      db.prepare('INSERT INTO chats VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        chatId,
        senderName,
        'Online Store',
        JSON.stringify(billTransferPayload),
        'online_system',
        createdAt,
        'ONLINE_WEB',
        'All',
        1
      );

      return {
        reservationId,
        otp,
        expiresAt,
        subtotal,
        discountAmount: discount,
        total: finalTotal,
        items: validatedItems,
        billTransferPayload,
        chatId,
        senderName
      };
    });

    const result = transaction();

    // Broadcast WebSocket updates across LAN registers
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      // Broadcast stock reduction immediately to all registers & clients
      const allProducts = db.prepare('SELECT * FROM products').all();
      broadcast({ type: 'STOCK_UPDATED', data: allProducts });

      // Broadcast new reservation card to cashier chatbox
      broadcast({
        type: 'CHAT_MESSAGE',
        data: {
          id: result.chatId,
          senderName: result.senderName,
          senderRole: 'Online Store',
          ciphertext: JSON.stringify(result.billTransferPayload),
          iv: 'online_system',
          timestamp: result.expiresAt,
          fingerprint: 'ONLINE_WEB',
          recipientName: 'All',
          isBillTransfer: true
        }
      });
    }

    res.status(201).json({
      success: true,
      reservationId: result.reservationId,
      otp: result.otp,
      expiresAt: result.expiresAt,
      subtotal: result.subtotal,
      discountAmount: result.discountAmount,
      total: result.total,
      items: result.items,
    });
  } catch (error: any) {
    console.error('[Reservation Error]:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// POST /api/reservations/:id/verify-otp - Cashier verifies customer OTP to accept the bill into register
router.post('/:id/verify-otp', (req, res: Response) => {
  try {
    const { id } = req.params;
    const { otp, cashierName } = req.body;

    if (!otp) {
      return res.status(400).json({ error: 'Please provide the customer 4-digit OTP.' });
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as any;
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation record not found.' });
    }

    if (reservation.status === 'accepted') {
      return res.status(400).json({ error: 'This reservation has already been accepted and loaded.' });
    }

    if (reservation.status === 'expired') {
      return res.status(400).json({ error: 'This reservation has expired and items were returned to stock.' });
    }

    // Check expiry
    if (new Date(reservation.expires_at).getTime() < Date.now()) {
      // Auto-mark expired
      db.prepare("UPDATE reservations SET status = 'expired' WHERE id = ?").run(id);
      return res.status(400).json({ error: '30-minute reservation has expired.' });
    }

    // Compare OTP
    if (reservation.otp.trim() !== String(otp).trim()) {
      return res.status(400).json({ error: 'Invalid OTP. Please verify the code on customer screen.' });
    }

    // Mark as accepted
    const now = new Date().toISOString();
    const claimant = cashierName ? String(cashierName).trim() : 'Cashier';
    db.prepare(`
      UPDATE reservations 
      SET status = 'accepted', accepted_at = ?, accepted_by = ? 
      WHERE id = ?
    `).run(now, claimant, id);

    // Update the corresponding chat message in the chats table so all registers see it claimed/taken
    let chatMsgId: string | null = null;
    try {
      const chatRow = db.prepare("SELECT id, ciphertext, iv FROM chats WHERE ciphertext LIKE ?").get(`%"reservationId":"${id}"%`) as any;
      if (chatRow) {
        chatMsgId = chatRow.id;
        let payload = JSON.parse(chatRow.ciphertext);
        payload.isAccepted = true;
        payload.claimedBy = claimant;
        payload.claimedAt = now;
        payload.status = 'claimed';
        const updatedCiphertext = JSON.stringify(payload);
        db.prepare("UPDATE chats SET ciphertext = ? WHERE id = ?").run(updatedCiphertext, chatRow.id);

        const broadcast = req.app.get('broadcast');
        if (broadcast) {
          broadcast({
            type: 'EDIT_CHAT_MESSAGE',
            data: { id: chatRow.id, ciphertext: updatedCiphertext, iv: chatRow.iv }
          });
          broadcast({
            type: 'RESERVATION_CLAIMED',
            data: { reservationId: id, chatId: chatRow.id, claimedBy: claimant, claimedAt: now }
          });
        }
      }
    } catch (chatErr) {
      console.warn('[OTP Verify] Failed to update chat record:', chatErr);
    }

    const items = JSON.parse(reservation.items || '[]');

    res.json({
      success: true,
      valid: true,
      reservationId: id,
      billData: {
        type: 'BILL_TRANSFER',
        items,
        customerName: reservation.customer_name,
        customerPhone: reservation.customer_phone,
        subtotal: reservation.subtotal,
        discountAmount: reservation.discount_amount,
        couponCode: reservation.coupon_code,
        total: reservation.total,
        reservationId: id,
        claimedBy: claimant,
        claimedAt: now,
        isAccepted: true
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reservations/:id/cancel - Cancel active reservation and restore items to store inventory
router.post(['/:id/cancel', '/cancel'], (req, res: Response) => {
  try {
    const reservationId = req.params.id || req.body.reservationId;
    const { reason, customerName } = req.body;

    if (!reservationId) {
      return res.status(400).json({ error: 'Reservation ID is required.' });
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId) as any;
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation record not found.' });
    }

    if (reservation.status === 'cancelled') {
      return res.json({ success: true, message: 'Reservation is already cancelled.', reservationId });
    }

    if (reservation.status === 'expired') {
      return res.status(400).json({ error: 'Reservation has already expired and items were already returned to inventory.' });
    }

    if (reservation.status === 'completed') {
      return res.status(400).json({ error: 'Reservation has already been billed and completed at the cash register.' });
    }

    const items = JSON.parse(reservation.items || '[]');
    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
      // 1. Restore product stock back to inventory
      for (const item of items) {
        let upd = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.id);
        if (upd.changes === 0 && item.sku) {
          upd = db.prepare('UPDATE products SET stock = stock + ? WHERE sku = ?').run(item.quantity, item.sku);
        }
        if (upd.changes === 0 && item.name) {
          db.prepare('UPDATE products SET stock = stock + ? WHERE LOWER(name) = LOWER(?)').run(item.quantity, item.name.trim());
        }
      }

      // 2. Update reservation status to cancelled
      db.prepare(`
        UPDATE reservations 
        SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ? 
        WHERE id = ?
      `).run(now, reason || 'Cancelled by customer', reservationId);
    });

    transaction();

    // 3. Broadcast updated stock to all registers and customer websites
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      const allProducts = db.prepare('SELECT * FROM products').all();
      broadcast({ type: 'STOCK_UPDATED', data: allProducts });

      // Notify counter chatbox
      broadcast({
        type: 'CHAT_MESSAGE',
        data: {
          id: 'msg_res_cancel_' + Date.now(),
          senderName: getOnlineSenderName(),
          senderRole: 'Online Store',
          ciphertext: JSON.stringify({
            type: 'ONLINE_RESERVATION_CANCELLED',
            reservationId,
            customerName: reservation.customer_name || customerName || 'Customer',
            reason: reason || 'Cancelled by customer',
            timestamp: now,
          }),
          iv: 'online_system',
          timestamp: now,
          fingerprint: 'ONLINE_WEB',
          recipientName: 'All',
        }
      });
    }

    console.log(`↩️ [Reservation Cancelled]: Restored stock for reservation ${reservationId}`);
    res.json({
      success: true,
      message: 'Reservation cancelled successfully. Items have been returned to store inventory.',
      reservationId,
    });
  } catch (error: any) {
    console.error('[Reservation Cancel Error]:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reservations/active - Get all currently active reservations
router.get('/active', (_req, res: Response) => {
  try {
    const now = new Date().toISOString();
    const rows = db.prepare("SELECT * FROM reservations WHERE status = 'active' AND expires_at >= ? ORDER BY created_at DESC").all(now);
    res.json(rows.map((r: any) => ({
      ...r,
      items: JSON.parse(r.items || '[]')
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reservations/my-reservation?customerName=...
// Fetches the active reservation ONLY for the specific customer requesting it
router.get('/my-reservation', (req, res: Response) => {
  try {
    const customerName = String(req.query.customerName || '').trim();
    if (!customerName) {
      return res.json({ activeReservation: null });
    }

    const now = new Date().toISOString();
    const reservation = db.prepare(`
      SELECT * FROM reservations 
      WHERE LOWER(customer_name) = LOWER(?) AND status = 'active' AND expires_at >= ?
      ORDER BY created_at DESC LIMIT 1
    `).get(customerName, now) as any;

    if (!reservation) {
      return res.json({ activeReservation: null });
    }

    res.json({
      activeReservation: {
        reservationId: reservation.id,
        otp: reservation.otp,
        expiresAt: reservation.expires_at,
        subtotal: reservation.subtotal,
        discountAmount: reservation.discount_amount,
        total: reservation.total,
        items: JSON.parse(reservation.items || '[]'),
        customerName: reservation.customer_name,
        customerPhone: reservation.customer_phone,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
