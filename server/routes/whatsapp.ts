import { Router, Response } from 'express';
import { db } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { whatsappManager } from '../services/whatsappManager';

const router = Router();

// Re-export phone sanitizer for other server routes
export function sanitizeWhatsAppPhone(phone: string, defaultCountryCode = '91'): string {
  return whatsappManager.sanitizePhone(phone, defaultCountryCode);
}

// GET /api/whatsapp/status - Returns current WhatsApp Web connection and settings
router.get('/status', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'whatsapp_%'").all() as { key: string; value: string }[];
    const config: Record<string, string> = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }

    const state = whatsappManager.getState();

    res.json({
      enabled: config['whatsapp_enabled'] !== 'false',
      provider: 'baileys_web',
      autoPrompt: config['whatsapp_auto_prompt'] !== 'false',
      ...state,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/whatsapp/connect - Requests or refreshes WhatsApp Web pairing QR code
router.post('/connect', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const forceNewQr = Boolean(req.body.forceNewQr);
    const state = await whatsappManager.startSession(forceNewQr);
    res.json({
      success: true,
      ...state,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to start WhatsApp Web session' });
  }
});

// POST /api/whatsapp/disconnect - Unlinks the shop WhatsApp account and clears auth credentials
router.post('/disconnect', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const state = await whatsappManager.disconnectSession(true);
    res.json({
      success: true,
      message: 'Shop WhatsApp account disconnected successfully.',
      ...state,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to disconnect WhatsApp Web session' });
  }
});

// POST /api/whatsapp/send-bill - Sends bill directly to customer's WhatsApp using the paired shop account
router.post('/send-bill', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { phone, billNumber, message, total } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Customer phone number is required.' });
  }

  const cleanPhone = sanitizeWhatsAppPhone(phone);
  if (cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Invalid customer phone number format.' });
  }

  const billText = message || `Tax Invoice #${billNumber}\nTotal Amount: ₹${total}`;
  const state = whatsappManager.getState();

  // If Shop WhatsApp Web session is paired and connected, dispatch automatically in the background!
  if (state.status === 'connected') {
    try {
      const result = await whatsappManager.sendDirectMessage(cleanPhone, billText);
      return res.json({
        success: true,
        mode: 'automated',
        messageId: result.messageId,
        phone: result.phone,
        shopPhone: result.shopPhone,
        timestamp: result.timestamp,
        message: `Bill #${billNumber} sent automatically to customer +${cleanPhone} from Shop WhatsApp.`,
      });
    } catch (sendErr: any) {
      console.warn('Direct WhatsApp automated send failed, falling back:', sendErr.message);
      // Fall back to direct link if error occurred
      const directLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(billText)}`;
      return res.json({
        success: false,
        notConnected: false,
        mode: 'fallback',
        fallbackUrl: directLink,
        phone: cleanPhone,
        error: sendErr.message || 'Automated dispatch failed',
      });
    }
  }

  // Fallback: If not paired yet, return standard wa.me deep link so cashier can still send with 1 click
  const directLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(billText)}`;
  return res.json({
    success: false,
    notConnected: true,
    mode: 'fallback',
    fallbackUrl: directLink,
    phone: cleanPhone,
    message: 'Shop WhatsApp is not linked. Scan the QR code in Settings to enable 100% automated background sending.',
  });
});

// Backward compatible alias for /send-receipt
router.post('/send-receipt', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { phone, billNumber, message, total } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Customer phone number is required.' });
  }

  const cleanPhone = sanitizeWhatsAppPhone(phone);
  if (cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Invalid customer phone number format.' });
  }

  const billText = message || `Tax Invoice #${billNumber}\nTotal: ₹${total}`;
  const state = whatsappManager.getState();

  if (state.status === 'connected') {
    try {
      const result = await whatsappManager.sendDirectMessage(cleanPhone, billText);
      return res.json({
        success: true,
        mode: 'automated',
        messageId: result.messageId,
        phone: result.phone,
        shopPhone: result.shopPhone,
      });
    } catch (e: any) {
      const directLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(billText)}`;
      return res.json({
        success: false,
        mode: 'fallback',
        url: directLink,
        error: e.message,
      });
    }
  }

  const directLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(billText)}`;
  return res.json({
    success: false,
    notConnected: true,
    mode: 'fallback',
    url: directLink,
    phone: cleanPhone,
  });
});

// POST /api/whatsapp/send-reminder - Sends Khata balance reminder directly to customer
router.post('/send-reminder', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { phone, customerName, outstanding, message } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Customer phone number is required.' });
  }

  const cleanPhone = sanitizeWhatsAppPhone(phone);
  const state = whatsappManager.getState();
  const reminderText = message || `Payment Reminder from Store for ${customerName}: Outstanding balance ₹${outstanding}`;

  if (state.status === 'connected') {
    try {
      const result = await whatsappManager.sendDirectMessage(cleanPhone, reminderText);
      return res.json({
        success: true,
        mode: 'automated',
        messageId: result.messageId,
        phone: result.phone,
        shopPhone: result.shopPhone,
        message: `Khata reminder sent to +${cleanPhone}.`,
      });
    } catch (e: any) {
      const directLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(reminderText)}`;
      return res.json({
        success: false,
        mode: 'fallback',
        fallbackUrl: directLink,
        error: e.message,
      });
    }
  }

  const directLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(reminderText)}`;
  return res.json({
    success: false,
    notConnected: true,
    mode: 'fallback',
    fallbackUrl: directLink,
    phone: cleanPhone,
    message: 'Shop WhatsApp is not linked. Scan QR code in Settings.',
  });
});

// POST /api/whatsapp/test - Verify sending or link generation
router.post('/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { testPhone } = req.body;
  const cleanPhone = sanitizeWhatsAppPhone(testPhone || '9845012345');
  const sampleMsg = 'Test message from J MART Retail POS. WhatsApp Web integration is fully operational! 🚀';
  const state = whatsappManager.getState();

  if (state.status === 'connected') {
    try {
      const result = await whatsappManager.sendDirectMessage(cleanPhone, sampleMsg);
      return res.json({
        success: true,
        mode: 'automated',
        message: `Live test message sent successfully to +${cleanPhone} from linked Shop WhatsApp (+${state.connectedNumber})!`,
        messageId: result.messageId,
        phone: cleanPhone,
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: err.message || 'Failed to send test message via linked WhatsApp',
      });
    }
  }

  const sampleLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(sampleMsg)}`;
  return res.json({
    success: false,
    notConnected: true,
    mode: 'fallback',
    phone: cleanPhone,
    targetPhone: cleanPhone,
    message: 'Shop WhatsApp is not connected. Scan the QR code to connect your shop account, or test via Click-to-Chat below.',
    sampleLink,
  });
});

export default router;
