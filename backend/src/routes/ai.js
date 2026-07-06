const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { getEmbedding, cosineSimilarity, parseCriteria } = require('../ml/vision');

const MATCH_THRESHOLD = 0.45; // below this, nothing counts as a confident match

async function loadDishProfiles(dishIds) {
  if (!dishIds.length) return {};
  const { rows } = await pool.query('SELECT dish_id, embedding FROM dish_embeddings WHERE dish_id = ANY($1)', [dishIds]);
  const byDish = {};
  rows.forEach(r => { (byDish[r.dish_id] ||= []).push(r.embedding); });
  return byDish;
}

function bestSimilarity(embedding, profileEmbeddings) {
  let best = 0;
  for (const e of profileEmbeddings) {
    const sim = cosineSimilarity(embedding, e);
    if (sim > best) best = sim;
  }
  return best;
}

// POST /api/ai/identify
router.post('/identify', async (req, res) => {
  const { photoBase64, dishes } = req.body;
  if (!photoBase64 || !dishes?.length) return res.status(400).json({ error: 'photoBase64 and dishes are required' });

  try {
    const embedding = await getEmbedding(photoBase64);
    const profiles = await loadDishProfiles(dishes.map(d => d.id));

    let bestDish = null;
    let bestScore = 0;
    const candidates = [];

    for (const dish of dishes) {
      const profile = profiles[dish.id] || [];
      if (!profile.length) { candidates.push({ name: dish.name, similarity: 0, samples: 0 }); continue; }
      const sim = bestSimilarity(embedding, profile);
      candidates.push({ name: dish.name, similarity: Math.round(sim * 100) / 100, samples: profile.length });
      if (sim > bestScore) { bestScore = sim; bestDish = dish; }
    }

    if (!bestDish || bestScore < MATCH_THRESHOLD) {
      return res.json({ match: null, confidence: Math.round(bestScore * 100), candidates });
    }
    res.json({ match: bestDish.name, confidence: Math.round(bestScore * 100), candidates });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Identification failed', detail: e.message });
  }
});

// POST /api/ai/audit
router.post('/audit', async (req, res) => {
  const { dish, photoBase64 } = req.body;
  if (!dish || !photoBase64) return res.status(400).json({ error: 'dish and photoBase64 are required' });

  try {
    const embedding = await getEmbedding(photoBase64);
    const profiles = await loadDishProfiles([dish.id]);
    const profile = profiles[dish.id] || [];

    if (!profile.length) {
      return res.status(400).json({ error: 'This dish has no reference photo yet — add one in the Dish Library before auditing.' });
    }

    const similarity = bestSimilarity(embedding, profile);
    const percentage = Math.max(0, Math.min(100, Math.round(similarity * 100)));

    const criteria = parseCriteria(dish.prompt).map(c => ({
      name: c.name,
      max_points: c.max_points,
      score: Math.round((percentage / 100) * c.max_points),
      comment: `${percentage}% visual match to the learned profile for this dish (based on ${profile.length} photo${profile.length === 1 ? '' : 's'} learned so far).`,
    }));

    const total_score = criteria.reduce((s, c) => s + c.score, 0);
    const max_total = criteria.reduce((s, c) => s + c.max_points, 0);
    const pct = max_total ? total_score / max_total : 0;
    const verdict = pct >= 0.85 ? 'Pass' : pct >= 0.65 ? 'Needs Review' : 'Fail';

    res.json({
      criteria,
      total_score,
      max_total,
      overall_comment: `Compared against ${profile.length} learned photo${profile.length === 1 ? '' : 's'} for "${dish.name}", this photo scored a ${percentage}% visual match. This profile grows and gets more accurate every time an audit for this dish is saved.`,
      verdict,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Audit scoring failed', detail: e.message });
  }
});

module.exports = router;
