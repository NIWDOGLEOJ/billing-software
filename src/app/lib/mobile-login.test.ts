import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { CashierBillingAdvanced } from '../components/cashier-billing-advanced';
import { LoginPage } from '../components/login-page';
import { Layout } from '../components/layout';
import { SectorNav } from '../components/sector-nav';
import { AuthProvider } from '../contexts/auth-context';
import { ThemeProvider } from '../contexts/theme-context';
import { isMobileDevice } from './device';
import { useDeferredLocalStorage } from '../hooks/useDeferredLocalStorage';

describe('Component Module Evaluation', () => {
  it('imports CashierBillingAdvanced without crashing', () => {
    expect(CashierBillingAdvanced).toBeDefined();
  });
  it('imports LoginPage without crashing', () => {
    expect(LoginPage).toBeDefined();
  });
  it('imports Layout without crashing', () => {
    expect(Layout).toBeDefined();
  });
  it('imports SectorNav without crashing', () => {
    expect(SectorNav).toBeDefined();
  });

  it('renders CashierBillingAdvanced in mobile viewport for logged-in cashier without crashing', () => {
    if (!global.window) {
      (global as any).window = global;
    }
    Object.defineProperty(global.window, 'innerWidth', { value: 375, writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'userAgent', { value: 'iPhone', writable: true, configurable: true });

    const storage: Record<string, string> = {
      authToken: 'fake-token',
      currentUser: JSON.stringify({
        id: 'emp_1',
        username: 'employee',
        name: 'John Cashier',
        role: 'employee',
        permissions: ['access_billing'],
        createdAt: new Date().toISOString(),
        isActive: true,
      }),
      currentSession: JSON.stringify({
        id: 'session_1',
        userId: 'emp_1',
        loginTime: new Date().toISOString(),
      }),
    };

    (global as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
      clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
    };

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        React.createElement(
          AuthProvider,
          null,
          React.createElement(
            ThemeProvider,
            null,
            React.createElement(CashierBillingAdvanced, null)
          )
        )
      )
    );

    expect(html).toBeDefined();
    // Mobile register contains shift status banner
    expect(html).toContain('Shift Status');
    // Mobile cashier is NOT blocked by the desktop cash drawer float modal
    expect(html).not.toContain('Open Cash Drawer');
    expect(html).not.toContain('Count and verify the physical floating currency');
  });

  it('renders Layout in mobile viewport for logged-in cashier without crashing', () => {
    const storage: Record<string, string> = {
      authToken: 'fake-token',
      currentUser: JSON.stringify({
        id: 'emp_1',
        username: 'employee',
        name: 'John Cashier',
        role: 'employee',
        permissions: ['access_billing'],
        createdAt: new Date().toISOString(),
        isActive: true,
      }),
      currentSession: JSON.stringify({
        id: 'session_1',
        userId: 'emp_1',
        loginTime: new Date().toISOString(),
      }),
    };

    (global as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
      clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
    };

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        React.createElement(
          AuthProvider,
          null,
          React.createElement(
            ThemeProvider,
            null,
            React.createElement(Layout, null)
          )
        )
      )
    );

    expect(html).toBeDefined();
  });

  it('renders LoginPage in mobile viewport without crashing', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/login'] },
        React.createElement(
          AuthProvider,
          null,
          React.createElement(
            ThemeProvider,
            null,
            React.createElement(LoginPage, null)
          )
        )
      )
    );

    expect(html).toContain('Terminal sign-in');
  });

  it('verifies mobile user-agent detection logic', () => {
    const isMobileUA = (ua: string, width: number) => {
      return width < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    };

    expect(isMobileUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)', 375)).toBe(true);
    expect(isMobileUA('Mozilla/5.0 (Linux; Android 13; Pixel 7)', 412)).toBe(true);
    expect(isMobileUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 1920)).toBe(false);
    expect(isMobileUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 1440)).toBe(false);
    // Narrow window on desktop also triggers mobile view safely
    expect(isMobileUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 500)).toBe(true);
  });
});

describe('Unified isMobileDevice Detection Utility', () => {
  const origUA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const origMaxTouch = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0;
  const origInnerWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;

  afterEach(() => {
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'userAgent', { value: origUA, configurable: true });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: origMaxTouch, configurable: true });
    }
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'innerWidth', { value: origInnerWidth, configurable: true });
    }
  });

  it('detects portrait mobile screen by viewport width (< 768px)', () => {
    Object.defineProperty(global.window, 'innerWidth', { value: 390, writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'userAgent', { value: 'Mozilla/5.0', writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'maxTouchPoints', { value: 0, writable: true, configurable: true });
    expect(isMobileDevice()).toBe(true);
  });

  it('detects iPhone in landscape mode (width = 844px with iPhone UA)', () => {
    Object.defineProperty(global.window, 'innerWidth', { value: 844, writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('detects Android phone (width = 412px with Android UA)', () => {
    Object.defineProperty(global.window, 'innerWidth', { value: 412, writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro)',
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('detects modern iPadOS Safari (Macintosh UA with maxTouchPoints > 1)', () => {
    Object.defineProperty(global.window, 'innerWidth', { value: 1024, writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global.navigator, 'maxTouchPoints', { value: 5, writable: true, configurable: true });
    expect(isMobileDevice()).toBe(true);
  });

  it('detects coarse pointer touchscreen devices under 1024px', () => {
    Object.defineProperty(global.window, 'innerWidth', { value: 800, writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'userAgent', { value: 'CustomTabletUA', writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'maxTouchPoints', { value: 0, writable: true, configurable: true });
    Object.defineProperty(global.window, 'matchMedia', {
      value: (q: string) => ({
        matches: q.includes('pointer: coarse'),
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('identifies desktop counter terminals as non-mobile', () => {
    Object.defineProperty(global.window, 'innerWidth', { value: 1920, writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global.navigator, 'maxTouchPoints', { value: 0, writable: true, configurable: true });
    Object.defineProperty(global.window, 'matchMedia', {
      value: () => ({ matches: false }),
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(false);
  });

  it('identifies desktop macOS terminals as non-mobile when maxTouchPoints is 0', () => {
    Object.defineProperty(global.window, 'innerWidth', { value: 1440, writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global.navigator, 'maxTouchPoints', { value: 0, writable: true, configurable: true });
    Object.defineProperty(global.window, 'matchMedia', {
      value: () => ({ matches: false }),
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(false);
  });
});

describe('useDeferredLocalStorage Hook Hardening', () => {
  it('exports useDeferredLocalStorage as a valid function', () => {
    expect(typeof useDeferredLocalStorage).toBe('function');
  });

  it('renders a component using useDeferredLocalStorage without throwing in SSR or mock idle callback', () => {
    function TestDeferredComponent({ testKey, testVal }: { testKey: string; testVal: any }) {
      useDeferredLocalStorage(testKey, testVal);
      return React.createElement('div', null, 'deferred-ok');
    }

    const html = renderToString(
      React.createElement(TestDeferredComponent, { testKey: 'demoKey', testVal: { count: 42 } })
    );
    expect(html).toContain('deferred-ok');
  });
});

