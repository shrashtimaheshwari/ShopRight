import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Store, Package, Inbox, BarChart3, PlusCircle, LogOut, User, Loader2, AlertCircle, CheckCircle, XCircle, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './api/client';

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '582096119859-2frlksmhqmtaoris57b8c43br29hembu.apps.googleusercontent.com';

// ─── Shared UI Helpers ────────────────────────────────────────────────────────

function Spinner() {
  return <Loader2 className="w-5 h-5 animate-spin text-orange-400" />;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {message}
    </div>
  );
}

function inputCls() {
  return 'w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 transition-colors';
}

function btnPrimary() {
  return 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-orange-600 hover:bg-orange-500 text-white transition-all shadow-lg shadow-orange-600/20 disabled:opacity-60 disabled:cursor-not-allowed';
}

// ─── Login Page ───────────────────────────────────────────────────────────────

function LoginPage() {
  const { login, demoLogin, googleLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setError(null);
    setLoading(true);
    try {
      await demoLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm glass-panel rounded-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-orange-500/20 mx-auto">
            M
          </div>
          <h1 className="text-2xl font-bold text-white">Merchant Portal</h1>
          <p className="text-sm text-slate-400">Sign in to manage your shops & orders</p>
        </div>

        {error && <ErrorBanner message={error} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Email</label>
            <input
              type="email"
              className={inputCls()}
              placeholder="merchant@shopright.local"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Password</label>
            <input
              type="password"
              className={inputCls()}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading} className={btnPrimary() + ' w-full'}>
            {loading ? <Spinner /> : 'Sign In'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
          <div className="relative text-center"><span className="px-2 bg-slate-900/80 text-xs text-slate-500">or continue with</span></div>
        </div>

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              if (credentialResponse.credential) {
                try {
                  await googleLogin(credentialResponse.credential);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Google Sign-In failed');
                }
              }
            }}
            onError={() => {
              setError('Google Sign-In failed');
            }}
            theme="filled_black"
            shape="pill"
          />
        </div>

        <button onClick={handleDemo} disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-60">
          {loading ? <Spinner /> : 'Demo Sign In'}
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

function DashboardPage() {
  const { token } = useAuth();
  const [shops, setShops] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.getMyShops(token)
      .then(setShops)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load shops'))
      .finally(() => setLoading(false));
  }, [token]);

  const statusColor = (s: unknown) => {
    if (s === 'APPROVED') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (s === 'PENDING') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    if (s === 'REJECTED') return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (s === 'SUSPENDED') return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl glass-panel border border-orange-500/20 bg-gradient-to-r from-orange-950/40 via-slate-900 to-slate-900">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">My Shops</h2>
          <p className="text-sm text-slate-400 mt-1">Manage your registered shops and their status.</p>
        </div>
        <Link to="/onboarding" className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white transition-all shadow-lg shadow-orange-600/20">
          <PlusCircle className="w-4 h-4" />
          Register New Shop
        </Link>
      </div>

      {loading && (
        <div className="flex justify-center py-12"><Spinner /></div>
      )}
      {error && <ErrorBanner message={error} />}
      {!loading && !error && shops.length === 0 && (
        <div className="p-8 rounded-2xl glass-panel text-center text-slate-400">
          No shops registered yet. Click "Register New Shop" to get started.
        </div>
      )}
      {!loading && shops.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shops.map((shop, i) => (
            <div key={String(shop.id ?? i)} className="p-5 rounded-2xl glass-panel space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-white text-lg leading-tight">{String(shop.name ?? '')}</h3>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor(shop.status)}`}>
                  {String(shop.status ?? '')}
                </span>
              </div>
              <p className="text-xs text-slate-400 line-clamp-2">{String(shop.description ?? '')}</p>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">{String(shop.category ?? '')}</span>
                <span>{String(shop.serviceRadiusKm ?? '')} km radius</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Order Inbox Page ─────────────────────────────────────────────────────────

interface ShopOption { id: string; name: string; }

const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  PLACED: ['ACCEPT', 'REJECT'],
  ACCEPTED: ['START_PREPARING'],
  PREPARING: ['MARK_READY'],
};

function OrderInboxPage() {
  const { token } = useAuth();
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getMyShops(token)
      .then(s => {
        const opts = s.map(sh => ({ id: String(sh.id ?? ''), name: String(sh.name ?? '') }));
        setShops(opts);
        if (opts.length > 0) setSelectedShopId(opts[0].id);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load shops'))
      .finally(() => setShopsLoading(false));
  }, [token]);

  const fetchOrders = useCallback(() => {
    if (!token || !selectedShopId) return;
    setLoading(true);
    setError(null);
    api.getOrders(token, selectedShopId)
      .then(res => {
        const list = Array.isArray(res) ? res : (res as { orders?: Record<string, unknown>[] }).orders ?? [];
        setOrders(list as Record<string, unknown>[]);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load orders'))
      .finally(() => setLoading(false));
  }, [token, selectedShopId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function handleAction(orderId: string, event: string) {
    if (!token) return;
    setActionLoading(orderId + event);
    try {
      await api.updateOrderStatus(token, selectedShopId, orderId, event);
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  }

  const eventBtnCls = (event: string) => {
    if (event === 'ACCEPT' || event === 'MARK_READY') return 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50';
    if (event === 'REJECT') return 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50';
    return 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-50';
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl glass-panel border border-orange-500/20 bg-gradient-to-r from-orange-950/40 via-slate-900 to-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Order Inbox</h2>
          <p className="text-sm text-slate-400 mt-1">Accept, prepare, and mark orders as ready for pickup.</p>
        </div>
        <button onClick={fetchOrders} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {shopsLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : (
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-400 shrink-0">Shop:</label>
          <select
            value={selectedShopId}
            onChange={e => setSelectedShopId(e.target.value)}
            className={inputCls() + ' max-w-xs'}
          >
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : orders.length === 0 ? (
        <div className="p-8 rounded-2xl glass-panel text-center text-slate-400">No orders found for this shop.</div>
      ) : (
        <div className="space-y-3">
          {orders.map((order, i) => {
            const orderId = String(order.id ?? i);
            const status = String(order.status ?? '');
            const transitions = ORDER_STATUS_TRANSITIONS[status] ?? [];
            return (
              <div key={orderId} className="p-5 rounded-2xl glass-panel space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs text-slate-500">Order #{orderId.slice(-8)}</span>
                    <div className="font-bold text-white mt-0.5">{String((order.customer as Record<string, unknown>)?.name ?? 'Customer')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border text-orange-400 bg-orange-500/10 border-orange-500/20">
                      {status}
                    </span>
                    <span className="text-sm font-bold text-white">₹{((Number(order.total ?? 0)) / 100).toFixed(2)}</span>
                  </div>
                </div>
                {Array.isArray(order.items) && (
                  <div className="text-xs text-slate-400">
                    {(order.items as Record<string, unknown>[]).map((item, j) => (
                      <span key={j} className="mr-2">{String(item.name ?? '')} ×{String(item.quantity ?? 1)}</span>
                    ))}
                  </div>
                )}
                {transitions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {transitions.map(event => (
                      <button
                        key={event}
                        onClick={() => handleAction(orderId, event)}
                        disabled={actionLoading === orderId + event}
                        className={eventBtnCls(event)}
                      >
                        {actionLoading === orderId + event ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                        {event.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Products Page ────────────────────────────────────────────────────────────

function ProductsPage() {
  const { token } = useAuth();
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockLoading, setStockLoading] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', unit: 'pcs', imageUrl: '' });

  useEffect(() => {
    if (!token) return;
    api.getMyShops(token)
      .then(s => {
        const opts = s.map(sh => ({ id: String(sh.id ?? ''), name: String(sh.name ?? '') }));
        setShops(opts);
        if (opts.length > 0) setSelectedShopId(opts[0].id);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load shops'))
      .finally(() => setShopsLoading(false));
  }, [token]);

  const fetchProducts = useCallback(() => {
    if (!token || !selectedShopId) return;
    setLoading(true);
    setError(null);
    api.getProducts(token, selectedShopId)
      .then(setProducts)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load products'))
      .finally(() => setLoading(false));
  }, [token, selectedShopId]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  async function handleToggleStock(productId: string, current: boolean) {
    if (!token) return;
    setStockLoading(productId);
    try {
      await api.toggleStock(token, productId, !current);
      fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle stock');
    } finally {
      setStockLoading(null);
    }
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !selectedShopId) return;
    setFormLoading(true);
    setFormError(null);
    try {
      await api.createProduct(token, {
        shopId: selectedShopId,
        name: form.name,
        description: form.description,
        price: Math.round(parseFloat(form.price) * 100),
        unit: form.unit,
        imageUrl: form.imageUrl || undefined,
      });
      setForm({ name: '', description: '', price: '', unit: 'pcs', imageUrl: '' });
      setShowForm(false);
      fetchProducts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create product');
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl glass-panel border border-orange-500/20 bg-gradient-to-r from-orange-950/40 via-slate-900 to-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Product Catalog</h2>
          <p className="text-sm text-slate-400 mt-1">Add products and manage in-stock status.</p>
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white transition-all">
          <PlusCircle className="w-4 h-4" />
          {showForm ? 'Cancel' : 'Add Product'}
        </button>
      </div>

      {shopsLoading ? <div className="flex justify-center py-4"><Spinner /></div> : (
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-400 shrink-0">Shop:</label>
          <select value={selectedShopId} onChange={e => setSelectedShopId(e.target.value)} className={inputCls() + ' max-w-xs'}>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreateProduct} className="p-6 rounded-2xl glass-panel space-y-4">
          <h3 className="font-bold text-white">New Product</h3>
          {formError && <ErrorBanner message={formError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Name*</label>
              <input required className={inputCls()} placeholder="e.g. Amul Butter" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Price (₹)*</label>
              <input required type="number" min="0" step="0.01" className={inputCls()} placeholder="e.g. 55.00" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Unit</label>
              <input className={inputCls()} placeholder="e.g. 500g, pcs, kg" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Image URL</label>
              <input className={inputCls()} placeholder="https://..." value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Description</label>
              <input className={inputCls()} placeholder="Short description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <button type="submit" disabled={formLoading} className={btnPrimary()}>
            {formLoading ? <Spinner /> : <><CheckCircle className="w-4 h-4" /> Add Product</>}
          </button>
        </form>
      )}

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : products.length === 0 ? (
        <div className="p-8 rounded-2xl glass-panel text-center text-slate-400">No products yet. Add your first product above.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p, i) => {
            const productId = String(p.id ?? i);
            const inStock = Boolean(p.inStock);
            return (
              <div key={productId} className="p-5 rounded-2xl glass-panel space-y-3">
                {Boolean(p.imageUrl) && (
                  <img src={String(p.imageUrl)} alt={String(p.name)} className="w-full h-32 object-cover rounded-lg" />
                )}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-white">{String(p.name)}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{String(p.description ?? '')}</p>
                  </div>
                  <span className="text-sm font-bold text-orange-400 shrink-0">₹{(Number(p.price ?? 0) / 100).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{String(p.unit ?? '')}</span>
                  <button
                    onClick={() => handleToggleStock(productId, inStock)}
                    disabled={stockLoading === productId}
                    className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                  >
                    {stockLoading === productId ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> :
                      inStock
                        ? <><ToggleRight className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400">In Stock</span></>
                        : <><ToggleLeft className="w-5 h-5 text-slate-500" /><span className="text-slate-500">Out of Stock</span></>
                    }
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Register Shop Page ───────────────────────────────────────────────────────

function RegisterShopPage() {
  const { token } = useAuth();
  const [form, setForm] = useState({ name: '', description: '', category: '', lat: '', lng: '', address: '', serviceRadiusKm: '5' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await api.createShop(token, {
        name: form.name,
        description: form.description,
        category: form.category,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        address: form.address,
        serviceRadiusKm: parseFloat(form.serviceRadiusKm),
      });
      setSuccess(true);
      setForm({ name: '', description: '', category: '', lat: '', lng: '', address: '', serviceRadiusKm: '5' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register shop');
    } finally {
      setLoading(false);
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div className="space-y-1.5">
      <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</label>
      <input
        type={type}
        required
        className={inputCls()}
        placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="p-6 rounded-2xl glass-panel border border-orange-500/20 bg-gradient-to-r from-orange-950/40 via-slate-900 to-slate-900">
        <h2 className="text-2xl font-bold text-white tracking-tight">Register New Shop</h2>
        <p className="text-sm text-slate-400 mt-1">New shops start in PENDING status and require admin approval.</p>
      </div>

      {error && <ErrorBanner message={error} />}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          <CheckCircle className="w-4 h-4" />
          Shop registered successfully! Awaiting admin approval.
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-6 rounded-2xl glass-panel space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Shop Name*', 'name', 'text', 'e.g. Green Grocer')}
          {field('Category*', 'category', 'text', 'e.g. GROCERY')}
          {field('Latitude*', 'lat', 'number', '12.9716')}
          {field('Longitude*', 'lng', 'number', '77.5946')}
          {field('Service Radius (km)', 'serviceRadiusKm', 'number', '5')}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Address*</label>
          <input required className={inputCls()} placeholder="Full street address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Description</label>
          <input className={inputCls()} placeholder="Short shop description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <button type="submit" disabled={loading} className={btnPrimary()}>
          {loading ? <Spinner /> : <><Store className="w-4 h-4" /> Register Shop</>}
        </button>
      </form>
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────

function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { label: 'Overview', path: '/', icon: BarChart3 },
    { label: 'Order Inbox', path: '/orders', icon: Inbox },
    { label: 'Products', path: '/products', icon: Package },
    { label: 'Register Shop', path: '/onboarding', icon: Store },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col antialiased">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-orange-500/20">
              M
            </div>
            <div>
              <span className="font-bold text-white text-lg tracking-tight">ShopRight</span>
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded">
                Merchant Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1 sm:gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive ? 'bg-orange-500 text-slate-950 font-semibold shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="h-5 w-px bg-slate-800" />

            {user && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                  <User className="w-3.5 h-3.5 text-orange-400" />
                  <span className="hidden md:inline font-medium truncate max-w-[120px]">{user.name.split(' ')[0]}</span>
                </div>
                <button
                  onClick={logout}
                  title="Logout"
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/orders" element={<OrderInboxPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/onboarding" element={<RegisterShopPage />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
        ShopRight Hyperlocal Marketplace · Merchant Dashboard (Port 5174)
      </footer>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function AuthGate() {
  const { user } = useAuth();
  return user ? <AppShell /> : <LoginPage />;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
