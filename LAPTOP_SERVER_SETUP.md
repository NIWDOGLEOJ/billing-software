# Garuda Linux Laptop 24/7 Server & POS Setup Guide

This guide provides complete, step-by-step instructions for deploying and running **NexusFlow POS** and the **customer-facing e-commerce website** simultaneously on a laptop running **Garuda Linux (Arch-based)**.

---

## 💻 Hardware & Architecture Profile

* **CPU**: Intel® Core™ i5-1135G7 (4 cores / 8 threads, up to 4.2 GHz)
* **RAM**: 8 GB DDR4 (+ Garuda compressed **zRAM** enabled by default)
* **Storage**: 256 GB NVMe SSD
* **GPU**: Intel Iris Xe (Primary display) + NVIDIA GeForce MX350 2 GB (Suspended to save power & heat)
* **Networking**: Wi-Fi / Ethernet
* **Power Source**: Battery acting as an integrated **Uninterruptible Power Supply (UPS)** against store power cuts.

```
                     ┌─────────────────────────────────────────────────────────┐
                     │          GARUDA LINUX LAPTOP (24/7 Micro-Server)        │
                     │                                                         │
  Cashier Screen ───>│  Local POS UI (http://localhost:5173 or :3000)         │
                     │  Local Express Backend (server/index.ts)                │
                     │  SQLite WAL Database (retail.db)                        │
                     │                            │ (Read-Only Sync)           │
                     │                            ▼                            │
  Customer Site  ───>│  Website Server (:5174) <── inventory.json             │
                     │                            │                            │
                     └────────────────────────────┼────────────────────────────┘
                                                  │
                                                  ▼ (Encrypted Outbound Tunnel)
                                    [ Cloudflare Edge CDN / SSL ]
                                                  │
                                                  ▼
                                       https://yourshop.com
```

---

## ⚙️ Step 1: Garuda Linux OS Optimizations (24/7 Server Readiness)

Run all commands in the **Alacritty** or **Konsole** terminal on Garuda Linux.

### 1.1 Prevent Sleep on Lid Close & Idle
Edit the system login manager configuration to keep the server running even if the laptop lid is closed:
```bash
sudo nano /etc/systemd/logind.conf
```
Uncomment (remove `#`) or add the following lines:
```ini
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
IdleAction=ignore
```
Save and exit (`Ctrl + O`, `Enter`, `Ctrl + X`). Apply the changes:
```bash
sudo systemctl restart systemd-logind
```

---

### 1.2 Disable Wi-Fi Power Saving (Prevent Nighttime Disconnects)
Linux power managers may put Wi-Fi into sleep mode after hours of inactivity, breaking incoming website requests.

```bash
sudo nano /etc/NetworkManager/conf.d/default-wifi-powersave-on.conf
```
Ensure the configuration contains:
```ini
[connection]
wifi.powersave = 2
```
*(Value `2` explicitly disables Wi-Fi power saving).* Apply:
```bash
sudo systemctl restart NetworkManager
```

---

### 1.3 Protect Battery Health (Prevent Swelling from 24/7 Plugged-in State)
Keeping a lithium-ion laptop plugged into power 24/7 at 100% can degrade the cells over time. Cap the maximum charge at **75%–80%**:

```bash
# Check if your laptop motherboard supports the hardware charge threshold:
if [ -f /sys/class/power_supply/BAT0/charge_control_end_threshold ]; then
    echo 80 | sudo tee /sys/class/power_supply/BAT0/charge_control_end_threshold
    echo "Battery threshold set to 80%"
fi
```
*(Note: If your laptop is ASUS or Lenovo, you can also set this via `asusctl` or `tlp` / `ideapad` packages in Arch).*

---

### 1.4 Keep the Dedicated GPU (NVIDIA MX350) Idle
The Intel Iris Xe integrated graphics easily handles the desktop environment. To avoid fan noise, heat, and power consumption from the MX350:
* Do **not** prefix server commands with `prime-run`.
* Garuda's hybrid graphics manager automatically puts the NVIDIA GPU into deep runtime power-management sleep when unused.

---

### 1.5 Verify Garuda zRAM
Confirm your compressed swap is active (this gives your 8GB RAM the effective capacity of ~11–12GB):
```bash
zramctl
```
You should see a `/dev/zram0` device configured.

---

## 📦 Step 2: Install Runtime & Build Dependencies

Garuda Linux uses `pacman`. Install Node.js LTS, pnpm, build tools (required for native packages like `better-sqlite3` and `sharp`), and `cloudflared`:

```bash
# Update package repositories
sudo pacman -Syu

# Install Node.js, npm, git, and native compilation tools
sudo pacman -S nodejs npm git base-devel cloudflared

# Install pnpm and tsx globally
sudo npm install -g pnpm tsx
```

Verify versions:
```bash
node -v   # v20+ recommended
pnpm -v   # v9+ recommended
cloudflared -v
```

---

## 🛠️ Step 3: Project Setup & Building

Navigate to the project root directory (replace with your actual folder path):
```bash
cd "/Volumes/sata ssd 1/my projects/Retail Billing UI Design"
# or if copied to home directory:
# cd ~/projects/retail-pos
```

### 3.1 Setup POS System
```bash
# Install root dependencies
pnpm install

# Build the client and server for production
pnpm build
```

### 3.2 Setup Customer Website
```bash
# Enter website folder and install
cd website
pnpm install

# Build customer website
pnpm build

# Return to root
cd ..
```

### 3.3 Test Inventory Export Script
Run the decoupled read-only export script to verify it can read `retail.db` and generate `inventory.json`:
```bash
node website/sync/export-inventory.js
```
Expected output:
```
[Sync] Reading store database from: .../retail.db
[Sync Success] Successfully exported XX products with live stock to:
  .../website/public/inventory.json
```

---

## 🤖 Step 4: Configure Automatic 24/7 Services with `systemd`

Using `systemd` ensures that if the laptop restarts or an application crashes, all services are automatically brought back online in the background without needing a user to log in.

> **Note:** In the service files below, replace `/home/user/retail-pos` with the **absolute path** to your project directory, and `user` with your Garuda username.

### 4.1 POS Server Service (`/etc/systemd/system/nexusflow-pos.service`)
```bash
sudo nano /etc/systemd/system/nexusflow-pos.service
```
Paste:
```ini
[Unit]
Description=NexusFlow Retail POS Server
After=network.target

[Service]
Type=simple
User=godjoel
WorkingDirectory=/Volumes/sata ssd 1/my projects/Retail Billing UI Design
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

---

### 4.2 Customer Website Service (`/etc/systemd/system/nexusflow-website.service`)
```bash
sudo nano /etc/systemd/system/nexusflow-website.service
```
Paste:
```ini
[Unit]
Description=NexusFlow Customer E-Commerce Website
After=network.target

[Service]
Type=simple
User=godjoel
WorkingDirectory=/Volumes/sata ssd 1/my projects/Retail Billing UI Design/website
ExecStart=/usr/bin/pnpm preview --port 5174 --host 0.0.0.0
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

### 4.3 Automated Inventory Sync Service & Timer
To automatically update the website's product catalog and stock levels every 10 minutes without touching cashier operations:

**Create the sync service:**
```bash
sudo nano /etc/systemd/system/nexusflow-sync.service
```
Paste:
```ini
[Unit]
Description=Sync SQLite Inventory to Customer Website
After=network.target

[Service]
Type=oneshot
User=godjoel
WorkingDirectory=/Volumes/sata ssd 1/my projects/Retail Billing UI Design
ExecStart=/usr/bin/node website/sync/export-inventory.js
```

**Create the sync timer:**
```bash
sudo nano /etc/systemd/system/nexusflow-sync.timer
```
Paste:
```ini
[Unit]
Description=Run NexusFlow Inventory Sync Every 10 Minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
```

---

### 4.4 Enable and Start the Services
```bash
sudo systemctl daemon-reload

# Enable auto-start on boot & start right now
sudo systemctl enable --now nexusflow-pos.service
sudo systemctl enable --now nexusflow-website.service
sudo systemctl enable --now nexusflow-sync.timer
```

Verify service statuses:
```bash
systemctl status nexusflow-pos.service
systemctl status nexusflow-website.service
systemctl list-timers | grep nexusflow
```

---

## 🌐 Step 5: Expose Website to the Internet (Cloudflare Tunnel)

To allow customers across the globe to visit your website without opening router ports, paying for static IPs, or exposing your local PC:

### 5.1 Authenticate Cloudflare
```bash
cloudflared tunnel login
```
*A browser window will open. Log into your free Cloudflare account and select your domain (e.g. `yourshop.com`).*

### 5.2 Create the Tunnel
```bash
cloudflared tunnel create jmart-store
```
*Note down the Tunnel ID generated.*

### 5.3 Configure the Tunnel
Create the configuration directory and file:
```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```
Paste:
```yaml
tunnel: <YOUR-TUNNEL-UUID>
credentials-file: /home/godjoel/.cloudflared/<YOUR-TUNNEL-UUID>.json

ingress:
  # Route your website domain to the local website server
  - hostname: shop.yourdomain.com
    service: http://localhost:5174

  # Fallback rule (required by Cloudflare)
  - service: http_status:404
```

### 5.4 Route Your DNS & Run as a System Daemon
```bash
# Route your DNS hostname in Cloudflare:
cloudflared tunnel route dns jmart-store shop.yourdomain.com

# Install cloudflared as a 24/7 systemd service:
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Now, anyone visiting `https://shop.yourdomain.com` will reach your website with instant SSL encryption, DDoS protection, and global CDN caching provided by Cloudflare.

---

## 🏪 Step 6: Daily In-Store Operations

### For the Cashier on the Laptop Screen
Open the web browser (e.g., Firefox or Chromium) and navigate to:
```
http://localhost:3000
```
* **Tip**: Press `F11` to enter fullscreen kiosk mode.
* Barcode scanners plugged in via USB will work directly into the search/scan input field.

### For Mobile Scanners in the Store
On employee smartphones or Android POS devices connected to the store Wi-Fi:
1. Check the laptop's LAN IP:
   ```bash
   ip -br addr show
   # Example: 192.168.1.50
   ```
2. Open `http://192.168.1.50:3000/scan` on any phone browser.
3. The camera activates and scans barcodes directly into the cashier's active cart over WebSockets.

---

## 🔍 Step 7: Useful Maintenance & Monitoring Commands

| Action | Command |
|---|---|
| **Monitor CPU / RAM usage** | `btop` or `htop` |
| **Check CPU Temperature** | `sensors` |
| **View Live POS logs** | `journalctl -u nexusflow-pos.service -f` |
| **View Live Website logs** | `journalctl -u nexusflow-website.service -f` |
| **Trigger manual stock sync** | `sudo systemctl start nexusflow-sync.service` |
| **Restart POS Server** | `sudo systemctl restart nexusflow-pos.service` |
| **Backup Database** | `sqlite3 retail.db ".backup 'retail_backup_$(date +%F).db'"` |
