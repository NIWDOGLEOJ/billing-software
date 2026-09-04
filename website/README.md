# J MART — Customer Shop Website & Live Stock Tracker

A modern, high-performance customer-facing website for your store that connects with your retail inventory so shoppers can check live product stock availability, current prices, and special discounts before visiting your shop.

---

## 🌟 Key Features

* **⚡ Live Stock Availability Status**:
  - 🟢 **In Stock**: Product is available on store shelves (with exact available count option).
  - 🟡 **Low Stock**: Highlights items with fewer units left (e.g., "Only 3 left!").
  - 🔴 **Out of Stock**: Clearly marked to prevent wasted customer visits.
* **🔍 Instant Search & Multi-Category Filtering**:
  - Search by name, brand, SKU, or tags with live autocomplete feel.
  - Horizontal scrolling category pills with live product counts.
  - **"In Stock Only"** quick toggle switch.
  - Sort by Featured, Price (Low to High, High to Low), Name, or Stock availability.
* **📱 WhatsApp Reserve & In-Store Order**:
  - Customers can assemble a shopping bag / reservation list.
  - Generates a pre-formatted WhatsApp message directly to your store's WhatsApp number with items, quantities, and pickup times.
* **📍 Store Timings & Maps Direction**:
  - Live "Open Now / Closes at" status badge.
  - One-click Google Maps navigation, direct phone calling, and store info modal.
* **🔒 100% Decoupled from Billing Code**:
  - Completely self-contained in this `/website` folder with its own `package.json`, TypeScript configuration, and Vite build pipeline.
  - Safe, read-only sync mechanism that never interferes with the cashier POS database.

---

## 🚀 Getting Started

### 1. Install Dependencies
Navigate into the `website` folder and install:
```bash
cd website
pnpm install
# or
npm install
```

### 2. Start Local Development Server
```bash
pnpm dev
# or
npm run dev
```
The website will open at:
```
http://localhost:5174
```

### 3. Build for Production
```bash
pnpm build
# or
npm run build
```
Generates a static, production-ready `dist/` bundle that can be deployed to Vercel, Netlify, Cloudflare Pages, GitHub Pages, or any web server.

---

## ⚙️ Customizing Your Store Information

Open [`src/config/storeConfig.ts`](./src/config/storeConfig.ts) to update:
- Store Name, Tagline, and Description
- Physical Address & Google Maps Direction Link
- Phone Number & WhatsApp Number
- Operating Hours (Weekdays & Weekends)
- Feature toggles (WhatsApp orders, exact stock count vs badges)

---

## 🔄 Synchronizing with Store Billing Inventory

See the complete guide in [`sync/README.md`](./sync/README.md).
To run an instant export from your store database:
```bash
node sync/export-inventory.js
```
This generates `public/inventory.json`, which the website automatically detects and displays.
