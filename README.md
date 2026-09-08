# NexusFlow — Advanced LAN-Based Retail POS System

<p align="center">
  <strong>A high-performance, full-stack Point-of-Sale system for retail, grocery & wholesale shops — runs entirely on your local network.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react" alt="React 18.3"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite" alt="Vite 6"/>
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express" alt="Express 5"/>
  <img src="https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite" alt="SQLite"/>
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss" alt="Tailwind CSS 4"/>
  <img src="https://img.shields.io/badge/tests-179%20passed-brightgreen" alt="179 tests"/>
</p>

---

## Table of Contents

1. [Project Overview](#-project-overview)
2. [Architecture](#️-architecture)
3. [Tech Stack](#-tech-stack)
4. [Feature Reference](#-feature-reference)
5. [Directory Structure](#-directory-structure)
6. [Setup & Running](#️-setup--running)
7. [Available Scripts](#-available-scripts)
8. [Environment Variables](#-environment-variables)
9. [Keyboard Shortcuts](#️-keyboard-shortcuts)
10. [Barcode Scanner Support](#-barcode-scanner-support)
11. [Mobile Usage](#-mobile-usage)
12. [Customer Website](#-customer-website)
13. [Database Schema](#️-database-schema)
14. [WebSocket Events](#-websocket-events)
15. [Product Image Pipeline](#-product-image-pipeline)
16. [Deployment Notes](#-deployment-notes)
17. [Test Suite](#-test-suite)

---

## 🏪 Project Overview

NexusFlow is a production-ready, self-hosted retail POS platform built for **retail, grocery, and wholesale shops**. It runs completely on a LAN — no internet connection required — making it immune to cloud outages and blazing fast at high-traffic checkout counters.

**Core values:**
- ⚡ Instant checkout — barcode scan → cart → receipt in seconds
- 🔒 All data stays on your server, zero cloud dependency
- 📱 Works on desktop browsers, tablets, and mobile phones on the same LAN
- 🎨 NexusFlow instrument-panel design — warm greyscale palette, Public Sans UI text, IBM Plex Mono for numbers

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        LAN Network                               │
│                                                                  │
│  ┌─────────────────┐   REST + WS   ┌──────────────────────────┐ │
│  │  Cashier/Owner  │◄─────────────►│   Express.js Server      │ │
│  │  React SPA      │               │   (Node.js + TypeScript)  │ │
│  │  (Vite, port    │               │   port 3000               │ │
│  │   5173 dev)     │               │                           │ │
│  └─────────────────┘               │  ┌─────────────────────┐  │ │
│                                    │  │  SQLite (WAL mode)  │  │ │
│  ┌─────────────────┐               │  │  better-sqlite3     │  │ │
│  │  Customer       │   REST        │  └─────────────────────┘  │ │
│  │  Website        │◄─────────────►│                           │ │
│  │  (separate Vite │               │  ┌─────────────────────┐  │ │
│  │   app /website) │               │  │  WebSocket Server   │  │ │
│  └─────────────────┘               │  │  (ws library)       │  │ │
│                                    │  └─────────────────────┘  │ │
│  ┌─────────────────┐               └──────────────────────────┘ │
│  │  Mobile Scanner │   Camera +                                  │
│  │  (same React    │   REST                                      │
│  │   app, /scan    │                                             │
│  │   route)        │                                             │
│  └─────────────────┘                                             │
└──────────────────────────────────────────────────────────────────┘
```

The Express server serves the compiled React SPA from `dist/`, handles all REST API routes under `/api`, and runs a WebSocket server that broadcasts real-time events to every connected terminal.

---

## 🛠️ Tech Stack

### Billing App (Main SPA)

| Layer | Technology |
|---|---|
| Frontend framework | React 18.3 + TypeScript |
| Build tool | Vite 6 |
| Styling | Tailwind CSS 4 + shadcn/ui (Radix UI primitives) |
| Routing | React Router 7 |
| Forms | React Hook Form |
| Icons | Lucide React |
| Charts | Recharts |
| Animations | Motion (Framer Motion v12) |
| Barcode scanning | Native `BarcodeDetector` API + `@zxing/library` fallback |
| Date handling | date-fns 3 |

### Backend Server

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| HTTP framework | Express.js 5 |
| Language | TypeScript (transpiled with `tsx` in dev, `tsc` for prod) |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| Authentication | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| Real-time | WebSocket (`ws` library) |
| Image processing | `sharp` (server-side segmentation & WebP conversion) |
| Cryptography | Web Crypto API (client-side AES-256-GCM) |

### Customer Website (`/website/`)

| Layer | Technology |
|---|---|
| Framework | React + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Integration | WhatsApp order links, NexusFlow REST API for products & coupons |

### Design System

- **Typeface (UI):** Public Sans
- **Typeface (numbers/mono):** IBM Plex Mono
- **Palette:** Warm greyscale instrument-panel — neutral backgrounds with high-contrast data ink
- **Branding:** Shop name displayed prominently; `nexusflow` in 9–10 px faint text at bottom of every page

---

## ✨ Feature Reference

### 1. Cashier Register (Desktop & Mobile)

- **Dual-mode layout:** Full desktop grid for counter use; compact mobile card stack for handheld operation
- **Barcode scanner:** Continuous RAF scanning loop using native `BarcodeDetector` + `@zxing/library` TRY_HARDER fallback
- **1D & 2D formats supported:**
  - EAN-13, EAN-8, UPC-A, UPC-E
  - Code 128, Code 39, Code 93
  - ITF, Codabar, GS1 DataBar RSS-14 & Expanded
  - QR Code, Data Matrix, Aztec, PDF417
- **Cart management:** Add, remove, adjust quantity and per-item discount in real time
- **Wholesale pricing tiers:** Retail / Dealer / Distributor — switch at billing time
- **GST calculation:** Auto-selects IGST (inter-state) or CGST + SGST (intra-state) based on settings
- **Khata (credit):** Record sales on credit against a customer account
- **F-key shortcuts:** F1–F12 for fast actions (see [Keyboard Shortcuts](#️-keyboard-shortcuts))

### 2. Unified Discounts & Loyalty Rewards

Single card in the checkout sheet handles:
- Flat ₹ discount
- Percentage (%) discount
- Loyalty point redemption (customer points balance shown inline)
- Coupon code input box (validates and applies in one step)

### 3. Coupon System

- Admin creates single-use coupon codes stored in SQLite
- Atomic transaction enforcement — a coupon can only be claimed once, even with concurrent requests
- Claimed coupons disappear from all UI surfaces (POS checkout + customer website) instantly via WebSocket sync
- LAN-wide `COUPON_REDEEMED` broadcast ensures all terminals update without page refresh

### 4. Mobile Scanner

- **Live video RAF loop** with progressive camera constraint fallback:
  - HD back-camera (1920×1080) → standard (640×480) → any video input
- In-browser camera fallback for non-HTTPS LAN environments
- **90° orientation-invariant pass** — detects vertical barcodes without rotating the phone
- Photo capture mode with ZXing decode for still images
- **Auto Quick-Add** on unknown barcode — pops a form to add the new product directly

### 5. Product Image Pipeline

1. **Mobile capture** — cashier/owner photographs product with phone camera directly in the browser
2. **Client-side compression** — 12–48 MP shot compressed to ~250 KB using `imageCompressor.ts`
3. **Server-side background removal** — `sharp`-powered algorithm:
   - Sobel edge barrier detection
   - Corner consensus classification (background vs. foreground)
   - BFS flood-fill segmentation
   - Pure `#FFFFFF` compositing over transparent PNG
4. **Enhancement** — brightness / saturation / sharpness tuning applied server-side
5. **WebP output** — final image saved as WebP and served via `/uploads/`
6. **WebSocket broadcast** — `STOCK_UPDATED` + `IMAGE_ENHANCED` events propagate to all terminals

> Product images are intentionally **hidden** in the billing software UI and only shown on the customer-facing website.

### 6. OTP Bill Pickup & Chat (E2EE)

- Customers receive an OTP; cashier scans or types it to hand off a reserved order
- **AES-256-GCM end-to-end encrypted** chatbox for inter-terminal communication
  - Keys derived client-side via SHA-256 from a shared passphrase
  - Server is a blind relay — only stores and forwards ciphertext
- `RESERVATION_CLAIMED` WebSocket event closes the pickup on all terminals simultaneously
- **Auto-hide claimed orders** toggle to keep the pickup queue clean
- All chat/reservation records persisted in SQLite

### 7. Settings (16-tab Panel)

Full-screen settings accessible from the dashboard shell:

| Tab | Contents |
|---|---|
| General | Shop name, address, GST number, sector |
| Users | Staff accounts, role assignment, password reset |
| Shifts | Active shift list, denomination calculator |
| Products | Bulk import via RFC-4180 CSV, HSN/UOM rules |
| Customers | Loyalty tier thresholds, khata management |
| Discounts | Coupon code creation & management |
| Billing | GST mode (IGST/CGST+SGST), receipt format |
| Appearance | Theme tokens, font preview |
| Backup/Restore | Full DB export & restore |
| Analytics | GSTR-1 export, HSN summary CSV |
| Keyboard | Shortcut reference card |
| Attendance | Registration date awareness, admin override |
| Restock PO | Auto-flagged low-stock items, supplier config |
| …and more | WAI-ARIA tablist, Escape navigation throughout |

### 8. Accessibility (WAI-ARIA)

- Full roving `tabIndex` in all list/grid components
- Focus trapping in every modal and drawer
- Escape key closes any open panel, sheet, or dialog
- Screen-reader-compatible landmark regions

### 9. Back Office & Analytics

- **Sales analytics dashboard** with Recharts area charts
- **AI forecasting panel** — linear regression on daily sales, projects 7-day revenue, R² confidence score, trend delta
- **GSTR-1 export** — aggregates bills by HSN/tax slab, generates compliant B2B CSV
- **RFC-4180 CSV import** — bulk product upsert via validated spreadsheet upload
- **CSV exports** — products, customers, employees, bills — filenames include shop name slug
- **Khata ledger** — per-customer credit history

### 10. Staff & Shift Management

- **Attendance calendar** — color-coded grid (Blue=Present, Red=Absent, Orange=Leave, Green=Holiday)
- Registration-date-aware: no absent marks before hire date
- **Shift closing** — denomination counter with INR coins/notes, variance chips showing over/short
- Shift data persisted server-side; Z-report printable

### 11. Login Page

- Minimal: shop name at top, username + password fields only
- No test shortcuts, no LAN connection cards visible
- Single-session enforcement: logging in on a new device invalidates the previous session via WebSocket

### 12. Dynamic Shop Branding

- Shop name loaded from DB settings at runtime, no hardcoding
- Appears in: nav header, print receipts, page titles, WebSocket broadcasts, CSV filename slugs
- `nexusflow` in 9–10 px faint text at bottom of every page/receipt

### 13. Customer Website (`/website/`)

- Product catalog with white-background enhanced images
- Shopping cart with WhatsApp order integration (pre-filled message)
- Coupon display — only shows unredeemed codes applicable to customer
- Syncs product data from NexusFlow REST API

### 14. Vite Configuration

- `allowedHosts` includes `*.trycloudflare.com` for Cloudflare tunnel LAN exposure
- Proxies `/api` and WebSocket to Express backend in dev mode

---

## 📂 Directory Structure

```
Retail Billing UI Design/
├── index.html                        # Main SPA HTML entry point
├── package.json                      # Root dependencies & scripts
├── pnpm-workspace.yaml               # pnpm workspace (includes /website)
├── vite.config.ts                    # Vite config (proxy, allowedHosts)
├── tsconfig.json                     # Frontend TS config
├── tsconfig.server.json              # Server TS config (CommonJS output)
│
├── server/                           # Express.js backend
│   ├── index.ts                      # HTTP + WebSocket server init
│   ├── db.ts                         # SQLite setup, migrations, seed
│   ├── middleware/
│   │   └── auth.ts                   # JWT verification middleware
│   ├── routes/
│   │   ├── auth.ts                   # Login, logout, heartbeat
│   │   ├── bills.ts                  # Bill creation & history
│   │   ├── chats.ts                  # E2EE chat message routes
│   │   ├── coupons.ts                # Coupon CRUD & redemption
│   │   ├── products.ts               # Inventory CRUD + CSV import
│   │   ├── print.ts                  # Receipt generation
│   │   ├── reservations.ts           # OTP bill pickup
│   │   ├── settings.ts               # Shop settings CRUD
│   │   ├── shifts.ts                 # Shift open/close + Z-report
│   │   └── users.ts                  # User management, attendance
│   └── services/                     # Background services
│
├── src/                              # React frontend
│   ├── main.tsx                      # App bootstrap
│   ├── app/
│   │   ├── App.tsx                   # Root component + providers
│   │   ├── routes.ts                 # React Router route declarations
│   │   ├── contexts/
│   │   │   ├── auth-context.tsx      # Auth state + session management
│   │   │   └── theme-context.tsx     # Theme token provider
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts       # LAN WebSocket hook
│   │   │   ├── useConfirm.tsx        # Async confirm dialog hook
│   │   │   └── useDeferredLocalStorage.ts
│   │   ├── components/
│   │   │   ├── cashier-billing-advanced.tsx  # Main checkout sheet
│   │   │   ├── analytics-dashboard.tsx       # Sales analytics + AI panel
│   │   │   ├── pos-settings.tsx              # 16-tab settings panel
│   │   │   ├── employee-management.tsx       # Staff CRUD
│   │   │   ├── shift-closing-modal.tsx       # Denomination counter
│   │   │   ├── shift-start-modal.tsx         # Shift open form
│   │   │   ├── login-page.tsx                # Auth page
│   │   │   ├── layout.tsx                    # Dashboard shell + nav
│   │   │   ├── product-photo-capture-modal.tsx  # Image capture flow
│   │   │   └── ui/
│   │   │       ├── e2ee-chatbox.tsx          # AES-256-GCM chat
│   │   │       ├── liquid-glass-card.tsx     # Glassmorphism card
│   │   │       └── …                         # Other shadcn/ui components
│   │   ├── sectors/                  # Retail/Grocery/Wholesale sector UI
│   │   ├── lib/                      # Shared utilities
│   │   └── utils/
│   │       ├── api.ts                # Typed REST client
│   │       ├── imageCompressor.ts    # Client-side image compression
│   │       └── glare.ts/tsx          # Liquid glass glare effect
│   ├── styles/
│   │   ├── globals.css               # Global resets
│   │   ├── design-tokens.css         # CSS custom properties
│   │   ├── theme.css                 # Light/dark theme vars
│   │   ├── fonts.css                 # Public Sans + IBM Plex Mono
│   │   └── redesign.css              # NexusFlow instrument-panel overrides
│   └── assets/                       # Static images & SVGs
│
├── website/                          # Customer-facing website (separate app)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/                          # Website React components
│   └── public/                       # Website static assets
│
├── android app/                      # Native Kotlin Android wrapper
│   └── app/src/main/
│       ├── AndroidManifest.xml
│       └── java/com/nexusflow/pos/MainActivity.kt
│
└── scripts/
    └── dev.js                        # Concurrently runner for dev mode
```

---

## ⚙️ Setup & Running

### Prerequisites

- **Node.js** 20+ (LTS recommended)
- **pnpm** 9+ (`npm install -g pnpm`)
- A modern browser (Chrome 88+, Edge 88+, or Firefox 90+ with BarcodeDetector polyfill)

### 1. Install dependencies

```bash
pnpm install
```

This installs all workspace packages (root + `/website`).

### 2. Development (hot reload)

```bash
# Starts both Express server (port 3000) and Vite dev server (port 5173)
pnpm dev
```

Or with LAN access (open to all devices on the network):

```bash
pnpm dev:host
```

Open: `http://localhost:5173` (or `http://<your-machine-ip>:5173` on other LAN devices)

### 3. Production build & run

```bash
# Build React SPA + compile TypeScript server
pnpm build

# Start production Express server (serves SPA + API on port 3000)
pnpm start
```

Open: `http://localhost:3000` (or `http://<your-machine-ip>:3000`)

### 4. Customer website (development)

```bash
pnpm website:dev
```

### 5. First-time setup

On first startup, the server automatically:
1. Creates the SQLite database (`retail.db`) with all tables
2. Runs schema migrations
3. Seeds a default owner account — **change the password immediately in Settings → Users**

---

## 📜 Available Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start dev server (Express + Vite, port 3000/5173) |
| `pnpm dev:host` | Dev server exposed to LAN (`--host`) |
| `pnpm dev:server` | Express server only (tsx watch) |
| `pnpm dev:client` | Vite only |
| `pnpm build` | Production build (SPA + server TS compile) |
| `pnpm build:client` | Vite SPA build only |
| `pnpm build:server` | TypeScript server compile only |
| `pnpm start` | Run compiled production server |
| `pnpm website:dev` | Customer website dev server |
| `pnpm website:build` | Customer website production build |
| `pnpm test` | Run full test suite (Vitest, 179 tests) |
| `pnpm test:watch` | Vitest in watch mode |

---

## 🔐 Environment Variables

NexusFlow needs minimal configuration. Create a `.env` file in the project root (never commit this):

```env
# Server
PORT=3000
JWT_SECRET=replace-with-a-long-random-string

# Database path (defaults to ./retail.db)
DB_PATH=./retail.db
```

For the customer website, create `website/.env` (see `website/.env.example`):

```env
VITE_API_BASE_URL=http://<your-server-ip>:3000
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `F1` | Open barcode scanner / quick-scan input |
| `F2` | Add product by name search |
| `F3` | Focus customer phone lookup |
| `F4` | Print current receipt |
| `F5` | Toggle wholesale pricing tier |
| `F8` | Open discounts & loyalty card |
| `F9` | Print last bill |
| `F10` | Open OTP bill pickup |
| `F12` | Open shift closing |
| `Escape` | Close any open modal, sheet, or dialog |
| `Tab` / `Shift+Tab` | Roving focus through all interactive elements |
| `Enter` / `Space` | Activate focused button or list item |
| `Arrow keys` | Navigate within tablist, select menus |

> All shortcuts are WAI-ARIA compliant with full roving `tabIndex` and focus trapping inside modals.

---

## 📷 Barcode Scanner Support

NexusFlow uses a **dual decode engine** with automatic fallback:

1. **Primary:** Native `BarcodeDetector` API (Chrome 83+, Edge 83+) — hardware-accelerated, zero latency
2. **Fallback:** `@zxing/library` with `TRY_HARDER` hint — software decode, works in Firefox and older browsers

**Supported formats:**

| Category | Formats |
|---|---|
| 1D Retail | EAN-13, EAN-8, UPC-A, UPC-E |
| 1D Industrial | Code 128, Code 39, Code 93, ITF, Codabar |
| GS1 | DataBar RSS-14, DataBar Expanded |
| 2D | QR Code, Data Matrix, Aztec, PDF417 |

**Scanner modes:**
- **Continuous RAF loop** — scans every animation frame for instant detection
- **90° orientation pass** — automatically detects vertical barcodes without rotating the device
- **Photo capture** — tap a capture button to decode a still frame via ZXing

---

## 📱 Mobile Usage

Access the full POS app on any phone or tablet connected to the same LAN:

1. Run `pnpm dev:host` (or `pnpm start` in production)
2. Open `http://<server-ip>:3000` on the mobile browser
3. The UI automatically switches to a mobile-optimized layout on viewports < 768 px

**Mobile-specific features:**
- Live barcode scanner via rear camera (progressive HD → standard → any fallback)
- Photo capture for product images — compress on device, process on server
- Compact cart with swipe-to-remove
- In-browser camera works over plain HTTP on LAN (no HTTPS required for same-network devices in Chrome)

**Android app wrapper** (`/android app/`):
- Native Kotlin `WebView` wrapper with immersive fullscreen sticky mode
- Bridges `getUserMedia` camera permissions to Android runtime
- Caches server IP in `SharedPreferences` — enter once, remembered forever

---

## 🌐 Customer Website

The `/website/` directory is a **completely separate Vite/React application** that provides a public-facing storefront:

- Product catalog with enhanced white-background images (served from NexusFlow `/uploads/`)
- Shopping cart
- WhatsApp order integration (click-to-order via `wa.me` link)
- Coupon display — only shows active, unredeemed coupons
- Syncs product data from NexusFlow REST API

**Run in parallel with the main app:**
```bash
# Terminal 1
pnpm dev        # Main POS (port 3000/5173)

# Terminal 2
pnpm website:dev  # Customer website (port 5174)
```

---

## 🗃️ Database Schema

SQLite database (`retail.db`) in WAL mode for concurrent reads:

```
users               — staff accounts, roles, password hashes
shift_records       — shift open/close times, cash amounts
break_records       — break start/end per user
bills               — completed transactions (items stored as JSON)
customers           — phone, name, loyalty points, total spent
chats               — E2EE ciphertext messages
coupons             — single-use coupon codes
reservations        — OTP bill pickup queue
products            — inventory, pricing tiers, HSN, UOM
settings            — shop name, address, GST, sector, theme
attendance          — daily attendance records
```

---

## 📡 WebSocket Events

All terminals subscribe to a single WebSocket connection. Events:

| Event | Triggered by | Effect on receivers |
|---|---|---|
| `STOCK_UPDATED` | Product edit/add | Reload product catalogue |
| `IMAGE_ENHANCED` | Server finishes image processing | Refresh product image |
| `SALES_CHANGED` | Bill completed | Update analytics charts |
| `SHIFT_CHANGED` | Shift open/close | Refresh shift status badge |
| `BREAK_CHANGED` | Break start/end | Update employee status indicator |
| `SESSION_CHANGED` | Login/logout | Refresh active users list |
| `SESSION_INVALIDATED` | Concurrent login | Force-logout old session |
| `COUPON_REDEEMED` | Coupon used | Remove coupon from all UI |
| `RESERVATION_CLAIMED` | OTP pickup confirmed | Remove from pickup queue |
| `ACTIVE_USERS_LIST` | Server heartbeat | Update online badge count |

---

## 🖼️ Product Image Pipeline

```
Phone camera capture
       │
       ▼
Client-side compression (imageCompressor.ts)
  12–48 MP → ~250 KB JPEG
       │
       ▼  POST /api/products/:id/image
Server receives image buffer
       │
       ▼
sharp — Sobel edge detection
  + Corner consensus (BFS flood fill)
  + Background classification
       │
       ▼
White (#FFFFFF) background compositing
  + Brightness/saturation/sharpness enhancement
       │
       ▼
WebP output → saved to /uploads/
       │
       ▼
WebSocket broadcast: STOCK_UPDATED + IMAGE_ENHANCED
```

---

## 🚀 Deployment Notes

### LAN Deployment (recommended)

1. Run `pnpm build` on the host machine
2. Run `pnpm start` — Express serves everything on port 3000
3. All devices on the same WiFi/LAN can connect via `http://<host-ip>:3000`
4. No SSL required for camera access on Chrome within LAN (localhost exemption + LAN IP exemption)

### Cloudflare Tunnel (remote access)

For remote access without port forwarding:

```bash
cloudflared tunnel --url http://localhost:3000
```

NexusFlow's `vite.config.ts` already includes `*.trycloudflare.com` in `allowedHosts`, so the Cloudflare tunnel URL works out of the box.

### Production Checklist

- [ ] Set a strong `JWT_SECRET` in `.env`
- [ ] Change the default owner password in Settings → Users
- [ ] Configure `DB_PATH` to a persistent storage location (not temporary)
- [ ] Set up OS-level backup for the SQLite database file
- [ ] Test barcode scanning on the intended hardware before go-live

### What Is NOT included (intentionally)

- No Docker config — SQLite + Node.js runs natively; containerization is straightforward if needed
- No cloud database — SQLite is the deliberate choice for offline-first LAN operation
- No HTTPS cert management — use a reverse proxy (nginx/Caddy) or Cloudflare tunnel for SSL

---

## 🧪 Test Suite

**179 tests across 8 test suites** powered by [Vitest](https://vitest.dev/):

```bash
pnpm test          # run once
pnpm test:watch    # watch mode
```

Tests cover:
- Product CRUD API routes
- Bill creation and GST calculation logic
- Coupon atomic redemption (single-use enforcement)
- Barcode format detection utilities
- Image compression pipeline
- Loyalty point tier thresholds
- CSV import validation
- WebSocket event broadcasting

---

## 📄 License & Attributions

See [ATTRIBUTIONS.md](./ATTRIBUTIONS.md) for third-party library credits.

---

<p align="center">
  <sub>nexusflow</sub>
</p>
