const fs = require('fs-extra');
const path = require('path');
const { BrowserWindow } = require('electron');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { solveTencentCaptcha } = require('./captcha_solver');
const { logError } = require('../utils/error_logger');

const DEFAULT_CREDENTIALS = {
  phone: '15290810827',
  pass: 'trangchu1234P#'
};

class AuthManager {
  /**
   * @param {string} storageDir Directory to store session data
   */
  constructor(storageDir) {
    this.storageDir = storageDir || path.join(process.cwd(), 'data');
    this.cookieFile = path.join(this.storageDir, 'session_cookies.json');
    this.credentials = { ...DEFAULT_CREDENTIALS };
    fs.ensureDirSync(this.storageDir);
  }

  setCredentials(phone, pass) {
    if (phone) this.credentials.phone = phone.trim();
    if (pass) this.credentials.pass = pass.trim();
  }

  getCredentials() {
    return this.credentials;
  }

  async getSavedCookies() {
    try {
      if (await fs.pathExists(this.cookieFile)) {
        const data = await fs.readJson(this.cookieFile);
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (err) {
      console.error('[AuthManager] Error reading cookies:', err.message);
    }
    return [];
  }

  async saveCookies(cookies) {
    try {
      if (!Array.isArray(cookies) || cookies.length === 0) return false;
      await fs.writeJson(this.cookieFile, cookies, { spaces: 2 });
      console.log(`[AuthManager] Đã lưu ${cookies.length} cookies vào ${this.cookieFile}`);
      return true;
    } catch (err) {
      console.error('[AuthManager] Error saving cookies:', err.message);
      return false;
    }
  }

  async clearCookies() {
    try {
      if (await fs.pathExists(this.cookieFile)) {
        await fs.remove(this.cookieFile);
      }
      return true;
    } catch (err) {
      console.error('[AuthManager] Error clearing cookies:', err.message);
      return false;
    }
  }

  isLoggedIn(cookies) {
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return false;
    }
    const names = cookies.map(c => c.name);
    return names.includes('mfw_uid') ||
      names.includes('login') ||
      names.includes('oav2_token') ||
      names.includes('uenter') ||
      names.includes('w_tsfp') ||
      (names.includes('PHPSESSID') && names.includes('mfw_uuid'));
  }

  /**
   * Fully automated login & captcha solver workflow
   * @param {Function} onLog Callback for progress logs
   */
  async autoLogin(onLog = () => { }, browserType = 'chrome') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const chromeCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
    ];

    const edgeCandidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ];

    let executablePath = null;
    if (browserType === 'edge') {
      for (const p of edgeCandidates) {
        if (fs.existsSync(p)) {
          executablePath = p;
          break;
        }
      }
    }

    if (!executablePath) {
      for (const p of chromeCandidates) {
        if (fs.existsSync(p)) {
          executablePath = p;
          break;
        }
      }
    }

    if (!executablePath) {
      for (const p of edgeCandidates) {
        if (fs.existsSync(p)) {
          executablePath = p;
          break;
        }
      }
    }

    if (!executablePath) {
      executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    }

    const browserName = executablePath.toLowerCase().includes('edge') ? 'Microsoft Edge' : 'Google Chrome';
    onLog(`Khởi chạy trình duyệt: ${browserName}...`, 'info');

    let browser = null;
    try {
      browser = await puppeteer.launch({
        executablePath,
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1200,800'
        ],
        ignoreDefaultArgs: ['--enable-automation']
      });

      const page = (await browser.pages())[0] || await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      onLog('Đang điều hướng đến https://passport.mafengwo.cn/...', 'info');
      await page.goto('https://passport.mafengwo.cn/', { waitUntil: 'domcontentloaded', timeout: 35000 });

      // Mafengwo WAF executes probe.js and performs a window reload after ~2-3 seconds.
      // We wait 4.5s for this initial WAF fingerprinting & reload to fully settle.
      onLog('Đang chờ bảo mật WAF ổn định phiên làm việc...', 'info');
      await new Promise(r => setTimeout(r, 4500));

      // Solve landing captcha if triggered before login
      await solveTencentCaptcha(page, { onLog });
      await new Promise(r => setTimeout(r, 1000));

      // Explicitly switch to Password Login Tab
      onLog('Chuyển sang tab Đăng Nhập Bằng Mật Khẩu (密码登录)...', 'info');
      await page.waitForSelector('p[data-type="password"], ._j_account_tab[data-type="password"], .account_v2_tabs', { timeout: 10000 }).catch(() => {});
      await page.evaluate(() => {
        if (window.$ && typeof window.$ === 'function') {
          try { window.$('p[data-type="password"], ._j_account_tab[data-type="password"]').click(); } catch(e){}
        }
        const pwdTabs = document.querySelectorAll('p[data-type="password"], ._j_account_tab[data-type="password"], p.account_v2_tab');
        for (const tab of pwdTabs) {
          if (tab.getAttribute('data-type') === 'password' || (tab.innerText && tab.innerText.includes('密码'))) {
            tab.click();
            tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
        }
        document.querySelectorAll('.account_v2_tab, ._j_account_tab').forEach(t => {
          if (t.getAttribute('data-type') === 'password' || (t.innerText && t.innerText.includes('密码'))) {
            t.classList.add('active');
          } else {
            t.classList.remove('active');
          }
        });
        document.querySelectorAll('.account_v2_form, ._j_account_form').forEach(f => {
          if (f.getAttribute('data-type') === 'password') {
            f.style.display = 'block';
            f.style.visibility = 'visible';
          } else if (f.getAttribute('data-type') === 'qrcode') {
            f.style.display = 'none';
          }
        });
      });
      await new Promise(r => setTimeout(r, 1000));

      // Ensure input fields are ready
      await page.waitForSelector('#login_ppt', { visible: true, timeout: 6000 });

      // Type phone
      onLog(`Tự động điền tài khoản: ${this.credentials.phone}...`, 'info');
      await page.click('#login_ppt');
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(this.credentials.phone, { delay: 20 });

      // Type password
      await page.click('#pwd');
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(this.credentials.pass, { delay: 20 });

      // Check agreement checkbox
      await page.evaluate(() => {
        const agree = document.getElementById('login_agreement') || document.querySelector('.login-agreement-radio');
        if (agree) {
          agree.checked = true;
          agree.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      await new Promise(r => setTimeout(r, 600));

      // Submit login
      onLog('Nhấn nút Đăng Nhập...', 'info');
      await page.click('#_js_loginBtn');

      onLog('Đang kiểm tra và tự động giải Captcha kéo thả...', 'info');
      await new Promise(r => setTimeout(r, 2500));

      // Solve slider captcha
      await solveTencentCaptcha(page, { onLog, maxRetries: 6 });

      await new Promise(r => setTimeout(r, 4000));

      // Save cookies
      const cookies = await page.cookies();
      await this.saveCookies(cookies);

      const loggedIn = this.isLoggedIn(cookies);
      if (loggedIn) {
        onLog('ĐĂNG NHẬP & LƯU PHIÊN THÀNH CÔNG! Sẵn sàng cào dữ liệu.', 'success');
      } else {
        onLog(`Đã lưu ${cookies.length} cookie phiên làm việc.`, 'info');
      }

      await new Promise(r => setTimeout(r, 2000));
      return loggedIn;

    } catch (err) {
      onLog(`Lỗi trong tiến trình đăng nhập tự động: ${err.message}`, 'error');
      return false;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (e) { }
      }
    }
  }

  /**
   * Open an interactive Login assist window using Electron BrowserWindow
   * Automatically switches tab to '密码登录' and fills account/password, handling WAF reloads.
   * @param {BrowserWindow} parentWindow
   * @param {Function} onLog Callback for log events
   * @returns {Promise<boolean>} Resolves true when login succeeds
   */
  async openLoginWindow(parentWindow, onLog = () => { }) {
    return new Promise((resolve) => {
      onLog('Đang mở cửa sổ hỗ trợ đăng nhập trực quan...');

      const loginWin = new BrowserWindow({
        width: 1100,
        height: 850,
        parent: parentWindow || null,
        modal: false,
        title: `Đăng Nhập Mafengwo (${this.credentials.phone})`,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      loginWin.setMenuBarVisibility(false);

      const targetUrl = 'https://passport.mafengwo.cn/';
      loginWin.loadURL(targetUrl);

      // Automated tab switcher and field filler injection script
      const injectAutoSwitchScript = async () => {
        if (loginWin.isDestroyed()) return;
        try {
          await loginWin.webContents.executeJavaScript(`
            (function() {
              try {
                // 1. Add top assistive guidance banner
                if (!document.getElementById('mfw_helper_banner')) {
                  const banner = document.createElement('div');
                  banner.id = 'mfw_helper_banner';
                  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999999;background:linear-gradient(90deg,#0f172a,#1e293b);color:#fff;padding:10px 16px;font-family:sans-serif;font-size:13px;border-bottom:2px solid #10b981;box-shadow:0 4px 15px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:space-between;';
                  banner.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' +
                    '<span style="background:#10b981;color:#fff;font-weight:bold;padding:2px 8px;border-radius:4px;font-size:11px;">AUTO AUTH</span>' +
                    '<span>Tài khoản: <b style="color:#06b6d4;">${this.credentials.phone}</b> | Mật khẩu: <b style="color:#34d399;">${this.credentials.pass}</b></span>' +
                    '</div>' +
                    '<button id="btn_trigger_fill" style="background:#10b981;color:#fff;border:none;padding:6px 14px;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;box-shadow:0 2px 8px rgba(16,185,129,0.4);">👉 Tự Động Điền & Đăng Nhập</button>';
                  document.body.prepend(banner);

                  document.getElementById('btn_trigger_fill').onclick = function() {
                    switchAndFill(true);
                  };
                }

                function switchAndFill(forceClickSubmit) {
                  // A. Trigger tab switch via jQuery if present
                  if (window.$ && typeof window.$ === 'function') {
                    try { window.$('p[data-type="password"], ._j_account_tab[data-type="password"]').click(); } catch(e){}
                  }

                  // B. Dispatch click event on password tab
                  const pwdTabs = document.querySelectorAll('p[data-type="password"], ._j_account_tab[data-type="password"], p.account_v2_tab');
                  for (const tab of pwdTabs) {
                    if (tab.getAttribute('data-type') === 'password' || (tab.innerText && tab.innerText.includes('密码'))) {
                      tab.click();
                      tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    }
                  }

                  // C. Force DOM styles to reveal password form and hide QR form
                  document.querySelectorAll('.account_v2_tab, ._j_account_tab').forEach(t => {
                    if (t.getAttribute('data-type') === 'password' || (t.innerText && t.innerText.includes('密码'))) {
                      t.classList.add('active');
                    } else {
                      t.classList.remove('active');
                    }
                  });

                  document.querySelectorAll('.account_v2_form, ._j_account_form').forEach(f => {
                    if (f.getAttribute('data-type') === 'password') {
                      f.style.display = 'block';
                      f.style.visibility = 'visible';
                    } else if (f.getAttribute('data-type') === 'qrcode') {
                      f.style.display = 'none';
                    }
                  });

                  // D. Fill phone
                  const phoneInput = document.getElementById('login_ppt') || document.querySelector('input[placeholder*="手机"], input[placeholder*="邮箱"]');
                  if (phoneInput) {
                    phoneInput.value = "${this.credentials.phone}";
                    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
                    phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
                    phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));
                  }

                  // E. Fill password
                  const pwdInput = document.getElementById('pwd') || document.querySelector('input[type="password"]');
                  if (pwdInput) {
                    pwdInput.value = "${this.credentials.pass}";
                    pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
                    pwdInput.dispatchEvent(new Event('change', { bubbles: true }));
                    pwdInput.dispatchEvent(new Event('blur', { bubbles: true }));
                  }

                  // F. Agree checkbox
                  const agree = document.getElementById('login_agreement') || document.querySelector('.login-agreement-radio, input[type="checkbox"]');
                  if (agree) {
                    agree.checked = true;
                    agree.dispatchEvent(new Event('change', { bubbles: true }));
                  }

                  if (forceClickSubmit) {
                    const loginBtn = document.getElementById('_js_loginBtn');
                    if (loginBtn) {
                      loginBtn.click();
                    }
                  }
                }

                // Check if we are currently on QR code tab; if so, switch to password tab
                const activeTab = document.querySelector('._j_account_tab.active');
                const isQrActive = activeTab && activeTab.getAttribute('data-type') === 'qrcode';
                const phoneInput = document.getElementById('login_ppt');
                const isPhoneEmpty = phoneInput && !phoneInput.value;

                if (isQrActive || isPhoneEmpty) {
                  switchAndFill(false);
                }

              } catch (e) {
                console.error('Helper script error:', e);
              }
            })();
          `);
        } catch (e) { }
      };

      // Run injection on load and repeatedly monitor for page reloads / tab changes
      loginWin.webContents.on('did-finish-load', () => {
        injectAutoSwitchScript();
      });

      // Persistent loop every 800ms during the whole lifetime of the window
      const helperInterval = setInterval(() => {
        if (loginWin.isDestroyed()) {
          clearInterval(helperInterval);
          return;
        }
        injectAutoSwitchScript();
      }, 800);

      // Periodic cookie sync across all domains
      let isSuccessHandled = false;
      const cookieInterval = setInterval(async () => {
        if (loginWin.isDestroyed()) {
          clearInterval(cookieInterval);
          return;
        }

        try {
          const currentUrl = loginWin.webContents.getURL();
          const cookies = await loginWin.webContents.session.cookies.get({});
          if (cookies.length > 0) {
            await this.saveCookies(cookies);
            const loggedIn = this.isLoggedIn(cookies);
            if ((loggedIn || (currentUrl && !currentUrl.includes('passport.mafengwo.cn') && currentUrl.includes('mafengwo.cn'))) && !isSuccessHandled) {
              isSuccessHandled = true;
              onLog('Đã phát hiện đăng nhập thành công! Phiên làm việc đã sẵn sàng.', 'success');

              // Update banner to success
              try {
                await loginWin.webContents.executeJavaScript(`
                  (function() {
                    const banner = document.getElementById('mfw_helper_banner');
                    if (banner) {
                      banner.style.background = 'linear-gradient(90deg,#064e3b,#047857)';
                      banner.innerHTML = '<div style="font-weight:bold;font-size:14px;color:#fff;">✅ ĐĂNG NHẬP THÀNH CÔNG! Đang tự động đóng cửa sổ...</div>';
                    }
                  })();
                `);
              } catch (e) { }

              // Auto close window after 1.5s
              setTimeout(() => {
                if (!loginWin.isDestroyed()) {
                  loginWin.close();
                }
              }, 1500);
            }
          }
        } catch (e) { }
      }, 1500);

      loginWin.on('closed', async () => {
        clearInterval(helperInterval);
        clearInterval(cookieInterval);
        const cookies = await this.getSavedCookies();
        const loggedIn = this.isLoggedIn(cookies);
        onLog(loggedIn ? 'Đã lưu phiên đăng nhập thành công!' : 'Đã đóng cửa sổ đăng nhập.');
        resolve(loggedIn);
      });
    });
  }
}

module.exports = AuthManager;
