const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs-extra');
const path = require('path');
const { cleanArticleHtml, sanitizeFilename } = require('./html_cleaner');
const { solveTencentCaptcha } = require('./captcha_solver');
const { getDataDir, getAppBaseDir, logError } = require('../utils/error_logger');
const { getUrlExcelPath, getExistingUrls, appendUrlIfNotExists, URL_EXCEL_FILENAME, getCollectedUrlsExcelPath, appendUrlsBatch, COLLECTED_URLS_FILENAME } = require('../excel/excel_manager');
const Tesseract = require('tesseract.js');

/**
 * Normalizes Vietnamese/English destination terms to standard Chinese keywords
 * recognized by Mafengwo's search & filter system.
 */
function normalizeDestinationKeyword(keyword) {
  if (!keyword) return '';
  const trimmed = keyword.trim();
  const lower = trimmed.toLowerCase();

  const dict = {
    // Vietnam destinations
    'vietnam': '越南', 'việt nam': '越南', 'viet nam': '越南', 'vn': '越南',
    'ha noi': '河内', 'hà nội': '河内', 'hanoi': '河内',
    'da nang': '岘港', 'đà nẵng': '岘港', 'danang': '岘港',
    'ho chi minh': '胡志明市', 'hồ chí minh': '胡志明市', 'saigon': '胡志明市', 'sài gòn': '胡志明市', 'hcm': '胡志明市',
    'phu quoc': '富国岛', 'phú quốc': '富国岛', 'phuquoc': '富国岛',
    'nha trang': '芽庄', 'nhatrang': '芽庄',
    'sapa': '沙坝', 'sa pa': '沙坝',
    'hoi an': '会安', 'hội an': '会安', 'hoian': '会安',
    'hue': '顺化', 'huế': '顺化',
    'da lat': '大叻', 'đà lạt': '大叻', 'dalat': '大叻',
    'ninh binh': '宁平', 'ninh bình': '宁平',
    'ha long': '下龙湾', 'hạ long': '下龙湾', 'halong': '下龙湾',
    'lao cai': '老街', 'lào cai': '老街', 'laocai': '老街',
    'mui ne': '美奈', 'mũi né': '美奈', 'muine': '美奈',
    'quy nhon': '归仁', 'quy nhơn': '归仁',

    // Popular China destinations
    'beijing': '北京', 'bắc kinh': '北京', 'bac kinh': '北京',
    'shanghai': '上海', 'thượng hải': '上海', 'thuong hai': '上海',
    'chengdu': '成都', 'thành đô': '成都', 'thanh do': '成都',
    'chongqing': '重庆', 'trùng khánh': '重庆', 'trung khanh': '重庆',
    'sanya': '三亚', 'tam á': '三亚', 'tam a': '三亚',
    'hangzhou': '杭州', 'hàng châu': '杭州', 'hang chau': '杭州',
    'xian': '西安', 'tây an': '西安', 'tay an': '西安',
    'kunming': '昆明', 'côn minh': '昆明', 'con minh': '昆明',
    'dali': '大理', 'đại lý': '大理', 'dai ly': '大理',
    'lijiang': '丽江', 'lệ giang': '丽江', 'le giang': '丽江',
    'tibet': '西藏', 'tây tạng': '西藏', 'tay tang': '西藏', 'lhasa': '拉萨',
    'guilin': '桂林', 'quế lâm': '桂林', 'que lam': '桂林',
    'zhangjiajie': '张家界', 'trương gia giới': '张家界', 'truong gia gioi': '张家界',
    'guangzhou': '广州', 'quảng châu': '广州', 'quang chau': '广州',
    'shenzhen': '深圳', 'thâm quyến': '深圳', 'tham quyen': '深圳',
    'xiamen': '厦门', 'hạ môn': '厦门', 'ha mon': '厦门',
    'suzhou': '苏州', 'tô châu': '苏州', 'to chau': '苏州',
    'nanjing': '南京', 'nam kinh': '南京',
    'qingdao': '青岛', 'thanh đảo': '青岛', 'thanh dao': '青岛',
    'harbin': '哈尔滨', 'cáp nhĩ tân': '哈尔滨', 'cap nhi tan': '哈尔滨',
    'jiuzhaigou': '九寨沟', 'cửu trại câu': '九寨沟', 'cuu trai cau': '九寨沟',
    'shangri-la': '香格里拉', 'shangrila': '香格里拉', 'hương cách lý lạp': '香格里拉',

    // International destinations
    'thailand': '泰国', 'thái lan': '泰国', 'thai lan': '泰国',
    'bangkok': '曼谷', 'phuket': '普吉岛', 'chiang mai': '清迈', 'chiangmai': '清迈', 'pattaya': '芭提雅',
    'japan': '日本', 'nhật bản': '日本', 'nhat ban': '日本',
    'tokyo': '东京', 'kyoto': '京都', 'osaka': '大阪', 'hokkaido': '北海道',
    'korea': '韩国', 'hàn quốc': '韩国', 'han quoc': '韩国', 'seoul': '首尔', 'jeju': '济州岛',
    'taiwan': '台湾', 'đài loan': '台湾', 'dai loan': '台湾', 'taipei': '台北',
    'hong kong': '香港', 'hồng kông': '香港', 'hongkong': '香港',
    'macau': '澳门', 'ma cao': '澳门',
    'singapore': '新加坡', 'bali': '巴厘岛', 'malaysia': '马来西亚', 'kuala lumpur': '吉隆坡',
    'cambodia': '柬埔寨', 'campuchia': '柬埔寨', 'siem reap': '暹粒',
    'laos': '老挝', 'lào': '老挝', 'luang prabang': '琅勃拉邦',
    'philippines': '菲律宾', 'boracay': '长滩岛', 'cebu': '宿务',
    'maldives': '马尔代夫', 'dubai': '迪拜', 'france': '法国', 'paris': '巴黎',
    'italy': '意大利', 'rome': '罗马', 'switzerland': '瑞士', 'usa': '美国'
  };

  return dict[lower] || trimmed;
}

class MafengwoCrawler {
  /**
   * @param {object} options
   * @param {string} options.chromePath Path to Chrome or Edge executable
   * @param {string} options.userDataDir Custom user data dir for persistent cookies
   * @param {Function} options.onLog Callback for log messages
   * @param {Function} options.onProgress Callback for progress updates
   * @param {Function} options.onPostScraped Callback when a post is saved
   * @param {Function} options.onStatusChange Callback for state changes
   */
  constructor(options = {}) {
    this.chromePath = options.chromePath || this.findDefaultBrowser(options.browserType || 'chrome');
    this.userDataDir = options.userDataDir || path.join(process.cwd(), 'temp_browser_profile');
    this.authManager = options.authManager || null;
    this.credentials = options.credentials || { phone: '15290810827', pass: 'trangchu1234P#' };
    this.onLog = options.onLog || console.log;
    this.onProgress = options.onProgress || (() => { });
    this.onPostScraped = options.onPostScraped || (() => { });
    this.onStatusChange = options.onStatusChange || (() => { });

    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;

    this.scrapedPosts = [];
    this.visitedUrls = new Set();
    this.currentOutputFolder = null;
  }

  findDefaultBrowser(preferred = 'chrome') {
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

    const otherCandidates = [
      path.join(localAppData, 'CocCoc', 'Browser', 'Application', 'browser.exe'),
      path.join(programFiles, 'CocCoc', 'Browser', 'Application', 'browser.exe'),
      path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    ];

    if (preferred === 'edge') {
      for (const p of edgeCandidates) {
        if (fs.existsSync(p)) return p;
      }
    }

    // Default: Check Chrome FIRST
    for (const p of chromeCandidates) {
      if (fs.existsSync(p)) return p;
    }

    // Fallback: Edge
    for (const p of edgeCandidates) {
      if (fs.existsSync(p)) return p;
    }

    // Fallback: Other Chromium browsers
    for (const p of otherCandidates) {
      if (fs.existsSync(p)) return p;
    }

    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    const logItem = { timestamp, message: msg, type };
    this.onLog(logItem);

    // If an error or warning occurs, write to daily log_error_YYYY-MM-DD.txt
    if (type === 'error' || type === 'warn' || (typeof msg === 'string' && (msg.toLowerCase().includes('lỗi') || msg.toLowerCase().includes('error')))) {
      logError(msg, 'Trình Cào Dữ Liệu');
    }
  }

  createTimestampFolder(baseDir, keyword = '') {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const cleanKw = keyword ? `_${sanitizeFilename(keyword).replace(/\s+/g, '_')}` : '';
    const folderName = `mafengwo_articles${cleanKw}_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    // If user does not pick a folder, automatically save in the data/ folder at app execution root
    const rootDataDir = getDataDir(baseDir);
    const targetDir = path.join(rootDataDir, folderName);
    fs.ensureDirSync(targetDir);
    this.currentOutputFolder = targetDir;
    return targetDir;
  }

  async initBrowser(headless = true, cookies = [], browserType = 'chrome') {
    this.chromePath = this.findDefaultBrowser(browserType);
    const browserName = this.chromePath.toLowerCase().includes('edge') ? 'Microsoft Edge' : 'Google Chrome';
    this.log(`Khởi chạy trình duyệt: ${browserName} (${headless ? 'Chế độ ngầm' : 'Hiển thị giao diện'})...`);

    fs.ensureDirSync(this.userDataDir);
    try {
      const lockFile = path.join(this.userDataDir, 'SingletonLock');
      if (fs.existsSync(lockFile)) {
        fs.removeSync(lockFile);
      }
    } catch (e) { }

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1366,850'
    ];

    this.browser = await puppeteer.launch({
      executablePath: this.chromePath,
      headless: headless ? 'new' : false,
      userDataDir: this.userDataDir,
      args: launchArgs,
      ignoreDefaultArgs: ['--enable-automation']
    });

    this.page = (await this.browser.pages())[0] || await this.browser.newPage();
    await this.page.setViewport({ width: 1366, height: 850 });

    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.mafengwo.cn/'
    });

    // Apply saved cookies if provided
    if (cookies && cookies.length > 0) {
      try {
        const puppeteerCookies = cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain.startsWith('.') ? c.domain.substring(1) : c.domain,
          path: c.path || '/',
          secure: !!c.secure,
          httpOnly: !!c.httpOnly
        }));
        await this.page.setCookie(...puppeteerCookies);
        this.log(`Đã nạp ${cookies.length} cookies xác thực vào phiên cào.`);
      } catch (err) {
        this.log(`Lỗi khi nạp cookies: ${err.message}`, 'warn');
      }
    }
  }

  cleanCookiesForPuppeteer(cookies) {
    if (!Array.isArray(cookies)) return [];
    return cookies.map(c => {
      const clean = {
        name: c.name,
        value: c.value,
        domain: c.domain ? c.domain.replace(/^\./, '') : 'mafengwo.cn',
        path: c.path || '/'
      };
      if (typeof c.secure === 'boolean') clean.secure = c.secure;
      if (typeof c.httpOnly === 'boolean') clean.httpOnly = c.httpOnly;
      return clean;
    }).filter(c => c.name && c.value !== undefined);
  }

  async ensurePageHealthy(targetPage = null) {
    const pageInstance = targetPage || this.page;
    try {
      if (!this.browser || !this.browser.isConnected()) {
        await this.initBrowser(!this.showBrowser, this.savedCookies || [], this.preferredBrowser);
      }
      if (!pageInstance || pageInstance.isClosed()) {
        const pages = await this.browser.pages();
        const fallback = pages.length > 0 ? pages[0] : await this.browser.newPage();
        await fallback.setViewport({ width: 1366, height: 850 });
        return fallback;
      }
      await pageInstance.evaluate(() => 1);
      return pageInstance;
    } catch (err) {
      this.log('Tự động khôi phục khung trình duyệt...', 'warn');
      const newP = await this.browser.newPage();
      await newP.setViewport({ width: 1366, height: 850 });
      await newP.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      );
      if (this.savedCookies && this.savedCookies.length > 0) {
        try {
          const valid = this.cleanCookiesForPuppeteer(this.savedCookies);
          if (valid.length > 0) await newP.setCookie(...valid);
        } catch (e) { }
      }
      return newP;
    }
  }

  async safeGoto(url, options = {}, targetPage = null) {
    const p = targetPage || this.page;
    const maxRetries = 2;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        await this.ensurePageHealthy(p);
        if (this.savedCookies && this.savedCookies.length > 0) {
          try {
            const valid = this.cleanCookiesForPuppeteer(this.savedCookies);
            if (valid.length > 0) await p.setCookie(...valid);
          } catch (e) { }
        }
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000, ...options });
        return true;
      } catch (err) {
        this.log(`Tải trang thử lần ${i}/${maxRetries} (${url}): ${err.message}`, 'warn');
        if (i === maxRetries) throw err;
        await this.sleep(1500);
      }
    }
  }

  async sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async checkPauseOrStop() {
    while (this.isPaused && !this.shouldStop) {
      await this.sleep(500);
    }
    if (this.shouldStop) {
      throw new Error('CRAWL_STOPPED_BY_USER');
    }
  }

  async pauseAndWait(reason) {
    if (reason) {
      this.log(reason, 'warn');
    }
    this.pause();
    await this.checkPauseOrStop();
  }

  pause() {
    this.isPaused = true;
    this.onStatusChange('paused');
    this.log('Đã tạm dừng quá trình cào. Nhấn "Tiếp Tục" khi đã xử lý xong.', 'warn');
  }

  resume() {
    this.isPaused = false;
    this.onStatusChange('running');
    this.log('Tiếp tục quá trình cào...', 'info');
  }

  stop() {
    this.shouldStop = true;
    this.isPaused = false;
    this.onStatusChange('stopping');
    this.log('Đang dừng quá trình cào...', 'warn');
  }

  /**
   * Comprehensive handler: Detects Login page / QR code popup / WAF Captcha
   * Automatically switches from QR to Password tab, fills credentials, submits, solves Captcha, and saves session.
   * @param {string} originalUrl
   * @param {object} targetPage Optional specific page instance
   */
  async handleLoginOrCaptchaIfPresent(originalUrl = null, targetPage = null) {
    const pageInstance = targetPage || this.page;
    if (!pageInstance) return;

    try {
      const currentUrl = pageInstance.url();
      if (currentUrl.includes('passport.mafengwo.cn')) {
        this.log('Phát hiện bị điều hướng về trang đăng nhập, đang giải quyết xác thực...', 'warn');
        await this.performLoginFlow(pageInstance);
        if (originalUrl && !originalUrl.includes('passport.mafengwo.cn')) {
          await this.safeGoto(originalUrl, {}, pageInstance);
        }
        return;
      }

      // Check if Tencent Captcha WAF iframe is on the page
      const hasCaptcha = await pageInstance.evaluate(() => {
        const hasIframe = !!document.querySelector('iframe#tcaptcha_iframe_dy, iframe[src*="captcha.gtimg.com"], iframe[src*="t.captcha.qq.com"]');
        const title = document.title || '';
        const bodyText = document.body ? document.body.innerText : '';
        return hasIframe || title.includes('WAF') || title.includes('安全验证') || bodyText.includes('安全验证');
      }).catch(() => false);

      if (hasCaptcha) {
        this.log('[Bảo vệ WAF] Phát hiện thử thách bảo mật Tencent Captcha, tự động giải...', 'warn');
        await solveTencentCaptcha(pageInstance, {
          onLog: (m, t) => this.log(m, t),
          maxRetries: 5
        });
        await this.sleep(1500);
        const cookies = await pageInstance.cookies();
        if (this.authManager) {
          await this.authManager.saveCookies(cookies);
        }
      }
    } catch (e) {
      if (e.message === 'CRAWL_STOPPED_BY_USER') throw e;
      // Ignore background check errors
    }
  }

  async performLoginFlow(pageInstance) {
    this.log('Tiến hành đăng nhập tài khoản...', 'info');
    await this.sleep(2500);

    // Solve initial landing captcha if presented
    await solveTencentCaptcha(pageInstance, {
      onLog: (m, t) => this.log(m, t),
      maxRetries: 5
    });
    await this.sleep(1000);

    // Switch tab to Password Login
    this.log('Chuyển từ quét mã QR sang tab Đăng Nhập Bằng Mật Khẩu (密码登录)...', 'info');
    await pageInstance.evaluate(() => {
      const pwdTabs = document.querySelectorAll('p[data-type="password"], ._j_account_tab[data-type="password"], p.account_v2_tab');
      for (const tab of pwdTabs) {
        if (tab.getAttribute('data-type') === 'password' || (tab.innerText && tab.innerText.includes('密码'))) {
          tab.click();
          tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      }
    });
    await this.sleep(1000);

    const phone = (this.credentials && this.credentials.phone) ? this.credentials.phone : '15290810827';
    const pass = (this.credentials && this.credentials.pass) ? this.credentials.pass : 'trangchu1234P#';

    const phoneSelector = (await pageInstance.$('#login_ppt')) ? '#login_ppt' : 'input[placeholder*="手机"], input[placeholder*="邮箱"]';
    const pwdSelector = (await pageInstance.$('#pwd')) ? '#pwd' : 'input[type="password"]';

    this.log(`Tự động điền tài khoản: ${phone}...`, 'info');
    await pageInstance.click(phoneSelector);
    await pageInstance.keyboard.down('Control');
    await pageInstance.keyboard.press('KeyA');
    await pageInstance.keyboard.up('Control');
    await pageInstance.keyboard.press('Backspace');
    await pageInstance.keyboard.type(phone, { delay: 20 });

    await pageInstance.click(pwdSelector);
    await pageInstance.keyboard.down('Control');
    await pageInstance.keyboard.press('KeyA');
    await pageInstance.keyboard.up('Control');
    await pageInstance.keyboard.press('Backspace');
    await pageInstance.keyboard.type(pass, { delay: 20 });

    // Check agreement
    await pageInstance.evaluate(() => {
      const agree = document.getElementById('login_agreement') || document.querySelector('.login-agreement-radio, input[type="checkbox"]');
      if (agree) {
        agree.checked = true;
        agree.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await this.sleep(600);

    // Submit login
    this.log('Nhấn nút Đăng Nhập...', 'info');
    await pageInstance.click('#_js_loginBtn');
    await this.sleep(2500);

    // Solve slider captcha
    this.log('Tự động giải Captcha kéo thả để hoàn tất đăng nhập...', 'info');
    await solveTencentCaptcha(pageInstance, {
      onLog: (m, t) => this.log(m, t),
      maxRetries: 6
    });
    await this.sleep(2500);

    let cookies = [];
    try {
      cookies = await pageInstance.cookies();
    } catch (e) { }

    if (cookies && cookies.length > 0) {
      this.savedCookies = cookies;
      if (this.authManager) {
        await this.authManager.saveCookies(cookies);
      }
    }
  }

  /**
   * Ensure the crawler is logged in before starting to scrape
   */
  async ensureLoggedIn() {
    this.log('====================================================', 'info');
    this.log('[BƯỚC 1/2] KIỂM TRA & ĐĂNG NHẬP TÀI KHOẢN MAFENGWO...', 'info');

    try {
      // 1. First navigate to homepage to see if cookies keep session logged in
      this.log('Kiểm tra phiên đăng nhập hiện tại trên hệ thống...', 'info');
      await this.page.goto('https://www.mafengwo.cn/', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => { });
      await this.sleep(1500);

      // Handle WAF challenge if present on homepage
      await this.handleLoginOrCaptchaIfPresent();

      const isAlreadyLoggedIn = await this.page.evaluate(() => {
        const userHeader = document.querySelector('.user_info, .head-user, .user_name, a[href*="/u/"], a[href*="/home/"]');
        const loginLink = document.querySelector('a[href*="passport.mafengwo.cn"], a[title="登录"]');
        if (userHeader && !loginLink) return true;
        if (document.cookie.includes('mfw_uid=') || document.cookie.includes('oav2_token=')) return true;
        return false;
      });

      if (isAlreadyLoggedIn) {
        this.log('-> Đã xác thực phiên đăng nhập thành công! Tài khoản sẵn sàng.', 'success');
        this.log('====================================================', 'info');
        return true;
      }

      // 2. Perform direct login at passport.mafengwo.cn
      this.log('Chưa đăng nhập. Đang truy cập trang đăng nhập https://passport.mafengwo.cn/...', 'info');
      await this.page.goto('https://passport.mafengwo.cn/', { waitUntil: 'domcontentloaded', timeout: 35000 });

      this.log('Đang chờ bảo mật WAF ổn định phiên làm việc...', 'info');
      await this.sleep(4500);

      await this.performLoginFlow(this.page);

      // Wait and check if we're still on login page
      await this.sleep(2000);
      const stillOnLogin = await this.page.evaluate(() => {
        return window.location.href.includes('passport.mafengwo.cn');
      }).catch(() => false);

      if (stillOnLogin) {
        this.log('Vẫn đang ở trang đăng nhập — đăng nhập có thể chưa thành công.', 'warn');
        this.log('====================================================', 'info');
        return false;
      }

      try {
        await this.page.goto('https://www.mafengwo.cn/', { waitUntil: 'domcontentloaded', timeout: 25000 });
        await this.sleep(2500);
      } catch (e) { }

      // Verify login on homepage
      const verifiedLogin = await this.page.evaluate(() => {
        const userHeader = document.querySelector('.user_info, .head-user, .user_name, a[href*="/u/"], a[href*="/home/"]');
        if (userHeader) return true;
        if (document.cookie.includes('mfw_uid=') || document.cookie.includes('oav2_token=')) return true;
        return false;
      }).catch(() => false);

      let cookies = [];
      try {
        cookies = await this.page.cookies('https://www.mafengwo.cn', 'https://passport.mafengwo.cn');
      } catch (e) { }

      if (cookies && cookies.length > 0) {
        this.savedCookies = cookies;
        if (this.authManager) {
          await this.authManager.saveCookies(cookies);
        }
      }

      if (verifiedLogin) {
        this.log(`-> ĐĂNG NHẬP THÀNH CÔNG! Đã lưu ${cookies.length} cookies xác thực.`, 'success');
      } else {
        this.log(`-> ĐĂNG NHẬP CHƯA XÁC NHẬN ĐƯỢC. Đã lưu ${cookies.length} cookies.`, 'warn');
      }
      this.log('====================================================', 'info');
      return verifiedLogin;

    } catch (err) {
      this.log(`Lỗi khi đăng nhập trước khi cào: ${err.message}`, 'warn');
      return false;
    }
  }

  /**
   * Apply keyword destination filter on Mafengwo homepage/feed
   * Interacts with "筛选" button and "目的地" input box
   */
  async applyDestinationFilter(rawKeyword) {
    const keyword = normalizeDestinationKeyword(rawKeyword);
    this.log(`Áp dụng bộ lọc điểm đến với từ khóa: "${rawKeyword}" -> "${keyword}"...`, 'info');

    try {
      await this.page.goto('https://www.mafengwo.cn/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      await this.sleep(2000);
      await this.handleLoginOrCaptchaIfPresent();

      // Scroll down to bring travel notes filter section into view
      await this.page.evaluate(() => window.scrollBy(0, 500));
      await this.sleep(800);

      // Capture initial title of first card to detect update
      const initialFirstTitle = await this.page.evaluate(() => {
        const card = document.querySelector('#_j_tn_content .tn-item dt a');
        return card ? card.innerText.trim() : '';
      });

      // 1. Click "筛选" (Filter) button
      this.log('Nhấn nút "筛选" (Lọc) trên thanh bài viết...', 'info');
      await this.page.waitForSelector('._j_open_search, .tn-menu', { timeout: 8000 }).catch(() => { });
      await this.page.evaluate(() => {
        const btn = document.querySelector('._j_open_search, .tn-menu');
        if (btn) {
          btn.click();
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      });
      await this.sleep(1000);

      // 2. Clear and type the keyword into the destination input
      await this.page.waitForSelector('input._j_gs_input', { timeout: 8000 });
      this.log(`Điền từ khóa "${keyword}" vào ô tìm kiếm 目的地...`, 'info');

      await this.page.evaluate(() => {
        const inp = document.querySelector('input._j_gs_input');
        if (inp) {
          inp.value = '';
          inp.focus();
        }
      });
      await this.page.type('input._j_gs_input', keyword, { delay: 60 });
      await this.sleep(1500);

      // 3. Always click the first suggestion item
      await this.page.waitForSelector('._j_sr_container li, .tn-search-suggest li', { timeout: 6000 }).catch(() => { });

      const suggestionText = await this.page.evaluate(() => {
        const it = document.querySelector('._j_sr_container li, .tn-search-suggest li');
        return it ? it.innerText.trim().replace(/\s+/g, ' ') : '';
      });

      try {
        await this.page.click('._j_sr_container li, .tn-search-suggest li');
      } catch (e) {
        await this.page.evaluate(() => {
          const it = document.querySelector('._j_sr_container li, .tn-search-suggest li');
          if (it) {
            it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            it.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }
        });
      }

      // Wait until feed updates
      await this.page.waitForFunction((oldTitle) => {
        const card = document.querySelector('#_j_tn_content .tn-item dt a');
        const curTitle = card ? card.innerText.trim() : '';
        return curTitle && curTitle !== oldTitle;
      }, { timeout: 10000 }, initialFirstTitle).catch(() => { });

      await this.sleep(2500);

      if (suggestionText) {
        this.log(`-> Đã chọn điểm đến: "${suggestionText}". Danh sách bài viết đã được cập nhật!`, 'success');
      } else {
        this.log(`-> Đã áp dụng bộ lọc từ khóa: "${keyword}". Danh sách bài viết đã được nạp!`, 'info');
      }

      return true;
    } catch (err) {
      this.log(`Cảnh báo khi áp dụng bộ lọc từ khóa: ${err.message}`, 'warn');
      return false;
    }
  }

  /**
   * Extract article links from current page feed
   */
  async extractArticleLinksFromPage(isKeywordMode = false) {
    return await this.page.evaluate((keywordMode) => {
      if (window.location.href.includes('passport.mafengwo.cn')) {
        return [];
      }

      const linksWithPosition = [];
      const seen = new Set();

      const invalidTitles = [
        '账号登录', '登录', '注册', '马蜂窝', 'mafengwo', '我的马蜂窝', '消息',
        '自由行攻略', '攻略', '首页', '社区', '结伴', '问答', '商城', '酒店', '机票'
      ];

      function isValidArticleUrl(href) {
        if (!href) return false;
        if (href.includes('passport.mafengwo.cn') || href.includes('/login') || href.includes('/register') || href.includes('app.mafengwo.cn')) {
          return false;
        }
        if (href.match(/\/i\/\d+\.html/)) return true;
        if (href.match(/\/gonglve\/ziyouxing\/\d+\.html/)) return true;
        return false;
      }

      function cleanTitle(raw) {
        if (!raw) return '';
        return raw.replace(/^APP\s*/i, '').replace(/[\r\n\t]+/g, ' ').trim();
      }

      // If in Keyword Mode: Strictly extract articles inside the filtered container (#_j_tn_content)
      if (keywordMode) {
        const cards = document.querySelectorAll('#_j_tn_content .tn-item, #_j_tn_content .post-item, #_j_tn_content ._j_article_item');
        cards.forEach(card => {
          const a = card.querySelector('dt a, h2 a, h3 a, .title a, a[href*="/i/"]');
          if (a) {
            let href = a.href || '';
            if (isValidArticleUrl(href) && !seen.has(href)) {
              seen.add(href);
              const heading = card.querySelector('dt a, h2, h3, .title, .tn-title, .post-title');
              let title = cleanTitle(heading ? heading.innerText : a.innerText);
              if (!invalidTitles.includes(title.toLowerCase())) {
                linksWithPosition.push({
                  href,
                  title: title.length > 2 ? title : '',
                  top: 0
                });
              }
            }
          }
        });

        if (linksWithPosition.length > 0) {
          return linksWithPosition.map(item => ({ href: item.href, title: item.title }));
        }
      }

      // 1. Structured article item cards (prioritize cards)
      const itemContainers = document.querySelectorAll(
        '#_j_tn_content .tn-item, .tn-top, ._j_top_post, .post-item, .tn-item, ._j_feed_item, ._j_article_item, .item, .gl-item, .m-item, .notes-item'
      );

      if (itemContainers.length > 0) {
        itemContainers.forEach(container => {
          const a = container.querySelector('a[href*="/i/"], a[href*="/gonglve/ziyouxing/"]');
          if (a) {
            let href = a.href || '';
            if (isValidArticleUrl(href) && !seen.has(href)) {
              seen.add(href);
              const rect = a.getBoundingClientRect();
              const heading = container.querySelector('dt a, h2, h3, .title, .tn-title, .title_bg, .post-title');
              let title = cleanTitle(heading ? heading.innerText : a.innerText);
              if (!invalidTitles.includes(title.toLowerCase())) {
                linksWithPosition.push({
                  href,
                  title: title.length > 2 ? title : '',
                  top: rect.top + window.scrollY
                });
              }
            }
          }
        });
      }

      // 2. Scan all remaining <a> tags to ensure no article is missed
      document.querySelectorAll('a[href*="/i/"], a[href*="/gonglve/ziyouxing/"]').forEach(a => {
        let href = a.href || '';
        if (isValidArticleUrl(href) && !seen.has(href)) {
          seen.add(href);
          const rect = a.getBoundingClientRect();
          const heading = a.querySelector('h2, h3, .title, .tn-title, .title_bg') || a.closest('div, li')?.querySelector('dt a, h2, h3, .title, .tn-title');
          let title = cleanTitle(heading ? heading.innerText : a.innerText);
          if (!invalidTitles.includes(title.toLowerCase())) {
            linksWithPosition.push({
              href,
              title: title.length > 2 ? title : '',
              top: rect.top + window.scrollY
            });
          }
        }
      });

      // 3. Sort strictly by top position on the page (Top to Bottom)
      linksWithPosition.sort((a, b) => a.top - b.top);
      return linksWithPosition.map(item => ({ href: item.href, title: item.title }));
    }, isKeywordMode);
  }

  /**
   * Navigate list feed to the next page
   */
  async goToNextListPage(targetPage, isKeywordMode = false, startUrl = '') {
    if (isKeywordMode) {
      this.log(`Chuyển danh sách lọc sang trang tiếp theo (下一页)...`, 'info');
      const clicked = await this.page.evaluate(() => {
        const nextBtn = document.querySelector(
          '.pg-next, #_j_tn_pagination .pg-next, a[title="下一页"], a.pg-next'
        );
        if (nextBtn && !nextBtn.classList.contains('disabled') && !nextBtn.getAttribute('disabled')) {
          nextBtn.click();
          return true;
        }
        // Fallback: find by visible text 下一页
        const candidates = document.querySelectorAll('a, span, button, li');
        for (const el of candidates) {
          const txt = (el.innerText || '').trim();
          if (txt === '下一页' || txt.includes('下一页')) {
            const clickable = el.closest('a') || el;
            clickable.click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) {
        this.log('Không tìm thấy nút 下一页 để chuyển trang.', 'warn');
      }
      await this.sleep(3000);
      return clicked;
    } else {
      let listUrl = startUrl;
      if (startUrl.match(/\/yj\/\d+\/?/)) {
        const baseMatch = startUrl.replace(/\/+$/, '');
        listUrl = `${baseMatch}/page_${targetPage}.html`;
      } else if (startUrl.includes('gonglve')) {
        listUrl = `https://www.mafengwo.cn/gonglve/?page=${targetPage}`;
      } else {
        listUrl = `${startUrl.replace(/\/+$/, '')}?page=${targetPage}`;
      }

      this.log(`--- Đang tải danh sách bài viết Trang ${targetPage} (${listUrl}) ---`);
      await this.safeGoto(listUrl, { timeout: 45000 });
      await this.sleep(2000);
      await this.handleLoginOrCaptchaIfPresent(listUrl);
      return true;
    }
  }

  /**
   * Main crawl workflow
   */
  async startCrawl(config = {}) {
    const targetCount = parseInt(config.targetCount, 10) || 20;
    const keyword = (config.keyword || '').trim();
    const isKeywordMode = !!keyword;

    let startUrl = (config.startUrl || 'https://www.mafengwo.cn/').trim();
    if (startUrl.includes('/youji/')) {
      startUrl = 'https://www.mafengwo.cn/yj/10183/';
    }

    const outputBaseDir = config.outputBaseDir || '';
    const delayMs = parseInt(config.delayMs, 10) || 10000;
    const cookies = config.cookies || [];
    const showBrowser = !!config.showBrowser;

    this.isRunning = true;
    this.isPaused = false;
    this.shouldStop = false;
    this.scrapedPosts = [];
    this.visitedUrls = new Set();
    this.savedCookies = cookies;
    this.onStatusChange('running');

    // 1. Create timestamp folder
    const outputFolder = this.createTimestampFolder(outputBaseDir, keyword);
    this.log(`Tạo thư mục lưu bài viết: ${outputFolder}`, 'success');

    // URL de-dup Excel: create if missing and preload existing URLs
    const normalizeUrl = (raw) => {
      const u = String(raw || '').trim();
      if (!u) return '';
      return u.replace(/#.*$/, '').replace(/\/+$/, '');
    };
    const urlExcelPath = getUrlExcelPath(outputBaseDir);
    const existingExcelUrls = await getExistingUrls(urlExcelPath);
    const normalizedExcelUrls = new Set(Array.from(existingExcelUrls).map(normalizeUrl).filter(Boolean));
    this.log(`File đối chiếu URL: ${URL_EXCEL_FILENAME} (đã có ${normalizedExcelUrls.size} URL).`, 'info');

    if (isKeywordMode) {
      this.log(`Mục tiêu cần kéo: ${targetCount} bài viết theo từ khóa: "${keyword}".`);
    } else {
      this.log(`Mục tiêu cần kéo: ${targetCount} bài viết từ ${startUrl}.`);
    }

    let detailPage = null;

    try {
      // 2. Initialize Browser
      this.showBrowser = showBrowser;
      this.preferredBrowser = config.browserType || this.preferredBrowser || 'chrome';
      await this.initBrowser(!showBrowser, cookies, this.preferredBrowser);

      // 3. Ensure Login is completed BEFORE crawling — retry up to 3 times
      let loginSuccess = false;
      for (let loginAttempt = 1; loginAttempt <= 3; loginAttempt++) {
        loginSuccess = await this.ensureLoggedIn();
        if (loginSuccess) break;
        this.log(`Đăng nhập chưa thành công, thử lại lần ${loginAttempt + 1}/3...`, 'warn');
        await this.sleep(3000);
      }

      if (!loginSuccess) {
        this.log('CẢNH BÁO: Chưa xác nhận được đăng nhập thành công. Vẫn tiếp tục thử cào...', 'warn');
      }

      this.log('[BƯỚC 2/2] BẮT ĐẦU TIẾN TRÌNH KÉO BÀI VIẾT TỪ MAFENGWO...', 'info');

      // 4. If Keyword Mode is active, apply the destination filter
      if (isKeywordMode) {
        await this.applyDestinationFilter(keyword);
      }

      let currentPage = 1;
      let consecutiveEmptyPages = 0;

      const createDetailPageWorker = async () => {
        const p = await this.browser.newPage();
        await p.setViewport({ width: 1366, height: 850 });
        await p.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        );
        return p;
      };

      // Detail tab is created per article after returning to list tab
      detailPage = null;

      while (this.scrapedPosts.length < targetCount && !this.shouldStop && consecutiveEmptyPages < 4) {
        await this.checkPauseOrStop();

        if (!isKeywordMode && currentPage > 1) {
          await this.goToNextListPage(currentPage, false, startUrl);
        }

        // Scroll to trigger lazy loading of feed articles on list page
        try {
          await this.page.evaluate(async () => {
            window.scrollBy(0, 1000);
            await new Promise(r => setTimeout(r, 600));
            window.scrollBy(0, 1500);
            await new Promise(r => setTimeout(r, 600));
          });
        } catch (e) { }

        // Extract article links on this page
        let articleLinks = [];
        try {
          articleLinks = await this.extractArticleLinksFromPage(isKeywordMode);
        } catch (e) {
          this.log(`Lỗi khi trích xuất danh sách link trang ${currentPage}: ${e.message}`, 'warn');
          articleLinks = [];
        }

        this.log(`Tìm thấy ${articleLinks.length} bài viết hợp lệ trên Trang ${currentPage}.`);

        // Log current page URL to help diagnose redirect issues
        const currentPageUrl = await this.page.url();
        if (currentPageUrl.includes('passport.mafengwo.cn')) {
          this.log(`Trang hiện tại bị redirect về đăng nhập: ${currentPageUrl}. Thử đăng nhập lại...`, 'warn');
          await this.handleLoginOrCaptchaIfPresent();
          await this.sleep(2000);
          continue;
        }
        const unvisitedLinks = articleLinks.filter(item => {
          const normalized = normalizeUrl(item.href);
          if (!normalized) return false;
          return !normalizedExcelUrls.has(normalized);
        });
        this.log(`Trong đó ${unvisitedLinks.length} bài chưa cào (bỏ qua ${articleLinks.length - unvisitedLinks.length} bài đã có trong ${URL_EXCEL_FILENAME}).`);

        if (unvisitedLinks.length === 0) {
          consecutiveEmptyPages++;
          this.log(`Không còn bài viết mới chưa cào trên Trang ${currentPage}. Thử trang tiếp theo...`, 'warn');
          currentPage++;
          if (isKeywordMode) {
            await this.goToNextListPage(currentPage, true);
          }
          await this.sleep(1500);
          continue;
        }

        consecutiveEmptyPages = 0;

        // Iterate through each article on current page
        for (const item of unvisitedLinks) {
          if (this.scrapedPosts.length >= targetCount || this.shouldStop) {
            break;
          }

          await this.checkPauseOrStop();
          const normalizedItemUrl = normalizeUrl(item.href);

          const postIndex = this.scrapedPosts.length + 1;
          this.log(`[${postIndex}/${targetCount}] Đang cào bài: ${item.title || item.href}`);

          try {
            // Open a fresh detail tab only when starting a new article
            if (!detailPage || detailPage.isClosed()) {
              detailPage = await createDetailPageWorker();
            }

            // Use detailPage worker to scrape
            await this.safeGoto(item.href, { timeout: 40000 }, detailPage);
            await this.sleep(1500);

            // Check and handle login or captcha on note page
            await this.handleLoginOrCaptchaIfPresent(item.href, detailPage);

            // Click expand buttons
            await detailPage.evaluate(() => {
              const expandBtns = document.querySelectorAll(
                '._j_show_all, ._j_show_more, ._j_unfold_detail, .unfold-btn, .more_btn, .btn_unfold, a[title*="展开"]'
              );
              expandBtns.forEach(b => {
                try { b.click(); } catch (e) { }
              });
            }).catch(() => { });

            this.log(`Đang lướt chậm từng đoạn để kích hoạt mục lục (${item.title || 'Mafengwo'})...`, 'info');

            // Smooth, slow scrolling to trigger all lazy-loaded chapters and catalogue markers
            await detailPage.evaluate(async () => {
              await new Promise((resolve) => {
                let currentPos = 0;
                const distance = 280;
                const intervalTime = 250;
                let totalHeight = document.body.scrollHeight;
                let bottomCount = 0;

                const timer = setInterval(() => {
                  window.scrollBy(0, distance);
                  currentPos += distance;

                  const moreBtns = document.querySelectorAll('._j_show_all, ._j_show_more, ._j_unfold_detail, .btn_unfold, .unfold-btn');
                  moreBtns.forEach(b => { try { b.click(); } catch (e) { } });

                  const newHeight = document.body.scrollHeight;
                  if (currentPos >= newHeight || currentPos > 150000) {
                    if (newHeight === totalHeight) {
                      bottomCount++;
                    } else {
                      totalHeight = newHeight;
                      bottomCount = 0;
                    }

                    if (bottomCount >= 3 || currentPos > 150000) {
                      clearInterval(timer);
                      resolve();
                    }
                  } else {
                    totalHeight = newHeight;
                  }
                }, intervalTime);
              });
            }).catch(() => { });

            // Extract live TOC (游记目录) from browser DOM if present
            const liveToc = await detailPage.evaluate(() => {
              const items = [];
              const seen = new Set();
              const addItem = (t) => {
                if (!t) return;
                let clean = t.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
                if (!clean || clean.length < 2 || clean === '游记目录' || clean === '文章目录' || clean === '目录' || clean === 'CONTENTS') return;
                clean = clean.replace(/^(\d+\s*[/／])\s*/, '$1 ');
                if (!seen.has(clean)) {
                  seen.add(clean);
                  items.push(clean);
                }
              };

              const catalogEls = document.querySelectorAll(
                '._j_catalog_list li, .catalog_list li, ._j_catalog_con li, .catalog_con li, .m_catalog li, ._j_catalog li, .side-catalog li, .side_catalog li, .dir_list li, ._j_anchor_list li, .mulu_list li, .catalog-list li, ._j_catalog_item, .catalog-item, .m-catalog-item'
              );
              if (catalogEls.length > 0) {
                catalogEls.forEach(el => addItem(el.innerText));
              }

              if (items.length === 0) {
                document.querySelectorAll('*').forEach(el => {
                  const text = (el.innerText || '').trim();
                  if (el.children.length === 0 && (text === '游记目录' || text === '文章目录' || (text.includes('目录') && text.length <= 6))) {
                    const parent = el.closest('div, nav, aside, section');
                    if (parent) {
                      parent.querySelectorAll('li, a, p, span.txt').forEach(sub => addItem(sub.innerText));
                    }
                  }
                });
              }

              if (items.length === 0) {
                document.querySelectorAll('._j_seqbox_title, .p_section .title, .p_title, h2.title_sub, .f-title').forEach(el => addItem(el.innerText));
              }

              return items;
            }).catch(() => []);

            if (liveToc && liveToc.length > 0) {
              this.log(`Trích xuất được ${liveToc.length} mục trong Mục Lục bài viết.`);
            }

            // Get HTML of detail page
            const html = await detailPage.content();

            // Clean HTML and generate plain TXT
            const cleaned = cleanArticleHtml(html, {
              url: item.href,
              title: item.title,
              index: postIndex,
              toc: liveToc
            });

            // Too short / login page → pause for manual check (no auto-skip silently)
            if (cleaned.title.includes('账号登录') || cleaned.title.includes('登录') || cleaned.wordCount < 100) {
              await this.pauseAndWait(
                `Nội dung quá ngắn hoặc trang đăng nhập (${cleaned.wordCount} ký tự): ${item.href}. Đã tạm dừng — kiểm tra trình duyệt rồi nhấn "Tiếp Tục".`
              );
              continue;
            }

            // Write TXT file
            const filePath = path.join(outputFolder, cleaned.filename);
            await fs.writeFile(filePath, cleaned.cleanText, 'utf8');

            const postData = {
              index: postIndex,
              title: cleaned.title,
              author: cleaned.author,
              date: cleaned.date,
              location: cleaned.location,
              url: item.href,
              wordCount: cleaned.wordCount,
              filename: cleaned.filename,
              filePath
            };

            this.scrapedPosts.push(postData);
            try {
              const saved = await appendUrlIfNotExists(urlExcelPath, normalizedItemUrl);
              normalizedExcelUrls.add(normalizedItemUrl);
              if (saved) {
                this.log(`Đã ghi URL vào ${URL_EXCEL_FILENAME}`, 'info');
              }
            } catch (excelErr) {
              this.log(`Lỗi ghi URL vào Excel (${urlExcelPath}): ${excelErr.message}`, 'error');
            }
            this.onPostScraped(postData);
            this.onProgress({
              current: this.scrapedPosts.length,
              target: targetCount,
              percent: Math.round((this.scrapedPosts.length / targetCount) * 100),
              currentPage
            });

            this.log(`-> Đã lưu thành công: "${cleaned.filename}" (${cleaned.wordCount} ký tự)`, 'success');

          } catch (err) {
            this.log(`Lỗi khi cào bài [${item.href}]: ${err.message}`, 'error');
          } finally {
            // Close detail tab, return to list tab, then next article will open a new tab
            try {
              if (detailPage && !detailPage.isClosed()) {
                await detailPage.close();
              }
            } catch (e) { }
            detailPage = null;

            try {
              if (this.page && !this.page.isClosed()) {
                await this.page.bringToFront();
              }
            } catch (e) { }
          }

          // Delay between articles (default 10000ms) + random jitter 500–3000ms
          const jitter = 500 + Math.floor(Math.random() * 2501);
          await this.sleep(delayMs + jitter);
        }

        // Advance to next page if quota not reached
        if (this.scrapedPosts.length < targetCount) {
          currentPage++;
          if (isKeywordMode) {
            await this.goToNextListPage(currentPage, true);
          }
          await this.sleep(1500);
        }
      }

      // Generate Manifest files
      await this.writeManifest(outputFolder, targetCount, keyword);

      this.log(`=== HOÀN TẤT KÉO ${this.scrapedPosts.length} BÀI VIẾT VÀO THƯ MỤC ===`, 'success');
      this.onStatusChange('completed');

      return {
        success: true,
        totalScraped: this.scrapedPosts.length,
        outputFolder,
        posts: this.scrapedPosts
      };

    } catch (err) {
      if (err.message === 'CRAWL_STOPPED_BY_USER') {
        this.log('Quá trình cào đã được người dùng dừng lại.', 'warn');
        this.onStatusChange('stopped');
        await this.writeManifest(outputFolder, targetCount, keyword);
        return { success: false, totalScraped: this.scrapedPosts.length, outputFolder, posts: this.scrapedPosts };
      }

      this.log(`Lỗi trong quá trình cào: ${err.message}`, 'error');
      this.onStatusChange('error');
      throw err;
    } finally {
      this.isRunning = false;
      if (detailPage && !detailPage.isClosed()) {
        try { await detailPage.close(); } catch (e) { }
      }
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (e) { }
        this.browser = null;
      }
    }
  }

  /**
   * Collect article URLs from list pages only (no detail scrape).
   * Saves to data/urls.xlsx until no more pages / no new links.
   */
  async startCollectUrls(config = {}) {
    const keyword = (config.keyword || '').trim();
    const isKeywordMode = !!keyword;
    let startUrl = (config.startUrl || 'https://www.mafengwo.cn/').trim();
    if (startUrl.includes('/youji/')) {
      startUrl = 'https://www.mafengwo.cn/yj/10183/';
    }

    const outputBaseDir = config.outputBaseDir || '';
    const cookies = config.cookies || [];
    const showBrowser = !!config.showBrowser;

    const normalizeUrl = (raw) => {
      const u = String(raw || '').trim();
      if (!u) return '';
      return u.replace(/#.*$/, '').replace(/\/+$/, '');
    };

    this.isRunning = true;
    this.isPaused = false;
    this.shouldStop = false;
    this.scrapedPosts = [];
    this.visitedUrls = new Set();
    this.savedCookies = cookies;
    this.onStatusChange('running');

    const urlsExcelPath = getCollectedUrlsExcelPath(outputBaseDir);
    const existingUrls = await getExistingUrls(urlsExcelPath);
    const knownUrls = new Set(Array.from(existingUrls).map(normalizeUrl).filter(Boolean));
    this.log(`Chế độ chỉ lấy URL → file: ${COLLECTED_URLS_FILENAME} (đã có ${knownUrls.size} URL).`, 'info');

    if (isKeywordMode) {
      this.log(`Thu thập URL theo từ khóa: "${keyword}" đến khi hết trang.`, 'info');
    } else {
      this.log(`Thu thập URL từ ${startUrl} đến khi hết trang.`, 'info');
    }

    let collectedThisRun = 0;

    try {
      this.showBrowser = showBrowser;
      this.preferredBrowser = config.browserType || this.preferredBrowser || 'chrome';
      await this.initBrowser(!showBrowser, cookies, this.preferredBrowser);

      let loginSuccess = false;
      for (let loginAttempt = 1; loginAttempt <= 3; loginAttempt++) {
        loginSuccess = await this.ensureLoggedIn();
        if (loginSuccess) break;
        this.log(`Đăng nhập chưa thành công, thử lại lần ${loginAttempt + 1}/3...`, 'warn');
        await this.sleep(3000);
      }

      if (!loginSuccess) {
        this.log('CẢNH BÁO: Chưa xác nhận được đăng nhập. Vẫn tiếp tục lấy URL...', 'warn');
      }

      if (isKeywordMode) {
        await this.applyDestinationFilter(keyword);
      } else if (startUrl && !startUrl.includes('passport.mafengwo.cn')) {
        await this.safeGoto(startUrl, { timeout: 45000 });
        await this.handleLoginOrCaptchaIfPresent(startUrl);
      }

      let currentPage = 1;

      while (!this.shouldStop) {
        await this.checkPauseOrStop();

        if (!isKeywordMode && currentPage > 1) {
          await this.goToNextListPage(currentPage, false, startUrl);
        }

        try {
          await this.page.evaluate(async () => {
            window.scrollBy(0, 1000);
            await new Promise(r => setTimeout(r, 600));
            window.scrollBy(0, 1500);
            await new Promise(r => setTimeout(r, 600));
          });
        } catch (e) { }

        let articleLinks = [];
        try {
          articleLinks = await this.extractArticleLinksFromPage(isKeywordMode);
        } catch (e) {
          this.log(`Lỗi trích xuất link trang ${currentPage}: ${e.message}`, 'warn');
          articleLinks = [];
        }

        this.log(`Trang ${currentPage}: tìm thấy ${articleLinks.length} link bài.`, 'info');

        const currentPageUrl = await this.page.url();
        if (currentPageUrl.includes('passport.mafengwo.cn')) {
          this.log(`Bị redirect đăng nhập: ${currentPageUrl}`, 'warn');
          await this.handleLoginOrCaptchaIfPresent();
          await this.sleep(2000);
          continue;
        }

        const newUrls = [];
        for (const item of articleLinks) {
          const normalized = normalizeUrl(item.href);
          if (!normalized) continue;
          if (knownUrls.has(normalized)) continue;
          newUrls.push(normalized);
        }

        this.log(
          `Trang ${currentPage}: ${newUrls.length} URL mới (bỏ qua ${articleLinks.length - newUrls.length} trùng trong ${COLLECTED_URLS_FILENAME}).`,
          'info'
        );

        if (newUrls.length === 0) {
          this.log(`Không có URL mới trên trang ${currentPage} — tiếp tục sang trang sau...`, 'warn');
        } else {
          try {
            const result = await appendUrlsBatch(urlsExcelPath, newUrls);
            newUrls.forEach(u => knownUrls.add(u));
            collectedThisRun += result.added;
            this.log(
              `Đã ghi ${result.added} URL vào ${COLLECTED_URLS_FILENAME} (tổng file: ${result.total}).`,
              'success'
            );
            this.onProgress({
              current: collectedThisRun,
              target: knownUrls.size,
              percent: 0,
              currentPage
            });
          } catch (excelErr) {
            this.log(`Lỗi ghi ${COLLECTED_URLS_FILENAME}: ${excelErr.message}`, 'error');
          }
        }

        // Advance to next list page
        currentPage++;
        let moved = false;
        if (isKeywordMode) {
          moved = await this.goToNextListPage(currentPage, true);
          if (!moved) {
            this.log('Không còn nút 下一页 — kết thúc thu thập URL.', 'warn');
            break;
          }
        } else {
          await this.goToNextListPage(currentPage, false, startUrl);
          moved = true;
        }
        await this.sleep(1500);
      }

      this.log(
        `=== HOÀN TẤT LẤY URL: +${collectedThisRun} mới | tổng trong file ~${knownUrls.size} | ${urlsExcelPath} ===`,
        'success'
      );
      this.onStatusChange('completed');

      return {
        success: true,
        mode: 'collectUrls',
        totalCollected: collectedThisRun,
        totalInFile: knownUrls.size,
        outputFolder: path.dirname(urlsExcelPath),
        urlsExcelPath
      };
    } catch (err) {
      if (err.message === 'CRAWL_STOPPED_BY_USER') {
        this.log('Đã dừng thu thập URL theo yêu cầu người dùng.', 'warn');
        this.onStatusChange('stopped');
        return {
          success: false,
          mode: 'collectUrls',
          totalCollected: collectedThisRun,
          totalInFile: knownUrls.size,
          outputFolder: path.dirname(urlsExcelPath),
          urlsExcelPath
        };
      }
      this.log(`Lỗi thu thập URL: ${err.message}`, 'error');
      this.onStatusChange('error');
      throw err;
    } finally {
      this.isRunning = false;
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (e) { }
        this.browser = null;
      }
    }
  }

  async writeManifest(outputFolder, targetCount, keyword = '') {
    if (!outputFolder) return;

    try {
      const summaryLines = [
        '================================================================================',
        '               TỔNG HỢP DANH SÁCH BÀI VIẾT KÉO TỪ MAFENGWO.CN                  ',
        '================================================================================',
        `Thời gian kéo: ${new Date().toLocaleString('vi-VN')}`,
        keyword ? `Từ khóa tìm kiếm: ${keyword}` : '',
        `Số lượng mục tiêu: ${targetCount} bài`,
        `Tổng số bài kéo thành công: ${this.scrapedPosts.length} bài`,
        `Thư mục lưu trữ: ${outputFolder}`,
        '--------------------------------------------------------------------------------',
        'STT | TÁC GIẢ | NGÀY ĐĂNG | TIÊU ĐỀ | FILE TXT | LINK GỐC',
        '--------------------------------------------------------------------------------'
      ].filter(Boolean);

      this.scrapedPosts.forEach(p => {
        summaryLines.push(
          `[${String(p.index).padStart(3, '0')}] [${p.author}] [${p.date}] ${p.title}\n   File: ${p.filename}\n   Link: ${p.url}\n`
        );
      });

      summaryLines.push('================================================================================');

      await fs.writeFile(
        path.join(outputFolder, '_tong_hop_danh_sach.txt'),
        summaryLines.join('\n'),
        'utf8'
      );

      await fs.writeJson(
        path.join(outputFolder, '_manifest.json'),
        {
          createdAt: new Date().toISOString(),
          keyword: keyword || undefined,
          totalScraped: this.scrapedPosts.length,
          targetCount,
          outputFolder,
          posts: this.scrapedPosts
        },
        { spaces: 2 }
      );
    } catch (err) {
      this.log(`Lỗi khi tạo file tổng hợp: ${err.message}`, 'warn');
    }
  }
}

module.exports = MafengwoCrawler;
