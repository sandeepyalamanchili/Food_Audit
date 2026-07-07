const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'foodaudit.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    // Let the auth context pick this up and show the login screen
    window.dispatchEvent(new Event('foodaudit:unauthorized'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────
export interface AuthUser { id: string; name: string; email: string; role: 'admin' | 'auditor'; }

export const registerAccount = (name: string, email: string, password: string) =>
  req<{ token: string; user: AuthUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
export const login = (email: string, password: string) =>
  req<{ token: string; user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const getMe = () => req<{ user: AuthUser }>('/api/auth/me');

// ─── Dishes ───────────────────────────────────────────────
export interface Dish { id: string; name: string; prompt: string; sop?: string; refImage?: string; createdAt: string; updatedAt?: string; }

export const getDishes = () => req<Dish[]>('/api/dishes');
export const createDish = (d: Omit<Dish, 'id' | 'createdAt' | 'updatedAt'>) =>
  req<Dish>('/api/dishes', { method: 'POST', body: JSON.stringify(d) });
export const updateDish = (id: string, d: Omit<Dish, 'id' | 'createdAt' | 'updatedAt'>) =>
  req<Dish>(`/api/dishes/${id}`, { method: 'PUT', body: JSON.stringify(d) });
export const deleteDish = (id: string) => req<{ success: boolean }>(`/api/dishes/${id}`, { method: 'DELETE' });

// ─── Restaurants & Branches ─────────────────────────────────
export interface Branch { id: string; restaurantId: string; name: string; address?: string | null; createdAt: string; }
export interface Restaurant { id: string; name: string; createdAt: string; branches: Branch[]; }

export const getRestaurants = () => req<Restaurant[]>('/api/restaurants');
export const createRestaurant = (name: string) =>
  req<Restaurant>('/api/restaurants', { method: 'POST', body: JSON.stringify({ name }) });
export const updateRestaurant = (id: string, name: string) =>
  req<Restaurant>(`/api/restaurants/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteRestaurant = (id: string) => req<{ success: boolean }>(`/api/restaurants/${id}`, { method: 'DELETE' });

export const createBranch = (restaurantId: string, name: string, address?: string) =>
  req<Branch>(`/api/restaurants/${restaurantId}/branches`, { method: 'POST', body: JSON.stringify({ name, address }) });
export const updateBranch = (branchId: string, name: string, address?: string) =>
  req<Branch>(`/api/restaurants/branches/${branchId}`, { method: 'PUT', body: JSON.stringify({ name, address }) });
export const deleteBranch = (branchId: string) => req<{ success: boolean }>(`/api/restaurants/branches/${branchId}`, { method: 'DELETE' });

// ─── Audits ───────────────────────────────────────────────
export interface Criterion { name: string; max_points: number; score: number; comment: string; }
export interface Audit {
  id: string;
  dishId?: string;
  dishName: string;
  restaurantId?: string | null;
  branchId?: string | null;
  restaurantName?: string | null;
  branchName?: string | null;
  userId?: string | null;
  userName?: string | null;
  photo: string;
  criteria: Criterion[];
  totalScore: number;
  maxTotal: number;
  overallComment?: string;
  verdict: 'Pass' | 'Needs Review' | 'Fail';
  createdAt: string;
}
export interface AuditListResponse { audits: Audit[]; total: number; }

export const getAudits = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return req<AuditListResponse>(`/api/audits${qs}`);
};
export const createAudit = (body: Omit<Audit, 'id' | 'createdAt' | 'userId' | 'userName'>) =>
  req<Audit>('/api/audits', { method: 'POST', body: JSON.stringify(body) });
export const deleteAudit = (id: string) => req<{ success: boolean }>(`/api/audits/${id}`, { method: 'DELETE' });

// ─── AI (built-in, self-learning) ──────────────────────────
export interface IdentifyCandidate { name: string; similarity: number; samples: number; }
export const identifyDish = (photoBase64: string, dishes: Dish[]) =>
  req<{ match: string | null; confidence: number; candidates: IdentifyCandidate[] }>('/api/ai/identify', {
    method: 'POST', body: JSON.stringify({ photoBase64, dishes }),
  });
export const auditDish = (dish: Dish, photoBase64: string) =>
  req<{ criteria: Criterion[]; total_score: number; max_total: number; overall_comment: string; verdict: string }>(
    '/api/ai/audit', { method: 'POST', body: JSON.stringify({ dish, photoBase64 }) }
  );

// ─── Analytics ────────────────────────────────────────────
export interface Analytics {
  totalAudits: number;
  avgScore: number;
  passCount: number;
  reviewCount: number;
  failCount: number;
  byDish: { name: string; count: number; avg: number }[];
}
export const getAnalytics = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return req<Analytics>(`/api/audits/analytics${qs}`);
};

// ─── Export ───────────────────────────────────────────────
export interface ExportRecord {
  id: string; date: string; restaurant: string; branch: string; auditedBy: string; dish: string;
  score: number; maxScore: number; percentage: number; verdict: string;
  overallComment: string; criteria: string;
}
export const getExportJson = (params?: Record<string, string>) => {
  const qs = new URLSearchParams({ ...(params || {}), format: 'json' }).toString();
  return req<{ records: ExportRecord[]; total: number }>(`/api/audits/export?${qs}`);
};

// Triggers a browser download of the filtered audits as a CSV file
export async function downloadAuditsCsv(params?: Record<string, string>) {
  const token = getToken();
  const qs = new URLSearchParams({ ...(params || {}), format: 'csv' }).toString();
  const res = await fetch(`${BASE}/api/audits/export?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to export CSV');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `food-audit-audits-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Dashboards (previous analysis, HTML/PPT uploads) ──────
export interface DashboardFile {
  id: string;
  restaurantId?: string | null;
  branchId?: string | null;
  restaurantName?: string | null;
  branchName?: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  tableCount: number;
  userId?: string | null;
  userName?: string | null;
  createdAt: string;
}

export interface ExtractedTable { name: string; headers: string[]; rows: string[][]; }

export const getDashboards = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return req<DashboardFile[]>(`/api/dashboards${qs}`);
};

export const getDashboardData = (id: string) =>
  req<{ id: string; title: string; tables: ExtractedTable[] }>(`/api/dashboards/${id}/data`);

export const uploadDashboard = (body: {
  restaurantId?: string; branchId?: string; restaurantName?: string; branchName?: string;
  title: string; fileName: string; mimeType: string; fileData: string;
}) => req<DashboardFile>('/api/dashboards', { method: 'POST', body: JSON.stringify(body) });

export const deleteDashboard = (id: string) => req<{ success: boolean }>(`/api/dashboards/${id}`, { method: 'DELETE' });

// Fetches the raw file (with auth) and returns a blob URL — used both to preview
// HTML dashboards inline and to trigger downloads for PPT/PPTX files.
export async function getDashboardFileBlobUrl(id: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`${BASE}/api/dashboards/${id}/raw`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to load file');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function downloadDashboardFile(id: string, fileName: string) {
  const url = await getDashboardFileBlobUrl(id);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
