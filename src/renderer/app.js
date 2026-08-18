document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const crawlForm = document.getElementById('crawlForm');
  const inputTargetCount = document.getElementById('inputTargetCount');
  
  const inputStartUrl = document.getElementById('inputStartUrl');
  const selectDestination = document.getElementById('selectDestination');
  const inputKeyword = document.getElementById('inputKeyword');
  const keywordChips = document.getElementById('keywordChips');

  const inputBaseDir = document.getElementById('inputBaseDir');
  const inputDelay = document.getElementById('inputDelay');
  const selectBrowser = document.getElementById('selectBrowser');
  const checkShowBrowser = document.getElementById('checkShowBrowser');
  
  const btnSelectFolder = document.getElementById('btnSelectFolder');
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnPauseText = document.getElementById('btnPauseText');
  const btnStop = document.getElementById('btnStop');
  
  const btnAutoLogin = document.getElementById('btnAutoLogin');
  const btnAutoLoginText = document.getElementById('btnAutoLoginText');
  const btnOpenAuth = document.getElementById('btnOpenAuth');
  const authIndicator = document.getElementById('authIndicator');
  const displayPhone = document.getElementById('displayPhone');
  
  const statCount = document.getElementById('statCount');
  const statPage = document.getElementById('statPage');
  const statPercent = document.getElementById('statPercent');
  const progressBarFill = document.getElementById('progressBarFill');
  const tabCount = document.getElementById('tabCount');
  
  const postsTableBody = document.getElementById('postsTableBody');
  const logTerminal = document.getElementById('logTerminal');
  const btnClearLogs = document.getElementById('btnClearLogs');
  
  const outputQuickBox = document.getElementById('outputQuickBox');
  const currentOutputFolderPath = document.getElementById('currentOutputFolderPath');
  const btnOpenOutputFolder = document.getElementById('btnOpenOutputFolder');

  let currentOutputFolder = null;
  let isPausedState = false;
  let totalTarget = 20;
  let scrapedPostsList = [];

  // 1. Destination Preset Handler
  selectDestination.addEventListener('change', () => {
    const val = selectDestination.value;
    if (val !== 'custom') {
      inputStartUrl.value = val;
    } else {
      inputStartUrl.focus();
      inputStartUrl.select();
    }
  });

  // 2. Keyword Quick Chips Handler
  if (keywordChips) {
    keywordChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        keywordChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        inputKeyword.value = chip.dataset.kw || chip.textContent.trim();
      });
    });

    inputKeyword.addEventListener('input', () => {
      const val = inputKeyword.value.trim().toLowerCase();
      keywordChips.querySelectorAll('.chip').forEach(chip => {
        const kw = (chip.dataset.kw || '').toLowerCase();
        if (kw === val) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    });
  }

  // 3. Check & Load Auth
  async function refreshAuthStatus() {
    try {
      const creds = await window.api.getCredentials();
      if (creds && creds.phone) {
        displayPhone.textContent = creds.phone;
      }
      const session = await window.api.checkSession();
      if (session.loggedIn) {
        authIndicator.classList.add('active');
        btnAutoLoginText.textContent = 'Đã Đăng Nhập (Tự động gia hạn)';
      } else {
        authIndicator.classList.remove('active');
        btnAutoLoginText.textContent = 'Tự Động Đăng Nhập & Giải Captcha';
      }
    } catch (e) {
      console.error('Auth check error:', e);
    }
  }

  await refreshAuthStatus();

  // 4. Auto Login with Captcha Solver
  btnAutoLogin.addEventListener('click', async () => {
    btnAutoLogin.disabled = true;
    btnAutoLoginText.textContent = 'Đang tự động giải & đăng nhập...';

    appendLog({
      timestamp: new Date().toLocaleTimeString('vi-VN'),
      message: 'Bắt đầu quy trình tự động đăng nhập và giải Captcha cho tài khoản...',
      type: 'info'
    });

    try {
      const browserType = selectBrowser ? selectBrowser.value : 'chrome';
      const success = await window.api.autoLogin(browserType);
      await refreshAuthStatus();
      if (success) {
        appendLog({
          timestamp: new Date().toLocaleTimeString('vi-VN'),
          message: 'TỰ ĐỘNG ĐĂNG NHẬP & GIẢI CAPTCHA THÀNH CÔNG! Phiên làm việc đã sẵn sàng.',
          type: 'success'
        });
      }
    } catch (err) {
      appendLog({
        timestamp: new Date().toLocaleTimeString('vi-VN'),
        message: `Lỗi đăng nhập: ${err.message}`,
        type: 'error'
      });
    } finally {
      btnAutoLogin.disabled = false;
      await refreshAuthStatus();
    }
  });

  // 5. Manual Visual Login Window Assist
  btnOpenAuth.addEventListener('click', async () => {
    try {
      appendLog({
        timestamp: new Date().toLocaleTimeString('vi-VN'),
        message: 'Đang mở cửa sổ hỗ trợ đăng nhập trực quan...',
        type: 'info'
      });
      await window.api.openLoginWindow();
      await refreshAuthStatus();
    } catch (err) {
      console.error('Error opening login window:', err);
    }
  });

  // 6. Quick chips for target count
  document.querySelectorAll('.quick-chips .chip[data-count]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.quick-chips .chip[data-count]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      inputTargetCount.value = chip.dataset.count;
    });
  });

  inputTargetCount.addEventListener('input', () => {
    const val = inputTargetCount.value;
    document.querySelectorAll('.quick-chips .chip[data-count]').forEach(chip => {
      if (chip.dataset.count === val) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  });

  // 7. Select Base Folder
  btnSelectFolder.addEventListener('click', async () => {
    const selected = await window.api.selectFolder();
    if (selected) {
      inputBaseDir.value = selected;
    }
  });

  // 8. Tab Switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // 9. Clear Logs
  btnClearLogs.addEventListener('click', () => {
    logTerminal.innerHTML = `
      <div class="log-entry info">
        <span class="log-time">[Hệ thống]</span>
        <span class="log-text">Đã làm sạch nhật ký thực thi.</span>
      </div>
    `;
  });

  function appendLog(logData) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${logData.type || 'info'}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${logData.timestamp || new Date().toLocaleTimeString('vi-VN')}]`;

    const textSpan = document.createElement('span');
    textSpan.className = 'log-text';
    textSpan.textContent = logData.message;

    entry.appendChild(timeSpan);
    entry.appendChild(textSpan);
    logTerminal.appendChild(entry);

    logTerminal.scrollTop = logTerminal.scrollHeight;
  }

  function addPostRow(post) {
    const emptyRow = postsTableBody.querySelector('.empty-row');
    if (emptyRow) {
      emptyRow.remove();
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-cyan);">${post.index}</td>
      <td>
        <div class="post-title-cell" title="${escapeHtml(post.title)}">${escapeHtml(post.title)}</div>
        <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">${escapeHtml(post.filename)}</div>
      </td>
      <td>${escapeHtml(post.author || 'Mafengwo')}</td>
      <td class="post-meta-cell">${post.wordCount ? post.wordCount.toLocaleString() : 0} ký tự</td>
      <td style="text-align: center;">
        <button type="button" class="btn btn-secondary btn-sm btn-open-txt" data-path="${escapeHtml(post.filePath)}" title="Mở file TXT">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Mở TXT
        </button>
      </td>
    `;

    tr.querySelector('.btn-open-txt').addEventListener('click', (e) => {
      const filePath = e.currentTarget.dataset.path;
      if (filePath) {
        window.api.openFile(filePath);
      }
    });

    postsTableBody.appendChild(tr);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 10. Start Crawl Form Submit
  crawlForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    totalTarget = parseInt(inputTargetCount.value, 10) || 20;
    const startUrl = inputStartUrl.value.trim() || 'https://www.mafengwo.cn/';
    const keyword = inputKeyword ? inputKeyword.value.trim() : '';
    const baseDir = inputBaseDir.value.trim();
    const delayMs = parseInt(inputDelay.value, 10) || 2000;
    const browserType = selectBrowser ? selectBrowser.value : 'chrome';
    const showBrowser = checkShowBrowser.checked;

    // Reset Table & Stats
    postsTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">
          <div class="empty-state">
            <p>Đang tải và xử lý danh sách bài viết từ Mafengwo...</p>
          </div>
        </td>
      </tr>
    `;
    scrapedPostsList = [];
    tabCount.textContent = '0';
    statCount.textContent = `0 / ${totalTarget} bài`;
    statPercent.textContent = '0%';
    statPage.textContent = 'Trang 1';
    progressBarFill.style.width = '0%';
    outputQuickBox.style.display = 'none';

    // UI state
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
    isPausedState = false;
    btnPauseText.textContent = 'Tạm Dừng';

    const sourceDesc = keyword ? `theo từ khóa "${keyword}" từ link ban đầu: ${startUrl}` : `từ nguồn link: ${startUrl}`;
    appendLog({
      timestamp: new Date().toLocaleTimeString('vi-VN'),
      message: `Bắt đầu quá trình kéo ${totalTarget} bài viết ${sourceDesc}... (Trình duyệt: ${browserType === 'edge' ? 'Microsoft Edge' : 'Google Chrome'})`,
      type: 'info'
    });

    try {
      await window.api.startCrawl({
        targetCount: totalTarget,
        startUrl,
        keyword,
        outputBaseDir: baseDir,
        delayMs,
        browserType,
        showBrowser
      });
    } catch (err) {
      appendLog({
        timestamp: new Date().toLocaleTimeString('vi-VN'),
        message: `Lỗi khởi động cào: ${err.message}`,
        type: 'error'
      });
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnStop.disabled = true;
    }
  });

  // 11. Pause / Resume / Stop
  btnPause.addEventListener('click', async () => {
    if (!isPausedState) {
      await window.api.pauseCrawl();
      isPausedState = true;
      btnPauseText.textContent = 'Tiếp Tục';
    } else {
      await window.api.resumeCrawl();
      isPausedState = false;
      btnPauseText.textContent = 'Tạm Dừng';
    }
  });

  btnStop.addEventListener('click', async () => {
    await window.api.stopCrawl();
    btnStop.disabled = true;
    btnPause.disabled = true;
  });

  btnOpenOutputFolder.addEventListener('click', () => {
    if (currentOutputFolder) {
      window.api.openFolder(currentOutputFolder);
    }
  });

  // 12. IPC Event Listeners from Main Process
  window.api.onCrawlerLog((logData) => {
    appendLog(logData);
  });

  window.api.onCrawlerProgress((progressData) => {
    statCount.textContent = `${progressData.current} / ${progressData.target} bài`;
    statPercent.textContent = `${progressData.percent}%`;
    progressBarFill.style.width = `${progressData.percent}%`;
    if (progressData.currentPage) {
      statPage.textContent = `Trang ${progressData.currentPage}`;
    }
  });

  window.api.onPostScraped((postData) => {
    scrapedPostsList.push(postData);
    tabCount.textContent = scrapedPostsList.length;
    addPostRow(postData);
  });

  window.api.onStatusChange((status) => {
    if (status === 'completed' || status === 'stopped' || status === 'error') {
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnStop.disabled = true;
      btnPauseText.textContent = 'Tạm Dừng';
    }
  });

  window.api.onCrawlerCompleted((result) => {
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;

    if (result && result.outputFolder) {
      currentOutputFolder = result.outputFolder;
      currentOutputFolderPath.textContent = result.outputFolder;
      outputQuickBox.style.display = 'flex';
    }

    refreshAuthStatus();
  });
});
