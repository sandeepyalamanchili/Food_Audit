# Food Audit — AI Food Audit Platform

Full-stack food quality auditing with a built-in, self-learning vision engine — no AI API key, no external AI company, nothing separate to host. Dish identification and scoring run as plain code inside this backend and get more accurate every day as real audit photos are saved. The app is login-protected, supports capturing audit photos directly from the camera, and is built mobile- and tablet-first while remaining fully usable on laptop/desktop.

```
food-audit/
├── backend/    → Node/Express API + built-in vision engine + auth  → deploy to Render
└── frontend/   → Next.js UI                                         → deploy to Vercel
```

Database: **Neon** (free serverless PostgreSQL)
AI: **built into the backend** — nothing extra to sign up for or host separately
Auth: **built-in email/password login** — accounts and sessions live in your own database

## ✨ Key features

- **Login-protected** — nobody can open the app or see any data without an account. The first person to register becomes an admin; everyone after is a regular auditor. Every saved audit records who performed it.
- **In-app camera capture** — a "Take Photo" button opens the device camera right inside the page (real browser camera-permission prompt), alongside the option to upload existing photos.
- **Multi-location support** — manage multiple restaurants, each with multiple branches, under "Restaurants & Branches." Pick the current restaurant + branch from the sidebar picker before running an audit; every saved audit is tagged with that location and can be filtered by it later.
- **Self-learning audits, no external AI** — the built-in vision engine identifies which dish a photo shows by comparing it to everything it's learned so far, and scores it against the marking prompt's named criteria. Every saved audit adds one more learned example for that dish, so accuracy compounds daily — no third party ever sees your photos.
- **Manual override, so bad matches don't teach bad habits** — if the engine gets it wrong, pick the correct dish from a dropdown before saving; this is what it actually learns from next time.
- **History with filters** — filter by restaurant, branch, dish, or verdict; see who audited each entry.
- **Export to CSV or Excel (.xlsx)** — from the History view, export the currently filtered result set, including restaurant/branch, auditor, scores, verdicts, and the criteria breakdown.
- **Responsive across devices** — a slide-out sidebar with a hamburger toggle on phones/tablets, a fixed sidebar on laptop/desktop, and layouts that reflow at both breakpoints.

---

## 🔐 How login works

- Accounts are created with **name, email, password** — no third-party sign-in, no external identity provider.
- Passwords are hashed (bcrypt) before being stored; the plain password is never saved anywhere.
- Signing in issues a signed session token (JWT) that the browser stores and sends with every request. Sessions last 30 days.
- Every API route except `/api/auth/*` requires a valid session — there is no way to reach dish, audit, or restaurant data while signed out.
- The **first account ever created becomes an admin**; every account after that is a regular auditor. There's currently no separate admin UI — this just tags who registered first, for future use.

---

## 📷 How camera capture works

The "Take Photo" button uses the browser's `getUserMedia` API, which triggers your device's real camera-permission prompt the first time it's used. If permission is denied, the app shows a clear message explaining how to re-enable it in browser settings rather than failing silently. A "Flip Camera" button switches between front/back cameras on phones and tablets. This requires the site to be served over HTTPS (which Vercel provides automatically) — camera access will not work on a plain `http://` URL other than `localhost`.

---

## 🧠 How the self-learning vision engine works

No separate setup step is needed for this — it's built into `backend/`.

1. **Fingerprinting** — every photo (reference photos and every saved audit) is run through MobileNet, a small, free, pretrained, open-weight model bundled as an npm package. It converts a photo into a list of numbers describing shape, texture, and composition — not raw pixels — which is what makes it hold up across lighting, shadows, and flash differences. This uses the pure-JavaScript build of TensorFlow.js (not the native `tfjs-node` variant), specifically so `npm install` never needs a C++ compiler or Visual Studio — it installs the same way on Windows, Mac, Linux, and Render.
2. **Growing profile per dish** — each fingerprint is stored in the database, tagged to its dish. A dish with one reference photo has a thin, less reliable profile; a dish with fifty real audit photos behind it has a rich, much more reliable one.
3. **Identifying a new photo** — the engine fingerprints the new photo and compares it against every dish's profile, picking the closest match (and reporting a confidence % so you can see how sure it was).
4. **Scoring** — it reads the marking prompt for lines like `Plating (20 pts)` to build the scorecard, then distributes points based on how visually close the photo is to that dish's learned profile.
5. **Learning loop** — every audit saved to History feeds that photo's fingerprint back into the dish's profile. Tomorrow's audits are compared against a slightly richer, more real-world profile than today's.

**Honest limitation**: this reads *visual* similarity, not *written* meaning. A line like "garnish placed at 2 o'clock" can't be independently checked — the engine only knows "how close does this look to what I've learned so far," broken down across the named point values in the prompt. It will not catch a specific spatial rule the way a person or a language-capable AI could.

**One infrastructure note**: running the vision model needs more memory than a bare API. If Render's free plan (512MB) crashes or times out on audits, switch that one service to the $7/mo Starter plan — everything else stays free.

---

## 🚀 Deploy in ~15 minutes

### Step 1 — Neon Database (free Postgres)

1. Go to [neon.tech](https://neon.tech) → create a free account
2. Create a new project → name it `food-audit`
3. From the dashboard, copy the **Connection String** (looks like `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`)

---

### Step 2 — Backend on Render (free)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → **Web Service**
3. Connect your GitHub repo, select the **`backend`** folder as root directory
4. Configure:
   - **Name**: `food-audit-api`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm run db:migrate && npm start`
   - **Plan**: Free
5. Add **Environment Variables**:
   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Your Neon connection string |
   | `JWT_SECRET` | A long random string — generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `FRONTEND_URL` | `https://your-app.vercel.app` (set this after step 3) |
   | `NODE_ENV` | `production` |
6. Click **Create Web Service**
7. Copy the Render URL (e.g. `https://food-audit-api.onrender.com`)

> **Note**: Render free tier spins down after 15 min inactivity, and the vision engine needs more memory than a bare API. If audits time out or the service crashes, upgrade to Starter ($7/mo) — it also removes the spin-down delay.
> If you deploy using the included `render.yaml` as a Render "Blueprint," `JWT_SECRET` is generated for you automatically.

---

### Step 3 — Frontend on Vercel (free)

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo, set **Root Directory** to `frontend`
3. Add **Environment Variable**:
   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_API_URL` | `https://food-audit-api.onrender.com` |
4. Click **Deploy**
5. Copy your Vercel URL and go back to Render → update `FRONTEND_URL` with it

---

### Step 4 — Create your first account

Visit your Vercel URL and register. The database tables (including the users table) are created automatically on first deploy. The very first account you create becomes an admin.

---

## 🏃 Local Development

### Backend
```bash
cd backend
cp .env.example .env
# Fill in DATABASE_URL and JWT_SECRET (any long random string works for local dev)
npm install
npm run db:migrate
npm run dev
# API runs at http://localhost:4000
```

### Frontend
```bash
cd frontend
cp .env.local.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev
# App runs at http://localhost:3000
```

Camera capture needs HTTPS to request permission in most browsers, except on `localhost`, which is treated as secure — so it works fine for local development without extra setup.

---

## 📡 API Reference

### Auth (public — no token required)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create an account `{ name, email, password }` → returns `{ token, user }` |
| POST | `/api/auth/login` | Sign in `{ email, password }` → returns `{ token, user }` |
| GET | `/api/auth/me` | Validate the current token → returns `{ user }` |

### Everything below requires `Authorization: Bearer <token>`

### Dishes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dishes` | List all dishes |
| POST | `/api/dishes` | Create dish |
| PUT | `/api/dishes/:id` | Update dish |
| DELETE | `/api/dishes/:id` | Delete dish |

### Restaurants & Branches
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/restaurants` | List restaurants, each with nested branches |
| POST | `/api/restaurants` | Create restaurant `{ name }` |
| PUT | `/api/restaurants/:id` | Rename restaurant |
| DELETE | `/api/restaurants/:id` | Delete restaurant (and its branches) |
| POST | `/api/restaurants/:id/branches` | Add a branch `{ name, address? }` |
| PUT | `/api/restaurants/branches/:branchId` | Update a branch |
| DELETE | `/api/restaurants/branches/:branchId` | Delete a branch |

### Audits
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/audits` | List audits (filters: `dishId`, `verdict`, `restaurantId`, `branchId`, `from`, `to`) |
| GET | `/api/audits/analytics` | Aggregated analytics |
| GET | `/api/audits/export?format=csv\|json` | Export the filtered audit set as CSV or JSON (JSON is used by the frontend to build the .xlsx file) |
| POST | `/api/audits` | Save audit result — automatically attributed to the signed-in user |
| DELETE | `/api/audits/:id` | Delete audit |

### AI (built-in, self-learning)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/identify` | Identify a dish by comparing its photo against every dish's learned profile |
| POST | `/api/ai/audit` | Score a dish against its marking prompt's named criteria using visual similarity |

---

## 🔒 Security Notes

- Passwords are hashed with bcrypt; plaintext passwords are never stored or logged.
- Every route except `/api/auth/*` requires a valid session token — there is no anonymous access to any data.
- Photos and prompts never leave your own backend and database — there is no external AI call at all, so nothing is sent to Anthropic, OpenAI, Google, or any other outside AI company.
- CORS is restricted to your frontend URL in production.
- Rate limiting: 200 req/15min globally, 20 req/min on AI endpoints, 30 req/15min on auth endpoints (to slow down password-guessing attempts).
- Images are stored as base64 in Postgres. For high volume, swap to Cloudinary (free tier: 25GB).
- `JWT_SECRET` must be a long random value kept out of source control — rotating it instantly signs every existing user out.

---

## 💾 Alternative: Supabase instead of Neon

If you prefer Supabase (also free):
1. [supabase.com](https://supabase.com) → new project
2. Settings → Database → Connection String (use the **URI** tab)
3. Use that as `DATABASE_URL` — everything else is identical
