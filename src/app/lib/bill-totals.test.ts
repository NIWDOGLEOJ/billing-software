import { describe, it, expect } from 'vitest';
import { computeBillTotals, BillTotalsInput } from './bill-totals';

/**
 * These cover the arithmetic a shop bills real customers on. If one of these
 * fails, someone is being charged the wrong amount.
 */

const base: BillTotalsInput = {
  items: [],
  gstEnabled: true,
  isInterState: false,
  activeSector: 'retail',
  roundingEnabled: true,
  paymentMode: 'cash',
  amountReceived: '',
  redeemLoyalty: false,
  loyaltyPointsToRedeem: 0,
  customerLoyaltyPoints: null,
  pointValue: 1,
};

const make = (over: Partial<BillTotalsInput> = {}) => computeBillTotals({ ...base, ...over });

describe('subtotal', () => {
  it('multiplies price by quantity across lines', () => {
    const t = make({ items: [
      { price: 50, quantity: 2, gstRate: 0 },
      { price: 12.5, quantity: 4, gstRate: 0 },
    ]});
    expect(t.subtotal).toBe(150);
  });

  it('is zero for an empty cart', () => {
    expect(make().subtotal).toBe(0);
    expect(make().finalTotal).toBe(0);
  });
});

describe('GST', () => {
  it('splits tax evenly into CGST and SGST for an intra-state sale', () => {
    const t = make({ items: [{ price: 100, quantity: 1, gstRate: 18 }] });
    expect(t.totalGst).toBeCloseTo(18, 10);
    expect(t.cgst).toBeCloseTo(9, 10);
    expect(t.sgst).toBeCloseTo(9, 10);
    expect(t.igst).toBe(0);
  });

  it('applies per-item GST rates rather than one blanket rate', () => {
    const t = make({ items: [
      { price: 100, quantity: 1, gstRate: 5 },   // 5
      { price: 100, quantity: 1, gstRate: 12 },  // 12
      { price: 100, quantity: 1, gstRate: 0 },   // 0
    ]});
    expect(t.totalGst).toBeCloseTo(17, 10);
    expect(t.subtotal).toBe(300);
    expect(t.exactTotal).toBeCloseTo(317, 10);
  });

  it('charges IGST instead of CGST+SGST on inter-state wholesale', () => {
    const t = make({
      activeSector: 'wholesale',
      isInterState: true,
      items: [{ price: 1000, quantity: 1, gstRate: 18 }],
    });
    expect(t.igst).toBeCloseTo(180, 10);
    expect(t.cgst).toBe(0);
    expect(t.sgst).toBe(0);
    // The customer pays the same either way — only the split differs.
    expect(t.exactTotal).toBeCloseTo(1180, 10);
  });

  it('stays intra-state for retail even when the customer is out of state', () => {
    const t = make({ activeSector: 'retail', isInterState: true, items: [{ price: 100, quantity: 1, gstRate: 18 }] });
    expect(t.igst).toBe(0);
    expect(t.cgst).toBeCloseTo(9, 10);
  });

  it('charges no tax when GST is switched off', () => {
    const t = make({ gstEnabled: false, items: [{ price: 100, quantity: 1, gstRate: 18 }] });
    expect(t.totalGst).toBe(0);
    expect(t.cgst).toBe(0);
    expect(t.exactTotal).toBe(100);
  });
});

describe('rounding', () => {
  it('rounds cash sales to the nearest rupee and records the adjustment', () => {
    const t = make({ paymentMode: 'cash', items: [{ price: 99.4, quantity: 1, gstRate: 0 }] });
    expect(t.roundedTotal).toBe(99);
    expect(t.roundingAdjustment).toBeCloseTo(-0.4, 10);
  });

  it('rounds up when the paise are above half', () => {
    const t = make({ paymentMode: 'upi', items: [{ price: 99.6, quantity: 1, gstRate: 0 }] });
    expect(t.roundedTotal).toBe(100);
    expect(t.roundingAdjustment).toBeCloseTo(0.4, 10);
  });

  it('does not round card sales', () => {
    const t = make({ paymentMode: 'card', items: [{ price: 99.4, quantity: 1, gstRate: 0 }] });
    expect(t.roundedTotal).toBeCloseTo(99.4, 10);
    expect(t.roundingAdjustment).toBe(0);
  });

  it('does not round when rounding is disabled', () => {
    const t = make({ roundingEnabled: false, items: [{ price: 99.4, quantity: 1, gstRate: 0 }] });
    expect(t.roundedTotal).toBeCloseTo(99.4, 10);
  });
});

describe('loyalty redemption', () => {
  it('never redeems more value than the customer holds', () => {
    const t = make({
      redeemLoyalty: true,
      loyaltyPointsToRedeem: 500,
      customerLoyaltyPoints: 30,   // only has 30
      pointValue: 1,
      items: [{ price: 200, quantity: 1, gstRate: 0 }],
    });
    expect(t.loyaltyDiscount).toBe(30);
    expect(t.finalTotal).toBe(170);
  });

  it('honours a point value above one rupee', () => {
    const t = make({
      redeemLoyalty: true,
      loyaltyPointsToRedeem: 10,
      customerLoyaltyPoints: 100,
      pointValue: 2.5,
      items: [{ price: 200, quantity: 1, gstRate: 0 }],
    });
    expect(t.loyaltyDiscount).toBe(25);
    expect(t.finalTotal).toBe(175);
  });

  it('applies nothing when redemption is off, even with points available', () => {
    const t = make({
      redeemLoyalty: false,
      loyaltyPointsToRedeem: 50,
      customerLoyaltyPoints: 100,
      items: [{ price: 200, quantity: 1, gstRate: 0 }],
    });
    expect(t.loyaltyDiscount).toBe(0);
    expect(t.finalTotal).toBe(200);
  });

  it('applies nothing for a walk-in customer', () => {
    const t = make({
      redeemLoyalty: true,
      loyaltyPointsToRedeem: 50,
      customerLoyaltyPoints: null,
      items: [{ price: 200, quantity: 1, gstRate: 0 }],
    });
    expect(t.loyaltyDiscount).toBe(0);
  });
});

describe('change due', () => {
  it('is the difference when the customer overpays', () => {
    const t = make({ amountReceived: '500', items: [{ price: 380, quantity: 1, gstRate: 0 }] });
    expect(t.changeAmount).toBe(120);
  });

  it('is zero when the customer pays exactly or short — never negative', () => {
    expect(make({ amountReceived: '380', items: [{ price: 380, quantity: 1, gstRate: 0 }] }).changeAmount).toBe(0);
    expect(make({ amountReceived: '100', items: [{ price: 380, quantity: 1, gstRate: 0 }] }).changeAmount).toBe(0);
  });

  it('treats an empty or junk amount box as nothing received', () => {
    expect(make({ amountReceived: '', items: [{ price: 380, quantity: 1, gstRate: 0 }] }).amountReceivedNum).toBe(0);
    expect(make({ amountReceived: 'abc', items: [{ price: 380, quantity: 1, gstRate: 0 }] }).amountReceivedNum).toBe(0);
  });

  it('gives change against the discounted total, not the pre-discount one', () => {
    const t = make({
      amountReceived: '200',
      redeemLoyalty: true,
      loyaltyPointsToRedeem: 50,
      customerLoyaltyPoints: 50,
      items: [{ price: 200, quantity: 1, gstRate: 0 }],
    });
    expect(t.finalTotal).toBe(150);
    expect(t.changeAmount).toBe(50);
  });
});

describe('a realistic basket end to end', () => {
  it('adds up the way a cashier would on paper', () => {
    const t = make({
      paymentMode: 'cash',
      amountReceived: '500',
      items: [
        { price: 45.5, quantity: 2, gstRate: 5 },   // 91.00 + 4.55
        { price: 120, quantity: 1, gstRate: 12 },   // 120.00 + 14.40
        { price: 30, quantity: 3, gstRate: 0 },     // 90.00 + 0
      ],
    });
    expect(t.subtotal).toBeCloseTo(301, 10);
    expect(t.totalGst).toBeCloseTo(18.95, 10);
    expect(t.exactTotal).toBeCloseTo(319.95, 10);
    expect(t.roundedTotal).toBe(320);
    expect(t.cgst).toBeCloseTo(9.475, 10);
    expect(t.sgst).toBeCloseTo(9.475, 10);
    expect(t.changeAmount).toBe(180);
  });
});
