import { Router } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db';
import { authenticateToken } from '../middleware/auth';
const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Formats string to a fixed receipt width (e.g. 40 characters for 80mm thermal paper)
function padLine(left, right, width = 40) {
    const leftClean = left.slice(0, width - right.length - 1);
    const spaces = width - leftClean.length - right.length;
    return leftClean + ' '.repeat(Math.max(1, spaces)) + right;
}
function divider(char = '-', width = 40) {
    return char.repeat(width);
}
// POST /api/print/receipt/:billId
router.post('/receipt/:billId', authenticateToken, (req, res) => {
    const { billId } = req.params;
    try {
        // 1. Fetch bill details from SQLite
        const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
        if (!bill) {
            return res.status(404).json({ error: 'Bill not found' });
        }
        const items = JSON.parse(bill.items || '[]');
        const shopDetails = bill.shop_details ? JSON.parse(bill.shop_details) : {
            name: 'RETAIL SUPERMARKET',
            address: '123 Main Street',
            phone: '(555) 123-4567'
        };
        // 2. Fetch printer settings
        const settingsRows = db.prepare('SELECT * FROM settings').all();
        const settings = {};
        for (const row of settingsRows) {
            settings[row.key] = row.value;
        }
        const printerName = settings.receiptPrinterName || '';
        const autoOpenDrawer = settings.autoOpenDrawer === 'true';
        // 3. Format Receipt Content in Raw Text
        const w = 40; // 40-character line width
        let r = '';
        // ESC/POS commands
        const ESC = '\x1b';
        const GS = '\x1d';
        const DRAWER_KICK = `${ESC}p\x00\x19\xfa`; // ESC p 0 25 250 -> kick RJ11 drawer pin
        const CUT = `${GS}V\x41\x03`; // cut paper
        // Add Cash Drawer open command if cash sale and enabled
        if (autoOpenDrawer && (bill.payment_mode || '').toLowerCase() === 'cash') {
            r += DRAWER_KICK;
        }
        // Header
        r += `${shopDetails.name.toUpperCase()}\n`;
        r += `${shopDetails.address}\n`;
        r += `Tel: ${shopDetails.phone}\n`;
        r += divider('=', w) + '\n';
        // Bill Meta
        r += `Bill #: ${bill.bill_number}\n`;
        r += `Date  : ${new Date(bill.date).toLocaleString()}\n`;
        r += `Cashier: ${bill.cashier_name || 'Cashier'}\n`;
        if (bill.customer_phone) {
            r += `Cust #: ${bill.customer_phone}\n`;
        }
        r += divider('-', w) + '\n';
        // Item Table Header
        r += padLine('Item Name', 'Qty x Price     Total', w) + '\n';
        r += divider('-', w) + '\n';
        // Items
        for (const item of items) {
            const nameLine = item.name;
            const calcLine = `${item.quantity} x ${Number(item.price).toFixed(2)}`;
            const totalLine = `₹${(item.quantity * item.price).toFixed(2)}`;
            r += `${nameLine}\n`;
            r += padLine(`  ${calcLine}`, totalLine, w) + '\n';
        }
        r += divider('-', w) + '\n';
        // Totals
        r += padLine('Subtotal', `₹${Number(bill.subtotal || 0).toFixed(2)}`, w) + '\n';
        if (bill.gst_enabled) {
            r += padLine(`CGST (${(Number(bill.gst_rate || 18) / 2)}%)`, `₹${Number(bill.cgst || 0).toFixed(2)}`, w) + '\n';
            r += padLine(`SGST (${(Number(bill.gst_rate || 18) / 2)}%)`, `₹${Number(bill.sgst || 0).toFixed(2)}`, w) + '\n';
            r += padLine('Total GST', `₹${Number(bill.gst_amount || 0).toFixed(2)}`, w) + '\n';
        }
        const pointsRedeemed = Number(bill.points_redeemed || 0);
        if (pointsRedeemed > 0) {
            r += padLine('Loyalty Redeemed', `-₹${pointsRedeemed.toFixed(2)}`, w) + '\n';
        }
        if (bill.rounding_adjustment !== 0) {
            r += padLine('Rounding', `${bill.rounding_adjustment > 0 ? '+' : ''}₹${Number(bill.rounding_adjustment).toFixed(2)}`, w) + '\n';
        }
        r += divider('=', w) + '\n';
        r += padLine('GRAND TOTAL', `₹${Number(bill.total).toFixed(2)}`, w) + '\n';
        r += divider('=', w) + '\n';
        // Payment details
        r += padLine('Payment Mode', (bill.payment_mode || 'cash').toUpperCase(), w) + '\n';
        if (bill.amount_received !== null && bill.amount_received !== undefined) {
            r += padLine('Received', `₹${Number(bill.amount_received).toFixed(2)}`, w) + '\n';
            r += padLine('Change Due', `₹${Number(bill.change_amount || 0).toFixed(2)}`, w) + '\n';
        }
        if (bill.customer_phone) {
            const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(bill.customer_phone);
            if (customer) {
                r += '\n';
                r += `⭐ Total Loyalty Points: ${customer.loyalty_points || 0}\n`;
                if (bill.points_earned > 0) {
                    r += `   Points Earned: +${bill.points_earned}\n`;
                }
                if ((customer.outstanding_balance || 0) > 0) {
                    r += `💳 Outstanding Ledger: ₹${Number(customer.outstanding_balance).toFixed(2)}\n`;
                }
            }
        }
        else if (bill.points_earned > 0) {
            r += '\n';
            r += `⭐ Points Earned this sale: ${bill.points_earned}\n`;
        }
        // Footer
        r += '\n';
        r += `THANK YOU FOR SHOPPING WITH US!\n`;
        r += `--- Please visit again ---\n\n\n\n`; // extra spaces for feed
        r += CUT;
        // 4. Print Execution (or write Mock output if printerName is empty)
        const receiptsDir = path.join(__dirname, '..', 'receipts');
        if (!fs.existsSync(receiptsDir)) {
            fs.mkdirSync(receiptsDir, { recursive: true });
        }
        const tempFilePath = path.join(receiptsDir, `receipt_${billId}.txt`);
        // Strip ESC/POS codes for the readable .txt mock log file
        const readableText = r
            .replace(DRAWER_KICK, '[CASH DRAWER OPEN POP]')
            .replace(CUT, '[PAPER CUT]\n');
        fs.writeFileSync(tempFilePath, readableText, 'utf8');
        console.log(`📝 Mock Receipt written locally to: ${tempFilePath}`);
        if (printerName) {
            // Execute local macOS/Linux print command line 'lp'
            // We write a clean binary copy including raw ESC codes to a temp file and send it
            const binFilePath = path.join(receiptsDir, `receipt_${billId}.bin`);
            fs.writeFileSync(binFilePath, r, 'binary');
            const cmd = `lp -d "${printerName}" "${binFilePath}"`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[Print Error] lp print execution failed: ${stderr || error.message}`);
                }
                else {
                    console.log(`[Print Success] Bill #${bill.bill_number} sent to printer "${printerName}"`);
                }
                // Cleanup binary print file after completion
                try {
                    fs.unlinkSync(binFilePath);
                }
                catch { }
            });
        }
        res.json({
            success: true,
            message: printerName ? `Sent to thermal printer "${printerName}"` : `Mock receipt generated locally`,
            receiptPath: tempFilePath
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
