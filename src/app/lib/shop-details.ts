import { useState, useEffect } from 'react';

export interface ShopDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
}

export const DEFAULT_SHOP_DETAILS: ShopDetails = {
  name: 'Sunrise Provisions',
  address: '14 Market Street, Fort, Mumbai 400 001',
  phone: '+91 22 2266 1890',
  email: 'accounts@sunriseprovisions.in',
  gstin: '27AABCU9603R1ZM',
};

export function getStoredShopDetails(): ShopDetails {
  try {
    const raw = localStorage.getItem('shopDetails');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.name) {
        return {
          name: parsed.name || DEFAULT_SHOP_DETAILS.name,
          address: parsed.address || DEFAULT_SHOP_DETAILS.address,
          phone: parsed.phone || DEFAULT_SHOP_DETAILS.phone,
          email: parsed.email || DEFAULT_SHOP_DETAILS.email,
          gstin: parsed.gstin || DEFAULT_SHOP_DETAILS.gstin,
        };
      }
    }
    const legacyName = localStorage.getItem('pos_shop_name');
    if (legacyName) {
      return { ...DEFAULT_SHOP_DETAILS, name: legacyName };
    }
  } catch {}
  return DEFAULT_SHOP_DETAILS;
}

export function saveStoredShopDetails(details: Partial<ShopDetails>) {
  try {
    const current = getStoredShopDetails();
    const updated = { ...current, ...details };
    localStorage.setItem('shopDetails', JSON.stringify(updated));
    localStorage.setItem('pos_shop_name', updated.name);
    if (typeof document !== 'undefined' && updated.name) {
      document.title = `${updated.name} - Retail POS & Inventory System`;
    }
    window.dispatchEvent(new CustomEvent('shop-details-updated', { detail: updated }));
  } catch {}
}

export function useShopDetails(): ShopDetails {
  const [details, setDetails] = useState<ShopDetails>(() => getStoredShopDetails());

  useEffect(() => {
    if (typeof document !== 'undefined' && details.name) {
      document.title = `${details.name} - Retail POS & Inventory System`;
    }
  }, [details.name]);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<ShopDetails>;
      if (customEvent.detail) {
        setDetails(customEvent.detail);
      } else {
        setDetails(getStoredShopDetails());
      }
    };
    window.addEventListener('shop-details-updated', handler);
    return () => window.removeEventListener('shop-details-updated', handler);
  }, []);

  return details;
}
