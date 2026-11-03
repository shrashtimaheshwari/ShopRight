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
    request<{ accessToken: string; user: Record<string, unknown> }>('/auth/google', { method: 'POST', body: JSON.stringify({ idToken, role: 'DELIVERY_PARTNER' }) }),

  setAvailability: (token: string, isAvailable: boolean, lat?: number, lng?: number) =>
    request<Record<string, unknown>>('/delivery/availability', { method: 'PATCH', body: JSON.stringify({ isAvailable, lat, lng }) }, token),

  updateLocation: (token: string, lat: number, lng: number) =>
    request<Record<string, unknown>>('/delivery/location', { method: 'PATCH', body: JSON.stringify({ lat, lng }) }, token),

  getAssignedOrders: (token: string) => request<Record<string, unknown>[]>('/delivery/orders', {}, token),

  pickupOrder: (token: string, orderId: string) =>
    request<Record<string, unknown>>(`/delivery/orders/${orderId}/pickup`, { method: 'POST' }, token),

  deliverOrder: (token: string, orderId: string) =>
    request<Record<string, unknown>>(`/delivery/orders/${orderId}/deliver`, { method: 'POST' }, token),
};
