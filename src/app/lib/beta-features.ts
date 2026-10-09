import { useState, useEffect } from 'react';

export interface BetaFeatures {
  gstLedger: boolean;
  warehouses: boolean;
  loyalty: boolean;
  advancedSmtp: boolean;
  gstReturns: boolean;
}

const DEFAULT_BETA_FEATURES: BetaFeatures = {
  gstLedger: true,
  warehouses: true,
  loyalty: true,
  advancedSmtp: false,
  gstReturns: true,
};

const STORAGE_KEY = 'nexusflow_beta_features';

export function getBetaFeatures(): BetaFeatures {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_BETA_FEATURES, ...JSON.parse(raw) };
      }
    }
  } catch (err) {
    console.warn('Failed to parse beta features from storage:', err);
  }
  return DEFAULT_BETA_FEATURES;
}

export function saveBetaFeatures(features: Partial<BetaFeatures>): BetaFeatures {
  const current = getBetaFeatures();
  const updated = { ...current, ...features };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('nexusflow-beta-features-updated', { detail: updated }));
    }
  } catch (err) {
    console.warn('Failed to save beta features to storage:', err);
  }
  return updated;
}

export function useBetaFeatures(): BetaFeatures & {
  setFeature: (key: keyof BetaFeatures, value: boolean) => void;
} {
  const [features, setFeatures] = useState<BetaFeatures>(getBetaFeatures);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<BetaFeatures>;
      if (customEvent.detail) {
        setFeatures(customEvent.detail);
      } else {
        setFeatures(getBetaFeatures());
      }
    };

    window.addEventListener('nexusflow-beta-features-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('nexusflow-beta-features-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const setFeature = (key: keyof BetaFeatures, value: boolean) => {
    const updated = saveBetaFeatures({ [key]: value });
    setFeatures(updated);
  };

  return {
    ...features,
    setFeature,
  };
}
