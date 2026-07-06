const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { v4: uuidv4 } = require('uuid');

// GET /api/restaurants — list restaurants, each with its branches nested
router.get('/', async (req, res) => {
  try {
    const { rows: restaurants } = await pool.query('SELECT id, name, created_at FROM restaurants ORDER BY name ASC');
    const { rows: branches } = await pool.query('SELECT id, restaurant_id, name, address, created_at FROM branches ORDER BY name ASC');
    const byRestaurant = {};
    branches.forEach(b => {
      (byRestaurant[b.restaurant_id] ||= []).push({
        id: b.id, restaurantId: b.restaurant_id, name: b.name, address: b.address, createdAt: b.created_at,
      });
    });
    res.json(restaurants.map(r => ({ id: r.id, name: r.name, createdAt: r.created_at, branches: byRestaurant[r.id] || [] })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch restaurants' });
  }
});

// POST /api/restaurants
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const id = uuidv4();
  try {
    const { rows } = await pool.query('INSERT INTO restaurants (id, name) VALUES ($1,$2) RETURNING *', [id, name.trim()]);
    const r = rows[0];
    res.status(201).json({ id: r.id, name: r.name, createdAt: r.created_at, branches: [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create restaurant' });
  }
});

// PUT /api/restaurants/:id
router.put('/:id', async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query('UPDATE restaurants SET name=$1 WHERE id=$2 RETURNING *', [name.trim(), req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Restaurant not found' });
    res.json({ id: rows[0].id, name: rows[0].name, createdAt: rows[0].created_at });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update restaurant' });
  }
});

// DELETE /api/restaurants/:id — deletes it and its branches (audits keep their name snapshot)
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM restaurants WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Restaurant not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete restaurant' });
  }
});

// POST /api/restaurants/:id/branches
router.post('/:id/branches', async (req, res) => {
  const { name, address } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const restaurant = await pool.query('SELECT id FROM restaurants WHERE id = $1', [req.params.id]);
    if (!restaurant.rows.length) return res.status(404).json({ error: 'Restaurant not found' });

    const id = uuidv4();
    const { rows } = await pool.query(
      'INSERT INTO branches (id, restaurant_id, name, address) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, req.params.id, name.trim(), address?.trim() || null]
    );
    const b = rows[0];
    res.status(201).json({ id: b.id, restaurantId: b.restaurant_id, name: b.name, address: b.address, createdAt: b.created_at });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

// PUT /api/restaurants/branches/:branchId
router.put('/branches/:branchId', async (req, res) => {
  const { name, address } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query(
      'UPDATE branches SET name=$1, address=$2 WHERE id=$3 RETURNING *',
      [name.trim(), address?.trim() || null, req.params.branchId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Branch not found' });
    const b = rows[0];
    res.json({ id: b.id, restaurantId: b.restaurant_id, name: b.name, address: b.address, createdAt: b.created_at });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update branch' });
  }
});

// DELETE /api/restaurants/branches/:branchId
router.delete('/branches/:branchId', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM branches WHERE id = $1', [req.params.branchId]);
    if (!rowCount) return res.status(404).json({ error: 'Branch not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete branch' });
  }
});

module.exports = router;
