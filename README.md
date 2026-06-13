# NexusFlow — Advanced LAN-Based Pharmacy Billing & POS System

NexusFlow is a state-of-the-art, high-performance pharmacy billing, medicine inventory management, and store operations application designed specifically for local area networks (LAN). It provides cashiers and pharmacists with a fluid, keyboard-driven checkout interface, incorporates enterprise-grade security protocols, and offers owners complete, real-time administrative control over drug batches, expiry tracking, patient records, tax reports, employee performance, and multi-device registers.

This build is locked specifically to the **Pharmacy Sector**, featuring tailored fields for generic drug names, strengths, dosage forms, manufacturer tracing, drug license logs, and prescription-mandated checkouts.

---

## 🏗️ Complete System Architecture

NexusFlow operates on a highly optimized local client-server framework. It does not rely on an external internet connection, making it completely immune to cloud outages and extremely fast for high-traffic checkout lines.

```mermaid
graph TD
    subgraph LAN Register Terminal [Pharmacist/Cashier Terminal (Vite + React Client)]
        UI[Glassmorphic React UI]
        State[React Context / State]
        WS_Client[WebSocket Hook Client]
        Crypto[SubtleCrypto AES-GCM Encryptor]
        UI --> State
        State --> Crypto
    end

    subgraph Native Android Wrapper [NexusFlow Android App (Kotlin WebView)]
        Immersive[Immersive Fullscreen Lock]
        CamBridge[WebChromeClient Camera Permission Bridge]
        IpCache[LAN Server IP SharedPreferences Cache]
        Immersive --> UI
        CamBridge --> UI
    end

    subgraph Local LAN Server [Host Machine (Express.js + TypeScript)]
        Express[Express REST API]
        WS_Server[WebSocket Server Router]
        DB[(SQLite DB - WAL Mode)]
        Daemon[Background Archiver & Retention Daemon]
        Sweeper[Active Session Heartbeat Sweeper]
        
        Express --> DB
        WS_Server --> Express
        Daemon --> DB
        Sweeper --> DB
    end

    State -- REST API Requests --> Express
    WS_Client -- Real-Time Subscriptions --> WS_Server
    WS_Server -- Push Notifications --> WS_Client
```

### The Technology Stack
*   **Frontend Client**: React 18 (Vite-powered Single Page Application) with Tailwind CSS, Lucide React icons, and HTML5 Canvas background ambient animations.
*   **Native Mobile/Tablet App**: Native Kotlin Android Wrapper featuring Immersive Sticky Locks, SharedPreferences IP storage, and custom `WebChromeClient` permissions hooks.
*   **Backend LAN Server**: Node.js & Express.js written in TypeScript.
*   **Database Layer**: SQLite (`better-sqlite3`) configured in Write-Ahead Logging (WAL) mode for concurrency and high-speed write performance across multiple registers.
*   **Real-time Synchronization**: Lightweight custom WebSocket (WS) layer that propagates inventory/session updates across registers instantaneously.
*   **Cryptographic Core**: Web Crypto API (`window.crypto.subtle`) for client-side hardware-accelerated E2EE encryption/decryption routines.

---

## 💎 Advanced Key Features

For detailed explanations of all capabilities, see the specialized guides in the [docs/](file:///Volumes/sata%20ssd/Aspire/projects/billing-software/docs/) folder:

1.  **[System Architecture & LAN Sync](file:///Volumes/sata%20ssd/Aspire/projects/billing-software/docs/architecture.md)**: Details the client-server design, WebSocket events, AES-256-GCM encrypted cooperative cart sharing, and session sweepers.
2.  **[Relational Database Schema](file:///Volumes/sata%20ssd/Aspire/projects/billing-software/docs/database.md)**: Outlines the 13 SQLite tables, WAL configuration, and field-level schemas for products, batches, and transactions.
3.  **[REST API Reference](file:///Volumes/sata%20ssd/Aspire/projects/billing-software/docs/api.md)**: Documentation of all Express.js backend endpoints, permissions, request/response formats.
4.  **[Features & Business Logic Guide](file:///Volumes/sata%20ssd/Aspire/projects/billing-software/docs/features.md)**: Covers barcode scanning, batch inwarding, prescription flags, spend-based patient loyalty, INR denomination calculations, and the zero-trace developer ghost mode.

---

## 🛠️ Developer Setup & Directory Framework

Here is the core structural directory layout of the repository:

```text
├── index.html                  # Main SPA HTML5 anchor
├── package.json                # Project dependencies and startup scripts
├── vite.config.ts              # Vite asset bundles config
├── server/                     # LAN EXPRESS BACKEND
│   ├── index.ts                # HTTP & WebSocket initialization
│   ├── db.ts                   # SQLite connections, schemas, and seeds
│   ├── middleware/
│   │   └── auth.ts             # Auth middleware & JWT verification
│   └── routes/                 # REST API Controller Endpoints
│       ├── analytics.ts        # Sales forecasting & tax exports
│       ├── auth.ts             # Login, logout, and heartbeat routes
│       ├── batches.ts          # Medicine batch and expiry tracking
│       ├── bills.ts            # Invoice checkout & billing
│       ├── chats.ts            # E2EE chat history retrieval
│       ├── customers.ts        # Patient profiles and loyalty tiers
│       ├── inventory.ts        # Stock counts & warehouses
│       ├── leaves.ts           # Staff leave scheduling
│       ├── print.ts            # Esc/POS receipt layout compilers
│       ├── products.ts         # Medicine Catalog CRUD
│       ├── settings.ts         # Store details & configuration
│       ├── shifts.ts           # Cashier shifts & Z-reports
│       └── users.ts            # Employee accounts & break records
└── src/                        # CLIENT REACT FRONTEND
    ├── main.tsx                # App bootstrap entry
    └── app/
        ├── routes.ts           # React Router paths
        ├── contexts/           # Auth and Theme provider states
        ├── hooks/              # useWebSocket LAN sync hooks
        └── components/         # CORE UI MODULES
            ├── layout.tsx      # Global dashboard shell & sidebar navigation
            ├── login-page.tsx  # Authentication view with 3D tilting card
            ├── pos-settings.tsx# Shift auditing and Catalog CRUD
            ├── cashier-billing-advanced.tsx # Real-time Dispensing cart sheet
            └── ui/             # REUSABLE UI ELEMENTS
                ├── e2ee-chatbox.tsx # AES-256 E2EE chat widget
                └── interactive-mesh-background.tsx # Canvas animations
```

### Installation

1.  **Install dependencies**:
    ```bash
    pnpm install
    ```
2.  **Start the development environment** (runs Vite on port 5173 and Express backend on port 3000 concurrently):
    ```bash
    pnpm dev
    ```
3.  **Compile for production release**:
    ```bash
    pnpm build
    ```
4.  **Run the production build locally**:
    ```bash
    pnpm start
    ```

---

## 🔒 Security & Developer Ghost Mode

This application includes a built-in **Developer Ghost Mode** for site maintenance:
- The seed developer account (`dev_1` / `developer` / `developer@retailpos.com`) is completely excluded from database employee listings (`GET /api/users`), making it invisible in all staff grids and settings panels.
- Sockets connecting with the developer identity are flagged as invisible: they receive updates but are excluded from active user counts, and their presence status is never broadcasted to active cashier screens.
- All transactional activity, chat history, shifts, and audit logs belonging to the developer are automatically filtered out from analytical endpoints, ensuring a completely clean administrative interface for store owners.

## 🚀 New Features

- **Barcode Scanner Integration**: Real‑time barcode scanning using device camera (always active on web, Android camera support). Scans add products instantly to the cart.
- **GST‑Compliant Invoicing**: Automatic GST calculation with HSN code handling for every invoice.
- **Drug License Validation**: Pharmacies must upload a valid State Drug Control Authority license; the system validates it before dispensing.
- **Schedule H/H1/X Medicine Records**: Dedicated records and alerts for Schedule H, H1, and X medicines, ensuring regulatory compliance.

## 📸 Demo

![Improved Billing UI](file:///Users/godjoel/.gemini/antigravity-ide/brain/fb455809-de7a-475a-b5b5-cb29934eeb5b/improved_billing_ui_1781338943363.png)