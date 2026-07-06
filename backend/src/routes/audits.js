const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { v4: uuidv4 } = require('uuid');
const { saveEmbedding } = require('./dishes');

function mapAudit(r) {
  return {
    id: r.id,
    dishId: r.dish_id,
    dishName: r.dish_name,
    restaurantId: r.restaurant_id,
    branchId: r.branch_id,
    restaurantName: r.restaurant_name,
    branchName: r.branch_name,
    userId: r.user_id,
    userName: r.user_name,
    photo: r.photo,
    criteria: r.criteria,
    totalScore: Number(r.total_score),
    maxTotal: Number(r.max_total),
    overallComment: r.overall_comment,
    verdict: r.verdict,
    createdAt: r.created_at,
  };
}

function buildFilters(query) {
  const { dishId, verdict, restaurantId, branchId, from, to } = query;
  const conditions = [];
  const params = [];
  let i = 1;

  if (dishId) { conditions.push(`dish_id = $${i++}`); params.push(dishId); }
  if (verdict) { conditions.push(`verdict = $${i++}`); params.push(verdict); }
  if (restaurantId) { conditions.push(`restaurant_id = $${i++}`); params.push(restaurantId); }
  if (branchId) { conditions.push(`branch_id = $${i++}`); params.push(branchId); }
  if (from) { conditions.push(`created_at >= $${i++}`); params.push(from); }
  if (to) { conditions.push(`created_at <= $${i++}`); params.push(to); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return { where, params, next: i };
}

// GET /api/audits
router.get('/', async (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  const { where, params, next } = buildFilters(req.query);
  let i = next;
  params.push(Number(limit), Number(offset));

  try {
    const { rows } = await pool.query(
      `SELECT * FROM audits ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      params
    );
    const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM audits ${where}`, params.slice(0, -2));
    res.json({ audits: rows.map(mapAudit), total: Number(countRows[0].count) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch audits' });
  }
});

// GET /api/audits/analytics
router.get('/analytics', async (req, res) => {
  try {
    const { rows: totals } = await pool.query(`
      SELECT COUNT(*) AS count,
             COALESCE(AVG(total_score / NULLIF(max_total,0) * 100), 0) AS avg_pct,
             COUNT(*) FILTER (WHERE verdict = 'Pass') AS pass_count,
             COUNT(*) FILTER (WHERE verdict = 'Needs Review') AS review_count,
             COUNT(*) FILTER (WHERE verdict = 'Fail') AS fail_count
      FROM audits
    `);
    const { rows: byDish } = await pool.query(`
      SELECT dish_name, COUNT(*) AS count, AVG(total_score / NULLIF(max_total,0) * 100) AS avg_pct
      FROM audits GROUP BY dish_name ORDER BY avg_pct ASC LIMIT 10
    `);
    const t = totals[0];
    res.json({
      totalAudits: Number(t.count),
      avgScore: Math.round(Number(t.avg_pct)),
      passCount: Number(t.pass_count),
      reviewCount: Number(t.review_count),
      failCount: Number(t.fail_count),
      byDish: byDish.map(r => ({ name: r.dish_name, count: Number(r.count), avg: Math.round(Number(r.avg_pct)) })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/audits/export?format=csv|json
router.get('/export', async (req, res) => {
  const { format = 'csv' } = req.query;
  const { where, params } = buildFilters(req.query);

  try {
    const { rows } = await pool.query(
      `SELECT id, dish_name, restaurant_name, branch_name, user_name, criteria, total_score, max_total,
              overall_comment, verdict, created_at
       FROM audits ${where} ORDER BY created_at DESC LIMIT 10000`,
      params
    );

    const records = rows.map(r => ({
      id: r.id,
      date: new Date(r.created_at).toISOString(),
      restaurant: r.restaurant_name || '',
      branch: r.branch_name || '',
      auditedBy: r.user_name || '',
      dish: r.dish_name,
      score: Number(r.total_score),
      maxScore: Number(r.max_total),
      percentage: Math.round((Number(r.total_score) / Number(r.max_total)) * 100),
      verdict: r.verdict,
      overallComment: r.overall_comment || '',
      criteria: (r.criteria || []).map(c => `${c.name}: ${c.score}/${c.max_points}${c.comment ? ' — ' + c.comment : ''}`).join(' | '),
    }));

    if (format === 'json') return res.json({ records, total: records.length });

    const headers = ['Date', 'Restaurant', 'Branch', 'Audited By', 'Dish', 'Score', 'Max Score', 'Percentage', 'Verdict', 'Overall Comment', 'Criteria Breakdown'];
    const escape = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    records.forEach(r => {
      lines.push([
        r.date, r.restaurant, r.branch, r.auditedBy, r.dish, r.score, r.maxScore, `${r.percentage}%`, r.verdict, r.overallComment, r.criteria,
      ].map(escape).join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="food-audit-audits-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\n'));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to export audits' });
  }
});

// GET /api/audits/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM audits WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Audit not found' });
    res.json(mapAudit(rows[0]));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch audit' });
  }
});

// POST /api/audits — attributed to the signed-in user making the request
router.post('/', async (req, res) => {
  const {
    dishId, dishName, photo, criteria, totalScore, maxTotal, overallComment, verdict,
    restaurantId, branchId, restaurantName, branchName,
  } = req.body;
  if (!dishName || !photo || !verdict) return res.status(400).json({ error: 'dishName, photo, verdict are required' });

  const id = uuidv4();
  try {
    const { rows } = await pool.query(
      `INSERT INTO audits (id, dish_id, dish_name, restaurant_id, branch_id, restaurant_name, branch_name, user_id, user_name, photo, criteria, total_score, max_total, overall_comment, verdict)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [id, dishId || null, dishName, restaurantId || null, branchId || null, restaurantName || null, branchName || null,
       req.user.id, req.user.name, photo, JSON.stringify(criteria || []), totalScore, maxTotal, overallComment || null, verdict]
    );
    res.status(201).json(mapAudit(rows[0]));
    // Fire-and-forget: this saved audit becomes tomorrow's training data for this dish.
    if (dishId) saveEmbedding(dishId, photo, 'audit');
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save audit' });
  }
});

// DELETE /api/audits/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM audits WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Audit not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete audit' });
  }
});

module.exports = router;
