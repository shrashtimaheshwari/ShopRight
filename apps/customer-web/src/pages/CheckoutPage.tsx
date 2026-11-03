import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AddressDto, OrderDto } from '@shopright/shared-types';
import { ShoppingBag, MapPin, Plus, ShieldCheck, AlertCircle, RefreshCw, Trash2, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';

export function CheckoutPage() {
  const navigate = useNavigate();
  const { user, quickDemoLogin } = useAuth();
  const { items, shopId, shopName, indicativeSubtotalPaise, updateQuantity, removeFromCart, clearCart } =
    useCart();

  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // New address form state
  const [showAddressForm, setShowAddressForm] = useState<boolean>(false);
  const [newLabel, setNewLabel] = useState<string>('Home');
  const [newLine1, setNewLine1] = useState<string>('12th Main, HAL 2nd Stage, Indiranagar');
  const [newCity, setNewCity] = useState<string>('Bengaluru');
  const [newLat, setNewLat] = useState<number>(12.9784);
  const [newLng, setNewLng] = useState<number>(77.6408);

  useEffect(() => {
    if (user) {
      loadAddresses();
    }
  }, [user]);

  async function loadAddresses() {
    try {
      const data = await apiRequest<AddressDto[]>('/addresses');
      setAddresses(data);
      if (data.length > 0) {
        const defaultAddr = data.find((a) => a.isDefault) || data[0];
        setSelectedAddressId(defaultAddr.id);
      }
    } catch (err) {
      console.error('Failed to load delivery addresses:', err);
    }
  }

  async function handleCreateAddress(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await apiRequest<AddressDto>('/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: newLabel,
          line1: newLine1,
          city: newCity,
          lat: newLat,
          lng: newLng,
          isDefault: true,
        }),
      });
      setAddresses((prev) => [created, ...prev]);
      setSelectedAddressId(created.id);
      setShowAddressForm(false);
    } catch (err: any) {
      alert(err.message || 'Failed to create address.');
    }
  }

  async function handlePlaceOrder() {
    if (!user) {
      alert('Please log in before placing an order.');
      return;
    }
    if (!selectedAddressId) {
      alert('Please select or create a delivery address.');
      return;
    }
    if (!shopId || items.length === 0) {
      alert('Your cart is empty.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Security Doc §3: Client sends ONLY shopId, deliveryAddressId, and items [{productId, quantity}].
      // No client prices, subtotals, delivery fees, or totals are ever transmitted.
      const payload = {
        shopId,
        deliveryAddressId: selectedAddressId,
        items: items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
        })),
        idempotencyKey: `client_order_${Date.now()}`,
      };

      const order = await apiRequest<OrderDto>('/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      clearCart();
      navigate(`/orders/${order.id}/track`);
    } catch (err: any) {
      setError(err.message || 'Failed to place order.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="p-16 rounded-2xl glass-panel text-center space-y-4 max-w-lg mx-auto border border-slate-800">
        <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto" />
        <h2 className="text-2xl font-bold text-white">Your Cart is Empty</h2>
        <p className="text-xs sm:text-sm text-slate-400">
          Discover physical shops near you and pick freshly available items.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20"
        >
          Explore Nearby Shops
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Checkout</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Ordering from <strong className="text-emerald-400">{shopName}</strong>
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl glass-panel border border-red-500/30 bg-red-950/30 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Auth Gate */}
      {!user && (
        <div className="p-6 rounded-2xl glass-panel border border-amber-500/20 bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-amber-300">Authentication Required</h3>
            <p className="text-xs text-slate-400 mt-1">
              Log in to access your saved addresses and place your order.
            </p>
          </div>
          <button
            onClick={quickDemoLogin}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md"
          >
            1-Click Demo Customer Login
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Delivery Address & Cart Items */}
        <div className="md:col-span-2 space-y-6">
          {/* Delivery Address Card */}
          <div className="p-6 rounded-2xl glass-panel space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Delivery Address
              </h3>
              {user && (
                <button
                  onClick={() => setShowAddressForm(!showAddressForm)}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showAddressForm ? 'Cancel' : 'Add New'}
                </button>
              )}
            </div>

            {showAddressForm ? (
              <form onSubmit={handleCreateAddress} className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Label</label>
                    <input
                      type="text"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="e.g. Home, Office"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">City</label>
                    <input
                      type="text"
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Address Line</label>
                  <input
                    type="text"
                    value={newLine1}
                    onChange={(e) => setNewLine1(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={newLat}
                      onChange={(e) => setNewLat(parseFloat(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={newLng}
                      onChange={(e) => setNewLng(parseFloat(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Save Address
                </button>
              </form>
            ) : addresses.length === 0 ? (
              <p className="text-xs text-slate-400">
                No saved addresses yet. Click "Add New" above to enter your delivery point.
              </p>
            ) : (
              <div className="space-y-2">
                {addresses.map((addr) => (
                  <label
                    key={addr.id}
                    className={`p-3.5 rounded-xl border flex items-start justify-between cursor-pointer transition-all ${
                      selectedAddressId === addr.id
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-slate-800 bg-slate-900/50 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="deliveryAddress"
                        checked={selectedAddressId === addr.id}
                        onChange={() => setSelectedAddressId(addr.id)}
                        className="mt-0.5 text-emerald-500 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-white block">{addr.label}</span>
                        <span className="text-xs text-slate-400 block mt-0.5">{addr.line1}, {addr.city}</span>
                        <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                          Coords: {addr.lat.toFixed(4)}, {addr.lng.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="p-6 rounded-2xl glass-panel space-y-4">
            <h3 className="text-base font-bold text-white flex items-center justify-between">
              <span>Items from {shopName}</span>
              <span className="text-xs font-normal text-slate-400">{items.length} items</span>
            </h3>

            <div className="divide-y divide-slate-800">
              {items.map((item) => (
                <div key={item.product.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-white">{item.product.name}</h4>
                    <span className="text-[11px] text-emerald-400 font-medium">
                      ₹{(item.product.price / 100).toFixed(2)} / {item.product.unit}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center text-xs"
                    >
                      -
                    </button>
                    <span className="text-xs font-bold text-white w-4 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center text-xs"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="ml-2 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Order Summary & Authoritative Notice */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass-panel border border-emerald-500/20 bg-gradient-to-b from-slate-900 to-slate-950 space-y-4">
            <h3 className="text-base font-bold text-white">Payment & Pricing Notice</h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Indicative Subtotal</span>
                <span className="text-white font-medium">
                  ₹{(indicativeSubtotalPaise / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Delivery Fee</span>
                <span className="text-emerald-400 font-medium">Calculated by Server</span>
              </div>
              <div className="pt-3 border-t border-slate-800 flex justify-between items-baseline">
                <span className="text-xs font-bold text-white">Authoritative Total</span>
                <span className="text-xs text-slate-400 italic">Confirmed upon checkout</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-[11px] text-slate-400 leading-relaxed">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Server-Authoritative Pricing (ADR-001)
              </div>
              <p>
                The backend verifies inventory, checks serviceability via Haversine, computes the distance fee, and writes the snapshot total directly to PostgreSQL.
              </p>
            </div>

            <button
              disabled={isSubmitting || !user}
              onClick={handlePlaceOrder}
              className={`w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                isSubmitting || !user
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Authorizing Order...
                </>
              ) : (
                <>
                  Place Order (Cash on Delivery)
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
