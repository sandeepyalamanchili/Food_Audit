const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { v4: uuidv4 } = require('uuid');
const { getEmbedding } = require('../ml/vision');

// Stores one learned fingerprint for a dish. Never throws — a failed embedding
// (e.g. bad image data) should not block saving the dish/audit itself.
async function saveEmbedding(dishId, base64, source) {
  try {
    const embedding = await getEmbedding(base64);
    await pool.query(
      'INSERT INTO dish_embeddings (id, dish_id, embedding, source) VALUES ($1,$2,$3,$4)',
      [uuidv4(), dishId, JSON.stringify(embedding), source]
    );
  } catch (e) {
    console.error('Failed to compute/store embedding:', e.message);
  }
}

function mapDish(r) {
  return { id: r.id, name: r.name, prompt: r.prompt, sop: r.sop, refImage: r.ref_image, createdAt: r.created_at, updatedAt: r.updated_at };
}

// GET /api/dishes
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM dishes ORDER BY name ASC');
    res.json(rows.map(mapDish));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch dishes' });
  }
});

// GET /api/dishes/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM dishes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Dish not found' });
    res.json(mapDish(rows[0]));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch dish' });
  }
});

// POST /api/dishes
router.post('/', async (req, res) => {
  const { name, prompt, sop, refImage } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

  const id = uuidv4();
  try {
    const { rows } = await pool.query(
      `INSERT INTO dishes (id, name, prompt, sop, ref_image) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, name.trim(), prompt.trim(), sop?.trim() || null, refImage || null]
    );
    res.status(201).json(mapDish(rows[0]));
    if (refImage) saveEmbedding(id, refImage, 'reference');
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create dish' });
  }
});

// PUT /api/dishes/:id
router.put('/:id', async (req, res) => {
  const { name, prompt, sop, refImage } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

  try {
    const { rows } = await pool.query(
      `UPDATE dishes SET name=$1, prompt=$2, sop=$3, ref_image=$4, updated_at=NOW() WHERE id=$5 RETURNING *`,
      [name.trim(), prompt.trim(), sop?.trim() || null, refImage || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Dish not found' });
    res.json(mapDish(rows[0]));
    if (refImage) saveEmbedding(rows[0].id, refImage, 'reference');
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update dish' });
  }
});

// DELETE /api/dishes/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM dishes WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Dish not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete dish' });
  }
});

module.exports = router;
module.exports.saveEmbedding = saveEmbedding;
