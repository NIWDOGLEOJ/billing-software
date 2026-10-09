// @ts-check
const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const discovery = require('./discovery.cjs');

/** @type {BrowserWindow | null} */
let mainWindow = null;

// Config file path in app userData directory
const configPath = path.join(app.getPath('userData'), 'nexusflow-desktop-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('Could not read desktop config:', err);
  }
  return {
    lastServerUrl: null,
    autoConnect: true,
    history: []
  };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write desktop config:', err);
  }
}

/**
 * Creates the main desktop application window
 */
function createMainWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'NexusFlow POS',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allows connecting to local LAN IPs and HTTP POS servers
    }
  });

  setupAppMenu();

  // Load either the saved server or the pairing UI
  initConnection();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle page failures gracefully
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    // If POS server dropped, show prompt to reconnect or switch
    if (validatedURL && !validatedURL.includes('pairing.html')) {
      console.warn(`Page load failed for ${validatedURL}: [${errorCode}] ${errorDescription}`);
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'POS Server Unreachable',
        message: `Could not connect to POS Server at:\n${validatedURL}`,
        detail: `Error: ${errorDescription}\n\nWould you like to search for servers on the local network?`,
        buttons: ['Search Local Network', 'Retry Connection', 'Cancel'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) {
          loadPairingScreen();
        } else if (response === 1) {
          mainWindow?.loadURL(validatedURL);
        }
      });
    }
  });
}

/**
 * Checks saved server and either auto-connects or loads pairing UI
 */
async function initConnection() {
  const config = loadConfig();

  if (config.autoConnect && config.lastServerUrl) {
    console.log(`Checking saved server: ${config.lastServerUrl}`);
    const res = await discovery.testServer(config.lastServerUrl, 1200);
    if (res.ok) {
      console.log(`Saved server reachable. Connecting to ${config.lastServerUrl}...`);
      loadPosUrl(config.lastServerUrl);
      return;
    }
    console.log('Saved server unreachable, opening LAN pairing screen...');
  }

  loadPairingScreen();
}

/**
 * Loads the local pairing and LAN discovery interface
 */
function loadPairingScreen() {
  if (!mainWindow) return;
  mainWindow.setTitle('NexusFlow POS — Connect to Server');
  mainWindow.loadFile(path.join(__dirname, 'ui', 'pairing.html'));
}

/**
 * Loads the connected POS web application
 * @param {string} serverUrl
 */
function loadPosUrl(serverUrl) {
  if (!mainWindow) return;
  mainWindow.setTitle(`NexusFlow POS — [${serverUrl}]`);
  mainWindow.loadURL(serverUrl);
}

/**
 * Sets up application menu with cashier and POS shortcuts
 */
function setupAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'Switch POS Server...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => loadPairingScreen()
        },
        {
          label: 'Reload POS Screen',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload()
        },
        {
          label: 'Hard Reload (Clear Cache)',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow?.webContents.reloadIgnoringCache()
        },
        { type: 'separator' },
        {
          label: 'Silent Print Receipt',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            mainWindow?.webContents.print({ silent: false, printBackground: true });
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.toggleDevTools()
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Network Diagnostics',
          click: () => {
            const subnets = discovery.getLocalSubnets();
            const text = subnets.map(s => `Interface: ${s.iface}\nIP: ${s.ip}\nBroadcast: ${s.broadcast}`).join('\n\n') || 'No active network interfaces detected.';
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Workstation Network Interfaces',
              message: text
            });
          }
        },
        {
          label: 'Online Documentation',
          click: () => shell.openExternal('https://github.com')
        }
      ]
    }
  ];

  // @ts-ignore
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------- IPC Communication Handlers ----------------

ipcMain.handle('scan-lan', async () => {
  try {
    const servers = await discovery.scanLAN({
      ports: [3000, 5173],
      onFoundServer: (server) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('server-found', server);
        }
      }
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan-complete', servers);
    }
    return servers;
  } catch (err) {
    console.error('Scan LAN IPC error:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan-complete', []);
    }
    return [];
  }
});

ipcMain.handle('test-server', async (_event, url) => {
  return await discovery.testServer(url, 2000);
});

ipcMain.handle('connect-server', async (_event, { url, remember }) => {
  const config = loadConfig();

  if (remember) {
    config.lastServerUrl = url;
    config.autoConnect = true;
    if (!config.history) config.history = [];
    if (!config.history.includes(url)) {
      config.history.unshift(url);
      if (config.history.length > 5) config.history.pop();
    }
    saveConfig(config);
  }

  loadPosUrl(url);
  return { ok: true };
});

ipcMain.handle('switch-server', () => {
  loadPairingScreen();
  return { ok: true };
});

ipcMain.handle('get-config', () => {
  const config = loadConfig();
  return {
    ...config,
    subnets: discovery.getLocalSubnets()
  };
});

ipcMain.handle('save-config', (_event, cfg) => {
  saveConfig(cfg);
  return { ok: true };
});

// App lifecycle
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
