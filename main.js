const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const AuthManager = require('./src/scraper/auth_manager');
const MafengwoCrawler = require('./src/scraper/mafengwo_crawler');
const { logError, getDataDir, getAppBaseDir } = require('./src/utils/error_logger');

// Catch any unhandled errors globally and write to daily log_error_YYYY-MM-DD.txt
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
  logError(err, 'Electron Main (uncaughtException)');
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
  logError(reason, 'Electron Main (unhandledRejection)');
});

let mainWindow = null;
let authManager = null;
let activeCrawler = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 950,
    minHeight: 650,
    title: 'Mafengwo Scraper Pro - Tự Động Kéo Bài Viết Sang TXT',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const userDataDir = app.getPath('userData');
  authManager = new AuthManager(userDataDir);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler - Auth & Credentials
ipcMain.handle('auth-get-credentials', async () => {
  return authManager ? authManager.getCredentials() : { phone: '15290810827', pass: 'trangchu1234P#' };
});

ipcMain.handle('auth-set-credentials', async (event, { phone, pass }) => {
  if (authManager) authManager.setCredentials(phone, pass);
  return { success: true };
});

ipcMain.handle('auth-check-session', async () => {
  if (!authManager) return { loggedIn: false, count: 0 };
  const cookies = await authManager.getSavedCookies();
  const loggedIn = authManager.isLoggedIn(cookies);
  return { loggedIn, count: cookies.length };
});

ipcMain.handle('auth-auto-login', async (event, browserType = 'chrome') => {
  if (!authManager) return false;
  const result = await authManager.autoLogin((msg, type = 'info') => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('crawler-log', {
        timestamp: new Date().toLocaleTimeString('vi-VN'),
        message: msg,
        type
      });
    }
  }, browserType);
  return result;
});

ipcMain.handle('auth-open-login-window', async () => {
  if (!authManager || !mainWindow) return false;
  const result = await authManager.openLoginWindow(mainWindow, (msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('crawler-log', {
        timestamp: new Date().toLocaleTimeString('vi-VN'),
        message: msg,
        type: 'info'
      });
    }
  });
  return result;
});

ipcMain.handle('auth-clear-cookies', async () => {
  if (authManager) await authManager.clearCookies();
  return { success: true };
});

// IPC Handler - Crawler Controls
ipcMain.handle('crawler-start', async (event, config) => {
  if (activeCrawler && activeCrawler.isRunning) {
    return { success: false, error: 'Crawler is already running!' };
  }

  const cookies = await authManager.getSavedCookies();
  const userDataDir = path.join(app.getPath('userData'), 'browser_profile');

  activeCrawler = new MafengwoCrawler({
    userDataDir,
    browserType: config?.browserType || 'chrome',
    authManager,
    credentials: authManager.getCredentials(),
    onLog: (logData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('crawler-log', logData);
      }
    },
    onProgress: (progressData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('crawler-progress', progressData);
      }
    },
    onPostScraped: (postData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('crawler-post-scraped', postData);
      }
    },
    onStatusChange: (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('crawler-status-change', status);
      }
    }
  });

  // Run crawler asynchronously
  (async () => {
    try {
      const result = await activeCrawler.startCrawl({
        ...config,
        cookies
      });

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('crawler-completed', result);
      }

      // Automatically reveal folder in Windows Explorer upon completion
      if (result && result.outputFolder && fs.existsSync(result.outputFolder)) {
        shell.openPath(result.outputFolder);
      }
    } catch (err) {
      logError(err, 'Tiến trình cào bài viết (crawler-start)');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('crawler-log', {
          timestamp: new Date().toLocaleTimeString('vi-VN'),
          message: `Lỗi: ${err.message}`,
          type: 'error'
        });
      }
    }
  })();

  return { success: true };
});

ipcMain.handle('crawler-pause', async () => {
  if (activeCrawler) {
    activeCrawler.pause();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('crawler-resume', async () => {
  if (activeCrawler) {
    activeCrawler.resume();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('crawler-stop', async () => {
  if (activeCrawler) {
    activeCrawler.stop();
    return { success: true };
  }
  return { success: false };
});

// IPC Handler - Dialogs & Shell
ipcMain.handle('dialog-select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Chọn thư mục lưu trữ bài viết'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('shell-open-folder', async (event, folderPath) => {
  if (!folderPath) return false;
  await shell.openPath(folderPath);
  return true;
});

ipcMain.handle('shell-open-file', async (event, filePath) => {
  if (!filePath) return false;
  await shell.openPath(filePath);
  return true;
});
