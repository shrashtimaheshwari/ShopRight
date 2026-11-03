import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { OrderDto, OrderStatus } from '@shopright/shared-types';
import { CheckCircle2, Clock, Package, Bike, Home, AlertCircle, RefreshCw, XCircle, Star } from 'lucide-react';
import { apiRequest } from '../api/client';

const ORDER_STAGES: { status: OrderStatus; label: string; icon: React.ElementType }[] = [
  { status: OrderStatus.PLACED, label: 'Order Placed', icon: Clock },
  { status: OrderStatus.ACCEPTED, label: 'Accepted by Shop', icon: CheckCircle2 },
  { status: OrderStatus.PREPARING, label: 'Packing Items', icon: Package },
  { status: OrderStatus.READY, label: 'Ready for Pickup', icon: Bike },
  { status: OrderStatus.PICKED_UP, label: 'Out for Delivery', icon: Bike },
  { status: OrderStatus.DELIVERED, label: 'Delivered', icon: Home },
];

export function OrderTrackingPage() {
  const { id: orderId } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>(OrderStatus.PLACED);
  const [lastPolledAt, setLastPolledAt] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Rating modal state
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);
  const [ratingSubmitted, setRatingSubmitted] = useState<boolean>(false);

  // 1. Initial full fetch
  useEffect(() => {
    async function loadInitialOrder() {
      if (!orderId) return;
      try {
        const data = await apiRequest<OrderDto>(`/orders/${orderId}`);
        setOrder(data);
        setCurrentStatus(data.status);
      } catch (err: any) {
        setError(err.message || 'Failed to load order.');
      } finally {
        setIsLoading(false);
      }
    }
    loadInitialOrder();
  }, [orderId]);

  // 2. Continuous REST polling every 3 seconds (ADR-003)
  useEffect(() => {
    if (!orderId) return;

    const interval = setInterval(async () => {
      try {
        const pollData = await apiRequest<{ orderId: string; status: OrderStatus; updatedAt: string }>(
          `/orders/${orderId}/status`
        );
        setCurrentStatus(pollData.status);
        setLastPolledAt(new Date());
      } catch (err) {
        console.warn('Status poll failed, retrying on next tick...', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [orderId]);

  async function handleCancelOrder() {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    setIsCancelling(true);
    try {
      const updated = await apiRequest<OrderDto>(`/orders/${orderId}/cancel`, {
        method: 'POST',
      });
      setCurrentStatus(updated.status);
    } catch (err: any) {
      alert(err.message || 'Failed to cancel order.');
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleSubmitRating(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingRating(true);
    try {
      await apiRequest(`/orders/${orderId}/rating`, {
        method: 'POST',
        body: JSON.stringify({ stars: ratingStars, comment: ratingComment }),
      });
      setRatingSubmitted(true);
      setShowRatingModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to submit rating.');
    } finally {
      setIsSubmittingRating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 glass-panel rounded-2xl space-y-3">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading authoritative order records...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-8 rounded-2xl glass-panel border border-red-500/30 text-center space-y-3 max-w-md mx-auto">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">Order Not Found</h2>
        <p className="text-xs text-slate-400">{error || 'Could not find this order.'}</p>
        <Link to="/orders" className="inline-block text-xs font-bold text-emerald-400 hover:underline">
          ← View Order History
        </Link>
      </div>
    );
  }

  const isCancelled = currentStatus === OrderStatus.CANCELLED;
  const isRejected = currentStatus === OrderStatus.REJECTED;
  const isDelivered = currentStatus === OrderStatus.DELIVERED;
  const canCancel = [OrderStatus.PLACED, OrderStatus.ACCEPTED, OrderStatus.PREPARING].includes(currentStatus);

  const currentStageIndex = ORDER_STAGES.findIndex((s) => s.status === currentStatus);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl glass-panel border border-emerald-500/20 bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">Order #{order.id.slice(0, 8)}</span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                isCancelled || isRejected
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : isDelivered
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              }`}
            >
              {currentStatus}
            </span>
          </div>
          <h1 className="text-xl font-bold text-white mt-1">Live Order Tracking</h1>
          <p className="text-xs text-slate-400">
            From <strong className="text-emerald-400">{order.shop?.name}</strong> · REST Polling Active
          </p>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-500 block">Status Polled</span>
          <span className="text-xs text-slate-400 font-mono">
            {lastPolledAt.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Progress Stepper */}
      {!isCancelled && !isRejected && (
        <div className="p-6 rounded-2xl glass-panel space-y-6">
          <div className="grid grid-cols-6 gap-2">
            {ORDER_STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              const isPastOrCurrent = idx <= currentStageIndex;
              const isCurrent = idx === currentStageIndex;

              return (
                <div key={stage.status} className="flex flex-col items-center text-center space-y-2">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      isCurrent
                        ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20'
                        : isPastOrCurrent
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-[10px] leading-tight font-medium hidden sm:block ${
                      isCurrent ? 'text-emerald-400 font-bold' : isPastOrCurrent ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Terminal States */}
      {isCancelled && (
        <div className="p-6 rounded-2xl glass-panel border border-red-500/30 bg-red-950/20 flex items-center gap-4">
          <XCircle className="w-8 h-8 text-red-400 flex-shrink-0" />
          <div>
            <h3 className="text-base font-bold text-white">Order Cancelled</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              This order has been cancelled. No payment was collected.
            </p>
          </div>
        </div>
      )}

      {isDelivered && (
        <div className="p-6 rounded-2xl glass-panel border border-emerald-500/30 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Order Delivered!</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Your items have been safely handed over. How was your experience?
            </p>
          </div>
          {!ratingSubmitted && !order.rating && (
            <button
              onClick={() => setShowRatingModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
            >
              <Star className="w-3.5 h-3.5" />
              Rate Delivery
            </button>
          )}
        </div>
      )}

      {/* Authoritative Order Details Card */}
      <div className="p-6 rounded-2xl glass-panel space-y-4">
        <h3 className="text-base font-bold text-white">Items Snapshot</h3>
        <div className="divide-y divide-slate-800">
          {order.items?.map((item) => (
            <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-300">
                {item.quantity}x {item.product?.name || 'Product'}
              </span>
              <span className="text-white font-mono">
                ₹{((item.unitPriceAtOrder * item.quantity) / 100).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-slate-800 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Server Subtotal</span>
            <span className="text-white font-mono">₹{(order.subtotal / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Delivery Fee</span>
            <span className="text-white font-mono">₹{(order.deliveryFee / 100).toFixed(2)}</span>
          </div>
          <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-bold text-emerald-400">
            <span>Total Amount</span>
            <span className="font-mono">₹{(order.total / 100).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Cancellation Guard (Security Doc §4) */}
      {canCancel && (
        <div className="flex justify-end">
          <button
            disabled={isCancelling}
            onClick={handleCancelOrder}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-red-950 hover:bg-red-900 text-red-300 border border-red-700/40 transition-all"
          >
            {isCancelling ? 'Cancelling...' : 'Cancel Order'}
          </button>
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 rounded-2xl glass-panel border border-emerald-500/20 bg-slate-900 space-y-4">
            <h3 className="text-lg font-bold text-white">Rate Your Delivery</h3>
            <form onSubmit={handleSubmitRating} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Stars (1-5)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setRatingStars(num)}
                      className={`w-9 h-9 rounded-xl text-sm font-bold transition-all ${
                        ratingStars >= num
                          ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      ★ {num}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Comment (optional)</label>
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="How was the shop packaging and delivery speed?"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRatingModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRating}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Submit Rating
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
