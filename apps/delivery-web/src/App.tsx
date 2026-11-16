import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  Bike,
  Navigation,
  CheckCircle2,
  Power,
  MapPin,
  Package,
  Phone,
  Clock,
  LogOut,
  User,
  AlertCircle,
  RefreshCw,
  Loader2,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './api/client';

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '582096119859-2frlksmhqmtaoris57b8c43br29hembu.apps.googleusercontent.com';

// ─── Shared Components ────────────────────────────────────────────────────────

function Spinner({ className = 'w-6 h-6' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin text-blue-500`} />;
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
      <div className="w-full max-w-md p-8 rounded-2xl glass-panel border border-blue-500/20 bg-slate-900/60 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-500/20">
            <Bike className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Delivery Partner Portal</h1>
          <p className="text-xs text-slate-400">Sign in to manage duty status and active delivery queue</p>
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
              placeholder="partner@shopright.local"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Spinner className="w-4 h-4 text-white" /> : 'Sign In'}
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
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          Demo Partner Sign In (partner@shopright.local)
        </button>
      </div>
    </div>
  );
}

// ─── Active Assignments Queue ─────────────────────────────────────────────────

function ActiveAssignmentsView() {
  const { token } = useAuth();
  const [isAvailable, setIsAvailable] = useState(false);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingDuty, setTogglingDuty] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulatedLat, setSimulatedLat] = useState(12.9716);
  const [simulatedLng, setSimulatedLng] = useState(77.5946);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getAssignedOrders(token);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('Failed to load orders', err);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadOrders().finally(() => setLoading(false));
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  async function handleToggleDuty() {
    if (!token) return;
    setTogglingDuty(true);
    setError(null);
    try {
      const newStatus = !isAvailable;
      await api.setAvailability(token, newStatus, simulatedLat, simulatedLng);
      setIsAvailable(newStatus);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update duty status');
    } finally {
      setTogglingDuty(false);
    }
  }

  async function handleUpdateLocation() {
    if (!token) return;
    try {
      await api.updateLocation(token, simulatedLat, simulatedLng);
      alert(`Location updated to [${simulatedLat.toFixed(4)}, ${simulatedLng.toFixed(4)}]`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Location update failed');
    }
  }

  async function handlePickup(orderId: string) {
    if (!token) return;
    setActionLoading(orderId);
    setError(null);
    try {
      await api.pickupOrder(token, orderId);
      await loadOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to pickup order');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeliver(orderId: string) {
    if (!token) return;
    setActionLoading(orderId);
    setError(null);
    try {
      await api.deliverOrder(token, orderId);
      await loadOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deliver order');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Availability / Duty Banner */}
      <div className="p-6 rounded-2xl glass-panel border border-blue-500/20 bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-2">
            <Navigation className="w-3.5 h-3.5" />
            Duty Status: {isAvailable ? 'Online & Available for Orders' : 'Offline'}
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Delivery Assignment Queue</h2>
          <p className="text-sm text-slate-400">
            When orders reach <span className="text-blue-400 font-semibold">READY</span>, the backend auto-assigns the nearest online partner via Haversine distance (ADR-007).
          </p>
        </div>

        <button
          onClick={handleToggleDuty}
          disabled={togglingDuty}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shrink-0 ${
            isAvailable
              ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20 hover:bg-emerald-400'
              : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
          }`}
        >
          {togglingDuty ? <Spinner className="w-4 h-4 text-white" /> : <Power className="w-4 h-4" />}
          {isAvailable ? 'Go Offline' : 'Go Online'}
        </button>
      </div>

      {/* GPS Simulator widget */}
      <div className="p-4 rounded-xl glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-400" />
          <span>GPS Simulator (Current Coordinates):</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.0001"
            value={simulatedLat}
            onChange={(e) => setSimulatedLat(parseFloat(e.target.value))}
            className="w-24 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white text-xs"
          />
          <input
            type="number"
            step="0.0001"
            value={simulatedLng}
            onChange={(e) => setSimulatedLng(parseFloat(e.target.value))}
            className="w-24 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white text-xs"
          />
          <button
            onClick={handleUpdateLocation}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
          >
            Update GPS
          </button>
        </div>
      </div>

      {Boolean(error) && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Assigned Orders List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>Active Assignments</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {orders.length}
            </span>
          </h3>
          <button
            onClick={loadOrders}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
        ) : orders.length === 0 ? (
          <div className="p-12 rounded-2xl glass-panel text-center space-y-3">
            <Package className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-lg font-bold text-white">No active orders assigned</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Ensure your duty status is <span className="text-emerald-400 font-semibold">Online</span>. When a merchant prepares an order and marks it <code className="text-blue-400">READY</code>, nearby orders will automatically appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {orders.map((order) => {
              const orderId = String(order.id);
              const status = String(order.status);
              const shop = (order.shop as Record<string, unknown>) ?? {};
              const address = (order.deliveryAddress as Record<string, unknown>) ?? {};
              const items = Array.isArray(order.items) ? order.items : [];
              const total = Number(order.total ?? 0);
              const isActionRunning = actionLoading === orderId;

              return (
                <div
                  key={orderId}
                  className="p-6 rounded-2xl glass-panel border border-slate-800 hover:border-blue-500/40 transition-all space-y-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                        <Bike className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">Order #{orderId.slice(0, 8)}</span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              status === 'READY'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                            }`}
                          >
                            {status === 'READY' ? 'Ready for Pickup' : 'Out for Delivery'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(String(order.createdAt ?? Date.now())).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-bold text-white">₹{(total / 100).toFixed(2)}</div>
                      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">COD / Collect Cash</span>
                    </div>
                  </div>

                  {/* Locations: Shop & Customer */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" /> Pickup From (Shop)
                      </span>
                      <p className="text-xs font-bold text-white">{String(shop.name ?? 'Shop')}</p>
                      <p className="text-xs text-slate-400">{String(shop.address ?? 'Address')}</p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Navigation className="w-3.5 h-3.5" /> Deliver To (Customer)
                      </span>
                      <p className="text-xs font-bold text-white">{String(address.label ?? 'Customer Location')}</p>
                      <p className="text-xs text-slate-400">
                        {String(address.line1 ?? '')}, {String(address.city ?? '')}
                      </p>
                    </div>
                  </div>

                  {/* Item Summary */}
                  <div className="text-xs text-slate-400 space-y-1 border-t border-slate-800/80 pt-3">
                    <span className="font-semibold text-slate-300">Items: </span>
                    {items.map((item: any, idx: number) => {
                      const prod = (item.product as Record<string, unknown>) ?? {};
                      return (
                        <span key={idx} className="inline-block mr-2">
                          {String(prod.name ?? 'Item')} × {Number(item.quantity ?? 1)}
                          {idx < items.length - 1 ? ',' : ''}
                        </span>
                      );
                    })}
                  </div>

                  {/* State Machine Transition Actions */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    {status === 'READY' && (
                      <button
                        onClick={() => handlePickup(orderId)}
                        disabled={isActionRunning}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs tracking-wide transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2 disabled:opacity-50"
                      >
                        {isActionRunning ? <Spinner className="w-4 h-4 text-white" /> : <Package className="w-4 h-4" />}
                        Confirm Pickup (PICKUP)
                      </button>
                    )}

                    {status === 'PICKED_UP' && (
                      <button
                        onClick={() => handleDeliver(orderId)}
                        disabled={isActionRunning}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50"
                      >
                        {isActionRunning ? <Spinner className="w-4 h-4 text-white" /> : <CheckCircle2 className="w-4 h-4" />}
                        Confirm Delivered (DELIVER)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-500/20">
            D
          </div>
          <div>
            <span className="font-bold text-white text-lg tracking-tight">ShopRight</span>
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">
              Delivery Partner
            </span>
          </div>
        </div>

        {Boolean(user) && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-medium">{user?.name}</span>
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
    <div className="space-y-6">
      <ActiveAssignmentsView />
    </div>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <div className="min-h-screen bg-slate-950 flex flex-col antialiased selection:bg-blue-500 selection:text-white">
          <AppHeader />

          <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
            <AppContent />
          </main>

          <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
            ShopRight Hyperlocal Marketplace · Delivery Partner App (Port 5175)
          </footer>
        </div>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
