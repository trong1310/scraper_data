const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Auth & Session
  getCredentials: () => ipcRenderer.invoke('auth-get-credentials'),
  setCredentials: (phone, pass) => ipcRenderer.invoke('auth-set-credentials', { phone, pass }),
  checkSession: () => ipcRenderer.invoke('auth-check-session'),
  autoLogin: (browserType) => ipcRenderer.invoke('auth-auto-login', browserType),
  openLoginWindow: () => ipcRenderer.invoke('auth-open-login-window'),
  clearCookies: () => ipcRenderer.invoke('auth-clear-cookies'),

  // Crawler Controls
  startCrawl: (config) => ipcRenderer.invoke('crawler-start', config),
  collectUrls: (config) => ipcRenderer.invoke('crawler-collect-urls', config),
  pauseCrawl: () => ipcRenderer.invoke('crawler-pause'),
  resumeCrawl: () => ipcRenderer.invoke('crawler-resume'),
  stopCrawl: () => ipcRenderer.invoke('crawler-stop'),

  // Dialogs & Shell
  selectFolder: () => ipcRenderer.invoke('dialog-select-folder'),
  openFolder: (folderPath) => ipcRenderer.invoke('shell-open-folder', folderPath),
  openFile: (filePath) => ipcRenderer.invoke('shell-open-file', filePath),

  // Event Listeners from Main Process
  onCrawlerLog: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('crawler-log', handler);
    return () => ipcRenderer.removeListener('crawler-log', handler);
  },
  onCrawlerProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('crawler-progress', handler);
    return () => ipcRenderer.removeListener('crawler-progress', handler);
  },
  onPostScraped: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('crawler-post-scraped', handler);
    return () => ipcRenderer.removeListener('crawler-post-scraped', handler);
  },
  onStatusChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('crawler-status-change', handler);
    return () => ipcRenderer.removeListener('crawler-status-change', handler);
  },
  onCrawlerCompleted: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('crawler-completed', handler);
    return () => ipcRenderer.removeListener('crawler-completed', handler);
  }
});
