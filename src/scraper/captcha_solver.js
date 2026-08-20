/**
 * Tencent Cloud WAF / Slider Captcha Auto-Solver for Mafengwo
 * High-Precision Left-Edge Gap Detection & Human-like Drag Trajectory
 */

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

module.exports = {
  solveTencentCaptcha,
  performHumanDrag
};
