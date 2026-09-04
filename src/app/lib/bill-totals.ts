/**
 * Pure checkout arithmetic.
 *
 * Extracted from cashier-billing-advanced.tsx so the numbers a shop bills real
 * customers on can be tested without mounting a 4,500-line component. The
 * component holds the React state; this file decides what the customer owes.
 */

export interface BillTotalsInput {
  items: Array<{ price: number; quantity: number; gstRate: number }>;
  gstEnabled: boolean;
  /** Inter-state wholesale sales attract IGST instead of CGST+SGST. */
  isInterState: boolean;
  activeSector: string;
  /** Cash and UPI are rounded to the nearest rupee. */
  roundingEnabled: boolean;
  paymentMode: string;
  /** Raw text from the "amount received" box. */
  amountReceived: string;
  redeemLoyalty: boolean;
  loyaltyPointsToRedeem: number;
  /** Points the customer actually holds; null when there's no customer. */
  customerLoyaltyPoints: number | null;
  /** Rupee value of one loyalty point. */
  pointValue: number;
}

export interface BillTotals {
  subtotal: number;
  totalGst: number;
  cgst: number;
  sgst: number;
  igst: number;
  exactTotal: number;
  roundedTotal: number;
  roundingAdjustment: number;
  amountReceivedNum: number;
  loyaltyDiscount: number;
  finalTotal: number;
  changeAmount: number;
}

export function computeBillTotals(input: BillTotalsInput): BillTotals {
  const {
    items, gstEnabled, isInterState, activeSector,
    roundingEnabled, paymentMode, amountReceived,
    redeemLoyalty, loyaltyPointsToRedeem, customerLoyaltyPoints, pointValue,
  } = input;

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  let totalGst = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (gstEnabled) {
    for (const item of items) {
      totalGst += (item.price * item.quantity * item.gstRate) / 100;
    }
    if (activeSector === 'wholesale' && isInterState) {
      igst = totalGst;
    } else {
      cgst = totalGst / 2;
      sgst = totalGst / 2;
    }
  }

  const exactTotal = subtotal + totalGst;

  let roundedTotal = exactTotal;
  let roundingAdjustment = 0;
  if (roundingEnabled && (paymentMode === 'cash' || paymentMode === 'upi')) {
    roundedTotal = Math.round(exactTotal);
    roundingAdjustment = roundedTotal - exactTotal;
  }

  // Never redeem more value than the customer actually holds.
  const loyaltyDiscount =
    (!redeemLoyalty || customerLoyaltyPoints === null || loyaltyPointsToRedeem <= 0)
      ? 0
      : Math.min(loyaltyPointsToRedeem * pointValue, customerLoyaltyPoints * pointValue);

  const amountReceivedNum = parseFloat(amountReceived) || 0;
  const finalTotal = roundedTotal - loyaltyDiscount;
  const changeAmount = amountReceivedNum > finalTotal ? amountReceivedNum - finalTotal : 0;

  return {
    subtotal, totalGst, cgst, sgst, igst, exactTotal,
    roundedTotal, roundingAdjustment, amountReceivedNum,
    loyaltyDiscount, finalTotal, changeAmount,
  };
}
