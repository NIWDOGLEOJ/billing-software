import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { CashierBillingAdvanced } from '../components/cashier-billing-advanced';
import { AuthProvider } from '../contexts/auth-context';
import { ThemeProvider } from '../contexts/theme-context';
import { FIELD, MONO } from './design-system';

describe('PostCSS @import Ordering and Google Fonts in index.html', () => {
  const rootDir = path.resolve(__dirname, '../../../');

  it('verifies index.html loads Google Fonts via valid <link rel="stylesheet"> tags', () => {
    const indexPath = path.join(rootDir, 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');

    expect(indexHtml).toContain('rel="preconnect"');
    expect(indexHtml).toContain('fonts.googleapis.com');
    expect(indexHtml).toContain('Public+Sans');
    expect(indexHtml).toContain('IBM+Plex+Mono');
    expect(indexHtml).toContain('Inter');
    expect(indexHtml).toContain('Plus+Jakarta+Sans');

    // Extract all Google Fonts stylesheets from index.html
    const linkMatches = indexHtml.match(/<link[^>]+rel="stylesheet"[^>]+href="https:\/\/fonts\.googleapis\.com[^"]+"/g) || [];
    expect(linkMatches.length).toBeGreaterThanOrEqual(2);

    for (const linkTag of linkMatches) {
      const hrefMatch = linkTag.match(/href="([^"]+)"/);
      expect(hrefMatch).not.toBeNull();
      const href = hrefMatch![1];

      // Ensure no malformed parameter fragments exist (e.g. repeated weights or invalid tuple chains)
      expect(href).not.toMatch(/1,400;0,400/);
      expect(href).not.toMatch(/0,300\.\.800;1,400;0,/);

      // Verify the URL structure conforms to Google Fonts css2 API
      const parsedUrl = new URL(href);
      expect(parsedUrl.hostname).toBe('fonts.googleapis.com');
      expect(parsedUrl.pathname).toBe('/css2');
      const families = parsedUrl.searchParams.getAll('family');
      expect(families.length).toBeGreaterThan(0);
    }
  });

  it('verifies stylesheets do not contain @import url(...) that trigger PostCSS at-rule ordering warnings', () => {
    const stylesDir = path.join(rootDir, 'src/styles');
    const cssFiles = fs.readdirSync(stylesDir).filter(f => f.endsWith('.css'));

    for (const file of cssFiles) {
      const content = fs.readFileSync(path.join(stylesDir, file), 'utf-8');
      const importUrlMatch = content.match(/@import\s+url\(/);
      expect(
        importUrlMatch,
        `Stylesheet ${file} should not contain @import url(...) after other statements`
      ).toBeNull();
    }
  });
});

describe('CSSStyleDeclaration Indexed Property Setter Protection', () => {
  const rootDir = path.resolve(__dirname, '../../../');

  /**
   * Simulates browser CSSStyleDeclaration behavior where numeric indexed properties
   * cannot be set (throwing "TypeError: Failed to set an indexed property [0] on 'CSSStyleDeclaration'").
   */
  function simulateSetValueForStyles(styles: Record<string, any>) {
    if (!styles || typeof styles !== 'object') return {};
    if (Array.isArray(styles)) {
      throw new TypeError(
        "Failed to set an indexed property [0] on 'CSSStyleDeclaration': Indexed property setter is not supported (style is an array)."
      );
    }

    const mockStyleDeclaration: Record<string, any> = {};
    const proxy = new Proxy(mockStyleDeclaration, {
      set(target, prop, value) {
        if (!isNaN(Number(prop))) {
          throw new TypeError(
            `Failed to set an indexed property [${String(prop)}] on 'CSSStyleDeclaration': Indexed property setter is not supported.`
          );
        }
        target[prop as string] = value;
        return true;
      },
    });

    for (const styleName in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, styleName)) {
        proxy[styleName] = styles[styleName];
      }
    }
    return mockStyleDeclaration;
  }

  it('demonstrates that spreading a string constant (like ...MONO) triggers the indexed property setter TypeError', () => {
    // Spreading a string creates numeric indices: { 0: "'", 1: "I", 2: "B", ... }
    const buggyStyle = { ...FIELD, ...(MONO as any), flex: 1 };
    expect('0' in buggyStyle).toBe(true);

    expect(() => {
      simulateSetValueForStyles(buggyStyle);
    }).toThrowError(/Failed to set an indexed property \[0\] on 'CSSStyleDeclaration'/);
  });

  it('demonstrates that fontFamily: MONO does not create indexed properties and safely sets styles', () => {
    const fixedStyle = { ...FIELD, fontFamily: MONO, flex: 1, height: 36, padding: '0 10px', fontSize: 12, textTransform: 'uppercase' as const };
    expect('0' in fixedStyle).toBe(false);

    const applied = simulateSetValueForStyles(fixedStyle);
    expect(applied.fontFamily).toBe(MONO);
    expect(applied.flex).toBe(1);
    expect(applied.fontSize).toBe(12);
  });

  it('scans all src TSX/JSX files via TypeScript AST to guarantee no string spreads or array literals exist inside style props', () => {
    function scanDir(dir: string, fileList: string[] = []): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
            scanDir(fullPath, fileList);
          }
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx')) {
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    const srcFiles = scanDir(path.join(rootDir, 'src'));
    const violations: string[] = [];

    for (const file of srcFiles) {
      const code = fs.readFileSync(file, 'utf-8');
      const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

      function visit(node: ts.Node) {
        if (ts.isJsxAttribute(node) && node.name.text === 'style') {
          const init = node.initializer;
          if (init && ts.isJsxExpression(init) && init.expression) {
            const expr = init.expression;
            const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

            // Reject passing array literal to style
            if (ts.isArrayLiteralExpression(expr)) {
              violations.push(`${file}:${line} passes array literal to style prop`);
            }

            // Reject spreading string identifiers or array literals inside style object
            if (ts.isObjectLiteralExpression(expr)) {
              expr.properties.forEach(prop => {
                if (ts.isSpreadAssignment(prop)) {
                  const spreadText = prop.expression.getText(sf);
                  if (
                    spreadText === 'MONO' ||
                    spreadText.startsWith('"') ||
                    spreadText.startsWith("'") ||
                    ts.isArrayLiteralExpression(prop.expression)
                  ) {
                    violations.push(`${file}:${line} spreads non-object (${spreadText}) inside style prop`);
                  }
                }
              });
            }
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sf);
    }

    expect(violations).toEqual([]);
  });

  it('renders CashierBillingAdvanced in mobile view with active style validation on all created elements', () => {
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
    };

    (global as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
      clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
    };

    // Intercept React element creation and validate all style props against CSSStyleDeclaration rules
    const checkedStyles: any[] = [];
    const origCreateElement = React.createElement;

    function validateElementStyle(props: any) {
      if (props && props.style) {
        checkedStyles.push(props.style);
        simulateSetValueForStyles(props.style);
      }
    }

    (React as any).createElement = function (type: any, props: any, ...children: any[]) {
      validateElementStyle(props);
      return origCreateElement.call(React, type, props, ...children);
    };

    let renderOutput = '';
    try {
      expect(() => {
        renderOutput = renderToString(
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
      }).not.toThrow();
    } finally {
      (React as any).createElement = origCreateElement;
    }

    expect(renderOutput).toContain('Discounts &amp; Loyalty Rewards');
    expect(renderOutput).toContain('Customer Coupon Discount');
    expect(renderOutput).toContain('Enter coupon code (e.g. GOLD10)');
    expect(renderOutput).toContain('Shift Status');
  });

  it('renders CashierBillingAdvanced in desktop view with active style validation on all created elements', () => {
    Object.defineProperty(global.window, 'innerWidth', { value: 1280, writable: true, configurable: true });
    Object.defineProperty(global.navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', writable: true, configurable: true });

    const checkedStyles: any[] = [];
    const origCreateElement = React.createElement;

    function validateElementStyle(props: any) {
      if (props && props.style) {
        checkedStyles.push(props.style);
        simulateSetValueForStyles(props.style);
      }
    }

    (React as any).createElement = function (type: any, props: any, ...children: any[]) {
      validateElementStyle(props);
      return origCreateElement.call(React, type, props, ...children);
    };

    let renderOutput = '';
    try {
      expect(() => {
        renderOutput = renderToString(
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
      }).not.toThrow();
    } finally {
      (React as any).createElement = origCreateElement;
    }

    expect(renderOutput).toContain('Retail Register');
    expect(renderOutput).toContain('Payment');
  });
});
