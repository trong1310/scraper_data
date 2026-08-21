/**
 * Tencent Cloud WAF / Slider Captcha & Graphic Image Captcha Auto-Solver for Mafengwo
 * High-Precision Left-Edge Gap Detection & Human-like Drag Trajectory
 */

const Tesseract = require('tesseract.js');
const JimpModule = require('jimp');
const Jimp = JimpModule.Jimp || JimpModule;

/**
 * Human-like mouse drag trajectory generator
 */
async function performHumanDrag(page, startX, startY, distance) {
  // 1. Move to start of slider thumb
  await page.mouse.move(startX, startY);
  await new Promise(r => setTimeout(r, 120));
  await page.mouse.down();
  await new Promise(r => setTimeout(r, 150));

  // 2. Generate multi-phase realistic human acceleration and deceleration curve
  const steps = 32 + Math.floor(Math.random() * 8);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Cubic bezier ease-out
    let ease;
    if (t < 0.60) {
      // Rapid acceleration phase
      ease = Math.pow(t / 0.60, 2) * 0.72;
    } else {
      // Smooth deceleration phase into slot
      const tDecel = (t - 0.60) / 0.40;
      ease = 0.72 + (1 - Math.pow(1 - tDecel, 3)) * 0.28;
    }

    const currX = startX + (distance * ease);
    const jitterY = startY + (Math.sin(t * Math.PI) * (Math.random() * 2 - 1));

    await page.mouse.move(currX, jitterY);
    const delay = 7 + Math.floor(Math.random() * 8);
    await new Promise(r => setTimeout(r, delay));
  }

  // 3. Final precise alignment and pause before mouse up
  await page.mouse.move(startX + distance, startY);
  await new Promise(r => setTimeout(r, 220));
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 400));
}

/**
 * Detect and solve Tencent Slider Captcha on page if present
 * @param {import('puppeteer-core').Page} page Puppeteer page
 * @param {object} options Options
 * @param {number} options.maxRetries Max retry attempts (default 5)
 * @param {Function} options.onLog Logging callback
 * @returns {Promise<boolean>} True if captcha resolved or not present
 */
async function solveTencentCaptcha(page, options = {}) {
  const maxRetries = options.maxRetries || 8;
  const onLog = options.onLog || console.log;

  let totalSolvedInSession = 0;

  // Outer loop to continuously solve back-to-back Captchas (Tencent Cloud secondary verification)
  while (totalSolvedInSession < 5) {
    let currentCaptchaSolved = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // 1. Check if captcha elements exist on the page
      const hasCaptcha = await page.evaluate(() => {
        const iframe = document.querySelector('iframe#tcaptcha_iframe_dy, iframe[src*="captcha.gtimg.com"], iframe[src*="drag_ele"], iframe[src*="t.captcha.qq.com"], iframe[src*="cap_union"]');
        const mask = document.getElementById('t_mask');
        const wrap = document.getElementById('tcaptcha_wrapper_transform_dy') || document.querySelector('.tcaptcha-transform');
        const tVerify = document.getElementById('t_verify');
        return !!(
          (iframe && iframe.offsetParent !== null) ||
          (mask && mask.style.display !== 'none' && mask.offsetParent !== null) ||
          (wrap && wrap.style.display !== 'none' && wrap.offsetParent !== null) ||
          tVerify
        );
      }).catch(() => false);

      if (!hasCaptcha) {
        if (totalSolvedInSession > 0) {
          onLog(`[Captcha] Tất cả ${totalSolvedInSession} Captcha liên tiếp đã được giải hoàn tất!`, 'success');
        }
        return true; // No captcha blocking
      }

      onLog(`[Captcha] Phát hiện xác thực bảo mật Tencent Slider (Captcha thứ ${totalSolvedInSession + 1}, Lần thử ${attempt}/${maxRetries})...`, 'warn');
      await new Promise(r => setTimeout(r, 1200));

      // 2. Find Captcha Frame
      let captchaFrame = page.frames().find(f =>
        f.url().includes('captcha.gtimg.com') ||
        f.url().includes('drag_ele') ||
        f.url().includes('t.captcha.qq.com') ||
        f.url().includes('cap_union')
      );

      if (!captchaFrame) {
        const iframeEl = await page.$('iframe#tcaptcha_iframe_dy, iframe[src*="captcha.gtimg.com"], iframe[src*="t.captcha.qq.com"]');
        if (iframeEl) {
          captchaFrame = await iframeEl.contentFrame();
        }
      }

      if (!captchaFrame) {
        onLog('[Captcha] Đang đợi khung xác thực nạp dữ liệu...', 'info');
        await new Promise(r => setTimeout(r, 1800));
        continue;
      }

      // If retry attempt, reload captcha to get a fresh clean image
      if (attempt > 2) {
        await captchaFrame.evaluate(() => {
          const reloadBtn = document.querySelector('#reload, .tc-reload, .tc-refresh, #slideReload, .tc-reload-btn');
          if (reloadBtn) reloadBtn.click();
        }).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));
      }

      // Wait for elements to be ready
      await captchaFrame.waitForSelector('#slideBg, .tc-bg-img, .tc-drag-bg, #slideBlock', { timeout: 4500 }).catch(() => { });
      await new Promise(r => setTimeout(r, 700));

      // 3. Extract Captcha Images & Coordinates
      const captchaData = await captchaFrame.evaluate(async () => {
        const bgEl = document.querySelector('#slideBg, .tc-bg-img, .tc-drag-bg, #slideBlock');
        const thumbEl = document.querySelector('#tcaptcha_drag_thumb, #tcaptcha_drag_button, .tc-drag-thumb, .tc-slider-normal, #slideThumb, .tc-drag-btn');

        if (!bgEl || !thumbEl) {
          return null;
        }

        const bgStyle = window.getComputedStyle(bgEl);
        const bgMatch = bgStyle.backgroundImage ? bgStyle.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/) : null;
        const bgUrl = bgMatch ? bgMatch[1] : null;

        const thumbRect = thumbEl.getBoundingClientRect();
        const bgRect = bgEl.getBoundingClientRect();

        return {
          bgUrl,
          thumbRect: {
            x: thumbRect.x,
            y: thumbRect.y,
            width: thumbRect.width,
            height: thumbRect.height
          },
          bgRect: {
            x: bgRect.x,
            y: bgRect.y,
            width: bgRect.width,
            height: bgRect.height
          }
        };
      }).catch(() => null);

      if (!captchaData || !captchaData.bgUrl || !captchaData.thumbRect) {
        onLog('[Captcha] Đang chuẩn bị hình ảnh mảnh ghép...', 'info');
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      // 4. Calculate Exact LEFT EDGE Gap Distance using Canvas analysis
      const gapAnalysis = await captchaFrame.evaluate(async (data) => {
        return new Promise((resolve) => {
          const bgImg = new Image();
          bgImg.crossOrigin = 'Anonymous';
          bgImg.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = bgImg.naturalWidth;
              canvas.height = bgImg.naturalHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(bgImg, 0, 0);

              const w = canvas.width;
              const h = canvas.height;
              const imgData = ctx.getImageData(0, 0, w, h).data;

              // Target the LEFT border of the cutout slot
              const minX = Math.floor(w * 0.22);
              const maxX = Math.floor(w * 0.88);
              let bestLeftX = minX;
              let maxBorderScore = -1;

              for (let x = minX; x < maxX; x++) {
                let score = 0;
                for (let y = Math.floor(h * 0.18); y < Math.floor(h * 0.82); y += 2) {
                  const idx = (y * w + x) * 4;
                  const idxOut = (y * w + (x - 4)) * 4;
                  const idxIn = (y * w + (x + 8)) * 4;

                  const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2];
                  const rOut = imgData[idxOut], gOut = imgData[idxOut + 1], bOut = imgData[idxOut + 2];
                  const rIn = imgData[idxIn], gIn = imgData[idxIn + 1], bIn = imgData[idxIn + 2];

                  const briOut = (rOut + gOut + bOut) / 3;
                  const briIn = (rIn + gIn + bIn) / 3;
                  const edgeDiff = Math.abs(r - rOut) + Math.abs(g - gOut) + Math.abs(b - bOut);

                  // Left edge of puzzle slot has high contrast and the inside is dark shadow
                  if (edgeDiff > 35 && briOut > briIn) {
                    score += edgeDiff + (briOut - briIn) * 1.5;
                  }
                }

                if (score > maxBorderScore) {
                  maxBorderScore = score;
                  bestLeftX = x;
                }
              }

              const scale = data.bgRect.width / w;
              const displayLeftX = Math.round(bestLeftX * scale);
              resolve({ bestLeftX, displayLeftX, scale });
            } catch (e) {
              resolve({ bestLeftX: 280, displayLeftX: 140, scale: 0.5 });
            }
          };

          bgImg.onerror = () => {
            resolve({ bestLeftX: 280, displayLeftX: 140, scale: 0.5 });
          };

          bgImg.src = data.bgUrl;
        });
      }, captchaData).catch(() => ({ bestLeftX: 280, displayLeftX: 140, scale: 0.5 }));

      // 5. Calculate absolute mouse coordinates on the main page
      const iframeElement = await page.$('iframe#tcaptcha_iframe_dy, iframe[src*="captcha.gtimg.com"], iframe[src*="t.captcha.qq.com"]');
      const iframeBox = iframeElement ? await iframeElement.boundingBox() : { x: 0, y: 0 };

      let startX = 0;
      let startY = 0;

      // Try getting thumb directly via frame boundingBox
      const thumbElement = await captchaFrame.$('#tcaptcha_drag_thumb, #tcaptcha_drag_button, .tc-drag-thumb, .tc-slider-normal, #slideThumb, .tc-drag-btn');
      const directThumbBox = thumbElement ? await thumbElement.boundingBox().catch(() => null) : null;

      if (directThumbBox && directThumbBox.x > 0 && directThumbBox.y > 0) {
        startX = Math.round(directThumbBox.x + directThumbBox.width / 2);
        startY = Math.round(directThumbBox.y + directThumbBox.height / 2);
      } else {
        const initialThumbX = (captchaData.thumbRect.x > 80) ? 32 : captchaData.thumbRect.x;
        startX = Math.round(iframeBox.x + initialThumbX + captchaData.thumbRect.width / 2);
        startY = Math.round(iframeBox.y + captchaData.thumbRect.y + captchaData.thumbRect.height / 2);
      }

      // Initial cutout piece offset relative to background is ~23px
      // Adaptive fine-tuning offset per attempt (calibrated to hit exactly in slot)
      const offsetVariations = [-23, -26, -20, -28, -24];
      const offset = offsetVariations[(attempt - 1) % offsetVariations.length];
      const dragDistance = Math.max(30, gapAnalysis.displayLeftX + offset);

      onLog(`[Captcha] Đang tự động kéo mảnh ghép -> Tọa độ: (${startX}, ${startY}), Khoảng cách: ${dragDistance}px (Mép trái: ${gapAnalysis.displayLeftX}px)...`, 'info');

      // 6. Perform realistic human drag
      await performHumanDrag(page, startX, startY, dragDistance);
      await new Promise(r => setTimeout(r, 2500));

      // 7. Verify clearance of THIS captcha step
      const stillActive = await page.evaluate(() => {
        const iframe = document.querySelector('iframe#tcaptcha_iframe_dy, iframe[src*="captcha.gtimg.com"], iframe[src*="t.captcha.qq.com"]');
        const mask = document.getElementById('t_mask');
        const wrap = document.getElementById('tcaptcha_wrapper_transform_dy');
        return !!((iframe && iframe.offsetParent !== null) || (mask && mask.offsetParent !== null) || (wrap && wrap.style.display !== 'none'));
      }).catch(() => false);

      if (!stillActive) {
        totalSolvedInSession++;
        currentCaptchaSolved = true;
        onLog(`[Captcha] Đã giải xong Captcha thứ ${totalSolvedInSession}! Đang kiểm tra xem còn Captcha nối tiếp không...`, 'success');
        await new Promise(r => setTimeout(r, 2000));
        break; // Break inner retry loop, return to outer loop to check for 2nd/3rd Captcha
      } else {
        onLog('[Captcha] Chưa khớp vị trí mảnh ghép, tự động hiệu chỉnh và thử lại...', 'warn');
        // Wait for slider reset animation
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!currentCaptchaSolved) {
      // Failed to solve this captcha within maxRetries
      return false;
    }
  }

  return true;
}

/**
 * Advanced image preprocessor using Jimp for OCR
 * 1. Luminance adaptive binarization to separate text from background
 * 2. Directional line detection & removal (erasing thin green/gray noise lines crossing characters)
 * 3. Morphological noise reduction (removing single orphaned pixels)
 * 4. Image contrast boost & 3x upscale for Tesseract OCR optimal accuracy
 * 
 * @param {Buffer} imageBuffer PNG Buffer of raw captcha image
 * @returns {Promise<Buffer>} Preprocessed clean PNG Buffer
 */
async function preprocessCaptchaImage(imageBuffer) {
  try {
    const rawBuf = Buffer.from(imageBuffer);
    let img;
    if (Jimp.read) {
      img = await Jimp.read(rawBuf);
    } else {
      img = new Jimp(rawBuf);
    }

    const w = img.width || img.bitmap.width;
    const h = img.height || img.bitmap.height;

    // Create a 3x upscaled simple image (grayscale + contrast) as fallback
    let simpleImg = img.clone();
    simpleImg.resize({ w: w * 3, h: h * 3 }).grayscale();

    // 1. Strict Luminance Binarization
    const matrix = [];
    for (let y = 0; y < h; y++) {
      matrix[y] = new Array(w).fill(255);
    }

    img.scan(0, 0, w, h, function (x, y, idx) {
      const r = this.bitmap.data[idx];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      matrix[y][x] = (lum < 140) ? 0 : 255;
    });

    // 2. Softened Line Removal Filter (horizSpan >= 5, vertSpan <= 1)
    const cleanedMatrix = matrix.map(row => [...row]);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 2; x < w - 2; x++) {
        if (matrix[y][x] === 0) {
          const isThinVertically = (matrix[y - 1][x] === 255 && matrix[y + 1][x] === 255);
          
          let horizSpan = 0;
          for (let dx = -3; dx <= 3; dx++) {
            if (x + dx >= 0 && x + dx < w && matrix[y][x + dx] === 0) {
              horizSpan++;
            }
          }

          let vertSpan = 0;
          for (let dy = -2; dy <= 2; dy++) {
            if (y + dy >= 0 && y + dy < h && matrix[y + dy][x] === 0) {
              vertSpan++;
            }
          }

          if (isThinVertically && horizSpan >= 5 && vertSpan <= 1) {
            cleanedMatrix[y][x] = 255;
          }
        }
      }
    }

    // 3. Write back cleaned matrix to Jimp image
    img.scan(0, 0, w, h, function (x, y, idx) {
      const val = cleanedMatrix[y][x];
      this.bitmap.data[idx] = val;
      this.bitmap.data[idx + 1] = val;
      this.bitmap.data[idx + 2] = val;
    });

    // 4. Upscale 3x for high-precision Tesseract OCR
    img.resize({ w: w * 3, h: h * 3 });

    const processedBuffer = await img.getBuffer('image/png');
    const simpleBuffer = await simpleImg.getBuffer('image/png');

    return { processedBuffer, simpleBuffer };
  } catch (err) {
    return { processedBuffer: imageBuffer, simpleBuffer: imageBuffer };
  }
}

/**
 * Find image captcha input field, image element, and refresh button
 * @param {import('puppeteer-core').Page | import('puppeteer-core').Frame} context
 */
async function findImageCaptchaElements(context) {
  return await context.evaluate(() => {
    // 1. Input Candidates: Find the strictly VISIBLE captcha input element
    const inputCandidates = [
      'input[name="code"]',
      'input[name="captcha"]',
      'input[name="vericode"]',
      'input[name="valicode"]',
      'input[placeholder*="验证码"]',
      'input[placeholder*="Mã"]',
      'input.captcha',
      'input._j_captcha',
      '#captcha_code',
      '#code',
      '#vericode',
      '#valicode'
    ];

    let inputEl = null;
    let inputSelector = null;

    for (const sel of inputCandidates) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el && el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden') {
          inputEl = el;
          if (!el.id) el.id = 'visible_captcha_input_' + Date.now();
          inputSelector = '#' + el.id;
          break;
        }
      }
      if (inputEl) break;
    }

    // 2. Image candidates: Find the strictly VISIBLE captcha image element
    const imgCandidates = [
      'img[src*="verifyCode"]',
      'img[src*="captcha"]',
      'img[src*="code"]',
      'img[src*="valicode"]',
      'img[src*="checkcode"]',
      'img[src*="vericode"]',
      'img[src*="rand"]',
      'img[src*="getcode"]',
      'img._j_captcha_img',
      'img.vericode',
      '#captcha_img',
      '#codeImg',
      '#code_img',
      'canvas[id*="captcha"]',
      'canvas[id*="code"]'
    ];

    let imgEl = null;
    let imgSelector = null;

    for (const sel of imgCandidates) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el && el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden') {
          imgEl = el;
          if (!el.id) el.id = 'visible_captcha_img_' + Date.now();
          imgSelector = '#' + el.id;
          break;
        }
      }
      if (imgEl) break;
    }

    // Fallback: search parent container of input field for img if imgEl wasn't found
    if (inputEl && !imgEl) {
      const parent = inputEl.closest('form, div, td, p, li, .form-group') || inputEl.parentElement;
      if (parent) {
        const parentVisuals = parent.querySelectorAll('img, canvas');
        for (const vis of parentVisuals) {
          if (vis.offsetParent !== null && (vis.width > 20 || vis.naturalWidth > 20 || vis.offsetWidth > 20)) {
            imgEl = vis;
            if (!vis.id) vis.id = 'visible_captcha_img_' + Date.now();
            imgSelector = '#' + vis.id;
            break;
          }
        }
      }
    }

    if (!imgEl || !inputEl) return null;

    // 3. Refresh Button Selectors ("换一换")
    let refreshSelector = null;
    const allEls = Array.from(document.querySelectorAll('a, button, span, div, img'));
    for (const el of allEls) {
      const txt = (el.innerText || el.title || el.alt || '').trim();
      if (txt.includes('换一换') || txt.includes('刷新') || txt.includes('看不清') || txt.includes('换张')) {
        if (el.offsetParent !== null && el.offsetWidth > 0) {
          if (!el.id) el.id = 'visible_refresh_btn_' + Date.now();
          refreshSelector = '#' + el.id;
          break;
        }
      }
    }

    if (!refreshSelector && imgSelector) {
      refreshSelector = imgSelector;
    }

    return {
      inputSelector,
      imgSelector,
      refreshSelector
    };
  }).catch(() => null);
}

/**
 * Detect and solve traditional Graphic / Text Image Captchas (e.g. 4-letter graphic code with noise line)
 * Uses Tesseract.js OCR engine with Jimp image preprocessing. Automatically retries if error prompt appears.
 * 
 * @param {import('puppeteer-core').Page} page Puppeteer page instance
 * @param {object} options Options
 * @param {number} options.maxRetries Maximum retry attempts (default 5)
 * @param {Function} options.onLog Logging callback function
 * @returns {Promise<boolean>} True if captcha resolved or not present
 */
async function solveImageCaptcha(page, options = {}) {
  const maxRetries = options.maxRetries || 6;
  const onLog = options.onLog || console.log;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let targetContext = page;
    let elements = await findImageCaptchaElements(page);

    if (!elements) {
      for (const frame of page.frames()) {
        const frameElements = await findImageCaptchaElements(frame);
        if (frameElements) {
          targetContext = frame;
          elements = frameElements;
          break;
        }
      }
    }

    if (!elements || !elements.inputSelector || !elements.imgSelector) {
      if (attempt === 1) {
        return true; // No image captcha present
      }
      break;
    }

    onLog(`[Image Captcha] Phát hiện Captcha hình ảnh chữ/số (Lần thử ${attempt}/${maxRetries})...`, 'warn');

    // Refresh captcha image if this is a retry attempt (only if explicit refresh button exists)
    if (attempt > 1 && elements.refreshSelector && elements.refreshSelector !== elements.imgSelector) {
      onLog('[Image Captcha] Nhấn nút "换一换" (Làm mới) để lấy mã captcha mới...', 'info');
      try {
        await targetContext.click(elements.refreshSelector);
      } catch (e) {
        await targetContext.evaluate((sel) => {
          const btn = document.querySelector(sel);
          if (btn) btn.click();
        }, elements.refreshSelector).catch(() => { });
      }
      await new Promise(r => setTimeout(r, 1200));
      elements = await findImageCaptchaElements(targetContext) || elements;
    }

    // Wait briefly for image render to stabilize
    await new Promise(r => setTimeout(r, 800));

    // Capture Captcha Image using evaluateHandle to guarantee visible element
    let imageBuffer = null;
    try {
      const imgHandle = await targetContext.evaluateHandle((sel) => {
        let el = document.querySelector(sel);
        if (el && el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0) return el;
        const imgs = document.querySelectorAll('img[src*="verifyCode"], img[src*="captcha"], img[src*="code"]');
        for (const img of imgs) {
          if (img.offsetParent !== null && img.offsetWidth > 0 && img.offsetHeight > 0) return img;
        }
        return null;
      }, elements.imgSelector);

      const imgElement = imgHandle.asElement();
      if (imgElement) {
        imageBuffer = await imgElement.screenshot({ type: 'png' });
      }
    } catch (err) {
      onLog(`[Image Captcha] Lỗi chụp ảnh captcha: ${err.message}`, 'warn');
    }

    if (!imageBuffer) {
      onLog('[Image Captcha] Không thể lấy hình ảnh Captcha, thử lại...', 'warn');
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    // Preprocess image (Dual-mode: Cleaned & Simple Upscaled)
    onLog('[Image Captcha] Đang xử lý khử nhiễu & phân tích loại bỏ đường kẻ (Line Removal)...', 'info');
    const { processedBuffer, simpleBuffer } = await preprocessCaptchaImage(imageBuffer);

    // OCR Text Recognition with Tesseract.js
    onLog('[Image Captcha] Đang sử dụng trí tuệ nhân tạo OCR để nhận diện mã chữ/số...', 'info');
    let recognizedText = '';
    
    // Try 1: Processed Buffer with PSM 8
    try {
      const ocr1 = await Tesseract.recognize(processedBuffer, 'eng', {
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        tessedit_pageseg_mode: '8'
      });
      recognizedText = (ocr1.data.text || '').replace(/[^a-zA-Z0-9]/g, '').trim();
    } catch (e) {
      onLog(`[Image Captcha] OCR Try 1 error: ${e.message}`, 'warn');
    }

    // Try 2: Simple Upscaled Buffer with PSM 7 if Try 1 was too short
    if (!recognizedText || recognizedText.length < 3) {
      try {
        const ocr2 = await Tesseract.recognize(simpleBuffer, 'eng', {
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
          tessedit_pageseg_mode: '7'
        });
        const txt2 = (ocr2.data.text || '').replace(/[^a-zA-Z0-9]/g, '').trim();
        if (txt2.length > recognizedText.length) {
          recognizedText = txt2;
        }
      } catch (e) {
        onLog(`[Image Captcha] OCR Try 2 error: ${e.message}`, 'warn');
      }
    }

    if (!recognizedText || recognizedText.length < 2) {
      onLog(`[Image Captcha] Mã nhận diện quá ngắn (${recognizedText}), đổi mã mới và thử lại...`, 'warn');
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    onLog(`[Image Captcha] Mã nhận diện thành công: "${recognizedText}". Đang điền vào ô input...`, 'info');

    // Fill recognized captcha code using physical focus, Ctrl+A Backspace, and keyboard.type
    let fillSuccess = false;
    try {
      const inputHandle = await targetContext.evaluateHandle((sel) => {
        let inp = document.querySelector(sel);
        if (inp && inp.offsetParent !== null && inp.offsetWidth > 0) return inp;
        const candidates = document.querySelectorAll('input[name="code"], input[placeholder*="验证码"], input[name="captcha"], input.captcha, input._j_captcha');
        for (const c of candidates) {
          if (c && c.offsetParent !== null && c.offsetWidth > 0 && c.offsetHeight > 0 && window.getComputedStyle(c).display !== 'none') {
            return c;
          }
        }
        return null;
      }, elements.inputSelector);

      const inputElHandle = inputHandle.asElement();
      if (inputElHandle) {
        // Physical click to gain active focus
        await inputElHandle.click({ delay: 50 });
        await new Promise(r => setTimeout(r, 150));

        // Select all text and clear
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 100));

        // Type recognized text character by character
        await page.keyboard.type(recognizedText, { delay: 40 });
        await new Promise(r => setTimeout(r, 150));

        // Synchronize DOM value and dispatch reactivity events
        await targetContext.evaluate((el, text) => {
          if (!el.value) el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        }, inputElHandle, recognizedText).catch(() => {});

        fillSuccess = true;
      }
    } catch (typeErr) {
      onLog(`[Image Captcha] Lỗi khi gõ ô input: ${typeErr.message}`, 'warn');
    }

    if (fillSuccess) {
      onLog(`[Image Captcha] Đã gõ mã "${recognizedText}" vào ô input thành công.`, 'info');
    } else {
      onLog('[Image Captcha] Không tìm thấy ô input để gõ mã.', 'warn');
    }

    await new Promise(r => setTimeout(r, 500));

    // Submit login or form if submit button exists
    const submitted = await page.evaluate(() => {
      const loginBtn = document.querySelector('#_js_loginBtn, button[type="submit"], input[type="submit"], .btn-login, .btn-primary');
      if (loginBtn && loginBtn.offsetParent !== null) {
        loginBtn.click();
        return true;
      }
      return false;
    }).catch(() => false);

    if (submitted) {
      onLog('[Image Captcha] Đã nhấn nút Gửi/Đăng nhập, đang kiểm tra kết quả...', 'info');
      await new Promise(r => setTimeout(r, 2500));
    }

    // Check if error message is present on page ("验证码错误, 请重新输入")
    const hasError = await page.evaluate(() => {
      const errEl = document.querySelector('.error-tip, .err-tip, .login-error, .error, p.err, span.err');
      const bodyTxt = document.body ? document.body.innerText : '';
      if (errEl && errEl.offsetParent !== null && (errEl.innerText.includes('验证码') || errEl.innerText.includes('错误'))) {
        return true;
      }
      return bodyTxt.includes('验证码错误') || bodyTxt.includes('Mã xác thực không đúng');
    }).catch(() => false);

    if (hasError) {
      onLog(`[Image Captcha] Mã "${recognizedText}" chưa đúng (lỗi 验证码错误), tự động đổi mã mới và thử lại...`, 'warn');
      // Clear input field before retrying
      await targetContext.evaluate((sel) => {
        const inp = document.querySelector(sel);
        if (inp) inp.value = '';
      }, elements.inputSelector).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }

    onLog('[Image Captcha] Đã giải thành công Captcha chữ/số!', 'success');
    return true;
  }

  return false;
}

/**
 * Master unified captcha solver: Auto-detects and solves both Tencent Slider Captcha and Graphic/Text Image Captcha
 * @param {import('puppeteer-core').Page} page Puppeteer page instance
 * @param {object} options Options
 * @returns {Promise<boolean>} True if resolved or no captchas present
 */
async function solveAllCaptchas(page, options = {}) {
  const onLog = options.onLog || console.log;

  // 1. Try Slider Captcha first
  const sliderResult = await solveTencentCaptcha(page, options);
  if (!sliderResult) {
    onLog('[Captcha Master] Không thể giải Captcha kéo thả Tencent.', 'warn');
  }

  // 2. Try Image Captcha second
  const imageResult = await solveImageCaptcha(page, options);
  if (!imageResult) {
    onLog('[Captcha Master] Không thể giải Captcha hình ảnh chữ/số.', 'warn');
  }

  return sliderResult && imageResult;
}

module.exports = {
  solveTencentCaptcha,
  solveImageCaptcha,
  solveAllCaptchas,
  performHumanDrag
};

