// ── Spreadsheet data extraction ──────────────────────────────────────
// Reads uploaded CSV/XLS/XLSX files into plain {name, headers, rows} tables
// using SheetJS, which understands all three formats natively — no custom
// parsing needed, unlike the old HTML/PPTX table scraper this replaced.

const XLSX = require('xlsx');

const MAX_TABLES = 20;      // one per sheet, for workbooks with many tabs
const MAX_ROWS_PER_TABLE = 2000;

function extractTablesFromSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const tables = [];

  for (const sheetName of workbook.SheetNames) {
    if (tables.length >= MAX_TABLES) break;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    if (!rows || rows.length < 2) continue;

    const headers = rows[0].map(h => String(h ?? '').trim());
    const dataRows = rows
      .slice(1, MAX_ROWS_PER_TABLE + 1)
      .map(r => headers.map((_, i) => String(r[i] ?? '').trim()))
      .filter(r => r.some(c => c !== ''));

    if (!dataRows.length) continue;
    tables.push({ name: sheetName, headers, rows: dataRows });
  }

  return tables;
}

module.exports = { extractTablesFromSpreadsheet };
