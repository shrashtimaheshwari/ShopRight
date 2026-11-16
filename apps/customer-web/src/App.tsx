import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Compass, ShoppingBag, Clock, User, LogOut } from 'lucide-react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider, useCart } from './context/CartContext';
import { NearbyShopsPage } from './pages/NearbyShopsPage';
import { ShopCatalogPage } from './pages/ShopCatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderTrackingPage } from './pages/OrderTrackingPage';
import { OrderHistoryPage } from './pages/OrderHistoryPage';

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '582096119859-2frlksmhqmtaoris57b8c43br29hembu.apps.googleusercontent.com';

function CustomerAppHeader() {
  const location = useLocation();
  const { user, logout, quickDemoLogin, loginWithGoogle } = useAuth();
  const { itemCount } = useCart();

  const navItems = [
    { label: 'Explore', path: '/', icon: Compass },
    { label: 'Cart', path: '/checkout', icon: ShoppingBag, badge: itemCount },
    { label: 'Orders', path: '/orders', icon: Clock },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-emerald-500/20">
            S
          </div>
          <div>
            <span className="font-bold text-white text-lg tracking-tight">ShopRight</span>
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              Customer
            </span>
          </div>
        </Link>

        {/* Navigation & Auth */}
        <div className="flex items-center gap-2 sm:gap-4">
          <nav className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-400 text-slate-950 font-black text-[10px]">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="h-5 w-px bg-slate-800" />

          {/* User Auth controls */}
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden md:inline font-medium truncate max-w-[120px]">
                  {user.name.split(' ')[0]}
                </span>
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="scale-90 origin-right">
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    if (credentialResponse.credential) {
                      try {
                        await loginWithGoogle(credentialResponse.credential);
                      } catch (err) {
                        console.error('Google Sign-In error:', err);
                        alert(err instanceof Error ? err.message : 'Google Sign-In failed');
                      }
                    }
                  }}
                  onError={() => {
                    console.error('Google Login Failed');
                  }}
                  shape="pill"
                  size="small"
                  theme="filled_black"
                />
              </div>
              <button
                onClick={quickDemoLogin}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shrink-0"
              >
                Demo Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <CartProvider>
          <div className="min-h-screen bg-slate-950 flex flex-col antialiased selection:bg-emerald-500 selection:text-white">
            <CustomerAppHeader />

            <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
              <Routes>
                <Route path="/" element={<NearbyShopsPage />} />
                <Route path="/shop/:id" element={<ShopCatalogPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/orders/:id/track" element={<OrderTrackingPage />} />
                <Route path="/orders" element={<OrderHistoryPage />} />
              </Routes>
            </main>

            <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
              ShopRight Hyperlocal Marketplace · Customer Web App (Port 5173)
            </footer>
          </div>
        </CartProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
