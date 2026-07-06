const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { v4: uuidv4 } = require('uuid');

const ALLOWED_MIME = new Set([
  'text/html',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt
]);
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB, matches the JSON body limit in index.js

function mapDashboard(r, includeData = false) {
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
    userId: r.user_id,
    userName: r.user_name,
    createdAt: r.created_at,
    ...(includeData ? { fileData: r.file_data } : {}),
  };
}

// GET /api/dashboards — list (filters: restaurantId, branchId), never includes file_data (keeps the list light)
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
      `SELECT id, restaurant_id, branch_id, restaurant_name, branch_name, title, file_name, mime_type, file_size, user_id, user_name, created_at
       FROM dashboards ${where} ORDER BY created_at DESC`,
      params
    );
    res.json(rows.map(r => mapDashboard(r)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch dashboards' });
  }
});

// GET /api/dashboards/:id/raw — serves the actual file for viewing (HTML, inline) or downloading (PPT, attachment)
router.get('/:id/raw', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM dashboards WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Dashboard not found' });
    const d = rows[0];
    const buffer = Buffer.from(d.file_data, 'base64');
    const disposition = d.mime_type === 'text/html' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', d.mime_type);
    res.setHeader('Content-Disposition', `${disposition}; filename="${d.file_name}"`);
    res.send(buffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load file' });
  }
});

// POST /api/dashboards — upload a dashboard, attributed to the signed-in user
router.post('/', async (req, res) => {
  const { restaurantId, branchId, restaurantName, branchName, title, fileName, mimeType, fileData } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!fileName || !mimeType || !fileData) return res.status(400).json({ error: 'fileName, mimeType, and fileData are required' });
  if (!ALLOWED_MIME.has(mimeType)) return res.status(400).json({ error: 'Only .html, .ppt, and .pptx files are accepted' });

  const fileSize = Math.ceil((fileData.length * 3) / 4); // approximate decoded size from base64 length
  if (fileSize > MAX_FILE_BYTES) return res.status(400).json({ error: 'File is too large — please keep uploads under 20MB' });

  const id = uuidv4();
  try {
    const { rows } = await pool.query(
      `INSERT INTO dashboards (id, restaurant_id, branch_id, restaurant_name, branch_name, title, file_name, mime_type, file_data, file_size, user_id, user_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, restaurant_id, branch_id, restaurant_name, branch_name, title, file_name, mime_type, file_size, user_id, user_name, created_at`,
      [id, restaurantId || null, branchId || null, restaurantName || null, branchName || null, title.trim(), fileName, mimeType, fileData, fileSize, req.user.id, req.user.name]
    );
    res.status(201).json(mapDashboard(rows[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to upload dashboard' });
  }
});

// DELETE /api/dashboards/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM dashboards WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Dashboard not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete dashboard' });
  }
});

module.exports = router;
