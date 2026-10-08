import { api } from './api';
import { toast } from 'sonner';

export interface EmailConfig {
  enabled: boolean;
  autoSend: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  hasPass?: boolean;
  senderName: string;
  senderEmail: string;
  subjectTemplate: string;
}

export interface SendBillEmailOptions {
  toEmail: string;
  customerName?: string;
  customerPhone?: string;
  billNumber: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    uom?: string;
  }>;
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

/** Fetches current store email & SMTP configuration */
export async function getEmailConfig(): Promise<EmailConfig> {
  return await api.get<EmailConfig>('/email/config');
}

/** Updates store email & SMTP configuration */
export async function saveEmailConfig(config: Partial<EmailConfig>): Promise<any> {
  return await api.post('/email/config', config);
}

/** Verifies active SMTP credentials with outgoing mail server */
export async function verifyEmailConnection(): Promise<{ success: boolean; message: string }> {
  return await api.post('/email/verify', {});
}

/** Sends a live test email to the specified target address */
export async function testEmailSending(targetEmail: string): Promise<any> {
  return await api.post('/email/test', { targetEmail });
}

/**
 * Dispatches digital tax invoice email to customer.
 * Shows instant feedback toast upon completion.
 */
export async function sendBillEmail(
  opts: SendBillEmailOptions
): Promise<{ success: boolean; message?: string }> {
  const targetEmail = (opts.toEmail || '').trim().toLowerCase();
  if (!targetEmail || !targetEmail.includes('@')) {
    throw new Error('Please enter a valid customer email address.');
  }

  try {
    const res = await api.post<any>('/email/send-bill', opts);
    if (res && res.success) {
      toast.success(`Bill #${opts.billNumber} sent to ${targetEmail}!`, {
        description: `Delivered via Store Email (${opts.shopDetails?.email || 'SMTP'})`,
      });
      return { success: true, message: res.message };
    }
    throw new Error(res?.error || 'Failed to send invoice email');
  } catch (err: any) {
    toast.error('Failed to email invoice: ' + (err?.message || 'Server error'));
    throw err;
  }
}
