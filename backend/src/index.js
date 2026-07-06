require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRouter = require('./routes/auth');
const dishesRouter = require('./routes/dishes');
const restaurantsRouter = require('./routes/restaurants');
const auditsRouter = require('./routes/audits');
const aiRouter = require('./routes/ai');
const dashboardsRouter = require('./routes/dashboards');
const { requireAuth } = require('./middleware/auth');

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// Body parsing — increased limit for base64 images and uploaded dashboard files (HTML/PPT up to ~20MB)
app.use(express.json({ limit: '30mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Auth routes are public (you need them to get a token in the first place)
app.use('/api/auth', authLimiter, authRouter);

// Everything else requires a signed-in user
app.use('/api/dishes', requireAuth, dishesRouter);
app.use('/api/restaurants', requireAuth, restaurantsRouter);
app.use('/api/audits', requireAuth, auditsRouter);
app.use('/api/ai', requireAuth, aiLimiter, aiRouter);
app.use('/api/dashboards', requireAuth, dashboardsRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Food Audit API running on port ${PORT}`));
