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
  <img src="https://img.shields.io/badge/tests-356%20passed-brightgreen" alt="356 tests"/>
</p>

---

## Table of Contents

1. [Project Overview](#-project-overview)
2. [Architecture](#️-architecture)
3. [Tech Stack](#-tech-stack)
4. [Feature Reference](#-feature-reference)
5. [WhatsApp Web QR Linked Device Integration](#-whatsapp-web-qr-linked-device-integration)
6. [Store Email & Digital GST Tax Invoices](#-store-email--digital-gst-tax-invoices)
7. [Thermal Printer Discovery & ESC/POS Direct Print](#-thermal-printer-discovery--escpos-direct-print)
8. [Directory Structure](#-directory-structure)
9. [Setup & Installation Guide](#️-setup--installation-guide)
10. [Available Scripts](#-available-scripts)
11. [Environment Variables](#-environment-variables)
12. [Keyboard Shortcuts](#️-keyboard-shortcuts)
13. [Barcode Scanner Support (Live Mobile & Hardware)](#-barcode-scanner-support)
14. [Mobile Usage & Android App](#-mobile-usage--android-app)
15. [Product Photo & Enhancement Pipeline](#-product-photo--enhancement-pipeline)
16. [Database Schema](#️-database-schema)
17. [WebSocket Real-Time Events](#-websocket-real-time-events)
18. [Deployment Notes](#-deployment-notes)
19. [Test Suite](#-test-suite)
20. [License & Attributions](#-license--attributions)

---

## 🏪 Project Overview

NexusFlow is a production-grade, self-hosted Point-of-Sale (POS) platform designed for **retail stores, supermarkets, grocery shops, and wholesale distributors**. It runs completely on a Local Area Network (LAN) — requiring zero external internet connection — ensuring continuous operation without cloud latency, subscription fees, or service downtime.

### Core Strengths
- ⚡ **Instant Checkout**: Real-time barcode scan → cart auto-addition → receipt generation in milliseconds.
- 📱 **Shop WhatsApp Web Linked Device**: Scan QR once in POS Settings to connect the store's WhatsApp phone. Automatic background invoice dispatch to customer phones upon bill generation with zero monthly API fees.
- 📧 **Automated Digital GST Tax Invoices**: 1-minute Gmail onboarding with Google App Passwords; instant responsive HTML receipts delivered to customer inbox.
- 🖨️ **Thermal Printer Auto-Discovery**: Automatic detection of 58mm & 80mm ESC/POS network and USB thermal receipt printers with zero-delay printing.
- 📷 **Live Hardware-Style Mobile Scanner**: Point phone/tablet camera at any barcode for instant continuous decoding with audio beep and haptic feedback — no photo taking needed.
- 🖼️ **Studio Product Photo Pipeline**: Built-in camera capture with 90° rotation correction, adaptive de-blurring, automated background isolation, and WebP compression.
- ✏️ **Full Product Editing**: In-place catalog updating for product names, barcodes, prices, stock levels, categories, and photos with real-time multi-terminal broadcast.
- 🔒 **Self-Contained Data Privacy**: All transactional and inventory data stays inside your on-premise SQLite WAL database.
- 📱 **Multi-Device LAN Mesh**: Seamlessly accessible across desktop counter PCs, handheld tablets, smartphones, and Android POS terminals.
- 🎨 **Instrument-Panel Interface**: Built with high-contrast data ink, Public Sans typography, and IBM Plex Mono figures for rapid readability under counter lighting.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Local Area Network (LAN)                        │
│                                                                        │
│  ┌───────────────────────┐             ┌─────────────────────────────┐ │
│  │   Desktop Cashier     │  REST + WS  │      Express.js Server      │ │
│  │   Browser / POS PC    │◄───────────►│      (Node.js + TS)         │ │
│  │   (Port 5173 / 3000)  │             │      Port 3000              │ │
│  └───────────────────────┘             │                             │ │
│                                        │  ┌────────────────────────┐ │ │
│  ┌───────────────────────┐             │  │ SQLite (WAL mode)      │ │ │
│  │   Mobile / Tablet     │  HTTPS / WS │  │ better-sqlite3         │ │ │
│  │   Continuous Scanner  │◄───────────►│  └────────────────────────┘ │ │
│  │   (Rear Camera View)  │             │                             │ │
│  └───────────────────────┘             │  ┌────────────────────────┐ │ │
│                                        │  │ WebSocket Server (ws)  │ │ │
│  ┌───────────────────────┐             │  └────────────────────────┘ │ │
│  │   Android POS Device  │  Native Web │                             │ │
│  │   (Kotlin App)        │◄───────────►│  ┌────────────────────────┐ │ │
│  └───────────────────────┘             │  │ WhatsApp Web Gateway   │ │ │
│                                        │  │ (@whiskeysockets/baileys│ │
│  ┌───────────────────────┐             │  └────────────────────────┘ │ │
│  │   ESC/POS Thermal     │   Direct    │                             │ │
│  │   Receipt Printers    │◄──Network───│  ┌────────────────────────┐ │ │
│  │   (58mm / 80mm)       │    / USB    │  │ Store Email / Nodemailer││
│  └───────────────────────┘             │  └────────────────────────┘ │ │
│                                        │                             │ │
│                                        │  ┌────────────────────────┐ │ │
│                                        │  │ Sharp Image Engine     │ │ │
│                                        │  └────────────────────────┘ │ │
│                                        └─────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

The server binary handles:
- Serving the compiled React Vite SPA.
- Routing all REST APIs under `/api/*`.
- Broadcasting real-time state mutations via WebSocket (`STOCK_UPDATED`, `SALES_CHANGED`, `WHATSAPP_STATUS_CHANGED`).
- Managing the persistent WhatsApp Web multi-device session for zero-fee customer messaging.
- Dispatching digital GST tax invoices and HTML receipts through store Gmail / SMTP.
- Autodiscovering and communicating directly with LAN and USB thermal receipt printers.
- Executing server-side image processing, adaptive deblurring, and background extraction.

---

## 🛠️ Tech Stack

### Frontend Client
| Layer | Technology |
|---|---|
| Framework | React 18.3 + TypeScript 5 |
| Build Tool & Dev Server | Vite 6 (with `@vitejs/plugin-basic-ssl` for LAN HTTPS camera permissions) |
| Styling | Tailwind CSS 4 + Radix UI primitives + Lucide Icons |
| State & Routing | React Router 7 |
| Real-Time Communication | Native Browser WebSocket Client with auto-reconnect |
| Barcode Engine | Native W3C `BarcodeDetector` API + `@zxing/library` continuous fallback |
| Charts & Data Viz | Recharts |
| Animations | Motion (Framer Motion v12) |
| Typography | Public Sans (UI) & IBM Plex Mono (Financial / Quantities) |

### Backend Server
| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ (ESM modules) |
| Web Framework | Express.js 5 |
| Language | TypeScript (run via `tsx` in dev, `tsc` for production) |
| Database Engine | SQLite via `better-sqlite3` with Write-Ahead Logging (`WAL`) mode |
| Authentication | JSON Web Tokens (`jsonwebtoken`) + `bcryptjs` password hashing |
| Real-Time Engine | `ws` WebSocket Server |
| WhatsApp Gateway | `@whiskeysockets/baileys` (Native WhatsApp Web Multi-Device protocol & QR session engine) |
| Email Service | `nodemailer` (Store Gmail / SMTP background delivery) |
| Thermal Printing | Direct ESC/POS socket streaming with UDP auto-discovery |
| Image Processing | `sharp` (adaptive unsharp masking, Sobel edge classification, BFS flood-fill, WebP export) |
| Cryptography | Client-side AES-256-GCM for End-to-End Encrypted terminal chat |

### Android Client
| Layer | Technology |
|---|---|
| Platform | Android 8.0+ (API 26+) |
| Language | Kotlin |
| Shell | Android `WebView` with hardware acceleration |
| Camera Support | Android `WebChromeClient` + `FileProvider` camera bridge |

---

## ✨ Feature Reference

### 1. Advanced Cashier Register & Checkout
- **Dual Responsive Layout**: Full desktop POS grid with multi-column item tables, and compact mobile card stack for handheld scanning.
- **Continuous Live Barcode Scanner**: Hardware-scanner experience on phones and webcams with zero photo-taking.
- **Wholesale & Retail Tiering**: Instant switching between Retail, Dealer, and Distributor pricing.
- **Smart Cart Controls**: Quantity increments, real-time item discount overrides, and fast swipe-to-delete.
- **GST Tax Engine**: Automatic identification of intra-state (CGST + SGST) vs. inter-state (IGST) taxation based on store configuration.
- **Khata Ledger (Customer Credit)**: Instantly bill orders on customer credit accounts with automatic balance tracking.

### 2. Product Management & In-Place Editing
- **Edit Any Existing Product**: Modal to update product name, barcode, selling price, wholesale prices, purchase price, category, stock count, and product image.
- **RFC-4180 CSV Import/Export**: Bulk catalog upload and CSV export formatted for spreadsheet editing.
- **Real-Time Catalog Sync**: Edits broadcast via WebSocket to update every active terminal immediately.

### 3. Studio Photo Capture & Image Enhancement
- **In-App Camera Viewfinder**: Direct camera capture with instant preview.
- **90° Rotation Tool**: Fix sideways or upside-down photos with 90° clockwise rotation steps (`90°`, `180°`, `270°`).
- **Retake Assurance**: Discard blurry or poorly framed shots with one tap.
- **Server-Side Adaptive De-Blurring**: Evaluates Laplacian variance and applies unsharp masking and contrast normalization to sharpen soft-focus product labels.
- **Automated Studio Background Isolation**: Removes background using edge-barrier detection and outputs clean WebP images on pure `#FFFFFF`.

### 4. Discounts, Coupons & Loyalty Points
- **Single-Use Coupons**: Atomic database-enforced coupon redemption preventing double usage across concurrent registers.
- **Customer Loyalty System**: Earn and redeem points based on customizable spend thresholds.
- **LAN-Wide Synchronization**: Redeemed coupons instantly disappear across all active terminals via WebSocket push.

### 5. Shift Management & Cashier Auditing
- **Denomination Calculator**: Physical cash reconciliation (₹2000, ₹500, ₹200, ₹100, ₹50, ₹20, ₹10, coins) with expected vs. actual variance calculations.
- **Z-Report Generation**: Printable daily closure reports with total sales, tax breakdowns, and cash discrepancies.
- **Staff Attendance Tracking**: Date-aware attendance grid with check-in, check-out, break tracking, and admin overrides.

### 6. Analytics & Intelligence
- **Sales Analytics Dashboard**: Daily, weekly, and monthly revenue and volume metrics via Recharts.
- **Linear Regression Forecasting**: Projects 7-day sales trends with $R^2$ confidence scoring.
- **GSTR-1 Compliance Reports**: Ready-to-file tax summaries aggregated by HSN code and tax slab.

### 7. End-to-End Encrypted Terminal Chat & OTP Pickup
- **E2EE Communication**: AES-256-GCM encrypted messaging between cashier terminals where the server only acts as a blind relay.
- **OTP Order Pickup**: Customer-facing pickup tokens for pre-packed orders, auto-claimed upon receipt.

### 8. Shop WhatsApp Web QR Linked Device Integration
- **Zero Third-Party Fees**: Directly connects store's existing WhatsApp phone using `@whiskeysockets/baileys` — no Twilio or Cloud API fees.
- **Automated Bill Dispatch**: Sends itemized digital bills, tax breakdowns, and payment confirmation automatically on checkout.
- **Khata Ledger Alerts**: 1-click ledger reminder dispatch to customers with pending balances.

### 9. Store Email & Digital GST Tax Invoices
- **1-Minute Gmail Setup**: Onboard in seconds with standard Google App Passwords.
- **Automatic Background E-Invoices**: Responsive HTML tax receipts delivered automatically to customer inboxes.
- **Modular Beta Features**: Configurable toggle in Settings unlocking Outlook, Zoho, and Custom SMTP servers.

### 10. Thermal Printer Auto-Discovery & ESC/POS Direct Print
- **Hardware Discovery**: Scans LAN and USB for 58mm and 80mm thermal receipt printers.
- **Direct ESC/POS Output**: Instant receipt dispensing with cash drawer kick and paper cut support.

---

## 📱 WhatsApp Web QR Linked Device Integration

NexusFlow connects directly to your store's WhatsApp account as a linked device using the multi-device protocol:

```
POS Checkout Counter                       Store Server (Node.js)                  Customer Phone
         │                                          │                                     │
         ├───► "Generate Bill" (Phone provided) ───►│                                     │
         │                                          ├───► Formats Itemized Receipt        │
         │                                          │     with GST Breakdown              │
         │                                          │                                     │
         │                                          ├───► Baileys Linked Device Socket ──►│ Customer Receives
         │                                          │     (server/data/whatsapp-auth/)    │ WhatsApp Message
         │◄─── Broadcasts WHATSAPP_STATUS_CHANGED ──┤                                     │ in < 1 Second!
```

### Key Capabilities:
- **Zero Cloud API Fees**: Bypasses costly enterprise messaging brokers (Twilio, Gupshup, Meta Cloud API). Runs 100% locally from the store's physical smartphone.
- **1-Click QR Pairing in POS Settings**:
  1. Open **Settings → WhatsApp** in the POS navigation.
  2. Click **Connect Shop WhatsApp** to generate a dynamic pairing QR code.
  3. Open WhatsApp on your shop phone → tap **Linked Devices** → **Link a Device** and scan the screen.
  4. The POS updates to `CONNECTED` status immediately with live WebSocket sync.
- **Automated Background Dispatch**: When the cashier enters a customer phone number during checkout, the itemized bill (products, quantities, discounts, CGST/SGST/IGST breakdown, and total) is dispatched instantly upon clicking **Generate Bill**.
- **Khata Customer Reminders**: Send pending balance reminders and statement summaries directly to customer WhatsApp chats from the Khata page.
- **Encrypted Local Credentials**: Session keys are stored locally in `server/data/whatsapp-auth/` and strictly protected in `.gitignore`.

---

## 📧 Store Email & Digital GST Tax Invoices

Provide customers with instant digital receipts and compliant tax invoices delivered directly to their email inbox:

### 1-Minute Gmail Setup (Production Default)
- Standard Gmail integration using Google App Passwords (`myaccount.google.com/apppasswords`).
- Built-in **Test Connection** button in **Settings → Email** verifies SMTP connectivity before saving.

### Automated Background Dispatch
- If a customer email is captured at checkout, NexusFlow formats a clean, responsive HTML invoice and delivers it in the background via Nodemailer without delaying counter checkout.
- Includes store branding, GSTIN, invoice date, itemized table, tax breakdown, and payment mode.

### Modular Beta Features System (`src/app/lib/beta-features.ts`)
- To maintain maximum counter stability, NexusFlow defaults to Gmail for standard retail deployments.
- Store administrators can enable **Beta Features** in Settings with 1 click to unlock advanced email providers:
  - **Microsoft Outlook / Office 365** (`smtp.office365.com:587`)
  - **Zoho Mail** (`smtp.zoho.com:465`)
  - **Custom SMTP Servers** (arbitrary host, ports 25 / 465 / 587, SSL/TLS toggles, custom sender name)

---

## 🖨️ Thermal Printer Discovery & ESC/POS Direct Print

- **Universal Auto-Discovery**: Automatically probes local network (raw socket port 9100) and system USB ports for attached receipt printers.
- **ESC/POS Engine**: Generates direct binary ESC/POS command streams for both **58mm** and **80mm** roll printers.
- **Zero Dialog Delay**: Dispenses receipts immediately on payment without triggering OS print preview dialogs.
- **Cash Drawer & Cutter**: Sends hardware kick pulse (`ESC p`) and full/partial paper cut (`GS V`) codes upon bill completion.

---

## 📂 Directory Structure

```
billing-software/
├── index.html                        # Main SPA HTML entry point
├── package.json                      # Dependencies and automation scripts
├── pnpm-workspace.yaml               # Workspace configuration
├── vite.config.ts                    # Vite config (Basic SSL, 127.0.0.1 proxy, allowedHosts)
├── tsconfig.json                     # Frontend TypeScript config
├── tsconfig.server.json              # Server TypeScript config
├── .env.example                      # Environment variable template
│
├── server/                           # Express.js backend application
│   ├── index.ts                      # Server bootstrap (Express + WebSocket)
│   ├── db.ts                         # SQLite schema, WAL setup & migrations
│   ├── middleware/
│   │   └── auth.ts                   # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.ts                   # Login, logout & session management
│   │   ├── bills.ts                  # Billing, sales & receipt retrieval
│   │   ├── chats.ts                  # E2EE terminal messaging endpoints
│   │   ├── coupons.ts                # Atomic coupon generation & redemption
│   │   ├── email.ts                  # Store SMTP settings, test & dispatch
│   │   ├── email.test.ts             # Email suite test cases
│   │   ├── products.ts               # Inventory CRUD, editing & CSV bulk import
│   │   ├── print.ts                  # Receipt layout generator & direct print
│   │   ├── reservations.ts           # OTP pickup queue
│   │   ├── settings.ts               # Store configuration & tax settings
│   │   ├── shifts.ts                 # Shift opening, closing & Z-report
│   │   ├── users.ts                  # User accounts & attendance
│   │   ├── whatsapp.ts               # WhatsApp QR pairing, status & message APIs
│   │   └── whatsapp.test.ts          # WhatsApp suite test cases
│   └── services/
│       ├── emailManager.ts           # Nodemailer transport & HTML invoice builder
│       ├── imageProcessor.ts         # Sharp image enhancement & background cut
│       └── whatsappManager.ts        # Baileys WhatsApp Web socket manager
│
├── src/                              # React frontend application
│   ├── main.tsx                      # Frontend entry point
│   ├── app/
│   │   ├── App.tsx                   # Top-level application router
│   │   ├── routes.ts                 # Route definitions
│   │   ├── contexts/
│   │   │   ├── auth-context.tsx      # User authentication state
│   │   │   └── theme-context.tsx     # Theme provider
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts       # Real-time WebSocket event listener
│   │   │   └── useConfirm.tsx        # Modal confirmation hook
│   │   ├── components/
│   │   │   ├── cashier-billing-advanced.tsx  # Main cashier counter & live scanner
│   │   │   ├── analytics-dashboard.tsx       # Analytics, inventory & product edit
│   │   │   ├── pos-settings.tsx              # 16-tab store administration panel
│   │   │   ├── product-photo-capture-modal.tsx # Camera viewfinder & rotation tool
│   │   │   ├── shift-closing-modal.tsx       # Cash reconciliation counter
│   │   │   ├── shift-start-modal.tsx         # Shift opening modal
│   │   │   ├── login-page.tsx                # Cashier authentication screen
│   │   │   ├── layout.tsx                    # Top navigation & system shell
│   │   │   └── ui/                           # Radix UI + Tailwind design primitives
│   │   ├── lib/
│   │   │   └── beta-features.ts              # Modular feature-flagging utility
│   │   └── utils/
│   │       ├── api.ts                        # Typed REST API client
│   │       ├── barcodeDecoder.ts             # Continuous camera stream decoder
│   │       ├── email.ts                      # Frontend email helper client
│   │       ├── imageCompressor.ts            # Client-side canvas compression
│   │       └── whatsapp.ts                   # Frontend WhatsApp helper client
│   └── styles/
│       ├── globals.css                       # Base layout & font definitions
│       └── design-tokens.css                 # Color tokens & theme parameters
│
├── print software/                           # Thermal printer discovery & profiles
│   ├── src/
│   │   ├── printerDiscovery.ts               # UDP/Network & USB printer scanner
│   │   └── profiles/                         # ESC/POS printer profile definitions
│   └── tests/
│       └── printerDiscovery.test.ts          # Hardware discovery test suite
│
├── android app/                              # Native Kotlin Android wrapper
│   └── app/src/main/
│       ├── AndroidManifest.xml               # Permissions & FileProvider configs
│       └── java/com/nexusflow/pos/MainActivity.kt  # Fullscreen WebView & camera bridge
│
└── scripts/
    └── dev.js                                # Concurrently orchestrator for dev
```

---

## ⚙️ Setup & Installation Guide

Follow these step-by-step instructions to get NexusFlow running locally or on your store network.

### Prerequisites

Ensure you have installed on your host machine:
- **Node.js**: `v20.0.0` or higher (LTS recommended) — [Download Node.js](https://nodejs.org/)
- **pnpm**: `v9.0.0` or higher — Install via `npm install -g pnpm`
- **Git**: [Download Git](https://git-scm.com/)

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/NIWDOGLEOJ/billing-software.git
cd billing-software
```

---

### Step 2: Install Dependencies

NexusFlow uses `pnpm` for fast, reproducible dependency resolution:

```bash
pnpm install
```

---

### Step 3: Configure Environment Variables

Copy the provided `.env.example` file to `.env`:

```bash
cp .env.example .env
```

Open `.env` in any text editor and adjust if needed:

```env
# Server Port (default 3000)
PORT=3000
NODE_ENV=development

# Change to a strong random string in production
JWT_SECRET=change-this-to-a-secure-random-string-in-production

# SQLite database file path (stored locally)
DB_PATH=./retail.db
```

---

### Step 4: Run in Development Mode

To start both the Express backend and the Vite frontend concurrently:

```bash
pnpm dev
```

- **Frontend**: Accessible at `https://localhost:5173` (or `http://localhost:5173`)
- **Backend API**: Running at `http://localhost:3000`

#### Running for LAN Access (Phones, Tablets & Handhelds)

To allow smartphones, tablets, and counter PCs on the same Wi-Fi network to connect:

```bash
pnpm dev:host
```

Vite will print the LAN IP address (for example: `https://192.168.1.15:5173`).
> **HTTPS on LAN**: NexusFlow automatically serves Vite over self-signed HTTPS using `@vitejs/plugin-basic-ssl`. This ensures modern mobile browsers (Chrome, Safari) grant camera access to the live barcode scanner without insecure origin restrictions.

---

### Step 5: Production Build & Deployment

For a production deployment on your counter server:

```bash
# 1. Compile the React SPA and TypeScript server
pnpm build

# 2. Start the standalone production server
pnpm start
```

The Express server serves the optimized React application, handles all REST and WebSocket connections, and listens on port `3000`:
- **Local access**: `http://localhost:3000`
- **LAN access**: `http://<server-ip>:3000`

---

### Step 6: Initial Login & Setup

On the first launch:
1. The SQLite database (`retail.db`) is initialized automatically with all necessary tables and indexes.
2. A default administrative account is created:
   - **Username**: `admin`
   - **Password**: `admin123`
3. Log in and navigate to **Settings → Users** to change the default admin password immediately.
4. Go to **Settings → General** to configure your store name, address, and GSTIN.

---

## 📜 Available Scripts

| Command | Action |
|---|---|
| `pnpm dev` | Starts Express server (port 3000) + Vite dev server (port 5173) |
| `pnpm dev:host` | Starts dev server exposed to LAN (`--host`) with HTTPS enabled for camera |
| `pnpm dev:server` | Runs backend Express server alone via `tsx watch` |
| `pnpm dev:client` | Runs frontend Vite dev server alone |
| `pnpm build` | Compiles frontend SPA into `dist/` and compiles server TypeScript into `dist-server/` |
| `pnpm build:client` | Builds Vite frontend only |
| `pnpm build:server` | Compiles server TypeScript with `tsc` only |
| `pnpm start` | Launches compiled production server (`node dist-server/index.js`) |
| `pnpm test` | Runs the full Vitest automated test suite (**356 passing tests**) |
| `pnpm test:watch` | Runs Vitest in interactive watch mode |

---

## 🔐 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port on which Express server listens |
| `NODE_ENV` | `development` | Environment mode (`development` / `production`) |
| `JWT_SECRET` | *(required in prod)* | Cryptographic secret key used to sign session tokens |
| `DB_PATH` | `./retail.db` | Filesystem path for the SQLite database file |

---

## ⌨️ Keyboard Shortcuts

Designed for high-speed counter operation with standard physical POS keyboards:

| Key | Action |
|---|---|
| `F1` | Open live barcode scanner / quick-scan input |
| `F2` | Search product by name / catalog picker |
| `F3` | Focus customer phone search |
| `F4` | Print current receipt |
| `F5` | Toggle wholesale pricing tier (Retail / Dealer / Distributor) |
| `F8` | Open unified discounts and coupon redemption sheet |
| `F9` | Print previous bill |
| `F10` | Open OTP bill pickup drawer |
| `F12` | Open shift closing & cash drawer reconciliation |
| `Escape` | Close active modal, sheet, or dialog |
| `Tab` / `Shift+Tab` | Roving focus across input fields |
| `Enter` | Add item or confirm prompt |

---

## 📷 Barcode Scanner Support

NexusFlow features a **high-speed dual barcode engine**:

```
Live Camera Stream (WebRTC getUserMedia)
                 │
                 ▼
  W3C Native BarcodeDetector (Chrome / Edge / Android)
                 │  Hardware-accelerated
                 │  ~15ms per frame
                 ├─► SUCCESS ──► Audio Beep + Haptic Vibrate + Auto Add to Cart
                 ▼  (if unsupported or frame unread)
  ZXing Multi-Format Reader with TRY_HARDER
                 │  Software fallback
                 ├─► SUCCESS ──► Audio Beep + Haptic Vibrate + Auto Add to Cart
```

### Live Mobile Scanning (No Pictures Needed)
- **Continuous Viewfinder**: Direct video feed at 80ms sampling cadence. Point your phone camera at a barcode, and the item rings up instantly.
- **Hardware-Style Feedback**:
  - **Audio confirmation**: 1850 Hz / 2400 Hz synthesized POS chime via Web Audio API.
  - **Haptic buzz**: 45ms vibration pulse on mobile devices via `navigator.vibrate`.
  - **Reticle animation**: Visual green reticle flash and target box.
- **Smart Deduplication**: 1.5-second refractory filter prevents duplicate scans of the same item while allowing rapid successive scanning of different items.
- **Camera Controls**: Quick flip between rear and front cameras, torch/flashlight toggle on supported hardware.

### Supported Barcode Symbologies
- **1D Retail**: EAN-13, EAN-8, UPC-A, UPC-E
- **1D Industrial**: Code 128, Code 39, Code 93, ITF (Interleaved 2 of 5), Codabar
- **GS1 Symbologies**: GS1 DataBar RSS-14, GS1 DataBar Expanded
- **2D Formats**: QR Code, Data Matrix, Aztec, PDF417

---

## 📱 Mobile Usage & Android App

### Browser-Based Mobile POS
1. Ensure your computer and smartphone are connected to the same Wi-Fi router.
2. Run `pnpm dev:host` (or `pnpm start` in production).
3. Open the LAN HTTPS address printed in your terminal on your mobile browser (e.g. `https://192.168.1.15:5173`).
4. Accept the local self-signed certificate once.
5. The UI automatically adapts to a touch-optimized mobile interface.

### Native Android POS App (`android app/`)
For dedicated Android POS handhelds or smartphones:
- Built in Kotlin with full hardware acceleration.
- Native `FileProvider` and `WebChromeClient` implementation ensuring zero camera permission issues.
- Integrated Android 11+ `<queries>` declarations for camera hardware.
- Immersive fullscreen sticky mode maximizing screen real estate for cashiers.
- Remembers store server IP in `SharedPreferences`.

---

## 🖼️ Product Photo & Enhancement Pipeline

When adding or updating products:

1. **In-App Camera Capture**: Open the camera viewfinder to snap a clean photo of the product.
2. **Review & Rotate Tool**:
   - Live visual preview before submitting.
   - **Rotate button (⟳ 90° clockwise)**: Easily adjust inverted or sideways photos.
   - **Retake button**: Instantly retake if the shot is misaligned or blurry.
3. **Client-Side Compression**: High-resolution camera images are compressed on-device into lightweight JPEGs via HTML5 Canvas before network transmission.
4. **Server-Side Sharp Processing**:
   - **Adaptive De-Blurring**: Automatically measures blur level and applies Laplacian unsharp masking and contrast enhancement to make product labels sharp.
   - **Edge Detection & Isolation**: Uses Sobel gradient filters and BFS flood fill to isolate product boundaries and composite onto a clean `#FFFFFF` background.
   - **WebP Output**: Outputs optimized WebP images saved into `/uploads/`.
5. **Real-Time Push**: `STOCK_UPDATED` WebSocket events notify all cashier screens to display the newly captured photo.

---

## 🗃️ Database Schema

All data is stored locally in SQLite (`retail.db`) using WAL (Write-Ahead Logging) mode:

```
users               — Cashier and manager accounts, roles, password hashes
shift_records       — Cashier shifts, start/end timestamps, cash totals
break_records       — Staff break tracking
bills               — Finalized sale transactions with JSON line items
customers           — Customer phone numbers, names, email, loyalty points, credit ledger
chats               — AES-256-GCM encrypted terminal messages
coupons             — Single-use promo codes with atomic redemption tracking
reservations        — OTP bill pickup queue
products            — Product SKU, barcode, price tiers, stock, category & image
settings            — Store profile, tax rates, GST configuration, theme, Gmail/SMTP credentials, WhatsApp toggles, thermal printer hardware profiles
attendance          — Daily staff attendance logs
```

---

## 📡 WebSocket Real-Time Events

NexusFlow maintains a persistent WebSocket connection between the server and all LAN clients:

| Event Name | Trigger | Action on Client |
|---|---|---|
| `STOCK_UPDATED` | Product edited, added, or sold | Re-fetches catalog and updates stock badges |
| `IMAGE_ENHANCED` | Server finishes background processing | Refreshes product image thumbnail |
| `SALES_CHANGED` | Bill completed at any counter | Updates real-time sales metrics and charts |
| `SHIFT_CHANGED` | Shift opened or closed | Updates shift status indicator |
| `BREAK_CHANGED` | Staff break toggle | Updates staff availability badges |
| `SESSION_CHANGED` | Cashier log in / out | Updates online terminal count |
| `SESSION_INVALIDATED` | Concurrent login detected | Logs out old terminal session |
| `COUPON_REDEEMED` | Coupon used at any register | Immediately removes coupon across all terminals |
| `RESERVATION_CLAIMED`| OTP order collected | Removes reservation from pickup queue |
| `WHATSAPP_STATUS_CHANGED`| Shop WhatsApp QR/connection state changes | Live updates WhatsApp pairing status pill across all screens |

---

## 🚀 Deployment Notes

### 💻 24/7 Laptop Micro-Server Deployment (Garuda / Arch Linux)
For full end-to-end instructions on running both the **POS Billing System** and the **Customer Website** 24/7 on an Intel i5 laptop with battery UPS backup and Cloudflare Tunnel, see:
👉 **[Garuda Linux Laptop 24/7 Setup Guide](LAPTOP_SERVER_SETUP.md)**

### Dedicated LAN Counter Setup (Recommended)
1. Designate one machine (PC, Mac, or Mini-PC) as the counter server.
2. Ensure it has a static local IP on your router (e.g. `192.168.1.100`).
3. Build and launch:
   ```bash
   pnpm build
   pnpm start
   ```
4. Other registers, tablets, and phones connect directly to `http://192.168.1.100:3000`.

### Cloudflare Tunnel (Secure Remote Access)
To access the POS system remotely or from another branch without opening router ports:
```bash
cloudflared tunnel --url http://localhost:3000
```
`vite.config.ts` includes `*.trycloudflare.com` in `allowedHosts` out of the box.

---

## 🧪 Test Suite

NexusFlow includes a comprehensive automated test suite powered by [Vitest](https://vitest.dev/):

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

### Coverage Overview:
- **Total Tests**: **356 passing tests** across 27 test suites (100% pass rate).
- **Backend Tests**:
  - `server/routes/products.test.ts`: Product CRUD, update endpoints, validation.
  - `server/routes/coupons.test.ts`: Atomic single-use coupon redemption.
  - `server/routes/bills.test.ts`: Bill calculation, multi-slab GST calculation.
  - `server/routes/whatsapp.test.ts`: WhatsApp connection status, QR code polling, session lifecycle, and message dispatch.
  - `server/routes/email.test.ts`: SMTP settings, Gmail verification, test email transmission, and automated bill receipt delivery.
  - `server/services/imageProcessor.test.ts`: Sharp de-blurring, Sobel edge classification, background cut, white/dark product preservation.
  - `print software/tests/printerDiscovery.test.ts`: Thermal printer discovery, profile mapping, and network/USB detection.
- **Frontend & Integration Tests**:
  - `src/app/lib/product-editing.test.ts`: In-place catalog updating and price changes.
  - `src/app/lib/mobile-live-scanner.test.ts`: Continuous live video scanning loop and feedback.
  - `src/app/lib/mobile-camera-resilience.test.ts`: Device orientation, camera permissions, fallback logic.
  - `src/app/lib/product-camera-and-photo.test.ts`: 90° rotation, canvas compression, photo attachment.
  - `src/app/lib/redesign-fixes.test.ts`: Instrument panel styling, coupon sanitization, tax rates.
  - `src/app/lib/barcode-formats.test.ts`: 1D and 2D barcode format recognition.
  - `src/app/lib/csv-import.test.ts`: RFC-4180 CSV parsing and product upsert validation.

---

## 📄 License & Attributions

See [ATTRIBUTIONS.md](./ATTRIBUTIONS.md) for third-party open-source credits and licenses.

---

<p align="center">
  <sub>nexusflow • LAN Retail POS System</sub>
</p>
