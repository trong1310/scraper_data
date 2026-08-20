const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs-extra');
const { getDataDir } = require('../utils/error_logger');

const EXCEL_FILENAME = 'mafengwo_data.xlsx';
const URL_EXCEL_FILENAME = 'mafengwo_url.xlsx';
const COLLECTED_URLS_FILENAME = 'urls.xlsx';
const SHEET_TITLES = 'Danh Sach Tieu De';
const SHEET_DATA = 'Du Lieu';
const SHEET_URLS = 'URLs';

const MAX_CELL_LEN = 32000;
const MAX_CONTENT_COLS = 10;

const DATA_COLUMNS_BASE = [
  { header: 'STT', key: 'index', width: 6 },
  { header: 'Tiêu đề', key: 'title', width: 50 },
  { header: 'Tác giả', key: 'author', width: 18 },
  { header: 'Level', key: 'level', width: 8 },
  { header: 'Ngày đăng', key: 'date', width: 16 },
  { header: 'View', key: 'view', width: 12 },
  { header: 'Follow', key: 'follow', width: 12 },
  { header: 'Share', key: 'share', width: 12 },
  { header: 'Thời gian khởi hành', key: 'departure', width: 22 },
  { header: 'Thời gian chuyến đi', key: 'tripDays', width: 20 },
  { header: 'Người', key: 'companion', width: 16 },
  { header: 'Chi phí/Người', key: 'cost', width: 16 },
  { header: 'Mục lục', key: 'toc', width: 40 },
];

function buildDataColumns() {
  const cols = [...DATA_COLUMNS_BASE];
  for (let i = 1; i <= MAX_CONTENT_COLS; i++) {
    cols.push({ header: `Nội dung ${i}`, key: `content_${i}`, width: 80 });
  }
  cols.push({ header: 'URL', key: 'url', width: 45 });
  cols.push({ header: 'Ngày cào', key: 'scrapedAt', width: 20 });
  return cols;
}

function splitContent(text, maxLen = MAX_CELL_LEN) {
  if (!text) return {};
  const parts = {};
  for (let i = 0; i < MAX_CONTENT_COLS; i++) {
    const chunk = text.substring(i * maxLen, (i + 1) * maxLen);
    if (!chunk) break;
    parts[`content_${i + 1}`] = chunk;
  }
  return parts;
}

function getExcelPath(baseDir) {
  const dataDir = getDataDir(baseDir);
  return path.join(dataDir, EXCEL_FILENAME);
}

function getUrlExcelPath(baseDir) {
  const dataDir = getDataDir(baseDir);
  return path.join(dataDir, URL_EXCEL_FILENAME);
}

function getCollectedUrlsExcelPath(baseDir) {
  const dataDir = getDataDir(baseDir);
  return path.join(dataDir, COLLECTED_URLS_FILENAME);
}

async function loadOrCreateWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();

  if (await fs.pathExists(filePath)) {
    await workbook.xlsx.readFile(filePath);
  }

  let sheetTitles = workbook.getWorksheet(SHEET_TITLES);
  if (!sheetTitles) {
    sheetTitles = workbook.addWorksheet(SHEET_TITLES);
    sheetTitles.columns = [
      { header: 'STT', key: 'index', width: 8 },
      { header: 'Tiêu đề', key: 'title', width: 60 },
      { header: 'URL', key: 'url', width: 50 },
      { header: 'Ngày cào', key: 'scrapedAt', width: 20 }
    ];
    styleHeaderRow(sheetTitles);
  }

  let sheetData = workbook.getWorksheet(SHEET_DATA);
  if (!sheetData) {
    sheetData = workbook.addWorksheet(SHEET_DATA);
    sheetData.columns = buildDataColumns();
    styleHeaderRow(sheetData);
  }

  return { workbook, sheetTitles, sheetData };
}

function styleHeaderRow(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86AB' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 28;
  headerRow.commit();
}

/**
 * Get all existing titles from sheet 1 for duplicate checking
 */
async function getExistingTitles(filePath) {
  const titles = new Set();
  if (!(await fs.pathExists(filePath))) return titles;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(SHEET_TITLES);
  if (!sheet) return titles;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const title = row.getCell('title').value;
    if (title) titles.add(String(title).trim());
  });

  return titles;
}

/**
 * Append one article to the Excel file (both sheets).
 * Returns false if the title already exists (duplicate).
 */
async function appendArticle(filePath, cleaned, meta = {}) {
  const { workbook, sheetTitles, sheetData } = await loadOrCreateWorkbook(filePath);

  const existingTitles = new Set();
  sheetTitles.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const t = row.getCell('title').value;
    if (t) existingTitles.add(String(t).trim());
  });

  const titleStr = String(cleaned.title || '').trim();
  if (existingTitles.has(titleStr)) {
    return { isDuplicate: true };
  }

  const nextIndex = sheetTitles.rowCount; // rowCount includes header

  sheetTitles.addRow({
    index: nextIndex,
    title: titleStr,
    url: cleaned.url || meta.url || '',
    scrapedAt: new Date().toLocaleString('vi-VN')
  });

  const tocStr = Array.isArray(cleaned.toc) && cleaned.toc.length > 0
    ? cleaned.toc.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : '';

  const contentParts = splitContent(cleaned.bodyOnly || '');

  sheetData.addRow({
    index: nextIndex,
    title: titleStr,
    author: cleaned.author || 'N/A',
    level: cleaned.level || 'N/A',
    date: cleaned.date || 'N/A',
    view: cleaned.view || '0',
    follow: cleaned.follow || '0',
    share: cleaned.share || '0',
    departure: cleaned.departure || '',
    tripDays: cleaned.tripDays || '',
    companion: cleaned.companion || '',
    cost: cleaned.cost || '',
    toc: tocStr.length > MAX_CELL_LEN ? tocStr.substring(0, MAX_CELL_LEN) : tocStr,
    ...contentParts,
    url: cleaned.url || meta.url || '',
    scrapedAt: new Date().toLocaleString('vi-VN')
  });

  const lastDataRow = sheetData.getRow(sheetData.rowCount);
  lastDataRow.alignment = { vertical: 'top', wrapText: true };
  lastDataRow.commit();

  await workbook.xlsx.writeFile(filePath);

  return { isDuplicate: false, index: nextIndex };
}

function ensureUrlSheetColumns(sheetUrls) {
  // ExcelJS drops column keys after readFile — must re-bind every time or addRow({url}) writes empty cells
  sheetUrls.columns = [
    { header: 'STT', key: 'index', width: 8 },
    { header: 'URL', key: 'url', width: 90 },
    { header: 'Ngày cào', key: 'scrapedAt', width: 22 }
  ];
}

function readUrlCell(row) {
  const byKey = row.getCell('url').value;
  const byIndex = row.getCell(2).value;
  const raw = byKey != null && byKey !== '' ? byKey : byIndex;
  if (raw == null) return '';
  if (typeof raw === 'object' && raw.text) return String(raw.text).trim();
  if (typeof raw === 'object' && raw.hyperlink) return String(raw.hyperlink).trim();
  return String(raw).trim();
}

async function loadOrCreateUrlWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();

  if (await fs.pathExists(filePath)) {
    await workbook.xlsx.readFile(filePath);
  }

  let sheetUrls = workbook.getWorksheet(SHEET_URLS);
  if (!sheetUrls) {
    sheetUrls = workbook.addWorksheet(SHEET_URLS);
    ensureUrlSheetColumns(sheetUrls);
    styleHeaderRow(sheetUrls);
  } else {
    ensureUrlSheetColumns(sheetUrls);
  }

  return { workbook, sheetUrls };
}

async function getExistingUrls(filePath) {
  const urls = new Set();
  const { workbook, sheetUrls } = await loadOrCreateUrlWorkbook(filePath);

  sheetUrls.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const urlVal = readUrlCell(row);
    if (!urlVal) return;
    urls.add(urlVal);
  });

  // Ensure the file is created even if no rows yet
  if (!(await fs.pathExists(filePath))) {
    await workbook.xlsx.writeFile(filePath);
  }

  return urls;
}

async function appendUrlIfNotExists(filePath, url) {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return false;

  await fs.ensureDir(path.dirname(filePath));
  const { workbook, sheetUrls } = await loadOrCreateUrlWorkbook(filePath);
  let exists = false;

  sheetUrls.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || exists) return;
    const urlVal = readUrlCell(row);
    if (urlVal && urlVal === normalizedUrl) {
      exists = true;
    }
  });

  if (exists) return false;

  // rowCount includes header; next data index = current data rows + 1
  const nextIndex = Math.max(1, sheetUrls.rowCount);
  sheetUrls.addRow({
    index: nextIndex,
    url: normalizedUrl,
    scrapedAt: new Date().toLocaleString('vi-VN')
  });

  const lastRow = sheetUrls.getRow(sheetUrls.rowCount);
  lastRow.alignment = { vertical: 'top', wrapText: true };
  lastRow.commit();

  await workbook.xlsx.writeFile(filePath);
  return true;
}

/**
 * Append many URLs in one write (skip duplicates already in file).
 * @returns {{ added: number, skipped: number, total: number }}
 */
async function appendUrlsBatch(filePath, urls) {
  const list = Array.isArray(urls) ? urls : [];
  await fs.ensureDir(path.dirname(filePath));
  const { workbook, sheetUrls } = await loadOrCreateUrlWorkbook(filePath);

  const existing = new Set();
  sheetUrls.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const urlVal = readUrlCell(row);
    if (urlVal) existing.add(urlVal);
  });

  let added = 0;
  let skipped = 0;
  const scrapedAt = new Date().toLocaleString('vi-VN');

  for (const raw of list) {
    const normalizedUrl = String(raw || '').trim();
    if (!normalizedUrl) {
      skipped++;
      continue;
    }
    if (existing.has(normalizedUrl)) {
      skipped++;
      continue;
    }
    const nextIndex = Math.max(1, sheetUrls.rowCount);
    sheetUrls.addRow({
      index: nextIndex,
      url: normalizedUrl,
      scrapedAt
    });
    existing.add(normalizedUrl);
    added++;
  }

  if (added > 0 || !(await fs.pathExists(filePath))) {
    await workbook.xlsx.writeFile(filePath);
  }

  return { added, skipped, total: existing.size };
}

module.exports = {
  getExcelPath,
  getUrlExcelPath,
  getCollectedUrlsExcelPath,
  getExistingTitles,
  getExistingUrls,
  appendArticle,
  appendUrlIfNotExists,
  appendUrlsBatch,
  EXCEL_FILENAME,
  URL_EXCEL_FILENAME,
  COLLECTED_URLS_FILENAME
};
