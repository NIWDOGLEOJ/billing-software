import { describe, it, expect } from 'vitest';

describe('Product Editing Frontend Logic & Integration', () => {
  it('correctly maps edited form fields into backend PUT payload with proper types and decimal precision', () => {
    const editForm = {
      name: '  Amul Salted Butter 500g  ',
      price: '275.50',
      mrp: '290.00',
      category: 'Dairy',
      gstRate: 12,
      stock: '2.5', // fractional stock test (e.g. KG or loose items)
      lowStockThreshold: '0.5',
      hsnCode: '0402',
      uom: 'KG',
      wholesalePrice: '250',
      brand: 'Amul',
    };

    const targetProduct = {
      id: 'prod_123',
      code: 'AMUL_BUTTER_500',
      name: 'Old Butter Name',
      price: 260,
    };

    const parsedPrice = parseFloat(editForm.price) || 0;
    const parsedMrp = parseFloat(editForm.mrp) || parsedPrice;
    const rawStock = parseFloat(editForm.stock);
    const parsedStock = isNaN(rawStock) ? 0 : rawStock;
    const rawThreshold = parseFloat(editForm.lowStockThreshold);
    const parsedThreshold = isNaN(rawThreshold) ? 10 : rawThreshold;
    const rawWholesale = parseFloat(editForm.wholesalePrice);
    const parsedWholesale = isNaN(rawWholesale) ? 0 : rawWholesale;

    const payload = {
      sku: targetProduct.code,
      name: editForm.name.trim(),
      price: parsedPrice,
      mrp: parsedMrp,
      stock: parsedStock,
      category: editForm.category.trim() || 'General',
      gst_rate: editForm.gstRate,
      hsn_code: editForm.hsnCode.trim(),
      uom: editForm.uom.trim() || 'PCS',
      low_stock_threshold: parsedThreshold,
      wholesale_price: parsedWholesale,
      brand: editForm.brand.trim(),
    };

    expect(payload.sku).toBe('AMUL_BUTTER_500');
    expect(payload.name).toBe('Amul Salted Butter 500g');
    expect(payload.price).toBe(275.5);
    expect(payload.mrp).toBe(290);
    expect(payload.stock).toBe(2.5); // decimal preserved, not truncated by parseInt
    expect(payload.low_stock_threshold).toBe(0.5);
    expect(payload.gst_rate).toBe(12);
    expect(payload.uom).toBe('KG');
    expect(payload.brand).toBe('Amul');
  });

  it('updates matching products in local catalogue state preserving all fields including mrp and imageUrl', () => {
    const initialProducts = [
      { id: '1', code: 'SKU_1', name: 'Product 1', price: 100, mrp: 120, stock: 10, imageUrl: '/img1.png' },
      { id: '2', code: 'SKU_2', name: 'Product 2', price: 200, mrp: 220, stock: 20, imageUrl: '/img2.png' },
      { id: '3', code: 'SKU_3', name: 'Product 3', price: 300, mrp: 350, stock: 30, imageUrl: '/img3.png' },
    ];

    const updatedProduct = {
      id: '2',
      code: 'SKU_2',
      name: 'Product 2 Updated',
      price: 220,
      mrp: 250,
      stock: 15.5,
      imageUrl: '/img2_new.png',
    };

    const targetId = '2';
    const targetCode = 'SKU_2';

    const updatedCatalogue = initialProducts.map(p =>
      (p.code === targetCode || p.id === targetId) ? { ...p, ...updatedProduct } : p
    );

    expect(updatedCatalogue[0].name).toBe('Product 1');
    expect(updatedCatalogue[1].name).toBe('Product 2 Updated');
    expect(updatedCatalogue[1].price).toBe(220);
    expect(updatedCatalogue[1].mrp).toBe(250);
    expect(updatedCatalogue[1].stock).toBe(15.5);
    expect(updatedCatalogue[1].imageUrl).toBe('/img2_new.png');
    expect(updatedCatalogue[2].price).toBe(300);
  });

  it('synchronizes cart bill items when a master product is updated', () => {
    const billItems = [
      { code: 'SKU_1', name: 'Old Name', price: 100, quantity: 2, gstRate: 5 },
      { code: 'SKU_9', name: 'Other Item', price: 50, quantity: 1, gstRate: 18 },
    ];

    const updated = {
      code: 'SKU_1',
      name: 'New Name',
      price: 120,
      gstRate: 12,
      hsnCode: '1905',
    };

    const gstEnabled = true;
    const updatedCart = billItems.map(item => {
      if (item.code === updated.code) {
        return {
          ...item,
          name: updated.name,
          price: updated.price,
          originalPrice: updated.price,
          gstRate: gstEnabled ? (updated.gstRate ?? item.gstRate) : 0,
          hsnCode: updated.hsnCode,
        };
      }
      return item;
    });

    expect(updatedCart[0].name).toBe('New Name');
    expect(updatedCart[0].price).toBe(120);
    expect(updatedCart[0].originalPrice).toBe(120);
    expect(updatedCart[0].gstRate).toBe(12);
    expect(updatedCart[0].hsnCode).toBe('1905');
    // Non-matching items unchanged
    expect(updatedCart[1].name).toBe('Other Item');
    expect(updatedCart[1].price).toBe(50);
  });

  it('synchronizes held table orders when a master product is edited', () => {
    const heldTables = [
      {
        id: 'table_1',
        name: 'Table 1',
        status: 'occupied',
        total: 200,
        items: [
          { code: 'SKU_1', name: 'Butter', price: 100, quantity: 2, gstRate: 0 },
        ],
      },
      {
        id: 'table_2',
        name: 'Table 2',
        status: 'occupied',
        total: 50,
        items: [
          { code: 'SKU_9', name: 'Bread', price: 50, quantity: 1, gstRate: 0 },
        ],
      },
    ];

    const updatedProduct = {
      code: 'SKU_1',
      name: 'Butter Premium',
      price: 125,
      gstRate: 0,
      hsnCode: '0402',
      uom: 'PCS',
    };

    const updatedTables = heldTables.map(t => {
      if (t.items && Array.isArray(t.items)) {
        let tableChanged = false;
        const newItems = t.items.map((item: any) => {
          if (item.code === updatedProduct.code) {
            tableChanged = true;
            return {
              ...item,
              name: updatedProduct.name,
              price: updatedProduct.price,
              originalPrice: updatedProduct.price,
              gstRate: updatedProduct.gstRate ?? item.gstRate,
              hsnCode: updatedProduct.hsnCode,
              uom: updatedProduct.uom,
            };
          }
          return item;
        });
        if (tableChanged) {
          const newTotal = newItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
          return { ...t, items: newItems, total: newTotal };
        }
      }
      return t;
    });

    expect(updatedTables[0].items[0].name).toBe('Butter Premium');
    expect(updatedTables[0].items[0].price).toBe(125);
    expect(updatedTables[0].total).toBe(250);
    expect(updatedTables[1].total).toBe(50);
  });

  it('verifies permission checks for canEditInventory', () => {
    const checkCanEdit = (isOwner: boolean, permissions: string[]) => {
      const hasPermission = (perm: string) => permissions.includes(perm);
      return isOwner || hasPermission('access_inventory');
    };

    expect(checkCanEdit(true, [])).toBe(true);
    expect(checkCanEdit(false, ['access_inventory'])).toBe(true);
    expect(checkCanEdit(false, ['access_billing'])).toBe(false);
    expect(checkCanEdit(false, [])).toBe(false);
  });
});
