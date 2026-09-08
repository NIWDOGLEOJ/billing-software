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
  /** Direct overall bill discount in rupees. */
  billDiscount?: number;
  /** Customer coupon discount in rupees. */
  couponDiscount?: number;
}

export interface BillTotals {
  /** Sum of price x quantity. GST-inclusive, because prices are MRP-inclusive. */
  subtotal: number;
  /** Ex-tax value the GST is reckoned on: subtotal with the tax extracted out. */
  taxableValue: number;
  totalGst: number;
  cgst: number;
  sgst: number;
  igst: number;
  exactTotal: number;
  roundedTotal: number;
  roundingAdjustment: number;
  amountReceivedNum: number;
  loyaltyDiscount: number;
  billDiscount: number;
  couponDiscount: number;
  finalTotal: number;
  changeAmount: number;
}


/**
 * Split a set of GST-inclusive lines into value and tax.
 *
 * Exported so the places that need a running total mid-sale (credit-limit
 * checks, suspending an order to a table) share one implementation. They each
 * used to carry their own copy of this loop, which is how they came to disagree
 * with the receipt.
 */
export function splitInclusiveGst(
  items: Array<{ price: number; quantity: number; gstRate: number }>,
  gstEnabled: boolean,
): { subtotal: number; taxableValue: number; totalGst: number } {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  if (!gstEnabled) return { subtotal, taxableValue: subtotal, totalGst: 0 };

  let taxableValue = 0;
  for (const i of items) {
    taxableValue += (i.price * i.quantity) / (1 + i.gstRate / 100);
  }
  return { subtotal, taxableValue, totalGst: subtotal - taxableValue };
}

export function computeBillTotals(input: BillTotalsInput): BillTotals {
  const {
    items, gstEnabled, isInterState, activeSector,
    roundingEnabled, paymentMode, amountReceived,
    redeemLoyalty, loyaltyPointsToRedeem, customerLoyaltyPoints, pointValue,
    billDiscount, couponDiscount,
  } = input;

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // GST is EXTRACTED from the price, not added on top.
  //
  // Prices in this catalogue are MRP-inclusive: the figure on the shelf edge is
  // what the customer hands over, so the tax is already inside it. Adding the
  // rate on top charged the customer the tax twice over -- Tata Gold Tea at
  // Rs.290/5% rang up as Rs.304.50 instead of Rs.290.00.
  //
  // Each line carries its own rate, because a grocery basket legitimately mixes
  // 0%, 5%, 12% and 18% lines and the rate-wise summary on the tax invoice has
  // to reconcile per rate.
  let taxableValue = 0;
  let totalGst = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (gstEnabled) {
    for (const item of items) {
      const lineInclusive = item.price * item.quantity;
      const lineTaxable = lineInclusive / (1 + item.gstRate / 100);
      taxableValue += lineTaxable;
      totalGst += lineInclusive - lineTaxable;
    }
    if (activeSector === 'wholesale' && isInterState) {
      igst = totalGst;
    } else {
      cgst = totalGst / 2;
      sgst = totalGst / 2;
    }
  } else {
    // No GST charged: the whole amount is simply the value of the goods.
    taxableValue = subtotal;
  }

  // The tax is already inside `subtotal`, so the customer owes exactly that.
  const exactTotal = subtotal;

  let roundedTotal = exactTotal;
  let roundingAdjustment = 0;
  if (roundingEnabled && (paymentMode === 'cash' || paymentMode === 'upi')) {
    roundedTotal = Math.round(exactTotal);
    roundingAdjustment = roundedTotal - exactTotal;
  }

  // Never redeem more value than the customer actually holds, and never exceed remaining payable.
  const billDiscountVal = Math.max(0, billDiscount || 0);
  const couponDiscountVal = Math.max(0, couponDiscount || 0);
  const remainingBeforeLoyalty = Math.max(0, roundedTotal - billDiscountVal - couponDiscountVal);

  const rawLoyaltyDiscount =
    (!redeemLoyalty || customerLoyaltyPoints === null || loyaltyPointsToRedeem <= 0)
      ? 0
      : Math.min(loyaltyPointsToRedeem * pointValue, customerLoyaltyPoints * pointValue);

  const loyaltyDiscount = Math.min(rawLoyaltyDiscount, remainingBeforeLoyalty);
  const totalDiscounts = loyaltyDiscount + billDiscountVal + couponDiscountVal;

  const amountReceivedNum = parseFloat(amountReceived) || 0;
  const finalTotal = Math.max(0, roundedTotal - totalDiscounts);
  const changeAmount = amountReceivedNum > finalTotal ? amountReceivedNum - finalTotal : 0;

  return {
    subtotal, taxableValue, totalGst, cgst, sgst, igst, exactTotal,
    roundedTotal, roundingAdjustment, amountReceivedNum,
    loyaltyDiscount, billDiscount: billDiscountVal, couponDiscount: couponDiscountVal,
    finalTotal, changeAmount,
  };
}
