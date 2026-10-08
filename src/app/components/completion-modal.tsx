import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Check, Mail } from 'lucide-react';
import { MONO, NUM, EYEBROW, inr } from '../lib/design-system';
import { sendWhatsAppReceipt } from '../utils/whatsapp';
import { sendBillEmail } from '../utils/email';
import { toast } from 'sonner';

interface CompletionModalProps {
  billNumber: string;
  itemCount: number;
  total: number;
  paymentMode: string;
  changeAmount: number;
  customerPhone?: string;
  customerName?: string;
  customerEmail?: string;
  cashierName?: string;
  shopDetails?: any;
  items?: any[];
  subtotal?: number;
  gstAmount?: number;
  autoSentWhatsApp?: boolean;
  autoSentEmail?: boolean;
  onClose: () => void;
  onNewBill: () => void;
}

export function CompletionModal({
  billNumber,
  itemCount,
  total,
  paymentMode,
  changeAmount,
  customerPhone,
  customerName,
  customerEmail,
  cashierName,
  shopDetails,
  items,
  subtotal,
  gstAmount,
  autoSentWhatsApp = false,
  autoSentEmail = false,
  onClose,
  onNewBill,
}: CompletionModalProps) {
  const [phoneInput, setPhoneInput] = useState(customerPhone || '');
  const [emailInput, setEmailInput] = useState(customerEmail || '');
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [waSent, setWaSent] = useState(autoSentWhatsApp || false);
  const [emailSent, setEmailSent] = useState(autoSentEmail || Boolean(customerEmail));

  const handleSendWhatsApp = async (phoneToSend?: string) => {
    const targetPhone = phoneToSend || phoneInput;
    if (!targetPhone || targetPhone.trim().length < 8) {
      toast.error('Please enter customer mobile number');
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      await sendWhatsAppReceipt({
        shopDetails,
        billNumber,
        items: (items || []).map(i => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          uom: i.uom,
        })),
        total,
        subtotal,
        gstAmount,
        customerName,
        customerPhone: targetPhone,
        cashierName,
        paymentMode,
        changeAmount,
      });
      setWaSent(true);
    } catch (e: any) {
      toast.error(e.message || 'Failed to dispatch WhatsApp receipt');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const handleSendEmail = async (emailToSend?: string) => {
    const targetEmail = (emailToSend || emailInput || '').trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      toast.error('Please enter a valid customer email address');
      return;
    }

    setIsSendingEmail(true);
    try {
      await sendBillEmail({
        toEmail: targetEmail,
        customerName,
        customerPhone,
        billNumber,
        items: (items || []).map(i => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          uom: i.uom,
        })),
        total,
        subtotal,
        gstAmount,
        paymentMode,
        changeAmount,
        shopDetails,
      });
      setEmailSent(true);
    } catch (e: any) {
      // Toast already shown by sendBillEmail on error
    } finally {
      setIsSendingEmail(false);
    }
  };
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'F5' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onNewBill();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNewBill]);
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md rounded-xl overflow-hidden flex flex-col shadow-2xl"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          color: 'var(--ink)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--rule2)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--ok-soft)', border: '1px solid var(--ok-line)', color: 'var(--ok)' }}
            >
              <Check size={16} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ ...EYEBROW, color: 'var(--ok)' }}>Settled &middot; Sale Recorded</div>
              <h2 className="text-lg font-bold tracking-tight text-[var(--ink)]">
                Bill {billNumber}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors"
            style={{
              background: 'var(--sub)',
              border: '1px solid var(--border2)',
              color: 'var(--ink3)',
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div
            className="rounded-lg p-4 space-y-2.5"
            style={{
              background: 'var(--sub)',
              border: '1px solid var(--rule2)',
            }}
          >
            <div className="flex justify-between items-center text-xs">
              <span style={{ color: 'var(--ink2)' }}>Items Count</span>
              <span style={{ ...NUM, fontWeight: 600 }}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span style={{ color: 'var(--ink2)' }}>Payment Mode</span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'var(--rule)',
                  color: 'var(--ink)',
                }}
              >
                {paymentMode}
              </span>
            </div>

            <div
              className="flex justify-between items-baseline pt-2"
              style={{ borderTop: '1px solid var(--rule)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Amount Paid</span>
              <span style={{ ...NUM, fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
                {inr(total)}
              </span>
            </div>

            {changeAmount > 0 && (
              <div
                className="flex justify-between items-center p-3 rounded-md mt-2"
                style={{
                  background: 'var(--ok-soft)',
                  border: '1px solid var(--ok-line)',
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--ok)',
                  }}
                >
                  Change returned
                </span>
                <span style={{ ...NUM, fontSize: 18, fontWeight: 700, color: 'var(--ok)' }}>
                  {inr(changeAmount)}
                </span>
              </div>
            )}
          </div>

          {/* WhatsApp E-Bill Quick Send Box */}
          <div
            className="rounded-lg p-3.5 border transition-colors"
            style={{
              background: waSent ? 'var(--ok-soft)' : 'var(--sub)',
              borderColor: waSent ? 'var(--ok-line)' : 'var(--border2)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold flex items-center gap-1.5 text-[var(--ink)]">
                <span>💬</span>
                <span>{waSent ? 'Sent to Customer via Shop WhatsApp' : 'Send Digital Bill via WhatsApp'}</span>
              </span>
              {waSent && (
                <span className="text-[10px] font-bold uppercase text-[var(--ok)] font-mono">
                  ✓ Sent
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center flex-1 h-[38px] px-2.5 rounded-md border bg-[var(--panel)] border-[var(--border2)]">
                <span className="text-xs font-mono text-[var(--ink3)] font-bold pr-1.5 border-r border-[var(--border2)]">
                  +91
                </span>
                <input
                  type="tel"
                  placeholder="Customer 10-digit mobile"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  className="flex-1 bg-transparent px-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendWhatsApp(phoneInput);
                    }
                  }}
                />
              </div>
              <button
                type="button"
                disabled={isSendingWhatsApp || !phoneInput.trim()}
                onClick={() => handleSendWhatsApp(phoneInput)}
                className="h-[38px] px-3.5 rounded-md text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1 border-0 bg-[#25d366] text-black hover:bg-[#20ba59] transition-colors"
              >
                <span>{isSendingWhatsApp ? 'Sending…' : waSent ? 'Resend' : 'Send'}</span>
              </button>
            </div>
          </div>

          {/* Email E-Invoice Quick Send Box */}
          <div
            className="rounded-lg p-3.5 border transition-colors"
            style={{
              background: emailSent ? 'var(--ok-soft)' : 'var(--sub)',
              borderColor: emailSent ? 'var(--ok-line)' : 'var(--border2)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold flex items-center gap-1.5 text-[var(--ink)]">
                <Mail size={14} className={emailSent ? 'text-[var(--ok)]' : 'text-[var(--accent)]'} />
                <span>{emailSent ? 'Tax Invoice Sent via Store Email' : 'Email Tax Invoice & E-Bill'}</span>
              </span>
              {emailSent && (
                <span className="text-[10px] font-bold uppercase text-[var(--ok)] font-mono">
                  ✓ Dispatched
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center flex-1 h-[38px] px-2.5 rounded-md border bg-[var(--panel)] border-[var(--border2)]">
                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="flex-1 bg-transparent px-1 text-xs font-sans text-[var(--ink)] focus:outline-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendEmail(emailInput);
                    }
                  }}
                />
              </div>
              <button
                type="button"
                disabled={isSendingEmail || !emailInput.trim()}
                onClick={() => handleSendEmail(emailInput)}
                className="h-[38px] px-3.5 rounded-md text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1 border-0 bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
              >
                <span>{isSendingEmail ? 'Sending…' : emailSent ? 'Resend' : 'Send'}</span>
              </button>
            </div>
          </div>

          <div
            className="rounded-lg p-3 text-center text-xs leading-relaxed"
            style={{
              background: 'var(--panel)',
              border: '1px dashed var(--border2)',
              color: 'var(--ink3)',
              fontFamily: MONO,
            }}
          >
            Bill print output armed &middot; Press <strong className="text-[var(--ink)]">ESC</strong> or <strong className="text-[var(--ink)]">F5</strong> for next customer
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className="px-5 py-3.5 flex items-center justify-end gap-2.5"
          style={{
            background: 'var(--sub)',
            borderTop: '1px solid var(--rule2)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-md text-xs font-semibold cursor-pointer transition-colors"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border2)',
              color: 'var(--ink2)',
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={onNewBill}
            className="h-10 px-5 rounded-md text-xs font-bold cursor-pointer transition-opacity flex items-center gap-2 hover:opacity-90"
            style={{
              background: 'var(--ink)',
              color: 'var(--panel)',
              border: 0,
            }}
          >
            <span>New Bill</span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 5px',
                borderRadius: 4,
                background: 'var(--panel)',
                color: 'var(--ink)',
              }}
            >
              F5
            </span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
