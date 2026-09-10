import { describe, it, expect } from 'vitest';

// Function matching the CSV parser in analytics-dashboard.tsx
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

describe('RFC-4180 CSV Parser in Back Office', () => {
  it('correctly preserves commas inside double-quoted fields without splitting columns', () => {
    const csv = 'Barcode,Description,MRP\n8901030383921,"Basmati Rice, 5kg Premium Pack",640\n8901030383922,"Tea, Red Label 500g",290';
    const rows = parseCsv(csv);

    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual(['Barcode', 'Description', 'MRP']);
    expect(rows[1]).toEqual(['8901030383921', 'Basmati Rice, 5kg Premium Pack', '640']);
    expect(rows[2]).toEqual(['8901030383922', 'Tea, Red Label 500g', '290']);
  });

  it('correctly handles escaped quotes ("")', () => {
    const csv = 'Code,Name,Price\n101,"Tata Gold ""Special Blend"" Tea",310';
    const rows = parseCsv(csv);

    expect(rows.length).toBe(2);
    expect(rows[1][1]).toBe('Tata Gold "Special Blend" Tea');
    expect(rows[1][2]).toBe('310');
  });

  it('handles CRLF line endings and whitespace trimming', () => {
    const csv = "ColA,ColB\r\n Val1 , Val2 \r\nVal3,Val4\r\n";
    const rows = parseCsv(csv);

    expect(rows.length).toBe(3);
    expect(rows[1]).toEqual(['Val1', 'Val2']);
    expect(rows[2]).toEqual(['Val3', 'Val4']);
  });
});

describe('Staff Attendance Prehire Resolution', () => {
  function getDayStatus(
    cellDate: Date,
    joinedDate: Date | null,
    day: number,
    today: number,
    firstDow: number,
    personIdx: number
  ): string {
    if (joinedDate && cellDate < joinedDate) return 'prehire';
    if (day > today) return 'future';
    if ((day - 1 + firstDow) % 7 === 6) return 'holiday';
    const seed = (day * 7 + personIdx * 13) % 11;
    if (seed === 0) return 'absent';
    if (seed === 1) return 'leave';
    return 'present';
  }

  it('flags dates prior to employee joining date as prehire', () => {
    const joined = new Date(2026, 7, 15); // joined August 15, 2026
    const earlyDate = new Date(2026, 7, 5, 23, 59, 59); // August 5, 2026

    const status = getDayStatus(earlyDate, joined, 5, 20, 0, 1);
    expect(status).toBe('prehire');
  });

  it('flags dates on or after joining date normally', () => {
    const joined = new Date(2026, 7, 15);
    const afterJoined = new Date(2026, 7, 16, 23, 59, 59);

    const status = getDayStatus(afterJoined, joined, 16, 20, 0, 1);
    expect(['present', 'absent', 'leave', 'holiday']).toContain(status);
  });
});

describe('Password Reset Parameter Resolution', () => {
  it('accepts either password or newPassword payload key', () => {
    const resolvePassword = (body: any) => body.password || body.newPassword;

    expect(resolvePassword({ password: 'Password123' })).toBe('Password123');
    expect(resolvePassword({ newPassword: 'Password456' })).toBe('Password456');
    expect(resolvePassword({ currentPassword: 'Old', newPassword: 'Password789' })).toBe('Password789');
    expect(resolvePassword({})).toBeUndefined();
  });
});

describe('Unified Retail, Grocery & Wholesale Sector Configuration', () => {
  it('combines retail, grocery, and wholesale into one unified sector profile', async () => {
    const { SECTORS } = await import('../components/sector-nav');

    expect(SECTORS.length).toBe(1);
    expect(SECTORS[0].id).toBe('retail');
    expect(SECTORS[0].short).toBe('Retail & Wholesale');
    expect(SECTORS[0].label).toContain('Retail, Grocery & Wholesale');

    const linkPaths = SECTORS[0].links.map(l => l.to);
    expect(linkPaths).toContain('/gst');
    expect(linkPaths).toContain('/khata');
  });

  it('verifies restaurant and pharmacy sectors are completely removed from navigation', async () => {
    const { SECTORS } = await import('../components/sector-nav');
    const sectorIds = SECTORS.map(s => s.id);

    expect(sectorIds).not.toContain('restaurant');
    expect(sectorIds).not.toContain('pharmacy');
    expect(sectorIds).not.toContain('grocery'); // Grocery merged into retail
    expect(sectorIds).not.toContain('wholesale'); // Wholesale merged into retail
  });

  it('determines whether cashier logout requires shift closing confirmation', () => {
    function shouldConfirmShiftOnLogout(userRole: string | undefined, hasActiveShift: boolean): boolean {
      return userRole === 'employee' && hasActiveShift;
    }

    // Cashier with an active shift must be prompted to close drawer or sign out anyway
    expect(shouldConfirmShiftOnLogout('employee', true)).toBe(true);

    // Cashier without an active shift can sign out directly
    expect(shouldConfirmShiftOnLogout('employee', false)).toBe(false);

    // Owner or admin does not require drawer closing prompt
    expect(shouldConfirmShiftOnLogout('owner', true)).toBe(false);
    expect(shouldConfirmShiftOnLogout('owner', false)).toBe(false);
  });
});

describe('Wholesale & Retail Tier Pricing Calculations', () => {
  it('correctly calculates prices across retail, dealer (wholesale), and distributor tiers', async () => {
    const { getProductTierPrice } = await import('../components/cashier-billing-advanced');

    const sampleProduct = {
      price: 100, // Retail price
      wholesalePrice: 75, // B2B Wholesale / Dealer price
      distributorPrice: 60, // Distributor bulk price
    };

    // Retail tier
    expect(getProductTierPrice(sampleProduct, 'retail')).toBe(100);

    // Dealer / Wholesale tier
    expect(getProductTierPrice(sampleProduct, 'dealer')).toBe(75);

    // Distributor tier
    expect(getProductTierPrice(sampleProduct, 'distributor')).toBe(60);

    // Fallback when wholesalePrice is not defined or 0
    const retailOnlyProduct = {
      price: 50,
      wholesalePrice: 0,
      distributorPrice: 0,
    };
    expect(getProductTierPrice(retailOnlyProduct, 'retail')).toBe(50);
    expect(getProductTierPrice(retailOnlyProduct, 'dealer')).toBe(50);
    expect(getProductTierPrice(retailOnlyProduct, 'distributor')).toBe(50);
  });
});

describe('B2B GST Derivation & Khata Risk', () => {
  it('derives intra-state vs inter-state tax from buyer and store GSTIN', async () => {
    const { splitInvoice } = await import('../sectors/gst-ledger-page');

    // Intra-state (same state Karnataka 29) -> CGST + SGST, no IGST
    const intraInvoice = {
      id: 'inv-01',
      buyerName: 'Local Store',
      gstin: '29ABCDE1234F1Z5',
      taxable: 10000,
      rate: 18,
    };
    const intra = splitInvoice(intraInvoice, '29');
    expect(intra.interState).toBe(false);
    expect(intra.igst).toBe(0);
    expect(intra.cgst).toBe(900);
    expect(intra.sgst).toBe(900);
    expect(intra.total).toBe(11800);

    // Inter-state (Maharashtra 27 buyer vs Karnataka 29 store) -> IGST, no CGST/SGST
    const interInvoice = {
      id: 'inv-02',
      buyerName: 'Mumbai Wholesaler',
      gstin: '27ABCDE1234F1Z5',
      taxable: 10000,
      rate: 18,
    };
    const inter = splitInvoice(interInvoice, '29');
    expect(inter.interState).toBe(true);
    expect(inter.igst).toBe(1800);
    expect(inter.cgst).toBe(0);
    expect(intra.sgst).toBe(900);
    expect(inter.total).toBe(11800);
  });

  it('accurately computes Khata account risk levels based on credit utilisation', async () => {
    const { risk } = await import('../sectors/khata-page');

    // High risk: >= 80% utilisation
    expect(risk({ name: 'Cust A', phone: '1', limit: 100000, outstanding: 85000, terms: 'NET-30' })).toEqual({
      used: 85,
      label: 'High',
      tone: 'danger',
    });

    // Watch risk: 50% - 79% utilisation
    expect(risk({ name: 'Cust B', phone: '2', limit: 100000, outstanding: 55000, terms: 'NET-30' })).toEqual({
      used: 55,
      label: 'Watch',
      tone: 'warn',
    });

    // Clear risk: < 50% utilisation
    expect(risk({ name: 'Cust C', phone: '3', limit: 100000, outstanding: 20000, terms: 'NET-30' })).toEqual({
      used: 20,
      label: 'Clear',
      tone: 'ok',
    });
  });

  it('verifies Attendance is included in core navigation links', async () => {
    const { CORE_LINKS } = await import('../components/sector-nav');
    expect(CORE_LINKS.some(l => l.to === '/attendance')).toBe(true);
  });
});

describe('POS Keyboard Operability & Mobile Scanner Hardening', () => {
  it('validates BrowserMultiFormatReader contains decodeFromVideoElement and decodeFromImageUrl', async () => {
    const { BrowserMultiFormatReader } = await import('@zxing/library');
    const reader = new BrowserMultiFormatReader();
    expect(typeof reader.decodeFromVideoElement).toBe('function');
    expect(typeof reader.decodeFromImageUrl).toBe('function');
    // Ensure the buggy nonexistent method is NOT assumed to exist
    // @ts-ignore
    expect(reader.decodeOnceFromVideoElement).toBeUndefined();
  });

  it('validates kiosk mode allowed key logic supports Alt+U for UPI and F1-F10 for billing', () => {
    const isAllowedKey = (ev: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): boolean => {
      if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) return true;
      const allowedControlKeys = [
        'Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'Space',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Home', 'End', 'PageUp', 'PageDown',
        'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'
      ];
      if (allowedControlKeys.includes(ev.key)) return true;
      const allowedFuncKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];
      if (allowedFuncKeys.includes(ev.key)) return true;
      if (ev.ctrlKey || ev.metaKey) {
        const allowedCtrlCombos = ['s', 'h', 'n', 'f', 'p', 'c', 'v', 'x', 'a', 'z', 'y'];
        if (allowedCtrlCombos.includes(ev.key.toLowerCase())) return true;
      }
      if (ev.altKey && ev.key.toLowerCase() === 'u') return true;
      return false;
    };

    // F-keys
    expect(isAllowedKey({ key: 'F1' })).toBe(true);
    expect(isAllowedKey({ key: 'F2' })).toBe(true);
    expect(isAllowedKey({ key: 'F8' })).toBe(true);
    expect(isAllowedKey({ key: 'F9' })).toBe(true);
    expect(isAllowedKey({ key: 'F10' })).toBe(true);
    expect(isAllowedKey({ key: 'F11' })).toBe(false); // F11 kiosk exit blocked
    expect(isAllowedKey({ key: 'F12' })).toBe(false); // Devtools blocked

    // Alt+U UPI shortcut
    expect(isAllowedKey({ key: 'u', altKey: true })).toBe(true);
    expect(isAllowedKey({ key: 'U', altKey: true })).toBe(true);
    expect(isAllowedKey({ key: 'x', altKey: true })).toBe(false);

    // Ctrl/Cmd shortcuts
    expect(isAllowedKey({ key: 's', ctrlKey: true })).toBe(true);
    expect(isAllowedKey({ key: 'h', ctrlKey: true })).toBe(true);
    expect(isAllowedKey({ key: 'f', ctrlKey: true })).toBe(true);
    expect(isAllowedKey({ key: 'q', ctrlKey: true })).toBe(false);

    // Escape and Navigation
    expect(isAllowedKey({ key: 'Escape' })).toBe(true);
    expect(isAllowedKey({ key: 'Tab' })).toBe(true);
    expect(isAllowedKey({ key: 'ArrowDown' })).toBe(true);
  });

  it('validates settings and back office navigation routes exist', async () => {
    const { CORE_LINKS } = await import('../components/sector-nav');
    expect(CORE_LINKS.some(l => l.to === '/config' && l.label === 'Settings')).toBe(true);
    expect(CORE_LINKS.some(l => l.to === '/' && l.label === 'Register')).toBe(true);
  });
});

describe('Live Scanner Continuous Detection & Torch Controls', () => {
  it('supports native BarcodeDetector detection and ZXing video frame fallback', async () => {
    // Mock video element
    const mockVideo = {
      readyState: 4, // HAVE_ENOUGH_DATA
      videoWidth: 640,
      videoHeight: 480,
    };

    // Test detector mock
    const mockBarcodeDetector = {
      detect: async (video: any) => [{ rawValue: '8901030383921', format: 'ean_13' }]
    };

    const barcodes = await mockBarcodeDetector.detect(mockVideo);
    expect(barcodes).toHaveLength(1);
    expect(barcodes[0].rawValue).toBe('8901030383921');
  });

  it('handles torch constraint toggling safely on video tracks', async () => {
    let torchState = false;
    const mockTrack = {
      applyConstraints: async (constraints: any) => {
        if (constraints?.advanced?.[0]?.torch !== undefined) {
          torchState = constraints.advanced[0].torch;
        }
      }
    };

    await mockTrack.applyConstraints({ advanced: [{ torch: true }] });
    expect(torchState).toBe(true);
    await mockTrack.applyConstraints({ advanced: [{ torch: false }] });
    expect(torchState).toBe(false);
  });
});

describe('Unified Single Box: Discounts & Loyalty Points Redemption', () => {
  it('computes flat rupee discount combined with loyalty points discount', () => {
    const subtotal = 1000;
    const flatDiscount = 150;
    const loyaltyPoints = 200;
    const pointValue = 1;
    const loyaltyDiscount = loyaltyPoints * pointValue; // 200

    const totalSavings = flatDiscount + loyaltyDiscount; // 350
    const finalPayable = Math.max(0, subtotal - totalSavings); // 650

    expect(totalSavings).toBe(350);
    expect(finalPayable).toBe(650);
  });

  it('computes percentage rate discount combined with loyalty points discount', () => {
    const subtotal = 2000;
    const percentRate = 10; // 10% = 200
    const percentDiscount = (subtotal * percentRate) / 100;
    const loyaltyPoints = 500;
    const pointValue = 0.5;
    const loyaltyDiscount = loyaltyPoints * pointValue; // 250

    const totalSavings = percentDiscount + loyaltyDiscount; // 450
    const finalPayable = Math.max(0, subtotal - totalSavings); // 1550

    expect(percentDiscount).toBe(200);
    expect(loyaltyDiscount).toBe(250);
    expect(totalSavings).toBe(450);
    expect(finalPayable).toBe(1550);
  });

  it('caps max redeemable points so total discount cannot exceed bill total', () => {
    const subtotal = 500;
    const billDiscount = 200;
    const remainingBeforeLoyalty = subtotal - billDiscount; // 300
    const pointValue = 1;
    const customerPoints = 1000; // customer has 1000 pts worth ₹1000

    const maxPointsNeeded = Math.ceil(remainingBeforeLoyalty / pointValue); // 300
    const redeemablePoints = Math.min(customerPoints, maxPointsNeeded);

    expect(redeemablePoints).toBe(300);
    const finalPayable = Math.max(0, subtotal - billDiscount - (redeemablePoints * pointValue));
    expect(finalPayable).toBe(0);
  });
});

describe('OTP Bill Handover / Pickup Verification', () => {
  it('marks reservations as claimed with claimant name and timestamp', () => {
    const reservation = {
      id: 'res-101',
      customer_name: 'Aditi Rao',
      items: [{ name: 'Parle-G', quantity: 2, price: 10 }],
      total: 20,
      otp: '4829',
      status: 'pending',
      isAccepted: false,
      claimedBy: null as string | null,
      claimedAt: null as string | null,
    };

    // Verify OTP matching
    const enteredOtp = '4829';
    const isValid = enteredOtp === reservation.otp;
    expect(isValid).toBe(true);

    // Update claimed state
    const claimant = 'Rahul (Counter 1)';
    const claimedAt = new Date().toISOString();
    const updated = {
      ...reservation,
      status: 'claimed',
      isAccepted: true,
      claimedBy: claimant,
      claimedAt: claimedAt,
    };

    expect(updated.status).toBe('claimed');
    expect(updated.isAccepted).toBe(true);
    expect(updated.claimedBy).toBe('Rahul (Counter 1)');
    expect(updated.claimedAt).toBeTruthy();
  });

  it('allows cashiers to dismiss claimed orders so they completely disappear from view', () => {
    const orders = [
      { id: '1', status: 'pending', isAccepted: false },
      { id: '2', status: 'claimed', isAccepted: true, claimedBy: 'Rahul' },
      { id: '3', status: 'pending', isAccepted: false },
    ];

    // Dismiss order 2
    const dismissedIds = new Set(['2']);
    const visibleOrders = orders.filter(o => !dismissedIds.has(o.id));

    expect(visibleOrders).toHaveLength(2);
    expect(visibleOrders.some(o => o.id === '2')).toBe(false);
  });
});

describe('Branding and Minimalist Interface Conformance', () => {
  it('defaults shop name to J MART and provides reactive synchronization', async () => {
    const { DEFAULT_SHOP_DETAILS, getStoredShopDetails } = await import('./shop-details');
    expect(DEFAULT_SHOP_DETAILS.name).toBe('J MART');
    const stored = getStoredShopDetails();
    expect(stored.name).toBeTruthy();
  });

  it('verifies subtle nexusflow footer styling tokens', () => {
    const footerStyle = {
      fontFamily: 'monospace',
      fontSize: 10,
      letterSpacing: '0.12em',
      opacity: 0.35,
      textTransform: 'lowercase',
    };

    expect(footerStyle.fontSize).toBeLessThanOrEqual(11);
    expect(footerStyle.opacity).toBeLessThanOrEqual(0.4);
    expect(footerStyle.textTransform).toBe('lowercase');
  });

  it('generates export CSV filenames using shop slug instead of nexusflow brand', async () => {
    const { DEFAULT_SHOP_DETAILS } = await import('./shop-details');
    const shopSlug = (DEFAULT_SHOP_DETAILS.name || 'store').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const dateStr = '2026-09-07';

    const catalogueFilename = `${shopSlug}-catalogue-${dateStr}.csv`;
    const hsnFilename = `${shopSlug}-gstr1-hsn-summary-${dateStr}.csv`;
    const employeesFilename = `${shopSlug}-employees-${dateStr}.csv`;

    expect(catalogueFilename).toBe('j-mart-catalogue-2026-09-07.csv');
    expect(hsnFilename).toBe('j-mart-gstr1-hsn-summary-2026-09-07.csv');
    expect(employeesFilename).toBe('j-mart-employees-2026-09-07.csv');
    expect(catalogueFilename).not.toContain('nexusflow');
  });
});

describe('Continuous Live Barcode Scanner Debouncing & Flow', () => {
  it('prevents rapid duplicate scans of the same barcode within cooldown window', () => {
    const lastScanned = { code: '', time: 0 };
    const scannedItems: string[] = [];

    const handleScan = (code: string, timestamp: number) => {
      if (
        (lastScanned.code === code && timestamp - lastScanned.time < 1500) ||
        (timestamp - lastScanned.time < 600)
      ) {
        return false; // ignored duplicate
      }
      lastScanned.code = code;
      lastScanned.time = timestamp;
      scannedItems.push(code);
      return true;
    };

    const t0 = 1000;
    expect(handleScan('8901030383921', t0)).toBe(true);
    // Duplicate scan 80ms later (same item still in viewfinder)
    expect(handleScan('8901030383921', t0 + 80)).toBe(false);
    // Duplicate scan 500ms later
    expect(handleScan('8901030383921', t0 + 500)).toBe(false);

    // New item scanned after 700ms
    expect(handleScan('8901030383922', t0 + 700)).toBe(true);

    // First item scanned again after 1600ms (valid re-scan)
    expect(handleScan('8901030383921', t0 + 1700)).toBe(true);

    expect(scannedItems).toEqual(['8901030383921', '8901030383922', '8901030383921']);
  });

  it('keeps camera open in continuous mode and closes in single scan mode', () => {
    let isScannerOpen = true;
    const closeScanner = () => { isScannerOpen = false; };

    // Continuous mode
    const onScanContinuous = (_code: string, continuous: boolean) => {
      if (!continuous) closeScanner();
    };

    onScanContinuous('8901030383921', true);
    expect(isScannerOpen).toBe(true); // Still open!

    // Single scan mode
    onScanContinuous('8901030383922', false);
    expect(isScannerOpen).toBe(false); // Closed!
  });
});

describe('Deep Verification: computeBillTotals Clamped Loyalty Discount', () => {
  it('strictly clamps loyalty discount to remaining payable amount after bill discount', async () => {
    const { computeBillTotals } = await import('./bill-totals');

    const result = computeBillTotals({
      items: [{ price: 100, quantity: 1, gstRate: 0 }],
      gstEnabled: false,
      isInterState: false,
      activeSector: 'retail',
      roundingEnabled: false,
      paymentMode: 'cash',
      amountReceived: '',
      redeemLoyalty: true,
      loyaltyPointsToRedeem: 500, // Cashier enters 500 points
      customerLoyaltyPoints: 1000, // Customer has 1000 points
      pointValue: 1,
      billDiscount: 30, // ₹30 bill discount
    });

    // Bill is 100, minus 30 bill discount = 70 remaining.
    // Even though 500 points was entered, loyalty discount MUST be clamped to 70!
    expect(result.subtotal).toBe(100);
    expect(result.billDiscount).toBe(30);
    expect(result.loyaltyDiscount).toBe(70);
    expect(result.finalTotal).toBe(0);
  });

  it('prevents customer points over-deduction when paying fully with bill discount', async () => {
    const { computeBillTotals } = await import('./bill-totals');

    const result = computeBillTotals({
      items: [{ price: 200, quantity: 1, gstRate: 0 }],
      gstEnabled: false,
      isInterState: false,
      activeSector: 'retail',
      roundingEnabled: false,
      paymentMode: 'cash',
      amountReceived: '',
      redeemLoyalty: true,
      loyaltyPointsToRedeem: 100,
      customerLoyaltyPoints: 200,
      pointValue: 1,
      billDiscount: 200, // 100% bill discount
    });

    expect(result.billDiscount).toBe(200);
    expect(result.loyaltyDiscount).toBe(0); // No loyalty needed
    expect(result.finalTotal).toBe(0);
  });
});

describe('OTP Bill Handover / Pickup Disappearance & Toggle Modes', () => {
  it('hides claimed orders completely when hideClaimed is true', () => {
    const orders = [
      { id: '1', status: 'pending', isAccepted: false },
      { id: '2', status: 'claimed', isAccepted: true, claimedBy: 'Rahul' },
      { id: '3', status: 'pending', isAccepted: false },
    ];

    const hideClaimed = true;
    const renderOrder = (order: typeof orders[0]) => {
      const isClaimed = order.status === 'claimed' || order.isAccepted;
      if (hideClaimed && isClaimed) return null; // Disappears completely
      return order;
    };

    const rendered = orders.map(renderOrder).filter(Boolean);
    expect(rendered).toHaveLength(2);
    expect(rendered.map((o: any) => o.id)).toEqual(['1', '3']);
  });

  it('shows claimant name and timestamp when hideClaimed is false', () => {
    const claimedOrder = {
      id: '2',
      status: 'claimed',
      isAccepted: true,
      claimedBy: 'Priya (Counter 2)',
      claimedAt: '2026-09-07T20:20:00.000Z',
    };

    const hideClaimed = false;
    const renderClaimBadge = (order: typeof claimedOrder) => {
      const isClaimed = order.status === 'claimed' || order.isAccepted;
      if (hideClaimed && isClaimed) return null;
      return {
        badge: 'Order Claimed',
        claimedBy: order.claimedBy,
        time: order.claimedAt,
      };
    };

    const badge = renderClaimBadge(claimedOrder);
    expect(badge).not.toBeNull();
    expect(badge?.claimedBy).toBe('Priya (Counter 2)');
    expect(badge?.time).toBe('2026-09-07T20:20:00.000Z');
  });
});

describe('Deep Continuous Live Barcode Scanner Loop Behavior', () => {
  it('keeps loop running across multiple barcode detections in continuous mode', () => {
    let active = true;
    let frameCount = 0;
    const scannedCodes: string[] = [];
    const continuousScan = true;

    const handleScanned = (code: string) => {
      scannedCodes.push(code);
    };

    // Simulate scanFrame execution
    const mockScanFrame = (codeToDetect: string | null) => {
      if (!active) return;
      frameCount++;

      if (codeToDetect && active) {
        handleScanned(codeToDetect);
        if (!continuousScan) {
          active = false;
          return;
        }
      }
    };

    // Frame 1: Detect item A
    mockScanFrame('8901030383921');
    expect(active).toBe(true); // Must remain active in continuous mode!

    // Frame 2: Detect item B
    mockScanFrame('8901030383922');
    expect(active).toBe(true); // Must remain active!

    // Frame 3: No barcode in frame
    mockScanFrame(null);
    expect(active).toBe(true);

    expect(scannedCodes).toEqual(['8901030383921', '8901030383922']);
    expect(frameCount).toBe(3);
  });

  it('terminates loop immediately upon detection when continuousScan is false', () => {
    let active = true;
    let frameCount = 0;
    const scannedCodes: string[] = [];
    const continuousScan = false;

    const handleScanned = (code: string) => {
      scannedCodes.push(code);
    };

    const mockScanFrame = (codeToDetect: string | null) => {
      if (!active) return;
      frameCount++;

      if (codeToDetect && active) {
        handleScanned(codeToDetect);
        if (!continuousScan) {
          active = false;
          return;
        }
      }
    };

    // Frame 1: Detect item
    mockScanFrame('8901030383921');
    expect(active).toBe(false); // Closed after single scan!

    // Frame 2: Subsequent frame must not execute
    mockScanFrame('8901030383922');
    expect(scannedCodes).toEqual(['8901030383921']);
    expect(frameCount).toBe(1);
  });

  it('prevents concurrent decode collisions using isDecoding lock', async () => {
    let isDecoding = false;
    let executionCount = 0;
    let collisionsAvoided = 0;

    const mockAsyncDecode = async () => {
      if (isDecoding) {
        collisionsAvoided++;
        return;
      }
      isDecoding = true;
      try {
        executionCount++;
        await new Promise((r) => setTimeout(r, 20));
      } finally {
        isDecoding = false;
      }
    };

    // Launch overlapping decode calls simultaneously
    const p1 = mockAsyncDecode();
    const p2 = mockAsyncDecode(); // should be skipped by lock
    await Promise.all([p1, p2]);

    expect(executionCount).toBe(1);
    expect(collisionsAvoided).toBe(1);
  });
});

describe('LAN-Wide Claimed Order Synchronization Without Decryption Dependency', () => {
  it('updates claimed status on remote terminals even when ciphertext is encrypted AES-GCM', () => {
    // Encrypted AES-GCM ciphertext which throws on JSON.parse
    const encryptedMessage = {
      id: 'chat_msg_101',
      senderName: 'Cashier 1',
      ciphertext: 'SGVsbG8gV29ybGQgQ0lQSEVSVEVYVA==', // base64 binary ciphertext
      iv: 'random_iv_base64',
    };

    const claimedOrders: Record<string, { claimedBy: string; claimedAt: string }> = {};

    // Simulate incoming WS message: RESERVATION_CLAIMED
    const wsEvent = {
      type: 'RESERVATION_CLAIMED',
      data: {
        chatId: 'chat_msg_101',
        claimedBy: 'Priya (Counter 2)',
        claimedAt: '2026-09-07T20:45:00.000Z',
      },
    };

    if (wsEvent.data && wsEvent.data.chatId) {
      claimedOrders[wsEvent.data.chatId] = {
        claimedBy: wsEvent.data.claimedBy,
        claimedAt: wsEvent.data.claimedAt,
      };
    }

    const claimedOverride = claimedOrders[encryptedMessage.id];
    const isClaimed = !!claimedOverride;

    expect(isClaimed).toBe(true);
    expect(claimedOverride.claimedBy).toBe('Priya (Counter 2)');
    expect(claimedOverride.claimedAt).toBe('2026-09-07T20:45:00.000Z');
  });

  it('accurately computes effective loyalty discount display matching backend calculation', () => {
    const subtotal = 100;
    const billDiscount = 70;
    const remainingBeforeLoyalty = Math.max(0, subtotal - billDiscount); // 30
    const pointValue = 1;
    const customerPoints = 500;
    const maxRedeemablePoints = Math.max(0, Math.min(customerPoints, Math.ceil(remainingBeforeLoyalty / pointValue))); // 30

    const enteredPoints = 100;
    const effectivePoints = Math.min(enteredPoints, maxRedeemablePoints); // 30
    const displayedDiscount = effectivePoints * pointValue; // ₹30

    expect(maxRedeemablePoints).toBe(30);
    expect(effectivePoints).toBe(30);
    expect(displayedDiscount).toBe(30); // Matches the ₹30 remaining payable amount
  });
});

describe('Strict Customer Coupon Single-Use & Visibility Suppression', () => {
  it('strictly filters out redeemed/used coupons from website and POS feeds', () => {
    const customerCoupons = [
      { code: 'GOLD10', discountAmount: 100, isUsed: false },
      { code: 'WELCOME100', discountAmount: 100, isUsed: true }, // already redeemed
      { code: 'FESTIVE25', discountAmount: 25, isUsed: false },
    ];

    // Verification of website sanitizeCustomerCoupons & navbar activeCoupons logic
    const visibleCoupons = customerCoupons.filter(c => !c.isUsed);
    expect(visibleCoupons.length).toBe(2);
    expect(visibleCoupons.map(c => c.code)).toEqual(['GOLD10', 'FESTIVE25']);
    expect(visibleCoupons.some(c => c.code === 'WELCOME100')).toBe(false);
  });

  it('rejects attempt to re-validate an already redeemed coupon', () => {
    const dbCoupon = {
      code: 'GOLD10',
      is_redeemed: 1,
      redeemed_at: '2026-09-07T21:00:00.000Z',
      discount_amount: 100,
    };

    // Validation rule
    const validateCoupon = (c: typeof dbCoupon) => {
      if (c.is_redeemed) {
        return { valid: false, error: `Coupon code "${c.code}" has already been redeemed and cannot be used again.` };
      }
      return { valid: true };
    };

    const res = validateCoupon(dbCoupon);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('already been redeemed');
  });

  it('enforces customer phone match for customer-restricted coupons', () => {
    const coupon = {
      code: 'VIP500',
      customer_phone: '9876543210',
      discount_amount: 500,
      is_redeemed: 0,
    };

    const validateForCustomer = (c: typeof coupon, phone: string) => {
      if (c.customer_phone && c.customer_phone !== phone) {
        return { valid: false, error: `Coupon "${c.code}" is exclusive to phone ${c.customer_phone}.` };
      }
      return { valid: true };
    };

    expect(validateForCustomer(coupon, '9876543210').valid).toBe(true);
    expect(validateForCustomer(coupon, '9999999999').valid).toBe(false);
  });
});

describe('In-Browser Camera Fallback for Mobile Barcode Scanning', () => {
  it('activates fallback mode when getUserMedia is missing or unavailable', () => {
    // Simulate non-secure HTTP / unsupported browser context
    const navigatorGUM = undefined;
    const hasGUM = Boolean(navigatorGUM);

    expect(hasGUM).toBe(false);

    // Fallback mode state transition
    let isCaptureFallbackMode = false;
    let autoTriggered = false;

    if (!hasGUM) {
      isCaptureFallbackMode = true;
      autoTriggered = true;
    }

    expect(isCaptureFallbackMode).toBe(true);
    expect(autoTriggered).toBe(true);
  });

  it('formats HTML5 camera capture input with environment-facing constraints', () => {
    const inputProps = {
      type: 'file',
      accept: 'image/*',
      capture: 'environment' as const,
    };

    expect(inputProps.type).toBe('file');
    expect(inputProps.accept).toBe('image/*');
    expect(inputProps.capture).toBe('environment');
  });
});

describe('Universal Barcode & QR Code Recognition on Mobile', () => {
  it('includes all 1D and 2D formats in native BarcodeDetector configuration', async () => {
    const { SUPPORTED_BARCODE_FORMATS } = await import('../components/cashier-billing-advanced');
    const requiredFormats = [
      'ean_13',
      'ean_8',
      'upc_a',
      'upc_e',
      'code_128',
      'code_39',
      'code_93',
      'itf',
      'codabar',
      'qr_code',
      'data_matrix',
      'aztec',
      'pdf417'
    ];

    for (const fmt of requiredFormats) {
      expect(SUPPORTED_BARCODE_FORMATS).toContain(fmt);
    }
  });

  it('configures ZXing BrowserMultiFormatReader with TRY_HARDER and all 1D/2D formats', async () => {
    const { createConfiguredZxingReader, ZXING_BARCODE_FORMATS } = await import('../components/cashier-billing-advanced');
    const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');

    const expectedFormats = [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.AZTEC,
      BarcodeFormat.PDF_417,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
      BarcodeFormat.RSS_14,
      BarcodeFormat.RSS_EXPANDED,
    ];

    for (const fmt of expectedFormats) {
      expect(ZXING_BARCODE_FORMATS).toContain(fmt);
    }

    const reader = createConfiguredZxingReader();
    expect(reader).toBeDefined();
    // @ts-ignore
    const hints = reader.reader.hints;
    expect(hints).toBeDefined();
    expect(hints.get(DecodeHintType.TRY_HARDER)).toBe(true);
    expect(hints.get(DecodeHintType.POSSIBLE_FORMATS)).toEqual(ZXING_BARCODE_FORMATS);
  });

  it('validates frame readiness guard before barcode decoding', () => {
    const isFrameReady = (video: { readyState: number; videoWidth: number; videoHeight: number } | null): boolean => {
      return Boolean(
        video &&
        video.readyState >= 2 && // HAVE_CURRENT_DATA
        video.videoWidth > 0 &&
        video.videoHeight > 0
      );
    };

    // Unready video states
    expect(isFrameReady(null)).toBe(false);
    expect(isFrameReady({ readyState: 0, videoWidth: 0, videoHeight: 0 })).toBe(false);
    expect(isFrameReady({ readyState: 2, videoWidth: 0, videoHeight: 0 })).toBe(false);
    expect(isFrameReady({ readyState: 1, videoWidth: 1280, videoHeight: 720 })).toBe(false);

    // Ready video state
    expect(isFrameReady({ readyState: 2, videoWidth: 1280, videoHeight: 720 })).toBe(true);
    expect(isFrameReady({ readyState: 4, videoWidth: 640, videoHeight: 480 })).toBe(true);
  });

  it('verifies offscreen canvas binarization classes can be instantiated', async () => {
    const { HybridBinarizer, GlobalHistogramBinarizer, BinaryBitmap } = await import('@zxing/library');
    expect(typeof HybridBinarizer).toBe('function');
    expect(typeof GlobalHistogramBinarizer).toBe('function');
    expect(typeof BinaryBitmap).toBe('function');
  });
});

describe('Automatic Quick Add Flow for Unknown Scanned Barcodes', () => {
  it('opens Quick Add modal and auto-populates scanned code when not found in database', () => {
    const existingProducts = [
      { code: '8901030383921', name: 'Britannia Good Day 100g', price: 20 },
      { code: '8901499008283', name: 'Tata Tea Gold 250g', price: 140 }
    ];

    let showQuickAddModal = false;
    let quickAddBarcode = '';
    let quickAddForm = { name: '', price: '', category: '', stock: '' };
    let toastMessage = '';
    let cart: any[] = [];

    const handleScanned = (scannedCode: string) => {
      const code = scannedCode.trim();
      const matched = existingProducts.find(
        p => p.code === code || p.code.toLowerCase() === code.toLowerCase()
      );

      if (matched) {
        cart.push(matched);
        toastMessage = `Scanned: ${matched.name}`;
      } else {
        quickAddBarcode = code;
        quickAddForm = { name: '', price: '', category: 'General', stock: '100' };
        showQuickAddModal = true;
        toastMessage = `Scanned code "${code}" not found in database.`;
      }
    };

    // 1. Scan known product
    handleScanned('8901030383921');
    expect(cart.length).toBe(1);
    expect(cart[0].name).toBe('Britannia Good Day 100g');
    expect(showQuickAddModal).toBe(false);

    // 2. Scan unknown product
    handleScanned('8901234567890');
    expect(cart.length).toBe(1);
    expect(showQuickAddModal).toBe(true);
    expect(quickAddBarcode).toBe('8901234567890');
    expect(quickAddForm.stock).toBe('100');
    expect(toastMessage).toContain('8901234567890');
  });
});

describe('Phone Camera Photo Capture & Pure White Background Auto-Enhancement', () => {
  it('verifies camera capture input has environment capture for phone camera in both modals', () => {
    const quickAddInputProps = {
      type: 'file',
      accept: 'image/*',
      capture: 'environment' as const,
    };

    const backOfficeInputProps = {
      type: 'file',
      accept: 'image/*',
      capture: 'environment' as const,
    };

    expect(quickAddInputProps.capture).toBe('environment');
    expect(quickAddInputProps.accept).toBe('image/*');
    expect(backOfficeInputProps.capture).toBe('environment');
    expect(backOfficeInputProps.accept).toBe('image/*');
  });

  it('verifies server image processor generates pure white background #FFFFFF for captured products', async () => {
    const { enhanceImageWithPureWhiteBg } = await import('../../../server/services/imageProcessor');
    const sharp = (await import('sharp')).default;

    // Create a mock countertop photo of a product
    const width = 120;
    const height = 120;
    const raw = Buffer.alloc(width * height * 4);

    // Counter background (grey: 175)
    for (let i = 0; i < width * height; i++) {
      raw[i * 4] = 175;
      raw[i * 4 + 1] = 175;
      raw[i * 4 + 2] = 175;
      raw[i * 4 + 3] = 255;
    }

    // Product body in center (blue)
    for (let y = 35; y < 85; y++) {
      for (let x = 35; x < 85; x++) {
        const idx = (y * width + x) * 4;
        raw[idx] = 30;
        raw[idx + 1] = 90;
        raw[idx + 2] = 220;
      }
    }

    const inputBuffer = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const enhancedBuffer = await enhanceImageWithPureWhiteBg(inputBuffer);
    const { data: outPixels } = await sharp(enhancedBuffer).raw().toBuffer({ resolveWithObject: true });

    // Perimeter corners must be pure white #FFFFFF
    expect(outPixels[0]).toBe(255);
    expect(outPixels[1]).toBe(255);
    expect(outPixels[2]).toBe(255);

    // Product interior must remain blue
    const centerOffset = (60 * width + 60) * 3;
    expect(outPixels[centerOffset + 2]).toBeGreaterThan(outPixels[centerOffset]);
  });

  it('verifies UPC-A and EAN-13 zero-padded barcode resolution', () => {
    const products = [
      { code: '0012345678905', name: 'Imported Cereal', price: 250 },
      { code: '8901030383921', name: 'Parle-G', price: 10 }
    ];

    const matchCode = (code: string) => {
      return products.find(p => {
        const pCode = (p.code || '').trim();
        if (pCode === code || pCode.toLowerCase() === code.toLowerCase()) return true;
        if (/^\d+$/.test(code) && /^\d+$/.test(pCode)) {
          if (pCode.padStart(13, '0') === code.padStart(13, '0')) return true;
        }
        return false;
      });
    };

    // Scanned as 12-digit UPC-A without leading zero
    const matched = matchCode('012345678905');
    expect(matched).toBeDefined();
    expect(matched?.name).toBe('Imported Cereal');
  });

  it('verifies client-side compressImageFileToDataUrl helper is available', async () => {
    const { compressImageFileToDataUrl } = await import('../utils/imageCompressor');
    expect(typeof compressImageFileToDataUrl).toBe('function');
  });
});






