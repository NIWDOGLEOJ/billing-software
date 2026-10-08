import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { db } from '../db';

export interface EmailConfig {
  enabled: boolean;
  autoSend: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  senderName: string;
  senderEmail: string;
  subjectTemplate: string;
}

export interface BillEmailItem {
  name: string;
  quantity: number;
  price: number;
  uom?: string;
  tax?: number;
}

export interface BillEmailOptions {
  toEmail: string;
  customerName?: string;
  customerPhone?: string;
  billNumber: string;
  items: BillEmailItem[];
  total: number;
  subtotal?: number;
  gstAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  paymentMode?: string;
  changeAmount?: number;
  discount?: number;
  dateTime?: string;
  shopDetails?: {
    name?: string;
    address?: string;
    phone?: string;
    gstin?: string;
    email?: string;
  };
}

class EmailManager {
  private transporter: Transporter | null = null;
  private cachedConfig: EmailConfig | null = null;

  constructor() {
    this.reloadConfig();
  }

  /**
   * Loads current email & SMTP settings from SQLite database
   */
  public getConfig(): EmailConfig {
    try {
      const rows = db.prepare(`
        SELECT key, value FROM settings WHERE key IN (
          'email_enabled',
          'email_auto_send',
          'smtp_host',
          'smtp_port',
          'smtp_secure',
          'smtp_user',
          'smtp_pass',
          'email_sender_name',
          'email_sender_address',
          'email_subject_template'
        )
      `).all() as Array<{ key: string; value: string }>;

      const map: Record<string, string> = {};
      for (const r of rows) {
        map[r.key] = r.value;
      }

      const port = Number(map['smtp_port']) || 587;
      const secure = map['smtp_secure'] === 'true' || port === 465;

      return {
        enabled: map['email_enabled'] === 'true',
        autoSend: map['email_auto_send'] !== 'false',
        host: map['smtp_host'] || 'smtp.gmail.com',
        port,
        secure,
        user: map['smtp_user'] || '',
        pass: map['smtp_pass'] || '',
        senderName: map['email_sender_name'] || 'J MART Retail',
        senderEmail: map['email_sender_address'] || map['smtp_user'] || '',
        subjectTemplate: map['email_subject_template'] || 'Tax Invoice #{billNumber} — {shopName}',
      };
    } catch (err) {
      return {
        enabled: false,
        autoSend: false,
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        user: '',
        pass: '',
        senderName: 'J MART Retail',
        senderEmail: '',
        subjectTemplate: 'Tax Invoice #{billNumber} — {shopName}',
      };
    }
  }

  /**
   * Refreshes the nodemailer transporter using current DB settings
   */
  public reloadConfig(): void {
    const config = this.getConfig();
    this.cachedConfig = config;

    if (!config.user || !config.pass || !config.host) {
      this.transporter = null;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
    } catch (e) {
      console.error('[EmailManager] Failed to create nodemailer transporter:', e);
      this.transporter = null;
    }
  }

  /**
   * Verifies SMTP connection and authentication credentials
   */
  public async verifyConnection(): Promise<{ success: boolean; message: string }> {
    this.reloadConfig();
    const config = this.cachedConfig || this.getConfig();

    if (!config.host || !config.user || !config.pass) {
      return {
        success: false,
        message: 'SMTP settings incomplete. Please provide Host, User/Email, and App Password.',
      };
    }

    if (!this.transporter) {
      return {
        success: false,
        message: 'Could not create mail transport with current settings.',
      };
    }

    try {
      await this.transporter.verify();
      return {
        success: true,
        message: `Connected successfully to SMTP server (${config.host}:${config.port}) as ${config.user}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'SMTP authentication failed. Check credentials or App Password.',
      };
    }
  }

  /**
   * Formats rupee currency string
   */
  private inr(val: number): string {
    return '₹' + Number(val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Generates a modern, responsive HTML receipt template
   */
  public generateHtmlReceipt(opts: BillEmailOptions): string {
    const shopName = opts.shopDetails?.name || 'J MART RETAIL';
    const shopAddr = opts.shopDetails?.address || 'Chennai, Tamil Nadu';
    const shopPhone = opts.shopDetails?.phone || '+91 77088 00220';
    const shopGstin = opts.shopDetails?.gstin || '';
    const nowStr = opts.dateTime || new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const itemRows = (opts.items || []).map((item, idx) => {
      const qtyStr = `${item.quantity} ${item.uom || 'PCS'}`;
      const lineTotal = this.inr(item.quantity * item.price);
      const isEven = idx % 2 === 0;
      return `
        <tr style="background-color: ${isEven ? '#ffffff' : '#f9fafb'}; border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 14px; font-size: 13px; color: #111827; font-weight: 500;">
            ${item.name}
          </td>
          <td style="padding: 10px 14px; font-size: 13px; color: #4b5563; text-align: center; font-family: monospace;">
            ${qtyStr}
          </td>
          <td style="padding: 10px 14px; font-size: 13px; color: #4b5563; text-align: right; font-family: monospace;">
            ${this.inr(item.price)}
          </td>
          <td style="padding: 10px 14px; font-size: 13px; color: #111827; font-weight: 600; text-align: right; font-family: monospace;">
            ${lineTotal}
          </td>
        </tr>
      `;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tax Invoice #${opts.billNumber}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
    
    <!-- Header -->
    <div style="background-color: #0f172a; color: #ffffff; padding: 24px 28px; text-align: left;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #94a3b8; font-weight: 700; margin-bottom: 4px;">
        Tax Invoice · Digital Receipt
      </div>
      <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
        ${shopName}
      </h1>
      <p style="margin: 6px 0 0 0; font-size: 12.5px; color: #cbd5e1; line-height: 1.4;">
        ${shopAddr}
      </p>
      <div style="margin-top: 8px; font-size: 12px; color: #94a3b8;">
        Tel: <strong>${shopPhone}</strong> ${shopGstin ? `&nbsp;·&nbsp; GSTIN: <strong>${shopGstin}</strong>` : ''}
      </div>
    </div>

    <!-- Meta Details Bar -->
    <div style="background-color: #f8fafc; padding: 14px 28px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 12.5px;">
      <div>
        <span style="color: #64748b;">Invoice #:</span>
        <strong style="color: #0f172a; font-family: monospace; font-size: 13px;">${opts.billNumber}</strong>
      </div>
      <div>
        <span style="color: #64748b;">Date:</span>
        <strong style="color: #0f172a;">${nowStr}</strong>
      </div>
    </div>

    ${opts.customerName || opts.customerPhone ? `
      <div style="padding: 12px 28px; background-color: #ffffff; border-bottom: 1px solid #f1f5f9; font-size: 12.5px; color: #475569;">
        Billed To: <strong style="color: #0f172a;">${opts.customerName || 'Valued Customer'}</strong>
        ${opts.customerPhone ? ` (${opts.customerPhone})` : ''}
      </div>
    ` : ''}

    <!-- Line Items Table -->
    <div style="padding: 20px 24px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">Item</th>
            <th style="padding: 10px 14px; text-align: center; font-size: 11px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">Qty</th>
            <th style="padding: 10px 14px; text-align: right; font-size: 11px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">Rate</th>
            <th style="padding: 10px 14px; text-align: right; font-size: 11px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <!-- Financial Totals Box -->
      <div style="max-width: 260px; margin-left: auto; border-top: 2px solid #e2e8f0; padding-top: 10px;">
        ${opts.subtotal ? `
          <div style="display: flex; justify-content: space-between; font-size: 12.5px; color: #64748b; margin-bottom: 5px;">
            <span>Subtotal:</span>
            <span style="font-family: monospace;">${this.inr(opts.subtotal)}</span>
          </div>
        ` : ''}
        ${opts.discount ? `
          <div style="display: flex; justify-content: space-between; font-size: 12.5px; color: #16a34a; margin-bottom: 5px;">
            <span>Discount:</span>
            <span style="font-family: monospace;">-${this.inr(opts.discount)}</span>
          </div>
        ` : ''}
        ${opts.cgst && opts.sgst ? `
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-bottom: 3px;">
            <span>CGST:</span>
            <span style="font-family: monospace;">${this.inr(opts.cgst)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-bottom: 5px;">
            <span>SGST:</span>
            <span style="font-family: monospace;">${this.inr(opts.sgst)}</span>
          </div>
        ` : opts.gstAmount ? `
          <div style="display: flex; justify-content: space-between; font-size: 12.5px; color: #64748b; margin-bottom: 5px;">
            <span>GST Included:</span>
            <span style="font-family: monospace;">${this.inr(opts.gstAmount)}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
          <span>Total:</span>
          <span style="color: #059669; font-family: monospace;">${this.inr(opts.total)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-top: 6px;">
          <span>Paid via:</span>
          <span style="font-weight: 700; text-transform: uppercase;">${opts.paymentMode || 'Cash'}</span>
        </div>
      </div>
    </div>

    <!-- Footer Note -->
    <div style="background-color: #f8fafc; padding: 20px 28px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 13.5px; font-weight: 600; color: #0f172a;">
        🙏 Thank you for shopping with us!
      </p>
      <p style="margin: 6px 0 0 0; font-size: 12px; color: #64748b;">
        🌿 Save paper, protect nature. Your digital e-bill has been recorded.
      </p>
    </div>

  </div>
</body>
</html>
    `;
  }

  /**
   * Generates clean plain text receipt for fallback and screen readers
   */
  public generateTextReceipt(opts: BillEmailOptions): string {
    const shopName = opts.shopDetails?.name || 'J MART RETAIL';
    const shopAddr = opts.shopDetails?.address || '';
    const shopPhone = opts.shopDetails?.phone || '';
    const shopGstin = opts.shopDetails?.gstin || '';

    const lines = [
      `🧾 ${shopName.toUpperCase()}`,
      shopAddr ? `📍 ${shopAddr}` : '',
      `📞 ${shopPhone} ${shopGstin ? `| GSTIN: ${shopGstin}` : ''}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `TAX INVOICE #${opts.billNumber}`,
      `Date: ${opts.dateTime || new Date().toLocaleString('en-IN')}`,
      opts.customerName ? `Customer: ${opts.customerName}` : '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'ITEMS PURCHASED:',
      ...(opts.items || []).map((it, i) => `${i + 1}. ${it.name} - ${it.quantity} ${it.uom || 'PCS'} @ ${this.inr(it.price)} = ${this.inr(it.quantity * it.price)}`),
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      opts.subtotal ? `Subtotal: ${this.inr(opts.subtotal)}` : '',
      opts.cgst && opts.sgst
        ? `CGST: ${this.inr(opts.cgst)}\nSGST: ${this.inr(opts.sgst)}`
        : opts.gstAmount ? `GST Included: ${this.inr(opts.gstAmount)}` : '',
      `TOTAL: ${this.inr(opts.total)}`,
      `Payment Mode: ${(opts.paymentMode || 'Cash').toUpperCase()}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'Thank you for your visit!',
      'Save paper, protect nature. Your digital e-bill.',
    ].filter(Boolean);

    return lines.join('\n');
  }

  /**
   * Sends an automated digital tax invoice to the customer's email address
   */
  public async sendBillEmail(opts: BillEmailOptions): Promise<{
    success: boolean;
    messageId?: string;
    toEmail: string;
    error?: string;
  }> {
    const toEmail = (opts.toEmail || '').trim().toLowerCase();
    if (!toEmail || !toEmail.includes('@') || !toEmail.includes('.')) {
      throw new Error('Valid customer email address is required.');
    }

    this.reloadConfig();
    const config = this.cachedConfig || this.getConfig();

    if (!config.enabled) {
      return {
        success: false,
        toEmail,
        error: 'Email integration is disabled in Store Settings.',
      };
    }

    if (!this.transporter) {
      throw new Error('Outgoing mail server (SMTP) is not configured. Please configure SMTP in Settings.');
    }

    const shopName = opts.shopDetails?.name || config.senderName || 'Store';
    const subject = config.subjectTemplate
      .replace('{billNumber}', opts.billNumber)
      .replace('{shopName}', shopName);

    const fromAddress = `"${config.senderName}" <${config.senderEmail || config.user}>`;
    const htmlContent = this.generateHtmlReceipt(opts);
    const textContent = this.generateTextReceipt(opts);

    const info = await this.transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });

    console.log(`✉️ [Email] Bill #${opts.billNumber} sent successfully to ${toEmail} (MessageId: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
      toEmail,
    };
  }

  /**
   * Sends a live test email to verify credentials
   */
  public async sendTestEmail(targetEmail: string): Promise<{
    success: boolean;
    messageId?: string;
    targetEmail: string;
    message: string;
  }> {
    const toEmail = (targetEmail || '').trim().toLowerCase();
    if (!toEmail || !toEmail.includes('@')) {
      throw new Error('Please enter a valid recipient email address.');
    }

    this.reloadConfig();
    const config = this.cachedConfig || this.getConfig();

    if (!this.transporter) {
      throw new Error('SMTP transporter is not configured. Check Host, Port, and User credentials.');
    }

    const fromAddress = `"${config.senderName}" <${config.senderEmail || config.user}>`;

    const info = await this.transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: `Test Email from ${config.senderName} Retail POS`,
      text: `Hello!\n\nThis is a test email sent from your ${config.senderName} Retail POS terminal.\n\nYour SMTP server connection is active and ready to dispatch customer tax invoices and receipts automatically!\n\nSent at: ${new Date().toLocaleString('en-IN')}`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; background-color: #f9fafb; color: #111827;">
          <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
            <div style="font-size: 24px; margin-bottom: 12px;">✉️ ✨</div>
            <h2 style="margin: 0 0 10px 0; color: #0f172a;">SMTP Integration Operational</h2>
            <p style="font-size: 14px; color: #4b5563; line-height: 1.5;">
              This test confirms that your store email settings are working properly. When customers provide an email at checkout, their tax invoices will be sent automatically.
            </p>
            <div style="margin-top: 16px; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; color: #166534;">
              ✓ Connected to <strong>${config.host}:${config.port}</strong> as <strong>${config.user}</strong>
            </div>
            <p style="margin-top: 16px; font-size: 12px; color: #9ca3af;">
              Sent at ${new Date().toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      `,
    });

    return {
      success: true,
      messageId: info.messageId,
      targetEmail: toEmail,
      message: `Test email dispatched successfully to ${toEmail}!`,
    };
  }
}

export const emailManager = new EmailManager();
