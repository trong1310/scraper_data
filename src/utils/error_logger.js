const fs = require('fs-extra');
const path = require('path');

/**
 * Determine the root execution directory for both Dev and Production (Packaged/Portable) modes
 */
function getAppBaseDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  
  // If running from packaged Electron app
  if (process.type === 'browser' || process.type === 'renderer') {
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && app.isPackaged) {
        return path.dirname(process.execPath);
      }
    } catch (e) { }
  }

  if (process.execPath && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('electron.exe')) {
    return path.dirname(process.execPath);
  }

  return process.cwd();
}

/**
 * Get the default Data folder directory (data/)
 * @param {string} customBaseDir Optional custom user selected directory
 */
function getDataDir(customBaseDir = '') {
  if (customBaseDir && typeof customBaseDir === 'string' && customBaseDir.trim().length > 0) {
    return customBaseDir.trim();
  }
  const root = getAppBaseDir();
  const dataDir = path.join(root, 'data');
  fs.ensureDirSync(dataDir);
  return dataDir;
}

/**
 * Get the dedicated logError folder directory (logError/)
 * @param {string} customBaseDir Optional custom base directory
 */
function getLogErrorDir(customBaseDir = '') {
  const root = customBaseDir && typeof customBaseDir === 'string' && customBaseDir.trim().length > 0
    ? customBaseDir.trim()
    : getAppBaseDir();
  const logErrorDir = path.join(root, 'logError');
  fs.ensureDirSync(logErrorDir);
  return logErrorDir;
}

/**
 * Format current date to YYYY-MM-DD
 */
function getDateString(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Format current time to YYYY-MM-DD HH:mm:ss
 */
function getTimestampString(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Append error details to daily error log file (logError/log_error_YYYY-MM-DD.txt)
 * @param {Error|string} error The error object or error message
 * @param {string} context Information about where the error occurred
 * @param {string} customDir Optional custom directory to place logError folder
 */
function logError(error, context = 'Hệ Thống', customDir = '') {
  try {
    const logErrorDir = getLogErrorDir(customDir);
    const dateStr = getDateString();
    const logFileName = `log_error_${dateStr}.txt`;
    const logFilePath = path.join(logErrorDir, logFileName);

    const timeStr = getTimestampString();
    let errorMessage = '';
    let errorStack = '';

    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack || '';
    } else if (typeof error === 'object') {
      try {
        errorMessage = JSON.stringify(error, null, 2);
      } catch (e) {
        errorMessage = String(error);
      }
    } else {
      errorMessage = String(error);
    }

    const logEntry = [
      `================================================================================`,
      `[${timeStr}] [LỖI] Phân hệ: ${context}`,
      `Nội dung lỗi: ${errorMessage}`,
      errorStack ? `Chi tiết Stack Trace:\n${errorStack}` : null,
      `================================================================================\n\n`
    ].filter(Boolean).join('\n');

    fs.appendFileSync(logFilePath, logEntry, 'utf8');

    return logFilePath;
  } catch (err) {
    console.error('Không thể ghi log_error:', err);
    return null;
  }
}

module.exports = {
  getAppBaseDir,
  getDataDir,
  getLogErrorDir,
  logError,
  getDateString,
  getTimestampString
};
