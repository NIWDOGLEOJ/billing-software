import { Router, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Formats string to a fixed receipt width (e.g. 40 characters for 80mm thermal paper)
function padLine(left: string, right: string, width = 40): string {
  const leftClean = left.slice(0, Math.max(0, width - right.length - 1));
  const spaces = width - leftClean.length - right.length;
  return leftClean + ' '.repeat(Math.max(1, spaces)) + right;
}

function centerLine(text: string, width = 40): string {
  const clean = text.trim();
  if (clean.length >= width) return clean.slice(0, width);
  const left = Math.floor((width - clean.length) / 2);
  return ' '.repeat(left) + clean;
}

function divider(char = '-', width = 40): string {
  return char.repeat(width);
}

// POST /api/print/receipt/:billId
router.post('/receipt/:billId', authenticateToken, (req: AuthRequest, res: Response) => {
  const { billId } = req.params;

  try {
    // 1. Fetch bill details from SQLite
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId) as any;
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Fetch printer settings & store configuration
    const settingsRows = db.prepare('SELECT * FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of settingsRows) {
      settings[row.key] = row.value;
    }

    const items = JSON.parse(bill.items || '[]');
    const shopDetails = bill.shop_details ? JSON.parse(bill.shop_details) : {
      name: settings.shopName || 'Sunrise Provisions',
      address: settings.shopAddress || '14 Market Street, Fort, Mumbai 400 001',
      phone: settings.shopPhone || '+91 22 2266 1890'
    };

    const printerName = settings.receiptPrinterName || '';
    const autoOpenDrawer = settings.autoOpenDrawer === 'true';

    // 3. Format Receipt Content in Raw Text
    const w = 40; // 40-character line width for 80mm/72mm thermal printable
    let r = '';

    // ESC/POS commands
    const ESC = '\x1b';
    const GS = '\x1d';
    const DRAWER_KICK = `${ESC}p\x00\x19\xfa`; // ESC p 0 25 250 -> kick RJ11 drawer pin
    const CUT = `${GS}V\x41\x03`; // cut paper
    const REVERSE_ON = `${GS}B\x01`; // GS B 1 -> white on black reversed mode
    const REVERSE_OFF = `${GS}B\x00`;
    const BOLD_ON = `${ESC}\x45\x01`;
    const BOLD_OFF = `${ESC}\x45\x00`;

    // Add Cash Drawer open command if cash sale and enabled
    if (autoOpenDrawer && (bill.payment_mode || '').toLowerCase() === 'cash') {
      r += DRAWER_KICK;
    }

    // Centred store masthead
    r += `${centerLine(shopDetails.name.toUpperCase(), w)}\n`;
    if (shopDetails.address) {
      r += `${centerLine(shopDetails.address, w)}\n`;
    }
    if (shopDetails.phone) {
      r += `${centerLine(`Tel: ${shopDetails.phone}`, w)}\n`;
    }
    const storeGstin = shopDetails.gstin || settings.storeGstin;
    if (storeGstin) {
      r += `${centerLine(`GSTIN ${storeGstin}`, w)}\n`;
    }

    // TAX INVOICE rule band
    r += divider('-', w) + '\n';
    r += `${centerLine('TAX INVOICE', w)}\n`;
    r += divider('-', w) + '\n';

    // Bill metadata grid
    r += padLine('BILL', bill.bill_number, w) + '\n';
    r += padLine('DATE', new Date(bill.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }), w) + '\n';
    r += padLine('TILL', `T-02 · ${bill.cashier_name || 'Cashier'}`, w) + '\n';
    if (bill.customer_phone) {
      r += padLine('CUST', bill.customer_phone, w) + '\n';
    }
    if (bill.customer_gstin) {
      r += padLine('CUST GSTIN', bill.customer_gstin, w) + '\n';
    }
    r += divider('-', w) + '\n';

    // Item Table Header
    r += padLine('ITEM', 'AMOUNT', w) + '\n';
    r += divider('-', w) + '\n';

    // Items calculation (tax extracted from inclusive price)
    let totalUnits = 0;
    let computedTaxable = 0;
    let computedGst = 0;

    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      const lineTotal = qty * price;
      const rate = Number(item.gstRate ?? item.gst_rate ?? (bill.gst_enabled ? (bill.gst_rate || 18) : 0));
      const lineTaxable = bill.gst_enabled ? lineTotal / (1 + rate / 100) : lineTotal;

      totalUnits += qty;
      computedTaxable += lineTaxable;
      computedGst += lineTotal - lineTaxable;

      const calcLine = `${qty} x ${price.toFixed(2)}`;
      const taxLabel = bill.gst_enabled && rate > 0 ? `GST ${rate}%` : '';
      const amountStr = `₹${lineTotal.toFixed(2)}`;

      if (item.name.length + amountStr.length + 1 <= w) {
        r += padLine(item.name, amountStr, w) + '\n';
        r += padLine(`  ${calcLine}`, taxLabel, w) + '\n';
      } else {
        r += `${item.name}\n`;
        r += padLine(`  ${calcLine}`, amountStr, w) + '\n';
        if (taxLabel) {
          r += padLine('  ', taxLabel, w) + '\n';
        }
      }
    }
    r += divider('-', w) + '\n';

    // Item / unit counts
    r += padLine(`${items.length} ITEMS`, `${totalUnits} UNITS`, w) + '\n';
    r += divider('-', w) + '\n';

    // Tax breakdown: Taxable value + extracted GST reconciling exactly with Total
    const taxableValue = bill.gst_enabled ? (bill.subtotal ? (bill.subtotal - (bill.gst_amount || 0)) : computedTaxable) : Number(bill.subtotal || 0);
    const isInterState = Boolean(bill.igst && Number(bill.igst) > 0);
    const cgstAmount = Number(bill.cgst !== undefined ? bill.cgst : (computedGst / 2));
    const sgstAmount = Number(bill.sgst !== undefined ? bill.sgst : (computedGst / 2));
    const igstAmount = Number(bill.igst !== undefined ? bill.igst : computedGst);

    r += padLine('Taxable value', taxableValue.toFixed(2), w) + '\n';
    if (bill.gst_enabled) {
      if (isInterState) {
        r += padLine('IGST', igstAmount.toFixed(2), w) + '\n';
      } else {
        r += padLine('CGST', cgstAmount.toFixed(2), w) + '\n';
        r += padLine('SGST', sgstAmount.toFixed(2), w) + '\n';
      }
    }

    const pointsRedeemed = Number(bill.points_redeemed || 0);
    if (pointsRedeemed > 0) {
      r += padLine('Loyalty Redeemed', `-₹${pointsRedeemed.toFixed(2)}`, w) + '\n';
    }

    if (bill.rounding_adjustment && Math.abs(Number(bill.rounding_adjustment)) >= 0.01) {
      const adj = Number(bill.rounding_adjustment);
      r += padLine('Rounding', `${adj > 0 ? '+' : ''}${adj.toFixed(2)}`, w) + '\n';
    }

    // Reversed TOTAL Block (white text on dark background in ESC/POS)
    r += divider('-', w) + '\n';
    r += `${REVERSE_ON}${BOLD_ON}${padLine('TOTAL', '₹' + Number(bill.total).toFixed(2), w)}${BOLD_OFF}${REVERSE_OFF}\n`;
    r += divider('-', w) + '\n';

    // Payment details
    const modeName = bill.payment_mode ? bill.payment_mode.charAt(0).toUpperCase() + bill.payment_mode.slice(1).toLowerCase() : 'Cash';
    if (bill.amount_received !== null && bill.amount_received !== undefined && Number(bill.amount_received) > 0) {
      r += padLine(`${modeName} tendered`, Number(bill.amount_received).toFixed(2), w) + '\n';
      r += padLine('Change given', Number(bill.change_amount || 0).toFixed(2), w) + '\n';
    } else {
      r += padLine('Paid via', modeName.toUpperCase(), w) + '\n';
    }

    // Loyalty and Ledger info
    if (bill.customer_phone) {
      const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(bill.customer_phone) as any;
      if (customer) {
        const earned = bill.points_earned || 0;
        const bal = customer.loyalty_points || 0;
        r += divider('-', w) + '\n';
        r += padLine('LOYALTY', `+${earned} earned · ${bal} balance`, w) + '\n';
        if ((customer.outstanding_balance || 0) > 0) {
          r += padLine('LEDGER BALANCE', `₹${Number(customer.outstanding_balance).toFixed(2)}`, w) + '\n';
        }
      }
    } else if (bill.points_earned > 0) {
      r += divider('-', w) + '\n';
      r += padLine('LOYALTY', `+${bill.points_earned} earned`, w) + '\n';
    }

    // Return terms & Footer (no emojis)
    r += '\n';
    r += `${centerLine('[QR: Scan to view or return this bill]', w)}\n`;
    r += `${centerLine('Exchange within 7 days with receipt', w)}\n`;
    r += `${centerLine('THANK YOU · VISIT AGAIN', w)}\n\n\n\n`;
    r += CUT;

    // 4. Print Execution (or write Mock output if printerName is empty)
    const receiptsDir = path.join(__dirname, '..', 'receipts');
    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true });
    }

    const tempFilePath = path.join(receiptsDir, `receipt_${billId}.txt`);

    // Strip ESC/POS codes for the readable .txt mock log file
    const readableText = r
      .replace(DRAWER_KICK, '[CASH DRAWER OPEN POP]\n')
      .replace(CUT, '[PAPER CUT]\n')
      .replace(new RegExp(REVERSE_ON, 'g'), '')
      .replace(new RegExp(REVERSE_OFF, 'g'), '')
      .replace(new RegExp(BOLD_ON, 'g'), '')
      .replace(new RegExp(BOLD_OFF, 'g'), '');

    fs.writeFileSync(tempFilePath, readableText, 'utf8');
    console.log(`Mock Receipt written locally to: ${tempFilePath}`);

    if (printerName) {
      // Execute local macOS/Linux print command line 'lp'
      const binFilePath = path.join(receiptsDir, `receipt_${billId}.bin`);
      fs.writeFileSync(binFilePath, r, 'binary');

      const cmd = `lp -d "${printerName}" "${binFilePath}"`;
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error(`[Print Error] lp print execution failed: ${stderr || error.message}`);
        } else {
          console.log(`[Print Success] Bill #${bill.bill_number} sent to printer "${printerName}"`);
        }
        try { fs.unlinkSync(binFilePath); } catch {}
      });
    }

    res.json({
      success: true,
      message: printerName ? `Sent to thermal printer "${printerName}"` : `Mock receipt generated locally`,
      receiptPath: tempFilePath
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
