import { toast } from 'sonner';
import { api } from './api';

export interface WhatsAppReceiptItem {
  name: string;
  quantity: number;
  price: number;
  uom?: string;
}

export interface WhatsAppReceiptOptions {
  shopDetails?: {
    name?: string;
    address?: string;
    phone?: string;
    gstin?: string;
    email?: string;
  };
  billNumber: string;
  items: WhatsAppReceiptItem[];
  total: number;
  subtotal?: number;
  gstAmount?: number;
  customerName?: string;
  customerPhone?: string;
  cashierName?: string;
  paymentMode?: string;
  changeAmount?: number;
  discount?: number;
  dateTime?: string;
}

export interface WhatsAppReminderOptions {
  shopName?: string;
  customerName: string;
  customerPhone: string;
  outstanding: number;
  terms?: string;
  upiId?: string;
}

export interface WhatsAppStatusResponse {
  enabled: boolean;
  provider: string;
  autoPrompt: boolean;
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrDataUrl: string | null;
  qrRaw: string | null;
  connectedNumber: string | null;
  connectedName: string | null;
  connectedAt: string | null;
  lastError: string | null;
}

/** Sanitize phone number to standard E.164 without plus */
export function sanitizeWhatsAppPhone(phone: string, defaultCountry = '91'): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) {
    return `${defaultCountry}${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `${defaultCountry}${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

/** Format Rupee amount */
function formatInr(val: number): string {
  return '₹' + Number(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format receipt text according to standard WhatsApp Markdown */
export function formatWhatsAppReceipt(opts: WhatsAppReceiptOptions): string {
  const shopName = (opts.shopDetails?.name || 'J MART RETAIL').toUpperCase();
  const shopAddr = opts.shopDetails?.address || '';
  const shopPhone = opts.shopDetails?.phone || '';
  const shopGstin = opts.shopDetails?.gstin || '';
  const nowStr = opts.dateTime || new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const divider = '━━━━━━━━━━━━━━━━━━━━';

  let text = `🧾 *${shopName}*\n`;
  if (shopAddr) text += `📍 ${shopAddr}\n`;
  if (shopPhone || shopGstin) {
    const metaParts = [];
    if (shopPhone) metaParts.push(`📞 ${shopPhone}`);
    if (shopGstin) metaParts.push(`GSTIN: ${shopGstin}`);
    text += `${metaParts.join(' | ')}\n`;
  }
  text += `${divider}\n`;
  text += `*TAX INVOICE #${opts.billNumber}*\n`;
  text += `📅 ${nowStr}\n`;
  if (opts.customerName || opts.customerPhone) {
    text += `👤 Customer: ${opts.customerName || 'Walk-in'}${opts.customerPhone ? ` (${opts.customerPhone})` : ''}\n`;
  }
  if (opts.cashierName) {
    text += `Cashier: ${opts.cashierName}\n`;
  }
  text += `${divider}\n`;
  text += `*ITEMS PURCHASED:*\n`;

  opts.items.forEach((item, idx) => {
    const lineTotal = item.quantity * item.price;
    const uomStr = item.uom ? ` ${item.uom}` : '';
    text += `${idx + 1}. *${item.name}*\n   ${item.quantity}${uomStr} × ${formatInr(item.price)} = ${formatInr(lineTotal)}\n`;
  });

  text += `${divider}\n`;
  if (opts.subtotal !== undefined) {
    text += `Subtotal: ${formatInr(opts.subtotal)}\n`;
  }
  if (opts.discount && opts.discount > 0) {
    text += `Discount: -${formatInr(opts.discount)}\n`;
  }
  if (opts.gstAmount !== undefined && opts.gstAmount > 0) {
    text += `Tax (GST Included): ${formatInr(opts.gstAmount)}\n`;
  }

  const pMode = (opts.paymentMode || 'Cash').toUpperCase();
  text += `*TOTAL AMOUNT: ${formatInr(opts.total)}*\n`;
  text += `Payment Mode: *${pMode}*\n`;

  if (opts.changeAmount && opts.changeAmount > 0) {
    text += `Change Returned: ${formatInr(opts.changeAmount)}\n`;
  }

  text += `${divider}\n`;
  text += `🙏 *Thank you for your visit!*\n`;
  text += `🌿 Save paper, protect nature. Your digital e-bill.`;

  return text;
}

/** Format Khata balance reminder text */
export function formatWhatsAppReminder(opts: WhatsAppReminderOptions): string {
  const shop = opts.shopName || 'J MART';
  const divider = '━━━━━━━━━━━━━━━━━━━━';

  let text = `📢 *PAYMENT REMINDER — ${shop}*\n`;
  text += `${divider}\n`;
  text += `Hello *${opts.customerName}*,\n`;
  text += `This is a gentle reminder regarding your outstanding Khata balance:\n\n`;
  text += `💰 *Outstanding Balance: ${formatInr(opts.outstanding)}*\n`;
  if (opts.terms) {
    text += `Credit Terms: ${opts.terms}\n`;
  }
  text += `${divider}\n`;
  if (opts.upiId) {
    text += `📲 Pay directly via UPI: *${opts.upiId}*\n`;
  }
  text += `You can also clear this balance at our store counter.\n`;
  text += `Thank you for your business!`;

  return text;
}

/** Generate standard WhatsApp deep link */
export function generateWhatsAppLink(phone: string, message: string): string {
  const cleanPhone = sanitizeWhatsAppPhone(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/** Open WhatsApp in a clean new tab or app */
export function openWhatsAppLink(url: string, targetWindow?: Window | null) {
  if (typeof window !== 'undefined') {
    if (targetWindow && !targetWindow.closed) {
      targetWindow.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}

/** Fetches real-time status of the WhatsApp Web multi-device connection */
export async function getWhatsAppConnectionStatus(): Promise<WhatsAppStatusResponse> {
  return await api.get<WhatsAppStatusResponse>('/whatsapp/status');
}

/** Requests or refreshes the pairing QR code */
export async function connectWhatsAppSession(forceNewQr = false): Promise<WhatsAppStatusResponse> {
  return await api.post<WhatsAppStatusResponse>('/whatsapp/connect', { forceNewQr });
}

/** Disconnects and unlinks the shop WhatsApp account */
export async function disconnectWhatsAppSession(): Promise<WhatsAppStatusResponse> {
  return await api.post<WhatsAppStatusResponse>('/whatsapp/disconnect', {});
}

/** Tests WhatsApp sending from the linked device */
export async function testWhatsAppSending(testPhone?: string): Promise<any> {
  return await api.post('/whatsapp/test', { testPhone });
}

/**
 * Dispatches WhatsApp bill receipt.
 * If the shop WhatsApp account is connected via Web QR, it sends AUTOMATICALLY in the background!
 * If not connected, it falls back seamlessly to the direct wa.me link.
 */
export async function sendWhatsAppReceipt(
  opts: WhatsAppReceiptOptions,
  targetWindow?: Window | null
): Promise<{
  success: boolean;
  automated?: boolean;
  opened?: boolean;
  shopPhone?: string;
}> {
  const phone = opts.customerPhone;
  if (!phone || phone.trim().length < 8) {
    if (targetWindow && !targetWindow.closed) {
      targetWindow.close();
    }
    throw new Error('Please enter a valid customer mobile number.');
  }

  const message = formatWhatsAppReceipt(opts);

  try {
    // Attempt automated background dispatch via the shop's linked WhatsApp
    const res = await api.post<any>('/whatsapp/send-bill', {
      phone,
      billNumber: opts.billNumber,
      message,
      total: opts.total,
    });

    if (res && res.success && res.mode === 'automated') {
      // Successfully sent in the background from the shop's WhatsApp!
      if (targetWindow && !targetWindow.closed) {
        targetWindow.close();
      }
      toast.success(`Bill #${opts.billNumber} sent automatically to customer!`, {
        description: `Delivered via Shop WhatsApp (+${res.shopPhone || ''}) to +${res.phone}`,
      });
      return { success: true, automated: true, shopPhone: res.shopPhone };
    }

    // Fallback: If not paired yet, open Click-to-Chat
    const fallbackUrl = res?.fallbackUrl || generateWhatsAppLink(phone, message);
    openWhatsAppLink(fallbackUrl, targetWindow);
    toast.info(`Bill #${opts.billNumber} opened in WhatsApp`, {
      description: 'Tip: Connect Shop WhatsApp via QR code in Settings for 100% automatic sending.',
    });
    return { success: true, automated: false, opened: true };
  } catch (err: any) {
    // Graceful offline fallback
    const link = generateWhatsAppLink(phone, message);
    openWhatsAppLink(link, targetWindow);
    toast.info(`Opened WhatsApp chat for customer`, {
      description: err?.message || 'Using Click-to-Chat fallback.',
    });
    return { success: true, automated: false, opened: true };
  }
}

/**
 * Dispatches Khata balance reminder.
 * Sends automatically via paired shop WhatsApp if available, or opens Click-to-Chat.
 */
export async function sendWhatsAppReminder(opts: WhatsAppReminderOptions): Promise<{
  success: boolean;
  automated?: boolean;
  opened?: boolean;
}> {
  const phone = opts.customerPhone;
  if (!phone || phone.trim().length < 8) {
    throw new Error('Please enter a valid customer mobile number.');
  }

  const message = formatWhatsAppReminder(opts);

  try {
    const res = await api.post<any>('/whatsapp/send-reminder', {
      phone,
      customerName: opts.customerName,
      outstanding: opts.outstanding,
      message,
    });

    if (res && res.success && res.mode === 'automated') {
      toast.success(`Khata reminder sent to ${opts.customerName}!`, {
        description: `Delivered via Shop WhatsApp to +${res.phone}`,
      });
      return { success: true, automated: true };
    }

    const fallbackUrl = res?.fallbackUrl || generateWhatsAppLink(phone, message);
    openWhatsAppLink(fallbackUrl);
    toast.info(`WhatsApp reminder opened for ${opts.customerName}`, {
      description: `Notifying ${phone} of ₹${opts.outstanding.toLocaleString('en-IN')}`,
    });
    return { success: true, automated: false, opened: true };
  } catch (e: any) {
    const link = generateWhatsAppLink(phone, message);
    openWhatsAppLink(link);
    return { success: true, automated: false, opened: true };
  }
}
