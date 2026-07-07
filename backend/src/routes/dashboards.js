const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { v4: uuidv4 } = require('uuid');
const { extractTablesFromSpreadsheet } = require('../extract/spreadsheet');

const ALLOWED_MIME = new Set([
  'text/csv',
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
]);
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB, matches the JSON body limit in index.js

function mapDataset(r) {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    branchId: r.branch_id,
    restaurantName: r.restaurant_name,
    branchName: r.branch_name,
    title: r.title,
    fileName: r.file_name,
    mimeType: r.mime_type,
    fileSize: r.file_size,
    tableCount: Array.isArray(r.extracted_tables) ? r.extracted_tables.length : 0,
    userId: r.user_id,
    userName: r.user_name,
    createdAt: r.created_at,
  };
}

// GET /api/dashboards — list uploaded data files (filters: restaurantId, branchId)
router.get('/', async (req, res) => {
  const { restaurantId, branchId } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;
  if (restaurantId) { conditions.push(`restaurant_id = $${i++}`); params.push(restaurantId); }
  if (branchId) { conditions.push(`branch_id = $${i++}`); params.push(branchId); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const { rows } = await pool.query(
      `SELECT id, restaurant_id, branch_id, restaurant_name, branch_name, title, file_name, mime_type, file_size,
              jsonb_array_length(extracted_tables) AS table_count, user_id, user_name, created_at
       FROM dashboards ${where} ORDER BY created_at DESC`,
      params
    );
    res.json(rows.map(r => ({
      id: r.id, restaurantId: r.restaurant_id, branchId: r.branch_id,
      restaurantName: r.restaurant_name, branchName: r.branch_name,
      title: r.title, fileName: r.file_name, mimeType: r.mime_type, fileSize: r.file_size,
      tableCount: Number(r.table_count) || 0,
      userId: r.user_id, userName: r.user_name, createdAt: r.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch uploaded data files' });
  }
});

// GET /api/dashboards/:id/raw — download the original file
router.get('/:id/raw', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM dashboards WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const d = rows[0];
    const buffer = Buffer.from(d.file_data, 'base64');
    res.setHeader('Content-Type', d.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${d.file_name}"`);
    res.send(buffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load file' });
  }
});

// GET /api/dashboards/:id/data — the tables extracted from this file, for charting on Analytics
router.get('/:id/data', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, title, extracted_tables FROM dashboards WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    res.json({ id: rows[0].id, title: rows[0].title, tables: rows[0].extracted_tables || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch file data' });
  }
});

// POST /api/dashboards — upload a CSV/XLS/XLSX file, attributed to the signed-in user.
// Every sheet is parsed into a table right away so it shows up on Analytics immediately.
router.post('/', async (req, res) => {
  const { restaurantId, branchId, restaurantName, branchName, title, fileName, mimeType, fileData } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!fileName || !mimeType || !fileData) return res.status(400).json({ error: 'fileName, mimeType, and fileData are required' });
  if (!ALLOWED_MIME.has(mimeType)) return res.status(400).json({ error: 'Only .csv, .xls, and .xlsx files are accepted' });

  const fileSize = Math.ceil((fileData.length * 3) / 4); // approximate decoded size from base64 length
  if (fileSize > MAX_FILE_BYTES) return res.status(400).json({ error: 'File is too large — please keep uploads under 20MB' });

  let extractedTables = [];
  try {
    const buffer = Buffer.from(fileData, 'base64');
    extractedTables = extractTablesFromSpreadsheet(buffer);
  } catch (e) {
    console.error('Spreadsheet parsing failed (file still saved):', e.message);
  }

  const id = uuidv4();
  try {
    const { rows } = await pool.query(
      `INSERT INTO dashboards (id, restaurant_id, branch_id, restaurant_name, branch_name, title, file_name, mime_type, file_data, file_size, extracted_tables, user_id, user_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, restaurant_id, branch_id, restaurant_name, branch_name, title, file_name, mime_type, file_size, extracted_tables, user_id, user_name, created_at`,
      [id, restaurantId || null, branchId || null, restaurantName || null, branchName || null, title.trim(), fileName, mimeType, fileData, fileSize, JSON.stringify(extractedTables), req.user.id, req.user.name]
    );
    res.status(201).json(mapDataset(rows[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// DELETE /api/dashboards/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM dashboards WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'File not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
