import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { OrderDto, OrderStatus } from '@shopright/shared-types';
import { Clock, ShoppingBag, ArrowRight, RefreshCw, AlertCircle, Star } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function OrderHistoryPage() {
  const { user, quickDemoLogin } = useAuth();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadOrders();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  async function loadOrders() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<OrderDto[]>('/orders');
      setOrders(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load order history.');
    } finally {
      setIsLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="p-12 rounded-2xl glass-panel text-center space-y-4 max-w-md mx-auto border border-slate-800">
        <Clock className="w-12 h-12 text-slate-600 mx-auto" />
        <h2 className="text-xl font-bold text-white">Login to View Order History</h2>
        <p className="text-xs text-slate-400">
          Sign in to check past orders, track live deliveries, or rate your experience.
        </p>
        <button
          onClick={quickDemoLogin}
          className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20"
        >
          1-Click Demo Customer Login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Your Orders</h1>
          <p className="text-xs text-slate-400 mt-1">
            Historical orders with immutable snapshot totals and delivery records.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 glass-panel rounded-2xl space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm text-slate-400">Retrieving order history...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl glass-panel border border-red-500/20 bg-red-950/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="p-16 rounded-2xl glass-panel text-center space-y-4 border border-slate-800">
          <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">No Past Orders Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You have not placed any orders yet. Explore shops in your area to get started!
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20"
          >
            Explore Nearby Shops
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isDelivered = order.status === OrderStatus.DELIVERED;
            const isCancelled = order.status === OrderStatus.CANCELLED;

            return (
              <div
                key={order.id}
                className="p-5 rounded-2xl glass-panel hover:border-emerald-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      Order #{order.id.slice(0, 8)}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        isCancelled
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : isDelivered
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}
                    >
                      {order.status}
                    </span>
                    {order.rating && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                        <Star className="w-3 h-3 fill-amber-400" />
                        {order.rating.stars} Stars
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-white">{order.shop?.name || 'Shop'}</h4>
                  <p className="text-xs text-slate-400">
                    {order.items?.length || 0} items · Placed on{' '}
                    {new Date(order.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">Total</span>
                    <span className="text-sm font-black text-emerald-400 font-mono">
                      ₹{(order.total / 100).toFixed(2)}
                    </span>
                  </div>

                  <Link
                    to={`/orders/${order.id}/track`}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                  >
                    Track Order
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
