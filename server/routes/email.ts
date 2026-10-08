import { Router, Response } from 'express';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { emailManager } from '../services/emailManager';

const router = Router();

// GET /api/email/config - Fetch email & SMTP settings
router.get('/config', authenticateToken, async (_req: AuthRequest, res: Response) => {
  try {
    const config = emailManager.getConfig();
    // Mask password before returning to client
    const maskedPass = config.pass ? '••••••••' : '';

    res.json({
      ...config,
      pass: maskedPass,
      hasPass: Boolean(config.pass),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch email settings' });
  }
});

// POST /api/email/config - Save email & SMTP configuration
router.post('/config', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      enabled,
      autoSend,
      host,
      port,
      secure,
      user,
      pass,
      senderName,
      senderEmail,
      subjectTemplate,
    } = req.body;

    const current = emailManager.getConfig();

    const insertOrUpdate = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const tx = db.transaction(() => {
      if (enabled !== undefined) insertOrUpdate.run('email_enabled', String(Boolean(enabled)));
      if (autoSend !== undefined) insertOrUpdate.run('email_auto_send', String(Boolean(autoSend)));
      if (host !== undefined) insertOrUpdate.run('smtp_host', String(host || 'smtp.gmail.com'));
      if (port !== undefined) insertOrUpdate.run('smtp_port', String(Number(port) || 587));
      if (secure !== undefined) insertOrUpdate.run('smtp_secure', String(Boolean(secure)));
      if (user !== undefined) insertOrUpdate.run('smtp_user', String(user || ''));
      // Only update password if a new non-empty string is provided
      if (pass !== undefined && pass !== '' && pass !== '••••••••') {
        const targetHost = String(host !== undefined ? host : (current.host || '')).toLowerCase();
        const cleanPass = (typeof pass === 'string' && targetHost.includes('gmail'))
          ? pass.replace(/\s+/g, '')
          : String(pass).trim();
        insertOrUpdate.run('smtp_pass', cleanPass);
      }
      if (senderName !== undefined) insertOrUpdate.run('email_sender_name', String(senderName || ''));
      if (senderEmail !== undefined) insertOrUpdate.run('email_sender_address', String(senderEmail || ''));
      if (subjectTemplate !== undefined) insertOrUpdate.run('email_subject_template', String(subjectTemplate || ''));
    });

    tx();
    emailManager.reloadConfig();

    res.json({
      success: true,
      message: 'Email configuration updated successfully.',
      config: {
        ...emailManager.getConfig(),
        pass: '••••••••',
        hasPass: Boolean(emailManager.getConfig().pass),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save email settings' });
  }
});

// POST /api/email/verify - Test SMTP connection & credentials
router.post('/verify', authenticateToken, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await emailManager.verifyConnection();
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'SMTP verification error' });
  }
});

// POST /api/email/test - Send a live test email
router.post('/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { targetEmail } = req.body;
    if (!targetEmail) {
      return res.status(400).json({ error: 'Please enter a recipient test email address.' });
    }

    const result = await emailManager.sendTestEmail(targetEmail);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to dispatch test email' });
  }
});

// POST /api/email/send-bill - Sends tax invoice to customer email
router.post('/send-bill', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      toEmail,
      customerName,
      customerPhone,
      billNumber,
      items,
      total,
      subtotal,
      gstAmount,
      cgst,
      sgst,
      igst,
      paymentMode,
      changeAmount,
      discount,
      dateTime,
      shopDetails,
    } = req.body;

    if (!toEmail) {
      return res.status(400).json({ error: 'Recipient customer email is required.' });
    }

    if (!billNumber) {
      return res.status(400).json({ error: 'Bill number is required.' });
    }

    const result = await emailManager.sendBillEmail({
      toEmail,
      customerName,
      customerPhone,
      billNumber,
      items: Array.isArray(items) ? items : [],
      total: Number(total || 0),
      subtotal: subtotal !== undefined ? Number(subtotal) : undefined,
      gstAmount: gstAmount !== undefined ? Number(gstAmount) : undefined,
      cgst: cgst !== undefined ? Number(cgst) : undefined,
      sgst: sgst !== undefined ? Number(sgst) : undefined,
      igst: igst !== undefined ? Number(igst) : undefined,
      paymentMode,
      changeAmount: changeAmount !== undefined ? Number(changeAmount) : undefined,
      discount: discount !== undefined ? Number(discount) : undefined,
      dateTime,
      shopDetails,
    });

    res.json({
      message: `Invoice #${billNumber} sent to ${toEmail}.`,
      ...result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to send invoice email' });
  }
});

export default router;
