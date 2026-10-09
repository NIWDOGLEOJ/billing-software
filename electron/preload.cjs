const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusflowDesktop', {
  platform: process.platform,
  scanLAN: () => ipcRenderer.invoke('scan-lan'),
  onServerFound: (callback) => {
    const handler = (_event, server) => callback(server);
    ipcRenderer.on('server-found', handler);
    return () => ipcRenderer.removeListener('server-found', handler);
  },
  onScanComplete: (callback) => {
    const handler = (_event, servers) => callback(servers);
    ipcRenderer.on('scan-complete', handler);
    return () => ipcRenderer.removeListener('scan-complete', handler);
  },
  testServer: (url) => ipcRenderer.invoke('test-server', url),
  connectServer: (url, remember = true) => ipcRenderer.invoke('connect-server', { url, remember }),
  switchServer: () => ipcRenderer.invoke('switch-server'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  closeApp: () => ipcRenderer.invoke('close-app'),
  minimizeApp: () => ipcRenderer.invoke('minimize-app'),
  maximizeApp: () => ipcRenderer.invoke('maximize-app')
});
