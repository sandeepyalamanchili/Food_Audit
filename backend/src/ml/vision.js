// ── Self-learning vision engine ──────────────────────────────────────
// Runs entirely inside this backend process. No external AI service,
// no API key, nothing else to host. Uses MobileNet (a small, free,
// pretrained, open-weight model) purely as a feature extractor — it
// turns a photo into a numeric "fingerprint" describing shape, texture,
// and composition, which stays stable across lighting/shadow/flash
// differences far better than raw pixels do.
//
// The "learning" happens in dish_embeddings (see routes/dishes.js and
// routes/audits.js): every reference photo AND every saved audit photo
// adds one more fingerprint to that dish's profile, so identification
// and scoring keep improving as real audits accumulate over time.

// ── Self-learning vision engine ──────────────────────────────────────
// Runs entirely inside this backend process. No external AI service,
// no API key, nothing else to host. Uses MobileNet (a small, free,
// pretrained, open-weight model) purely as a feature extractor — it
// turns a photo into a numeric "fingerprint" describing shape, texture,
// and composition, which stays stable across lighting/shadow/flash
// differences far better than raw pixels do.
//
// Deliberately uses the pure-JavaScript build of TensorFlow.js (not
// @tensorflow/tfjs-node) plus Jimp for image decoding — neither needs
// any native/compiled code, so this installs identically on Windows,
// Mac, Linux, and Render without a C++ compiler or Visual Studio.
//
// The "learning" happens in dish_embeddings (see routes/dishes.js and
// routes/audits.js): every reference photo AND every saved audit photo
// adds one more fingerprint to that dish's profile, so identification
// and scoring keep improving as real audits accumulate over time.

const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-cpu');
const mobilenet = require('@tensorflow-models/mobilenet');
const Jimp = require('jimp');

let modelPromise = null;
function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.setBackend('cpu');
      await tf.ready();
      return mobilenet.load({ version: 2, alpha: 1.0 });
    })();
  }
  return modelPromise;
}

// Converts a base64 JPEG/PNG into a 1024-length embedding vector (plain array of numbers)
async function getEmbedding(base64) {
  const model = await getModel();
  const buffer = Buffer.from(base64, 'base64');
  const image = await Jimp.read(buffer);
  const { width, height, data } = image.bitmap; // RGBA bytes

  // Drop the alpha channel — MobileNet expects RGB
  const rgb = new Int32Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }

  const imageTensor = tf.tensor3d(rgb, [height, width, 3], 'int32');
  try {
    const embeddingTensor = model.infer(imageTensor, true); // true = return the penultimate-layer embedding
    const arr = Array.from(await embeddingTensor.data());
    embeddingTensor.dispose();
    return arr;
  } finally {
    imageTensor.dispose();
  }
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Parses lines like "Plating: 30" or "Portion Size - 25 points" out of a marking prompt.
// Falls back to a single 100-point "Overall Match" criterion if nothing parses.
function parseCriteria(prompt) {
  const lines = (prompt || '').split('\n');
  const found = [];
  // Matches "Portion size: 20 pts", "Portion size - 20", and "Portion size (20 pts)"
  const re = /^[\s\-\*\u2022\d.)]*([A-Za-z][A-Za-z0-9 /'&-]*?)\s*[(:\-–]\s*(\d{1,3})\s*(?:points?|pts?)?\)?\s*$/i;
  for (const line of lines) {
    const m = line.trim().match(re);
    if (m) {
      const name = m[1].trim();
      const max = parseInt(m[2], 10);
      if (name && max > 0 && max <= 100) found.push({ name, max_points: max });
    }
  }
  if (!found.length) return [{ name: 'Overall Match', max_points: 100 }];

  // Normalize so max points sum to 100
  const sum = found.reduce((s, c) => s + c.max_points, 0);
  if (sum !== 100 && sum > 0) {
    found.forEach(c => { c.max_points = Math.round((c.max_points / sum) * 100); });
  }
  return found;
}

module.exports = { getEmbedding, cosineSimilarity, parseCriteria };
