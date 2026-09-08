import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  accentLight: string;
  accentDark: string;
  accentRgbLight: string;
  accentRgbDark: string;
}

export const COLOR_THEME_PRESETS: ThemePreset[] = [
  {
    id: 'azure',
    name: 'Azure Signal',
    description: 'The redesign accent: one cool blue, reserved for money owed and the action that collects it',
    accentLight: '#1f74bf',
    accentDark: '#67b0f9',
    accentRgbLight: '31, 116, 191',
    accentRgbDark: '103, 176, 249',
  },
  {
    id: 'emerald',
    name: 'Emerald Wave',
    description: 'Fresh green theme tuned for high contrast readability across light & dark surfaces',
    accentLight: '#059669',
    accentDark: '#34d399',
    accentRgbLight: '5, 150, 105',
    accentRgbDark: '52, 211, 153',
  },
  {
    id: 'sapphire',
    name: 'Royal Sapphire',
    description: 'Professional oceanic blue with vibrant dark elevation contrast',
    accentLight: '#2563eb',
    accentDark: '#60a5fa',
    accentRgbLight: '37, 99, 235',
    accentRgbDark: '96, 165, 250',
  },
  {
    id: 'amethyst',
    name: 'Amethyst Dusk',
    description: 'Deep royal violet with luminous dark accents',
    accentLight: '#7c3aed',
    accentDark: '#a78bfa',
    accentRgbLight: '124, 58, 237',
    accentRgbDark: '167, 139, 250',
  },
  {
    id: 'amber',
    name: 'Sunset Amber',
    description: 'Warm copper gold with warm contrast across light and dark modes',
    accentLight: '#d97706',
    accentDark: '#fbbf24',
    accentRgbLight: '217, 119, 6',
    accentRgbDark: '251, 191, 36',
  },
  {
    id: 'rose',
    name: 'Crimson Rose',
    description: 'Bold, expressive crimson rose with crisp status indicators',
    accentLight: '#e11d48',
    accentDark: '#fb7185',
    accentRgbLight: '225, 29, 72',
    accentRgbDark: '251, 113, 133',
  },
  {
    id: 'cyan',
    name: 'Cyan Aurora',
    description: 'Clean arctic cyan with high legibility across dark surfaces',
    accentLight: '#0891b2',
    accentDark: '#38bdf8',
    accentRgbLight: '8, 145, 178',
    accentRgbDark: '56, 189, 248',
  },
];

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  resolvedTheme: 'light' | 'dark';
  darkMode: boolean;
  toggleDarkMode: () => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
  activePresetId: string;
  selectPresetTheme: (presetId: string) => void;
  textColor: string;
  setTextColor: (color: string) => void;
  surfaceColor: string;
  setSurfaceColor: (color: string) => void;
  liquidGlassOpacity: number;
  setLiquidGlassOpacity: (opacity: number) => void;
  buttonOpacity: number;
  setButtonOpacity: (opacity: number) => void;
  elementOpacity: number;
  setElementOpacity: (opacity: number) => void;
  resetThemeDefaults: () => void;
}

const DEFAULT_ACCENT_COLOR = '#1f74bf';
const DEFAULT_TEXT_COLOR = '';
const DEFAULT_SURFACE_COLOR = '';
// Panel translucency. This shipped at 0.85, where a panel is visually
// indistinguishable from the page behind it — the effect was effectively off.
// 0.46 lets the backdrop genuinely read through the material; above ~0.6 the
// panel starts looking like a solid slab painted in the theme colour rather
// than like glass.
const DEFAULT_LIQUID_GLASS_OPACITY = 0.46;
// Below MIN the UI turns to mud and text loses contrast; above MAX the
// translucency stops being perceptible. The slider is clamped to this range.
export const GLASS_OPACITY_MIN = 0.2;
export const GLASS_OPACITY_MAX = 0.8;
/** Bump this suffix to re-baseline everyone onto a new default. */
export const GLASS_OPACITY_STORAGE_KEY = 'themeLiquidGlassOpacity.v2';
/** Bumped for the redesign: re-baselines saved accents onto the new palette. */
export const PRESET_STORAGE_KEY = 'themePresetId.v2';
export const ACCENT_STORAGE_KEY = 'themeAccentColor.v2';
export const SURFACE_STORAGE_KEY = 'themeSurfaceColor.v2';
const DEFAULT_PRESET_ID = 'azure';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const safeGetStorage = (key: string): string | null => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeSetStorage = (key: string, value: string): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in restricted environments / DOMException
  }
};

export const safeRemoveStorage = (key: string): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors in restricted environments / DOMException
  }
};

const getInitialThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  const saved = safeGetStorage('theme') || safeGetStorage('nexusflow_theme');
  if (saved === 'system' || saved === 'light' || saved === 'dark') {
    return saved;
  }
  const savedDarkMode = safeGetStorage('darkMode');
  if (savedDarkMode !== null) {
    try {
      const parsed = JSON.parse(savedDarkMode);
      if (typeof parsed === 'boolean') {
        return parsed ? 'dark' : 'light';
      }
    } catch {
      // Theme preference couldn't be persisted; the in-memory theme still applies.
    }
  }
  return 'system';
};

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialThemeMode);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? systemTheme : theme;
  const darkMode = resolvedTheme === 'dark';

  const [showSettings, setShowSettings] = useState(false);

  const [activePresetId, setActivePresetId] = useState<string>(() => {
    return safeGetStorage(PRESET_STORAGE_KEY) || DEFAULT_PRESET_ID;
  });

  const [accentColor, setAccentColorState] = useState<string>(() => {
    const saved = safeGetStorage(ACCENT_STORAGE_KEY);
    if (saved) return saved;
    const preset = COLOR_THEME_PRESETS.find(p => p.id === (safeGetStorage(PRESET_STORAGE_KEY) || DEFAULT_PRESET_ID));
    if (preset) {
      // Resolve against the persisted mode, not the OS preference: otherwise a
      // dark-mode till on a light-mode OS paints the light accent for one frame.
      const mode = getInitialThemeMode();
      const resolved = mode === 'system' ? getSystemTheme() : mode;
      return resolved === 'dark' ? preset.accentDark : preset.accentLight;
    }
    return DEFAULT_ACCENT_COLOR;
  });

  const [textColor, setTextColorState] = useState(DEFAULT_TEXT_COLOR);

  const [surfaceColor, setSurfaceColorState] = useState(() => {
    return safeGetStorage(SURFACE_STORAGE_KEY) || DEFAULT_SURFACE_COLOR;
  });

  const [liquidGlassOpacity, setLiquidGlassOpacityState] = useState<number>(() => {
    // Versioned key. Values written under the old keys came from a period when
    // the default was 0.85 (effect off) and then a clamp that landed people on
    // 0.62 — neither of which anyone actually chose, and both of which read as
    // a solid slab rather than glass. Bumping the key resets those once; any
    // value set from here on is a real preference and is respected.
    const saved = safeGetStorage(GLASS_OPACITY_STORAGE_KEY);
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed)) {
        return Math.min(GLASS_OPACITY_MAX, Math.max(GLASS_OPACITY_MIN, parsed));
      }
    }
    return DEFAULT_LIQUID_GLASS_OPACITY;
  });

  const setTheme = useCallback((newTheme: ThemeMode) => {
    const validTheme: ThemeMode = (newTheme === 'system' || newTheme === 'light' || newTheme === 'dark') ? newTheme : 'system';
    setThemeState(validTheme);
    safeSetStorage('theme', validTheme);
  }, []);

  const selectPresetTheme = useCallback((presetId: string) => {
    const preset = COLOR_THEME_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setActivePresetId(preset.id);
      safeSetStorage(PRESET_STORAGE_KEY, preset.id);
      const targetAccent = resolvedTheme === 'dark' ? preset.accentDark : preset.accentLight;
      setAccentColorState(targetAccent);
      safeSetStorage(ACCENT_STORAGE_KEY, targetAccent);
    }
  }, [resolvedTheme]);

  const toggleDarkMode = useCallback(() => {
    setThemeState(prev => {
      const currentResolved = prev === 'system' ? getSystemTheme() : prev;
      const nextTheme: ThemeMode = currentResolved === 'dark' ? 'light' : 'dark';
      safeSetStorage('theme', nextTheme);
      return nextTheme;
    });
  }, []);

  // Dynamic system theme preference change listener
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else if ('addListener' in mediaQuery) {
      (mediaQuery as any).addListener(handleChange);
      return () => (mediaQuery as any).addListener(handleChange);
    }
  }, []);

  // Sync documentElement class list, data-theme, and style.colorScheme
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.remove('light');
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }

    root.setAttribute('data-theme', resolvedTheme);
    root.style.colorScheme = resolvedTheme;
    safeSetStorage('darkMode', JSON.stringify(darkMode));

    // Per Rule 2 of color-selection-light-dark-themes.md:
    // Update accent color lightness dynamically when theme flips if an active preset is selected
    if (activePresetId) {
      const preset = COLOR_THEME_PRESETS.find(p => p.id === activePresetId);
      if (preset) {
        const expectedAccent = resolvedTheme === 'dark' ? preset.accentDark : preset.accentLight;
        setAccentColorState(expectedAccent);
      }
    }
  }, [resolvedTheme, darkMode, activePresetId]);

  // Comprehensive CSS variables sync for application-wide theme propagation
  useEffect(() => {
    safeSetStorage(ACCENT_STORAGE_KEY, accentColor);
    safeSetStorage(SURFACE_STORAGE_KEY, surfaceColor);

    const safeOpacity = (typeof liquidGlassOpacity === 'number' && !isNaN(liquidGlassOpacity) && liquidGlassOpacity >= 0 && liquidGlassOpacity <= 1)
      ? liquidGlassOpacity
      : DEFAULT_LIQUID_GLASS_OPACITY;

    safeSetStorage(GLASS_OPACITY_STORAGE_KEY, safeOpacity.toString());

    const root = document.documentElement;

    // 1. Accent Color & Primary Tokens
    root.style.setProperty('--primary-accent', accentColor);
    root.style.setProperty('--primary', accentColor);
    root.style.setProperty('--ring', accentColor);
    root.style.setProperty('--chart-1', accentColor);
    root.style.setProperty('--sidebar-primary', accentColor);
    root.style.setProperty('--sidebar-ring', accentColor);

    const hex = accentColor.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      root.style.setProperty('--primary-accent-rgb', `${r}, ${g}, ${b}`);
    }

    // 2. Liquid Glass & Surface Opacity Tokens
    root.style.setProperty('--liquid-glass-opacity', safeOpacity.toString());
    root.style.setProperty('--button-opacity', safeOpacity.toString());
    root.style.setProperty('--element-opacity', safeOpacity.toString());

    // 3. Text color now comes from the active light/dark theme tokens only.
    safeRemoveStorage('themeTextColor');
    root.style.removeProperty('--custom-text-color');
    root.style.removeProperty('--text-primary');
    root.style.removeProperty('--foreground');
    root.style.removeProperty('--card-foreground');
    root.style.removeProperty('--popover-foreground');
    root.style.removeProperty('--sidebar-foreground');

    // 4. Custom Surface Color (if provided & modified from default)
    if (surfaceColor) {
      safeSetStorage(SURFACE_STORAGE_KEY, surfaceColor);
      root.style.setProperty('--theme-surface-color', surfaceColor);

      const sHex = surfaceColor.replace('#', '');
      if (sHex.length === 6) {
        const sr = parseInt(sHex.substring(0, 2), 16);
        const sg = parseInt(sHex.substring(2, 4), 16);
        const sb = parseInt(sHex.substring(4, 6), 16);
        const sRgb = `${sr}, ${sg}, ${sb}`;
        root.style.setProperty('--surface-rgb', sRgb);

        // Glass surfaces take the chosen colour as a TINT, at the current
        // translucency — not as an opaque fill. Writing the raw hex here (which
        // is what used to happen) turned every "glass" surface into a solid
        // block of the theme colour, so nothing showed through and the material
        // just looked like painted plastic.
        const glass = (mult: number) =>
          `rgba(${sRgb}, calc(var(--liquid-glass-opacity, 0.5) * ${mult}))`;

        root.style.setProperty('--surface', glass(1));
        root.style.setProperty('--surface-elevated', glass(1.12));
        root.style.setProperty('--card', glass(1));
        root.style.setProperty('--card-bg', glass(1));
        root.style.setProperty('--popover', glass(1.2));
        root.style.setProperty('--sidebar', glass(1.18));
        root.style.setProperty('--bg-glass', glass(1));
        root.style.setProperty('--bg-glass-raised', glass(0.45));
      }
    } else {
      safeRemoveStorage(SURFACE_STORAGE_KEY);
      root.style.removeProperty('--theme-surface-color');
      root.style.removeProperty('--surface');
      root.style.removeProperty('--surface-elevated');
      root.style.removeProperty('--card');
      root.style.removeProperty('--card-bg');
      root.style.removeProperty('--popover');
      root.style.removeProperty('--sidebar');
      root.style.removeProperty('--surface-rgb');
      root.style.removeProperty('--bg-glass');
      root.style.removeProperty('--bg-glass-raised');
    }
  }, [accentColor, surfaceColor, liquidGlassOpacity]);

  const setAccentColor = (color: string) => {
    setActivePresetId('');
    safeRemoveStorage(PRESET_STORAGE_KEY);
    setAccentColorState(color);
  };

  const setTextColor = (_color: string) => {
    setTextColorState(DEFAULT_TEXT_COLOR);
    safeRemoveStorage('themeTextColor');
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.removeProperty('--custom-text-color');
      root.style.removeProperty('--text-primary');
      root.style.removeProperty('--foreground');
      root.style.removeProperty('--card-foreground');
      root.style.removeProperty('--popover-foreground');
      root.style.removeProperty('--sidebar-foreground');
    }
  };

  const setSurfaceColor = (color: string) => {
    setSurfaceColorState(color);
  };

  const setLiquidGlassOpacity = (opacity: number) => {
    const parsed = typeof opacity === 'number' ? opacity : parseFloat(opacity as any);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      setLiquidGlassOpacityState(parsed);
    } else {
      setLiquidGlassOpacityState(DEFAULT_LIQUID_GLASS_OPACITY);
    }
  };

  const resetThemeDefaults = () => {
    setActivePresetId(DEFAULT_PRESET_ID);
    safeSetStorage(PRESET_STORAGE_KEY, DEFAULT_PRESET_ID);
    const preset = COLOR_THEME_PRESETS[0];
    const defaultAccent = resolvedTheme === 'dark' ? preset.accentDark : preset.accentLight;
    setAccentColorState(defaultAccent);
    setTextColorState(DEFAULT_TEXT_COLOR);
    setSurfaceColorState(DEFAULT_SURFACE_COLOR);
    setLiquidGlassOpacityState(DEFAULT_LIQUID_GLASS_OPACITY);
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      resolvedTheme,
      darkMode,
      toggleDarkMode,
      showSettings,
      setShowSettings,
      accentColor,
      setAccentColor,
      activePresetId,
      selectPresetTheme,
      textColor,
      setTextColor,
      surfaceColor,
      setSurfaceColor,
      liquidGlassOpacity,
      setLiquidGlassOpacity,
      buttonOpacity: liquidGlassOpacity,
      setButtonOpacity: setLiquidGlassOpacity,
      elementOpacity: liquidGlassOpacity,
      setElementOpacity: setLiquidGlassOpacity,
      resetThemeDefaults
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
