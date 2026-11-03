import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  ShieldAlert,
  CheckSquare,
  ShoppingCart,
  Sliders,
  Activity,
  LogOut,
  User,
  AlertCircle,
  RefreshCw,
  Loader2,
  ShieldCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  PlusCircle,
  Store,
  DollarSign,
  Users,
  Clock,
} from 'lucide-react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './api/client';

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '582096119859-2frlksmhqmtaoris57b8c43br29hembu.apps.googleusercontent.com';

// ─── Shared Components ────────────────────────────────────────────────────────

function Spinner({ className = 'w-6 h-6' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin text-purple-500`} />;
}

// ─── Login View ───────────────────────────────────────────────────────────────

function LoginView() {
  const { login, demoLogin, googleLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl glass-panel border border-purple-500/20 bg-slate-900/60 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-purple-500/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Admin Console</h1>
          <p className="text-xs text-slate-400">Marketplace governance, approvals, and fee rule versioning</p>
        </div>

        {Boolean(error) && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@shopright.local"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Spinner className="w-4 h-4 text-white" /> : 'Sign In as Superadmin'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
          <div className="relative flex justify-center text-xs"><span className="px-2 bg-slate-900 text-slate-500">or continue with</span></div>
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

        <button
          onClick={handleDemo}
          disabled={loading}
          type="button"
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          Demo Admin Sign In (admin@shopright.local)
        </button>
      </div>
    </div>
  );
}

// ─── Analytics Overview ────────────────────────────────────────────────────────

function AnalyticsOverview() {
  const { token } = useAuth();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMetrics = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getAnalytics(token);
      setData(res);
    } catch (err: unknown) {
      console.error('Failed to load analytics', err);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadMetrics().finally(() => setLoading(false));
  }, [loadMetrics]);

  const shops = data?.shops ?? {};
  const orders = data?.orders ?? {};
  const revenue = data?.revenue ?? {};
  const users = data?.users ?? {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl glass-panel border border-purple-500/20 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-2">
            <ShieldAlert className="w-3.5 h-3.5" />
            Superadmin Authority
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Marketplace Operations & Governance</h2>
          <p className="text-sm text-slate-400">
            System metrics, merchant approvals, partner overrides, and versioned delivery fee rules.
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            loadMetrics().finally(() => setLoading(false));
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition-colors shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Metrics
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-5 rounded-2xl glass-panel space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs">Pending Approvals</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-3xl font-bold text-amber-400">{Number(shops.pending ?? 0)}</p>
            <p className="text-xs text-slate-500">Shops awaiting verification</p>
          </div>

          <div className="p-5 rounded-2xl glass-panel space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs">Active Approved Shops</span>
              <Store className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold text-white">{Number(shops.approved ?? 0)}</p>
            <p className="text-xs text-slate-500">Of {Number(shops.total ?? 0)} registered stores</p>
          </div>

          <div className="p-5 rounded-2xl glass-panel space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs">Total Orders Placed</span>
              <ShoppingCart className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-3xl font-bold text-white">{Number(orders.total ?? 0)}</p>
            <p className="text-xs text-slate-500">{Number(orders.delivered ?? 0)} successfully delivered</p>
          </div>

          <div className="p-5 rounded-2xl glass-panel space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs">Gross Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold text-emerald-400">
              ₹{(Number(revenue.totalPaise ?? 0) / 100).toFixed(2)}
            </p>
            <p className="text-xs text-slate-500">{Number(users.total ?? 0)} platform accounts</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shop Approvals View ───────────────────────────────────────────────────────

function ShopApprovalsView() {
  const { token } = useAuth();
  const [shops, setShops] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadShops = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getShops(token, statusFilter === 'ALL' ? undefined : statusFilter);
      const items = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
      setShops(items);
    } catch (err: unknown) {
      console.error('Failed to load shops', err);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    setLoading(true);
    loadShops().finally(() => setLoading(false));
  }, [loadShops]);

  async function handleApprove(id: string) {
    if (!token) return;
    setActionLoading(id);
    try {
      await api.approveShop(token, id);
      await loadShops();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    if (!token) return;
    setActionLoading(id);
    try {
      await api.rejectShop(token, id);
      await loadShops();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSuspend(id: string) {
    if (!token) return;
    setActionLoading(id);
    try {
      await api.suspendShop(token, id);
      await loadShops();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Suspend failed');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Merchant Shop Moderation</h2>
          <p className="text-xs text-slate-400 mt-1">
            Review onboarding shops, approve for public discovery, or suspend violative stores.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                statusFilter === st ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {Boolean(error) && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
      ) : shops.length === 0 ? (
        <div className="p-12 rounded-2xl glass-panel text-center text-slate-400 text-sm">
          No shops found matching filter &quot;{statusFilter}&quot;.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {shops.map((shop) => {
            const id = String(shop.id);
            const status = String(shop.status);
            const owner = (shop.owner as Record<string, unknown>) ?? {};
            const isActing = actionLoading === id;

            return (
              <div
                key={id}
                className="p-5 rounded-2xl glass-panel border border-slate-800 hover:border-purple-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-bold text-white text-base">{String(shop.name)}</h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        status === 'APPROVED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : status === 'PENDING'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : status === 'SUSPENDED'
                          ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                          : 'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {status}
                    </span>
                    <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider bg-purple-500/10 px-2 py-0.5 rounded">
                      {String(shop.category)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">{String(shop.description ?? '')}</p>
                  <p className="text-xs text-slate-500">
                    📍 {String(shop.address)} · Service Radius: {Number(shop.serviceRadiusKm ?? 5)} km
                  </p>

                  <div className="text-xs text-slate-400 pt-1 flex items-center gap-3">
                    <span>
                      Owner: <span className="text-slate-200 font-medium">{String(owner.name ?? 'Unknown')}</span>
                    </span>
                    <span>✉ {String(owner.email ?? '---')}</span>
                    <span>📞 {String(owner.phone ?? '---')}</span>
                  </div>
                </div>

                {/* Moderation Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {status !== 'APPROVED' && (
                    <button
                      onClick={() => handleApprove(id)}
                      disabled={isActing}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isActing ? <Spinner className="w-3.5 h-3.5 text-white" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Approve
                    </button>
                  )}

                  {status === 'APPROVED' && (
                    <button
                      onClick={() => handleSuspend(id)}
                      disabled={isActing}
                      className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isActing ? <Spinner className="w-3.5 h-3.5 text-white" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      Suspend
                    </button>
                  )}

                  {status !== 'REJECTED' && (
                    <button
                      onClick={() => handleReject(id)}
                      disabled={isActing}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-red-600 hover:text-white text-slate-300 text-xs font-bold transition-all border border-slate-700 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isActing ? <Spinner className="w-3.5 h-3.5 text-white" /> : <XCircle className="w-3.5 h-3.5" />}
                      Reject
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── All Orders View ──────────────────────────────────────────────────────────

function AllOrdersView() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getOrders(token)
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
        setOrders(items);
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">All Platform Orders</h2>
        <p className="text-xs text-slate-400 mt-1">Real-time inspection of orders across all stores and customers.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
      ) : orders.length === 0 ? (
        <div className="p-12 rounded-2xl glass-panel text-center text-slate-400 text-sm">No orders recorded yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 glass-panel">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Placed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {orders.map((o) => {
                const id = String(o.id);
                const customer = (o.customer as Record<string, unknown>) ?? {};
                const shop = (o.shop as Record<string, unknown>) ?? {};
                const total = Number(o.total ?? 0);
                const status = String(o.status);

                return (
                  <tr key={id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-purple-400 font-semibold">{id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-medium text-white">{String(customer.name ?? 'Guest')}</td>
                    <td className="px-4 py-3">{String(shop.name ?? 'Store')}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/20">
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-white">₹{(total / 100).toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(String(o.createdAt ?? Date.now())).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Fee Rules View ───────────────────────────────────────────────────────────

function FeeRulesView() {
  const { token } = useAuth();
  const [rules, setRules] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [baseFeeRupees, setBaseFeeRupees] = useState('30');
  const [perKmFeeRupees, setPerKmFeeRupees] = useState('10');
  const [freeThresholdRupees, setFreeThresholdRupees] = useState('500');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getFeeRules(token);
      setRules(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('Failed to load fee rules', err);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadRules().finally(() => setLoading(false));
  }, [loadRules]);

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createFeeRule(token, {
        baseFee: Math.round(parseFloat(baseFeeRupees) * 100),
        perKmFee: Math.round(parseFloat(perKmFeeRupees) * 100),
        freeDeliveryThreshold: freeThresholdRupees ? Math.round(parseFloat(freeThresholdRupees) * 100) : null,
      });
      setShowForm(false);
      await loadRules();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create fee rule');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Delivery Fee Rules Versioning</h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure base fees, per-km rates, and free delivery thresholds. Orders immutably record the active rule.
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-lg shadow-purple-600/20 shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          {showForm ? 'Cancel' : 'New Rule Version'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateRule} className="p-6 rounded-2xl glass-panel border border-purple-500/30 space-y-4">
          <h3 className="text-sm font-bold text-white">Create New Fee Rule Version</h3>
          {Boolean(error) && <div className="text-xs text-red-400">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Base Fee (₹)</label>
              <input
                type="number"
                step="0.01"
                value={baseFeeRupees}
                onChange={(e) => setBaseFeeRupees(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Per-Km Fee (₹)</label>
              <input
                type="number"
                step="0.01"
                value={perKmFeeRupees}
                onChange={(e) => setPerKmFeeRupees(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Free Delivery Threshold (₹, optional)</label>
              <input
                type="number"
                step="0.01"
                value={freeThresholdRupees}
                onChange={(e) => setFreeThresholdRupees(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
            >
              {submitting ? 'Publishing...' : 'Publish Versioned Rule'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
      ) : rules.length === 0 ? (
        <div className="p-12 rounded-2xl glass-panel text-center text-slate-400 text-sm">No fee rules configured.</div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, idx) => {
            const baseFee = Number(rule.baseFee ?? 0);
            const perKm = Number(rule.perKmFee ?? 0);
            const freeThreshold = rule.freeDeliveryThreshold != null ? Number(rule.freeDeliveryThreshold) : null;
            const effective = new Date(String(rule.effectiveFrom ?? Date.now())).toLocaleString();

            return (
              <div
                key={String(rule.id ?? idx)}
                className={`p-4 rounded-xl glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  idx === 0 ? 'border border-purple-500/40 bg-purple-950/20' : 'border border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">
                      Base ₹{(baseFee / 100).toFixed(2)} + ₹{(perKm / 100).toFixed(2)}/km
                    </span>
                    {idx === 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Active Rule
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Free Delivery Threshold:{' '}
                    {freeThreshold != null ? `Above ₹${(freeThreshold / 100).toFixed(2)}` : 'None (always charged)'}
                  </p>
                </div>

                <div className="text-xs text-slate-500 shrink-0">
                  Effective: {effective}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function AppHeader() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { label: 'Overview', path: '/', icon: Activity },
    { label: 'Shop Approvals', path: '/shops', icon: CheckSquare },
    { label: 'Orders', path: '/orders', icon: ShoppingCart },
    { label: 'Fee Rules', path: '/fee-rules', icon: Sliders },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-purple-500/20">
            A
          </div>
          <div>
            <span className="font-bold text-white text-lg tracking-tight">ShopRight</span>
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
              Superadmin
            </span>
          </div>
        </div>

        {Boolean(user) && (
          <nav className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-purple-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {Boolean(user) && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <User className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-medium hidden md:inline">{user?.name}</span>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Main App Entry ────────────────────────────────────────────────────────────

function AppContent() {
  const { user } = useAuth();

  if (!user) {
    return <LoginView />;
  }

  return (
    <Routes>
      <Route path="/" element={<AnalyticsOverview />} />
      <Route path="/shops" element={<ShopApprovalsView />} />
      <Route path="/orders" element={<AllOrdersView />} />
      <Route path="/fee-rules" element={<FeeRulesView />} />
    </Routes>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <div className="min-h-screen bg-slate-950 flex flex-col antialiased selection:bg-purple-500 selection:text-white">
          <AppHeader />

          <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
            <AppContent />
          </main>

          <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
            ShopRight Hyperlocal Marketplace · Admin Console (Port 5176)
          </footer>
        </div>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
