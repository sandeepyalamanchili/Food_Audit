'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getDishes, createDish, updateDish, deleteDish,
  getAudits, createAudit, deleteAudit as deleteAuditApi,
  identifyDish as apiIdentify, auditDish as apiAudit,
  getAnalytics,
  createRestaurant, updateRestaurant, deleteRestaurant,
  createBranch, updateBranch, deleteBranch,
  downloadAuditsCsv,
  type Dish, type Audit, type Analytics, type Restaurant, type Branch,
} from '../lib/api';
import { downloadAuditsExcel } from '../lib/export';
import { fileToResizedBase64 } from '../lib/image';
import { LocationProvider, useLocation } from '../lib/location-context';
import { AuthProvider, useAuth } from '../lib/auth-context';
import CameraCapture from '../components/CameraCapture';

type View = 'library' | 'audit' | 'history' | 'analytics' | 'locations';
type Verdict = 'Pass' | 'Needs Review' | 'Fail';

function verdictClass(v: string) {
  if (v === 'Pass') return 'pass';
  if (v === 'Fail') return 'fail';
  return 'warn';
}
function scoreClass(pct: number) {
  if (pct >= 85) return 'high';
  if (pct >= 65) return 'mid';
  return 'low';
}

// ─────────────────────────────────────────
// Toast hook
// ─────────────────────────────────────────
function useToast() {
  const [state, setState] = useState({ msg: '', type: '', show: false });
  const timer = useRef<NodeJS.Timeout>();

  const show = useCallback((msg: string, type = '') => {
    clearTimeout(timer.current);
    setState({ msg, type, show: true });
    timer.current = setTimeout(() => setState(s => ({ ...s, show: false })), 2800);
  }, []);

  return { state, show };
}

// ─────────────────────────────────────────
// Main App
// ─────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <LocationProvider>
        <Gate />
      </LocationProvider>
    </AuthProvider>
  );
}

// Shows the login screen until a valid session exists, then the real app.
function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-splash">
        <div className="logo-icon" style={{ width: 40, height: 40, fontSize: 15 }}>FA</div>
      </div>
    );
  }
  if (!user) return <LoginView />;
  return <AppShell />;
}

// ─────────────────────────────────────────
// Login / Register
// ─────────────────────────────────────────
function LoginView() {
  const { login, register, error } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
    } catch {
      // error is surfaced via useAuth().error
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="logo-mark" style={{ justifyContent: 'center', marginBottom: 4 }}>
          <div className="logo-icon">FA</div>
          <div className="logo-name">Food Audit</div>
        </div>
        <div className="auth-sub">{mode === 'login' ? 'Sign in to your team account' : 'Create your team account'}</div>

        {mode === 'register' && (
          <>
            <label>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
          </>
        )}
        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@restaurant.com" required />
        <label>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'} required minLength={mode === 'register' ? 8 : undefined} />

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={submitting}>
          {submitting ? <span className="spinner" /> : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>New here? <button type="button" onClick={() => setMode('register')}>Create an account</button></>
          ) : (
            <>Already have an account? <button type="button" onClick={() => setMode('login')}>Sign in</button></>
          )}
        </div>
      </form>
    </div>
  );
}

function AppShell() {
  const [view, setView] = useState<View>('library');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toast = useToast();
  const { user, logout } = useAuth();

  function go(v: View) {
    setView(v);
    setSidebarOpen(false);
  }

  return (
    <div className="app">
      {/* Mobile top bar with hamburger */}
      <div className="mobile-bar">
        <button className="hamburger" aria-label="Open menu" onClick={() => setSidebarOpen(o => !o)}>
          <span /><span /><span />
        </button>
        <div className="mobile-bar-logo">
          <div className="logo-icon">FA</div>
          <span>Food Audit</span>
        </div>
      </div>

      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-mark">
            <div className="logo-icon">FA</div>
            <div className="logo-name">Food Audit</div>
          </div>
          <div className="logo-sub">AI-Powered Auditing</div>
        </div>

        <LocationPicker />

        <nav className="nav">
          {([
            ['library', '⬡', 'Dish Library'],
            ['audit', '◎', 'Run Audit'],
            ['history', '◫', 'History'],
            ['analytics', '◈', 'Analytics'],
            ['locations', '⌂', 'Restaurants & Branches'],
          ] as [View, string, string][]).map(([id, icon, label]) => (
            <button
              key={id}
              className={`nav-item${view === id ? ' active' : ''}`}
              onClick={() => go(id)}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-name">{user?.name}</div>
            <div className="sidebar-user-email">{user?.email}</div>
          </div>
          <button className="sidebar-logout" onClick={logout}>Sign Out</button>
          <div style={{ marginTop: 10 }}>Self-learning vision engine</div>
        </div>
      </aside>

      {/* Main area */}
      <div className="main">
        {view === 'library' && <LibraryView toast={toast.show} />}
        {view === 'audit' && <AuditView toast={toast.show} />}
        {view === 'history' && <HistoryView toast={toast.show} />}
        {view === 'analytics' && <AnalyticsView />}
        {view === 'locations' && <LocationsView toast={toast.show} />}
      </div>

      {/* Toast */}
      <div className={`toast${toast.state.show ? ' show' : ''}${toast.state.type ? ' ' + toast.state.type : ''}`}>
        {toast.state.msg}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Location Picker (restaurant + branch, shown in sidebar)
// ─────────────────────────────────────────
function LocationPicker() {
  const {
    restaurants, loading,
    selectedRestaurantId, selectedBranchId,
    selectedRestaurant, setSelectedRestaurantId, setSelectedBranchId,
  } = useLocation();

  return (
    <div className="location-picker">
      <div className="location-picker-label">Auditing for</div>
      <select
        value={selectedRestaurantId}
        onChange={e => setSelectedRestaurantId(e.target.value)}
        disabled={loading || restaurants.length === 0}
      >
        <option value="">{loading ? 'Loading…' : restaurants.length === 0 ? 'No restaurants yet' : 'Select restaurant'}</option>
        {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select
        value={selectedBranchId}
        onChange={e => setSelectedBranchId(e.target.value)}
        disabled={!selectedRestaurant || (selectedRestaurant.branches.length === 0)}
        style={{ marginTop: 8 }}
      >
        <option value="">
          {!selectedRestaurant ? 'Select branch' : selectedRestaurant.branches.length === 0 ? 'No branches yet' : 'Select branch'}
        </option>
        {selectedRestaurant?.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {restaurants.length === 0 && !loading && (
        <div className="location-picker-hint">Add one under "Restaurants &amp; Branches" →</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Library View
// ─────────────────────────────────────────
function LibraryView({ toast }: { toast: (m: string, t?: string) => void }) {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Dish | null>(null);

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [sop, setSop] = useState('');
  const [refImage, setRefImage] = useState<string | null>(null);

  const refInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDishes(await getDishes()); }
    catch { toast('Failed to load dishes', 'err'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setEditing(null); setName(''); setPrompt(''); setSop(''); setRefImage(null);
  }

  function startEdit(d: Dish) {
    setEditing(d); setName(d.name); setPrompt(d.prompt);
    setSop(d.sop || ''); setRefImage(d.refImage || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave() {
    if (!name.trim()) return toast('Give the dish a name', 'err');
    if (!prompt.trim()) return toast('The marking prompt is required', 'err');
    setSaving(true);
    try {
      const body = { name: name.trim(), prompt: prompt.trim(), sop: sop.trim(), refImage: refImage || undefined };
      if (editing) { await updateDish(editing.id, body); toast('Dish updated', 'ok'); }
      else { await createDish(body); toast('Dish saved', 'ok'); }
      resetForm(); load();
    } catch (e: any) {
      toast(e.message || 'Failed to save dish', 'err');
    } finally { setSaving(false); }
  }

  async function handleDelete(d: Dish) {
    if (!confirm(`Delete "${d.name}"? Past audit history will remain.`)) return;
    try { await deleteDish(d.id); toast('Dish deleted'); load(); }
    catch { toast('Failed to delete dish', 'err'); }
  }

  async function handleRefImage(file: File) {
    try { setRefImage(await fileToResizedBase64(file, 700)); }
    catch { toast('Failed to process image', 'err'); }
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="page-title">Dish Library</div>
            <div className="page-sub">Define each dish once — prompt, reference image, and SOP.</div>
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>

      <div className="content">
        {/* Form */}
        <div className="card">
          <div className="card-title">{editing ? 'Edit Dish' : 'New Dish'}</div>

          <label>Dish name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Grilled Salmon with Dill Cream" />

          <label>Marking prompt <span style={{ color: 'var(--accent)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— highest priority</span></label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={5}
            placeholder={`Score out of 100 across:\n• Portion size (20 pts)\n• Plating & garnish (20 pts)\n• Protein doneness (25 pts)\n• Sauce coverage (15 pts)\n• Plate rim cleanliness (20 pts)\nDeduct 5 pts for visible cross-contamination.`}
          />
          <div className="input-hint">Name each criterion with its point value, e.g. "Plating (20 pts)" or "Plating: 20 pts" — the scoring engine reads these lines directly. Anything else in this box is ignored for scoring.</div>

          <label>Reference photo <span style={{ color: 'var(--fail)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— required, this is what the dish is learned from</span></label>
          <div
            className="dropzone"
            onClick={() => refInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleRefImage(f); }}
          >
            {refImage ? (
              <img src={`data:image/jpeg;base64,${refImage}`} style={{ maxHeight: 140, borderRadius: 6 }} alt="ref" />
            ) : (
              <>
                <div className="drop-icon">📸</div>
                <div className="drop-title">Drop the gold-standard photo here</div>
                <div className="drop-hint">or click to browse · JPG/PNG</div>
              </>
            )}
          </div>
          <input ref={refInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleRefImage(f); e.target.value = ''; }} />
          <div className="input-hint">This photo becomes the dish's starting profile. Every audit saved for this dish afterward automatically adds another learned photo, making identification and scoring more accurate over time.</div>

          <label>SOP text <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— reference only, not used for scoring</span></label>
          <textarea value={sop} onChange={e => setSop(e.target.value)} rows={3} placeholder="Paste the relevant procedure, hygiene, and storage notes for staff reference. The scoring engine doesn't read this — it's for human context only." />

          <div className="toolbar">
            {editing && <button className="btn btn-ghost" onClick={resetForm}>Cancel</button>}
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner" />&nbsp;Saving…</> : (editing ? 'Update Dish' : 'Save Dish')}
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="card-title" style={{ marginTop: 28, marginBottom: 14, fontSize: 11 }}>Saved Dishes · {dishes.length}</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <span className="spinner spinner-white" /> Loading…
          </div>
        ) : dishes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">⬡</div>
            <div className="empty-title">No dishes yet</div>
            <div className="empty-body">Add your first dish above to start running AI audits.</div>
          </div>
        ) : (
          <div className="dish-grid">
            {dishes.map(d => (
              <div key={d.id} className="dish-card">
                <div className="dish-thumb" style={d.refImage ? { backgroundImage: `url(data:image/jpeg;base64,${d.refImage})` } : {}}>
                  {!d.refImage && (
                    <div className="no-img" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'absolute', inset: 0, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      <span style={{ fontSize: 24, marginBottom: 6, display: 'block' }}>⬡</span>
                      No reference
                    </div>
                  )}
                </div>
                <div className="dish-body">
                  <div className="dish-name">{d.name}</div>
                  <div className="dish-meta">
                    {d.sop ? 'SOP · ' : ''}{new Date(d.createdAt).toLocaleDateString()}
                  </div>
                  <div className="dish-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => startEdit(d)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// Audit View
// ─────────────────────────────────────────
interface QueueItem {
  id: string;
  base64: string;
  status: 'queued' | 'identifying' | 'scoring' | 'done' | 'unknown' | 'error';
  dish?: Dish;
  result?: any;
  confidence?: number;
}

function AuditView({ toast }: { toast: (m: string, t?: string) => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ item: QueueItem; result: any }[]>([]);
  const [dishList, setDishList] = useState<Dish[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { selectedRestaurant, selectedBranch } = useLocation();
  const locationReady = !!selectedRestaurant && !!selectedBranch;

  useEffect(() => { getDishes().then(setDishList); }, []);

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue(q => q.map(i => i.id === id ? { ...i, ...patch } : i));
  }

  function addPhoto(base64: string) {
    setQueue(q => [...q, { id: Math.random().toString(36).slice(2), base64, status: 'queued' }]);
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    for (const file of arr) {
      const base64 = await fileToResizedBase64(file, 900);
      addPhoto(base64);
    }
  }

  async function scoreAgainst(item: QueueItem, dish: Dish) {
    updateItem(item.id, { status: 'scoring', dish });
    try {
      const result = await apiAudit(dish, item.base64);
      updateItem(item.id, { status: 'done', dish, result });
      setResults(r => [{ item: { ...item, dish, result }, result }, ...r]);
    } catch (e: any) {
      updateItem(item.id, { status: 'error' });
      toast(`Failed to score photo: ${e.message}`, 'err');
    }
  }

  async function runAudits() {
    if (!locationReady) { toast('Select a restaurant and branch before auditing', 'err'); return; }
    const dishes = await getDishes();
    if (!dishes.length) { toast('Add at least one dish to the library first', 'err'); return; }
    setRunning(true);

    for (const item of queue) {
      if (item.result) continue;
      updateItem(item.id, { status: 'identifying' });
      try {
        const { match, confidence } = await apiIdentify(item.base64, dishes);
        if (!match) { updateItem(item.id, { status: 'unknown', confidence }); continue; }
        const dish = dishes.find(d => d.name === match)!;
        updateItem(item.id, { confidence });
        await scoreAgainst({ ...item, confidence }, dish);
      } catch (e: any) {
        updateItem(item.id, { status: 'error' });
        toast(`Failed to audit one photo: ${e.message}`, 'err');
      }
    }
    setRunning(false);
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="page-title">Run Audit</div>
            <div className="page-sub">Upload dish photos — Food Audit identifies and grades each one automatically.</div>
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>

      <div className="content">
        {!locationReady && (
          <div className="location-warning">
            ⚠ Select a restaurant and branch in the sidebar before running an audit — every saved result is tagged to that location.
          </div>
        )}
        {locationReady && (
          <div className="location-chip">
            Auditing: <strong>{selectedRestaurant!.name}</strong> · {selectedBranch!.name}
          </div>
        )}

        <div className="capture-row">
          <div
            className="dropzone"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <div className="drop-icon">🖼️</div>
            <div className="drop-title">Drop photos or click to upload</div>
            <div className="drop-hint">Select multiple images for a full menu check</div>
          </div>
          <button className="dropzone camera-trigger" onClick={() => setCameraOpen(true)}>
            <div className="drop-icon">📷</div>
            <div className="drop-title">Take Photo</div>
            <div className="drop-hint">Opens your device camera</div>
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />

        {cameraOpen && (
          <CameraCapture
            onCapture={base64 => { addPhoto(base64); setCameraOpen(false); }}
            onClose={() => setCameraOpen(false)}
          />
        )}

        {queue.length > 0 && (
          <>
            <div className="photo-queue">
              {queue.map(item => (
                <div key={item.id} className="queue-item">
                  <img src={`data:image/jpeg;base64,${item.base64}`} alt="" />
                  <div className={`queue-status ${item.status}`}>
                    {item.status === 'identifying' ? '⟳ id…' :
                     item.status === 'scoring' ? '⟳ score…' :
                     item.status === 'done' ? '✓ done' :
                     item.status === 'unknown' ? `? unknown${item.confidence != null ? ` (${item.confidence}%)` : ''}` :
                     item.status === 'error' ? '✕ error' : 'queued'}
                  </div>
                  {item.status === 'unknown' && dishList.length > 0 && (
                    <select
                      className="queue-manual-pick"
                      defaultValue=""
                      onChange={e => {
                        const dish = dishList.find(d => d.id === e.target.value);
                        if (dish) scoreAgainst(item, dish);
                      }}
                    >
                      <option value="" disabled>Pick the dish manually…</option>
                      {dishList.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>

            <div className="toolbar">
              <button className="btn btn-outline btn-sm" onClick={() => { setQueue([]); setResults([]); }}>Clear all</button>
              <button className="btn btn-primary" onClick={runAudits} disabled={running || !locationReady}>
                {running ? <><span className="spinner" />&nbsp;Auditing…</> : `Audit ${queue.length} photo${queue.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}

        {/* Results */}
        <div style={{ marginTop: 28 }}>
          {results.map(({ item, result }, i) => (
            <ResultCard key={i} item={item} result={result} toast={toast} dishList={dishList} />
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// Result Card
// ─────────────────────────────────────────
function ResultCard({ item, result, toast, dishList }: { item: QueueItem; result: any; toast: (m: string, t?: string) => void; dishList: Dish[] }) {
  const [saved, setSaved] = useState(false);
  const [dish, setDish] = useState(item.dish);
  const [liveResult, setLiveResult] = useState(result);
  const [reassigning, setReassigning] = useState(false);
  const pct = Math.round((liveResult.total_score / liveResult.max_total) * 100);
  const vClass = verdictClass(liveResult.verdict);
  const { selectedRestaurant, selectedBranch } = useLocation();

  async function reassign(newDishId: string) {
    const newDish = dishList.find(d => d.id === newDishId);
    if (!newDish || newDish.id === dish?.id) return;
    setReassigning(true);
    try {
      const newResult = await apiAudit(newDish, item.base64);
      setDish(newDish);
      setLiveResult(newResult);
      setSaved(false);
      toast(`Re-scored against ${newDish.name}`, 'ok');
    } catch (e: any) {
      toast(e.message || 'Failed to re-score', 'err');
    } finally {
      setReassigning(false);
    }
  }

  async function save() {
    if (!selectedRestaurant || !selectedBranch) {
      toast('Select a restaurant and branch before saving', 'err');
      return;
    }
    try {
      await createAudit({
        dishId: dish?.id,
        dishName: dish!.name,
        restaurantId: selectedRestaurant.id,
        branchId: selectedBranch.id,
        restaurantName: selectedRestaurant.name,
        branchName: selectedBranch.name,
        photo: item.base64,
        criteria: liveResult.criteria,
        totalScore: liveResult.total_score,
        maxTotal: liveResult.max_total,
        overallComment: liveResult.overall_comment,
        verdict: liveResult.verdict as Verdict,
      });
      setSaved(true);
      toast('Audit saved to history', 'ok');
    } catch (e: any) {
      toast(e.message || 'Failed to save', 'err');
    }
  }

  return (
    <div className={`result-card ${vClass}`}>
      <div className={`stamp ${vClass}`}>
        <div className="stamp-pct">{pct}%</div>
        <div className="stamp-lbl">{liveResult.verdict}</div>
      </div>

      <div className="result-header">
        <img src={`data:image/jpeg;base64,${item.base64}`} alt={dish?.name} />
        <div className="result-info">
          <div className="result-dish">{dish?.name}</div>
          {item.confidence != null && (
            <div className="result-location">Identified with {item.confidence}% confidence</div>
          )}
          {selectedRestaurant && selectedBranch && (
            <div className="result-location">{selectedRestaurant.name} · {selectedBranch.name}</div>
          )}
          <div className="result-pts">{liveResult.total_score} / {liveResult.max_total} pts</div>
          <span className={`badge ${vClass}`} style={{ marginTop: 8, display: 'inline-flex' }}>{liveResult.verdict}</span>
        </div>
      </div>

      {dishList.length > 1 && (
        <div className="reassign-row">
          <span>Not the right dish?</span>
          <select value={dish?.id || ''} onChange={e => reassign(e.target.value)} disabled={reassigning}>
            {dishList.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {reassigning && <span className="spinner" />}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {liveResult.criteria.map((c: any, i: number) => {
          const cpct = Math.round((c.score / c.max_points) * 100);
          return (
            <div key={i} className="crit-row">
              <div className="crit-name-wrap">
                <div className="crit-name">{c.name}</div>
                {c.comment && <div className="crit-comment">{c.comment}</div>}
              </div>
              <div className={`crit-score ${scoreClass(cpct)}`}>{c.score}/{c.max_points}</div>
            </div>
          );
        })}
      </div>

      {liveResult.overall_comment && <div className="overall-note">{liveResult.overall_comment}</div>}

      <div className="toolbar">
        <button className="btn btn-outline btn-sm" onClick={save} disabled={saved || reassigning}>
          {saved ? '✓ Saved' : 'Save to History'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// History View
// ─────────────────────────────────────────
function HistoryView({ toast }: { toast: (m: string, t?: string) => void }) {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [filterDish, setFilterDish] = useState('');
  const [filterVerdict, setFilterVerdict] = useState('');
  const [filterRestaurant, setFilterRestaurant] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [selected, setSelected] = useState<Audit | null>(null);
  const [exporting, setExporting] = useState<'' | 'csv' | 'xlsx'>('');
  const { restaurants } = useLocation();

  const activeRestaurant = restaurants.find(r => r.id === filterRestaurant);

  const filterParams = useCallback((): Record<string, string> => {
    const params: Record<string, string> = {};
    if (filterDish) params.dishId = filterDish;
    if (filterVerdict) params.verdict = filterVerdict;
    if (filterRestaurant) params.restaurantId = filterRestaurant;
    if (filterBranch) params.branchId = filterBranch;
    return params;
  }, [filterDish, filterVerdict, filterRestaurant, filterBranch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, dishList] = await Promise.all([getAudits(filterParams()), getDishes()]);
      setAudits(res.audits);
      setTotal(res.total);
      setDishes(dishList);
    } catch { toast('Failed to load history', 'err'); }
    finally { setLoading(false); }
  }, [filterParams, toast]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this audit?')) return;
    try { await deleteAuditApi(id); toast('Audit deleted'); setSelected(null); load(); }
    catch { toast('Failed to delete', 'err'); }
  }

  async function handleExport(kind: 'csv' | 'xlsx') {
    setExporting(kind);
    try {
      if (kind === 'csv') await downloadAuditsCsv(filterParams());
      else await downloadAuditsExcel(filterParams());
      toast(`Exported as ${kind.toUpperCase()}`, 'ok');
    } catch (e: any) {
      toast(e.message || 'Export failed', 'err');
    } finally { setExporting(''); }
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="page-title">Audit History</div>
            <div className="page-sub">Every saved audit · {total} total</div>
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>

      <div className="content">
        <div className="history-filters">
          <select value={filterRestaurant} onChange={e => { setFilterRestaurant(e.target.value); setFilterBranch(''); }}>
            <option value="">All restaurants</option>
            {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} disabled={!activeRestaurant}>
            <option value="">All branches</option>
            {activeRestaurant?.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filterDish} onChange={e => setFilterDish(e.target.value)}>
            <option value="">All dishes</option>
            {dishes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={filterVerdict} onChange={e => setFilterVerdict(e.target.value)}>
            <option value="">All verdicts</option>
            <option value="Pass">Pass</option>
            <option value="Needs Review">Needs Review</option>
            <option value="Fail">Fail</option>
          </select>
          <div className="history-export">
            <button className="btn btn-outline btn-sm" onClick={() => handleExport('csv')} disabled={!!exporting || total === 0}>
              {exporting === 'csv' ? <><span className="spinner" />&nbsp;Exporting…</> : '⇩ Export CSV'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => handleExport('xlsx')} disabled={!!exporting || total === 0}>
              {exporting === 'xlsx' ? <><span className="spinner" />&nbsp;Exporting…</> : '⇩ Export Excel'}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <span className="spinner spinner-white" />
          </div>
        ) : audits.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◫</div>
            <div className="empty-title">No audits found</div>
            <div className="empty-body">Run and save audits to see them here.</div>
          </div>
        ) : (
          audits.map(a => {
            const pct = Math.round((a.totalScore / a.maxTotal) * 100);
            return (
              <div key={a.id} className="hist-row" onClick={() => setSelected(a)}>
                <img src={`data:image/jpeg;base64,${a.photo}`} alt={a.dishName} />
                <div>
                  <div className="hist-dish">{a.dishName}</div>
                  <div className="hist-date">
                    {new Date(a.createdAt).toLocaleString()}
                    {a.restaurantName && <> · {a.restaurantName}{a.branchName ? ` (${a.branchName})` : ''}</>}
                    {a.userName && <> · by {a.userName}</>}
                  </div>
                </div>
                <span className={`badge ${verdictClass(a.verdict)}`}>{a.verdict}</span>
                <div className="hist-pct" style={{ color: pct >= 85 ? 'var(--pass)' : pct >= 65 ? 'var(--warn)' : 'var(--fail)' }}>{pct}%</div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {selected && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="modal">
            <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            <AuditDetail audit={selected} onDelete={() => handleDelete(selected.id)} />
          </div>
        </div>
      )}
    </>
  );
}

function AuditDetail({ audit: a, onDelete }: { audit: Audit; onDelete: () => void }) {
  const pct = Math.round((a.totalScore / a.maxTotal) * 100);
  const vClass = verdictClass(a.verdict);
  return (
    <div>
      <div className="result-header" style={{ marginBottom: 18 }}>
        <img src={`data:image/jpeg;base64,${a.photo}`} alt={a.dishName} />
        <div className="result-info">
          <div className="result-dish">{a.dishName}</div>
          {a.restaurantName && <div className="result-location">{a.restaurantName}{a.branchName ? ` · ${a.branchName}` : ''}</div>}
          {a.userName && <div className="result-location">Audited by {a.userName}</div>}
          <div className="result-pts">{new Date(a.createdAt).toLocaleString()} · {a.totalScore}/{a.maxTotal} pts ({pct}%)</div>
          <span className={`badge ${vClass}`} style={{ marginTop: 8, display: 'inline-flex' }}>{a.verdict}</span>
        </div>
      </div>

      {a.criteria.map((c, i) => {
        const cpct = Math.round((c.score / c.max_points) * 100);
        return (
          <div key={i} className="crit-row">
            <div className="crit-name-wrap">
              <div className="crit-name">{c.name}</div>
              {c.comment && <div className="crit-comment">{c.comment}</div>}
            </div>
            <div className={`crit-score ${scoreClass(cpct)}`}>{c.score}/{c.max_points}</div>
          </div>
        );
      })}

      {a.overallComment && <div className="overall-note">{a.overallComment}</div>}

      <div className="toolbar">
        <button className="btn btn-danger btn-sm" onClick={onDelete}>Delete Audit</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Analytics View
// ─────────────────────────────────────────
function AnalyticsView() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalytics().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <span className="spinner spinner-white" style={{ width: 28, height: 28, borderWidth: 3 }} />
    </div>
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="page-title">Analytics</div>
            <div className="page-sub">Trends and weak points across all saved audits.</div>
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>

      <div className="content">
        {!data || data.totalAudits === 0 ? (
          <div className="empty">
            <div className="empty-icon">◈</div>
            <div className="empty-title">No data yet</div>
            <div className="empty-body">Save a few audits to see performance analytics.</div>
          </div>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-box">
                <div className="stat-val">{data.totalAudits}</div>
                <div className="stat-lbl">Total Audits</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{data.avgScore}%</div>
                <div className="stat-lbl">Average Score</div>
              </div>
              <div className="stat-box">
                <div className="stat-val" style={{ color: 'var(--pass)' }}>{data.passCount}</div>
                <div className="stat-lbl">Passed</div>
              </div>
              <div className="stat-box">
                <div className="stat-val" style={{ color: 'var(--warn)' }}>{data.reviewCount}</div>
                <div className="stat-lbl">Need Review</div>
              </div>
              <div className="stat-box">
                <div className="stat-val" style={{ color: 'var(--fail)' }}>{data.failCount}</div>
                <div className="stat-lbl">Failed</div>
              </div>
            </div>

            {data.byDish && data.byDish.length > 0 && (
              <div className="chart-card">
                <div className="chart-title">Lowest-scoring dishes (avg %)</div>
                <BarChart entries={data.byDish.map(d => ({ name: d.name, avg: d.avg }))} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// Locations View — manage restaurants & branches
// ─────────────────────────────────────────
function LocationsView({ toast }: { toast: (m: string, t?: string) => void }) {
  const { restaurants, loading, reload } = useLocation();
  const [newRestaurant, setNewRestaurant] = useState('');
  const [savingRestaurant, setSavingRestaurant] = useState(false);
  const [branchDrafts, setBranchDrafts] = useState<Record<string, string>>({});
  const [savingBranch, setSavingBranch] = useState<string>('');
  const [editingRestaurant, setEditingRestaurant] = useState<{ id: string; name: string } | null>(null);
  const [editingBranch, setEditingBranch] = useState<{ id: string; name: string } | null>(null);

  async function handleAddRestaurant() {
    if (!newRestaurant.trim()) return toast('Enter a restaurant name', 'err');
    setSavingRestaurant(true);
    try {
      await createRestaurant(newRestaurant.trim());
      setNewRestaurant('');
      toast('Restaurant added', 'ok');
      reload();
    } catch (e: any) { toast(e.message || 'Failed to add restaurant', 'err'); }
    finally { setSavingRestaurant(false); }
  }

  async function handleRenameRestaurant() {
    if (!editingRestaurant || !editingRestaurant.name.trim()) return;
    try {
      await updateRestaurant(editingRestaurant.id, editingRestaurant.name.trim());
      setEditingRestaurant(null);
      toast('Restaurant updated', 'ok');
      reload();
    } catch (e: any) { toast(e.message || 'Failed to update', 'err'); }
  }

  async function handleDeleteRestaurant(r: Restaurant) {
    if (!confirm(`Delete "${r.name}" and all its branches? Past audits keep their recorded name.`)) return;
    try { await deleteRestaurant(r.id); toast('Restaurant deleted'); reload(); }
    catch { toast('Failed to delete restaurant', 'err'); }
  }

  async function handleAddBranch(restaurantId: string) {
    const name = (branchDrafts[restaurantId] || '').trim();
    if (!name) return toast('Enter a branch name', 'err');
    setSavingBranch(restaurantId);
    try {
      await createBranch(restaurantId, name);
      setBranchDrafts(d => ({ ...d, [restaurantId]: '' }));
      toast('Branch added', 'ok');
      reload();
    } catch (e: any) { toast(e.message || 'Failed to add branch', 'err'); }
    finally { setSavingBranch(''); }
  }

  async function handleRenameBranch() {
    if (!editingBranch || !editingBranch.name.trim()) return;
    try {
      await updateBranch(editingBranch.id, editingBranch.name.trim());
      setEditingBranch(null);
      toast('Branch updated', 'ok');
      reload();
    } catch (e: any) { toast(e.message || 'Failed to update', 'err'); }
  }

  async function handleDeleteBranch(b: Branch) {
    if (!confirm(`Delete branch "${b.name}"? Past audits keep their recorded name.`)) return;
    try { await deleteBranch(b.id); toast('Branch deleted'); reload(); }
    catch { toast('Failed to delete branch', 'err'); }
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="page-title">Restaurants &amp; Branches</div>
            <div className="page-sub">Set up the locations you audit — pick one in the sidebar before running an audit.</div>
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>

      <div className="content">
        <div className="card">
          <div className="card-title">Add Restaurant</div>
          <div className="row">
            <input
              type="text" value={newRestaurant}
              onChange={e => setNewRestaurant(e.target.value)}
              placeholder="e.g. Golden Fork Kitchens"
              onKeyDown={e => e.key === 'Enter' && handleAddRestaurant()}
            />
            <button className="btn btn-primary" onClick={handleAddRestaurant} disabled={savingRestaurant} style={{ flex: '0 0 auto' }}>
              {savingRestaurant ? <span className="spinner" /> : 'Add'}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <span className="spinner spinner-white" /> Loading…
          </div>
        ) : restaurants.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">⌂</div>
            <div className="empty-title">No restaurants yet</div>
            <div className="empty-body">Add your first restaurant above, then add its branches.</div>
          </div>
        ) : (
          restaurants.map(r => (
            <div key={r.id} className="card">
              <div className="location-card-header">
                {editingRestaurant?.id === r.id ? (
                  <div className="row" style={{ flex: 1 }}>
                    <input
                      type="text" value={editingRestaurant.name}
                      onChange={e => setEditingRestaurant({ id: r.id, name: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && handleRenameRestaurant()}
                      autoFocus
                    />
                    <button className="btn btn-primary btn-sm" onClick={handleRenameRestaurant}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingRestaurant(null)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <div className="location-card-title">{r.name}</div>
                    <div className="location-card-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => setEditingRestaurant({ id: r.id, name: r.name })}>Rename</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRestaurant(r)}>Delete</button>
                    </div>
                  </>
                )}
              </div>

              <div className="branch-list">
                {r.branches.length === 0 && <div className="input-hint">No branches yet.</div>}
                {r.branches.map(b => (
                  <div key={b.id} className="branch-row">
                    {editingBranch?.id === b.id ? (
                      <div className="row" style={{ flex: 1 }}>
                        <input
                          type="text" value={editingBranch.name}
                          onChange={e => setEditingBranch({ id: b.id, name: e.target.value })}
                          onKeyDown={e => e.key === 'Enter' && handleRenameBranch()}
                          autoFocus
                        />
                        <button className="btn btn-primary btn-sm" onClick={handleRenameBranch}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingBranch(null)}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <span className="branch-name">{b.name}</span>
                        <div className="branch-actions">
                          <button className="btn btn-outline btn-sm" onClick={() => setEditingBranch({ id: b.id, name: b.name })}>Rename</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteBranch(b)}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="row" style={{ marginTop: 14 }}>
                <input
                  type="text"
                  value={branchDrafts[r.id] || ''}
                  onChange={e => setBranchDrafts(d => ({ ...d, [r.id]: e.target.value }))}
                  placeholder="New branch name, e.g. Downtown"
                  onKeyDown={e => e.key === 'Enter' && handleAddBranch(r.id)}
                />
                <button className="btn btn-outline btn-sm" onClick={() => handleAddBranch(r.id)} disabled={savingBranch === r.id} style={{ flex: '0 0 auto' }}>
                  {savingBranch === r.id ? <span className="spinner spinner-white" /> : '+ Add Branch'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function BarChart({ entries, labelWidth = 180 }: { entries: { name: string; avg: number }[]; labelWidth?: number }) {
  const w = 800, barH = 28, gap = 10, padR = 60;
  const h = entries.length * (barH + gap) + 16;
  const maxW = w - labelWidth - padR;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ overflow: 'visible', fontFamily: 'var(--font-mono)' }}>
      {entries.map((e, i) => {
        const y = i * (barH + gap) + 8;
        const bw = Math.max(2, (e.avg / 100) * maxW);
        const color = e.avg >= 85 ? 'var(--pass)' : e.avg >= 65 ? 'var(--warn)' : 'var(--fail)';
        const label = e.name.length > 26 ? e.name.slice(0, 24) + '…' : e.name;
        return (
          <g key={i}>
            <text x={labelWidth - 10} y={y + barH / 2 + 4} textAnchor="end" fontSize="12" fill="var(--text-secondary)">{label}</text>
            <rect x={labelWidth} y={y} width={maxW} height={barH} fill="rgba(255,255,255,0.04)" rx="3" />
            <rect x={labelWidth} y={y} width={bw} height={barH} fill={color} rx="3" opacity="0.85" />
            <text x={labelWidth + bw + 8} y={y + barH / 2 + 4} fontSize="12" fill="var(--text-primary)" fontWeight="600">{Math.round(e.avg)}%</text>
          </g>
        );
      })}
    </svg>
  );
}
