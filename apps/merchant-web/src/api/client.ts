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
    request<{ accessToken: string; refreshToken: string; user: Record<string, unknown> }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  googleLogin: (idToken: string) =>
    request<{ accessToken: string; refreshToken: string; user: Record<string, unknown> }>('/auth/google', { method: 'POST', body: JSON.stringify({ idToken, role: 'SHOPKEEPER' }) }),

  getMyShops: (token: string) => request<Record<string, unknown>[]>('/merchant/shops', {}, token),

  createShop: (token: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/merchant/shops', { method: 'POST', body: JSON.stringify(data) }, token),

  getOrders: (token: string, shopId: string, status?: string) =>
    request<Record<string, unknown>>(`/merchant/shops/${shopId}/orders${status ? `?status=${status}` : ''}`, {}, token),

  updateOrderStatus: (token: string, shopId: string, orderId: string, event: string) =>
    request<Record<string, unknown>>(`/merchant/shops/${shopId}/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ event }) }, token),

  getProducts: (token: string, shopId: string) =>
    request<Record<string, unknown>[]>(`/merchant/products?shopId=${shopId}`, {}, token),

  createProduct: (token: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/merchant/products', { method: 'POST', body: JSON.stringify(data) }, token),

  updateProduct: (token: string, productId: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/merchant/products/${productId}`, { method: 'PATCH', body: JSON.stringify(data) }, token),

  toggleStock: (token: string, productId: string, inStock: boolean) =>
    request<Record<string, unknown>>(`/merchant/products/${productId}/stock`, { method: 'PATCH', body: JSON.stringify({ inStock }) }, token),
};
