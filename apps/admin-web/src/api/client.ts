const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers, ...(options.headers as Record<string, string>) } });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'API Error');
  return json.data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: Record<string, unknown> }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  googleLogin: (idToken: string) =>
    request<{ accessToken: string; user: Record<string, unknown> }>('/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),

  getShops: (token: string, status?: string) =>
    request<Record<string, unknown>>(`/admin/shops${status ? `?status=${status}` : ''}`, {}, token),

  approveShop: (token: string, shopId: string) =>
    request<Record<string, unknown>>(`/admin/shops/${shopId}/approve`, { method: 'PATCH' }, token),

  rejectShop: (token: string, shopId: string) =>
    request<Record<string, unknown>>(`/admin/shops/${shopId}/reject`, { method: 'PATCH' }, token),

  suspendShop: (token: string, shopId: string) =>
    request<Record<string, unknown>>(`/admin/shops/${shopId}/suspend`, { method: 'PATCH' }, token),

  getOrders: (token: string, page?: number) =>
    request<Record<string, unknown>>(`/admin/orders?page=${page ?? 1}`, {}, token),

  getAnalytics: (token: string) => request<Record<string, unknown>>('/admin/analytics', {}, token),

  getFeeRules: (token: string) => request<Record<string, unknown>[]>('/admin/fee-rules', {}, token),

  createFeeRule: (token: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/admin/fee-rules', { method: 'POST', body: JSON.stringify(data) }, token),
};
