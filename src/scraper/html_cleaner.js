const cheerio = require('cheerio');

/**
 * Sanitize filename to be safe on Windows filesystem
 */
function sanitizeFilename(filename, maxLength = 100) {
  if (!filename) return 'bai_viet_khong_tieu_de';
  
  // Remove illegal characters: \ / : * ? " < > |
  let sanitized = filename
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).trim();
  }

  return sanitized || 'bai_viet_mafengwo';
}

/**
 * Clean Mafengwo Article HTML and convert to formatted text matching requested template:
 * 
 * Tiêu đề : ...
 * Tác giả : ...
 * Ngày đăng : ...
 * View : ...
 * Follow : ...
 * Share : ...
 * Thời gian khởi hành : ...
 * Thời gian chuyến đi: ...
 * Người : ...
 * Chi phí/ Người: ...
 * Nội Dung:
 * <Pure text content>
 * 
 * @param {string} html Raw HTML content
 * @param {object} meta Additional metadata if known
 * @returns {object} { title, author, date, url, cleanText, rawWordCount, filename }
 */
function cleanArticleHtml(html, meta = {}) {
  if (!html || typeof html !== 'string') {
    return {
      title: meta.title || 'Không có tiêu đề',
      author: meta.author || 'N/A',
      date: meta.date || 'N/A',
      url: meta.url || '',
      cleanText: '',
      wordCount: 0,
      filename: sanitizeFilename(meta.title) + '.txt'
    };
  }

  const $ = cheerio.load(html);

  // 0. Extract Table of Contents (TOC / 游记目录) BEFORE removing sidebars/catalog elements
  let tocList = Array.isArray(meta.toc) ? [...meta.toc] : [];

  if (tocList.length === 0) {
    const seenToc = new Set();
    const addTocItem = (rawText) => {
      if (!rawText) return;
      let cleanItem = rawText
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[•\-\*]\s*/, '')
        .trim();

      if (!cleanItem || cleanItem.length < 2) return;
      if (cleanItem === '游记目录' || cleanItem === '文章目录' || cleanItem === '目录' || cleanItem === 'CONTENTS') return;
      if (cleanItem.startsWith('http') || cleanItem.includes('function(') || cleanItem.includes('var ')) return;

      // Add a clean space between leading number prefix like "05/" and text
      cleanItem = cleanItem.replace(/^(\d+\s*[/／])\s*/, '$1 ');

      if (!seenToc.has(cleanItem)) {
        seenToc.add(cleanItem);
        tocList.push(cleanItem);
      }
    };

    // 1. Check specific Mafengwo catalog containers
    const catalogSelectors = [
      '._j_catalog_list li',
      '.catalog_list li',
      '._j_catalog_con li',
      '.catalog_con li',
      '.m_catalog li',
      '._j_catalog li',
      '.catalog-list li',
      '.side-catalog li',
      '.side_catalog li',
      '.dir_list li',
      '.notes_catalog li',
      '.catalog_box li',
      '._j_anchor_list li',
      '._j_mulu li',
      '.mulu_list li',
      '.catalog_wrap li',
      '._j_catalog_item',
      '.catalog-item',
      '.m-catalog-item'
    ];

    for (const sel of catalogSelectors) {
      $(sel).each((i, el) => {
        addTocItem($(el).text());
      });
      if (tocList.length > 0) break;
    }

    // 2. Check elements containing 游记目录 or 目录 as section title
    if (tocList.length === 0) {
      $('*').each((i, el) => {
        const selfText = $(el).clone().children().remove().end().text().trim();
        if (selfText === '游记目录' || selfText === '文章目录' || (selfText.includes('目录') && selfText.length <= 6)) {
          const parent = $(el).parent();
          parent.find('li, a, .item, p, span.txt').each((j, itemEl) => {
            const t = $(itemEl).text().trim();
            if (t && t !== selfText) {
              addTocItem(t);
            }
          });
        }
      });
    }

    // 3. Fallback: Chapter / Seqbox headings inside article content
    if (tocList.length === 0) {
      $('._j_seqbox_title, .p_section .title, .p_title, h2.title_sub, .f-title, ._j_chapter_title').each((i, el) => {
        const heading = $(el).text().trim();
        addTocItem(heading);
      });
    }
  }

  // 1. Remove all image elements, photo containers, and captions completely
  $(
    'img, picture, figure, figcaption, svg, canvas, ' +
    '.img_desc, .pic_desc, .photo_desc, ._j_img_desc, span.desc, ' +
    '.img_box, .pic_box, .pic_wrap, .img_wrap, ._j_photo, ._j_figure, ._j_img_box, ' +
    '._j_picshow, ._j_photoview, .add_pic, .photo_con, .mfw-photos'
  ).remove();

  // 2. Remove noise, scripts, ads, headers, sidebars, comments, and widgets
  $(
    'script, style, noscript, iframe, header, footer, nav, ' +
    '.mfw-header, .mfw-toolbar, .mfw-footer, .comments, .comment_box, ' +
    '.comment_list, ._j_comment_box, ._j_reply_box, .mfw-cmt, .cmt-item, ' +
    '._j_comment_list, ._j_reply_list, .reply_box, ._j_reply, .notes_comment, .post_comment, ' +
    '#_j_comment_list, .m-comment, ._j_add_comment, .comment-box, ._j_cmt_list, .review-box, ' +
    '.review_box, ._j_review, ._j_comment_page, .cmt_list, .comment-item, ._j_reply_content, ' +
    '.mfw-reviews, ._j_reviews, .reviews_box, .cmt_box, ._j_comm_wrap, .m-comment-wrap, ' +
    '._j_reply_form, ._j_reply_list_box, ._j_notes_cmt, ._j_commlist, #comment, ' +
    '.share_box, .side_bar, .side-bar, .side_nav, .banner, .ad_box, ' +
    '.recommend_box, .related_box, .pop_box, .login_box, .tcaptcha-transform, ' +
    '.passport_box, #header, #footer, ._j_related_mdd, ' +
    '.like_box, .reward_box, ._j_mfw_vote, ._j_support'
  ).remove();

  // 3. Extract Metadata Fields
  // Tiêu đề
  let title = meta.title;
  if (!title) {
    title = $(
      'h1.headtext, .vi_con h1, .post_title, .title_bg h1, .article_title, ._j_title, h1'
    ).first().text().trim();
  }
  if (!title) {
    title = $('title').text().replace(/- 蚂蜂窝.*|- 马蜂窝.*/i, '').trim();
  }
  title = title || 'Bài viết Mafengwo không tiêu đề';

  // Tác giả & Level
  let author = meta.author || '';
  let level = meta.level || '';

  // 1. Check DOM for Level
  const levelEl = $('.per_grade, .level, ._j_lv, .user_level, .grade, a[href*="/rank/lv"], a[title*="LV"]').first();
  if (levelEl.length > 0) {
    const lvText = (levelEl.attr('title') || levelEl.text() || '').trim();
    const lvMatch = lvText.match(/\d+/);
    if (lvMatch) {
      level = lvMatch[0];
    }
  }

  // 2. Check DOM for Author Name
  const authorNameEl = $('.per_name, .author_name, a[href*="/u/"].name, ._j_username').first();
  if (authorNameEl.length > 0) {
    author = authorNameEl.text().trim();
  }

  // 3. Fallback author container
  if (!author) {
    const authorEl = $('.per_info, .vc_author, .user_info, .author_info, .author').first();
    if (authorEl.length > 0) {
      author = authorEl.text().replace(/\s+/g, ' ').trim();
    }
  }

  // 4. Parse Level & clean Author string if Level was embedded
  if (author) {
    const lvMatch = author.match(/LV\.?\s*(\d+)/i);
    if (lvMatch && !level) {
      level = lvMatch[1];
    }
    author = author
      .replace(/LV\.?\s*\d+/gi, '')
      .replace(/关注(?:TA)?/g, '')
      .replace(/已关注/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  author = author || 'N/A';
  level = level || 'N/A';

  // Ngày đăng
  let date = meta.date;
  if (!date) {
    date = $(
      '.vc_time, .time, .pub_time, .post_time, .date, ._j_publish_time, span.time'
    ).first().text().replace(/\s+/g, ' ').trim();
  }
  date = date || 'N/A';

  // View
  let view = $(
    '.vc_browse, .view_num, .browse_num, .view, .ico_view, span.browse, .browse_count'
  ).first().text().replace(/\s+/g, ' ').trim();
  if (!view) {
    const eyeEl = $('i.ico_view, .vc_browse');
    if (eyeEl.length > 0) view = eyeEl.parent().text().replace(/\s+/g, ' ').trim();
  }
  if (!view) view = '0';

  // Follow / 收藏
  let follow = $(
    '.bs_collect, .favorite, .fav_num, .collect, li.favorite, li.bs_collect, ._j_fav'
  ).first().text().replace(/\s+/g, ' ').trim();
  if (!follow) follow = '0收藏';

  // Share / 分享
  let share = $(
    '.bs_share, .share_num, .share, li.share, li.bs_share, ._j_share_box'
  ).first().text().replace(/\s+/g, ' ').trim();
  if (!share) share = '0分享';

  // Travel Details (Departure, Days, Companion, Cost)
  let departure = '';
  let tripDays = '';
  let companion = '';
  let cost = '';

  // Check structured travel info box
  $('*').each((i, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if ($(el).children().length === 0 || $(el).find('li, div, p').length === 0) {
      if (t.includes('出发时间') && !departure) {
        departure = t.replace(/\s*\/\s*/g, '/');
      } else if (t.includes('出行天数') && !tripDays) {
        tripDays = t.replace(/\s*\/\s*/g, '/');
      } else if (t.includes('人物') && !companion) {
        companion = t.replace(/\s*\/\s*/g, '/');
      } else if ((t.includes('人均费用') || t.includes('费用')) && !cost) {
        cost = t.replace(/^.*?费用\s*[\/:]?\s*/, '').trim() || t;
      }
    }
  });

  // 4. Identify main content container and remove header components before extraction
  const $contentArea = $(
    '._j_detail_html, .va_con, .article_content, ._j_content, .post_content, .a_con_text, #_j_content, .view_con, .vc_article, .note_content, ._j_note_content, .gonglve_content, .main_content'
  ).first();

  let $content = $contentArea.length > 0 ? $contentArea : $('body');

  // Remove top header/meta blocks from inside $content to prevent duplicate text in body
  $content.find(
    'h1.headtext, .vi_con, .per_info, .vc_author, .user_info, .vc_time, .vc_browse, .bs_collect, .bs_share, .tarvi_con, .tarvi, .vt_item, .ginfo, .travel_info, ul.tarvi, .mdd_info'
  ).remove();

  // 5. Convert headings to readable section format
  $content.find('h1, h2, h3, h4, h5, h6, ._j_seqbox_title, .f-title, .title_sub').each((i, el) => {
    const headingText = $(el).text().trim();
    if (headingText) {
      $(el).replaceWith(`\n\n### ${headingText}\n\n`);
    }
  });

  // 6. Convert paragraphs and divs to proper breaks
  $content.find('p, div.p_section, ._j_seqbox, .article_title, blockquote, .p-section, ._j_note_paragraph').each((i, el) => {
    $(el).prepend('\n').append('\n');
  });

  // 7. Convert lists
  $content.find('li').each((i, el) => {
    $(el).prepend('\n• ').append('\n');
  });

  // 8. Convert line breaks
  $content.find('br').replaceWith('\n');

  // 9. Extract cleaned plain text
  let bodyText = $content.text();

  // 10. Clean extra whitespace and standardize line breaks
  bodyText = bodyText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0\u3000\u200b]+/g, ' ') // Clean unicode/ideographic spaces
    .replace(/[ \t]+\n/g, '\n') // Remove trailing spaces on lines
    .replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines to maximum 2
    .trim();

  // Cut off any trailing comment sections if present
  const commentCutoff = bodyText.search(/\n\s*(?:评论\s*\(|留言\s*\(|###\s*评论|共\s*\d+\s*条评论|写评论|发表评论)/i);
  if (commentCutoff !== -1) {
    bodyText = bodyText.substring(0, commentCutoff).trim();
  }

  // If body is empty or too short, fallback
  if (bodyText.length < 30) {
    const fallbackText = $('body').text().replace(/\s+/g, ' ').trim();
    if (fallbackText.length > bodyText.length) {
      bodyText = fallbackText;
    }
  }

  // 11. Format Table of Contents (Mục lục)
  let tocBlock = null;
  if (tocList && tocList.length > 0) {
    const formattedItems = tocList.map((item, idx) => `${idx + 1}. ${item}`);
    tocBlock = `Mục lục :\n${formattedItems.join('\n')}`;
  }

  // 12. Format final text strictly matching requested template
  const headerLines = [
    `Tiêu đề : ${title}`,
    `Đường dẫn : ${meta.url || ''}`,
    `Tác giả : ${author}`,
    `Level : ${level}`,
    `Ngày đăng : ${date}`,
    `View : ${view}`,
    `Follow : ${follow}`,
    `Share : ${share}`,
    departure ? `Thời gian khởi hành : ${departure}` : null,
    tripDays ? `Thời gian chuyến đi: ${tripDays}` : null,
    companion ? `Người : ${companion}` : null,
    cost ? `Chi phí/ Người: ${cost}` : null,
    tocBlock,
    'Nội Dung:',
    bodyText
  ].filter(x => x !== null);

  const fullCleanText = headerLines.join('\n');
  const wordCount = bodyText.replace(/\s+/g, '').length;

  const safeTitle = sanitizeFilename(title);
  const indexPrefix = meta.index ? `[${String(meta.index).padStart(3, '0')}] ` : '';
  const filename = `${indexPrefix}${safeTitle}.txt`;

  return {
    title,
    author,
    level,
    date,
    view,
    follow,
    share,
    departure,
    tripDays,
    companion,
    cost,
    toc: tocList,
    url: meta.url || '',
    cleanText: fullCleanText,
    bodyOnly: bodyText,
    wordCount,
    filename
  };
}

module.exports = {
  cleanArticleHtml,
  sanitizeFilename
};
