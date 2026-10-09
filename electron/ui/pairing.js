// @ts-check
const discoveredServers = new Map();
let isScanning = false;

// DOM Elements
const serversList = document.getElementById('serversList');
const serversCount = document.getElementById('serversCount');
const emptyState = document.getElementById('emptyState');
const clientIpBadge = document.getElementById('clientIpBadge');
const clientIpText = document.getElementById('clientIpText');
const scanHeading = document.getElementById('scanHeading');
const scanSubtext = document.getElementById('scanSubtext');
const radar = document.getElementById('radar');
const btnRescan = document.getElementById('btnRescan');
const manualHost = /** @type {HTMLInputElement} */ (document.getElementById('manualHost'));
const manualPort = /** @type {HTMLInputElement} */ (document.getElementById('manualPort'));
const rememberServer = /** @type {HTMLInputElement} */ (document.getElementById('rememberServer'));
const statusToast = document.getElementById('statusToast');
const toastMessage = document.getElementById('toastMessage');
const toastIcon = document.getElementById('toastIcon');

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', async () => {
  // Setup listeners for discovery events
  if (window.nexusflowDesktop) {
    window.nexusflowDesktop.onServerFound(handleServerFound);
    window.nexusflowDesktop.onScanComplete(handleScanComplete);

    try {
      const config = await window.nexusflowDesktop.getConfig();
      if (config) {
        if (config.subnets && config.subnets.length > 0) {
          clientIpText.textContent = `Workstation IP: ${config.subnets[0].ip}`;
        } else {
          clientIpText.textContent = 'LAN Connected';
        }

        if (config.lastServerUrl) {
          try {
            const url = new URL(config.lastServerUrl);
            manualHost.value = url.hostname;
            if (url.port) manualPort.value = url.port;
          } catch {}
        }
      }
    } catch (err) {
      console.warn('Failed to fetch config:', err);
    }
  }

  // Auto-start scan on open
  startScan();
});

/**
 * Trigger LAN scan
 */
async function startScan() {
  if (isScanning) return;
  isScanning = true;

  discoveredServers.clear();
  renderServers();

  scanHeading.textContent = 'Searching for POS Server on Local Network...';
  scanSubtext.textContent = 'Scanning local Wi-Fi and subnet for active NexusFlow instances';
  btnRescan.setAttribute('disabled', 'true');
  radar.style.opacity = '1';

  if (window.nexusflowDesktop) {
    try {
      await window.nexusflowDesktop.scanLAN();
    } catch (err) {
      console.error('Scan error:', err);
      handleScanComplete([]);
    }
  }
}

/**
 * Handle individual discovered server from discovery engine
 */
function handleServerFound(server) {
  if (!server || !server.url) return;
  discoveredServers.set(server.url, server);
  renderServers();
}

/**
 * Handle scan finished
 */
function handleScanComplete(servers) {
  isScanning = false;
  btnRescan.removeAttribute('disabled');
  radar.style.opacity = '0.5';

  if (discoveredServers.size === 0) {
    scanHeading.textContent = 'No Servers Automatically Found';
    scanSubtext.textContent = 'You can enter your POS server IP manually below, or connect to localhost';
  } else {
    scanHeading.textContent = `Found ${discoveredServers.size} Active POS Server(s)`;
    scanSubtext.textContent = 'Click "Connect" to launch workstation session';
  }
}

/**
 * Render discovered servers cards
 */
function renderServers() {
  serversCount.textContent = `${discoveredServers.size} found`;

  if (discoveredServers.size === 0) {
    emptyState.style.display = 'flex';
    // Clear any cards
    const existingCards = serversList.querySelectorAll('.server-card');
    existingCards.forEach((c) => c.remove());
    return;
  }

  emptyState.style.display = 'none';

  // Remove stale cards
  const existingCards = serversList.querySelectorAll('.server-card');
  existingCards.forEach((c) => c.remove());

  // Render each server
  for (const [url, server] of discoveredServers.entries()) {
    const card = document.createElement('div');
    card.className = 'server-card';

    const isLocal = server.isLocal || url.includes('localhost') || url.includes('127.0.0.1');

    card.innerHTML = `
      <div class="server-info">
        <div class="server-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </svg>
        </div>
        <div class="server-meta">
          <h4>
            ${escapeHtml(server.serverName || 'NexusFlow POS Server')}
            ${isLocal ? '<span class="tag-badge">Localhost</span>' : '<span class="tag-badge">LAN Server</span>'}
          </h4>
          <div class="server-url">${escapeHtml(url)}</div>
        </div>
      </div>
      <div class="server-stats">
        <div class="latency-badge">
          <span>●</span>
          <span>${server.latency ? `${server.latency}ms` : 'Online'}</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="connectToUrl('${escapeHtml(url)}')">
          Connect
        </button>
      </div>
    `;

    serversList.appendChild(card);
  }
}

/**
 * Connect to specified server URL
 */
async function connectToUrl(url) {
  showToast('Connecting to POS Server...', 'info');

  if (window.nexusflowDesktop) {
    try {
      const res = await window.nexusflowDesktop.testServer(url);
      if (!res.ok) {
        showToast(`Could not connect: ${res.error || 'Server unreachable'}`, 'error');
        return;
      }

      showToast('Connected! Launching POS...', 'success');
      const remember = rememberServer.checked;
      await window.nexusflowDesktop.connectServer(url, remember);
    } catch (err) {
      showToast(`Connection failed: ${err.message}`, 'error');
    }
  } else {
    showToast(`Opening ${url}...`, 'info');
    window.location.href = url;
  }
}

/**
 * Handle manual connection form submission
 */
async function handleManualConnect(e) {
  e.preventDefault();

  let host = manualHost.value.trim();
  const port = manualPort.value.trim() || '3000';

  if (!host) {
    showToast('Please enter a server IP or hostname', 'error');
    return;
  }

  // Normalize host
  host = host.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  let targetUrl = `http://${host}`;
  if (!host.includes(':')) {
    targetUrl += `:${port}`;
  }

  await connectToUrl(targetUrl);
}

/**
 * Quick shortcut to connect to localhost:3000
 */
function connectLocalhost() {
  manualHost.value = 'localhost';
  manualPort.value = '3000';
  connectToUrl('http://localhost:3000');
}

/**
 * Show temporary toast message
 */
function showToast(msg, type = 'info') {
  toastMessage.textContent = msg;
  statusToast.className = `toast ${type}`;
  toastIcon.textContent = type === 'error' ? '⚠️' : type === 'success' ? '✅' : '⏳';
  statusToast.classList.remove('hidden');

  if (type !== 'info') {
    setTimeout(() => {
      statusToast.classList.add('hidden');
    }, 4500);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return m;
    }
  });
}
