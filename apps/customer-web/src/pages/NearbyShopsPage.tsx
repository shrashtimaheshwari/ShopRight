import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShopDto } from '@shopright/shared-types';
import { MapPin, ShieldCheck, Store, RefreshCw, AlertTriangle, Compass } from 'lucide-react';
import { apiRequest } from '../api/client';

export function NearbyShopsPage() {
  // Default coordinates: Indiranagar, Bengaluru
  const [lat, setLat] = useState<number>(12.9784);
  const [lng, setLng] = useState<number>(77.6408);
  const [locationLabel, setLocationLabel] = useState<string>('Indiranagar, Bengaluru');
  const [shops, setShops] = useState<ShopDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNearbyShops(lat, lng);
  }, [lat, lng]);

  async function fetchNearbyShops(latitude: number, longitude: number) {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<ShopDto[]>(`/shops/nearby?lat=${latitude}&lng=${longitude}`);
      setShops(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch nearby shops.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleUseBrowserGeo() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocationLabel('GPS Detected Location');
      },
      (err) => {
        alert(`Location permission denied or unavailable: ${err.message}`);
      }
    );
  }

  function setPresetLocation(presetName: string, pLat: number, pLng: number) {
    setLat(pLat);
    setLng(pLng);
    setLocationLabel(presetName);
  }

  return (
    <div className="space-y-6">
      {/* Hyperlocal Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl glass-panel border border-emerald-500/20 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            Verified Serviceability (Haversine Radius)
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Discover Nearby Physical Shops
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Real physical stores within delivery range. Straight-line distance verified server-side.
          </p>
        </div>

        {/* Location Selector Bar */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 p-2 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span className="font-medium">{locationLabel}</span>
          </div>

          <button
            onClick={handleUseBrowserGeo}
            className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Auto Detect
          </button>

          <button
            onClick={() => setPresetLocation('Indiranagar (In-Range)', 12.9784, 77.6408)}
            className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Indiranagar
          </button>

          <button
            onClick={() => setPresetLocation('Whitefield (Out-of-Range)', 12.9698, 77.7499)}
            className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-600/30 transition-colors"
            title="Test out-of-range rejection"
          >
            Whitefield (Out-of-Range Test)
          </button>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 glass-panel rounded-2xl space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm text-slate-400">Verifying hyperlocal radius for nearby shops...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl glass-panel border border-red-500/20 bg-red-950/20 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : shops.length === 0 ? (
        <div className="p-12 rounded-2xl glass-panel text-center space-y-3 border border-slate-800">
          <Compass className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-semibold text-white">No Shops Deliver to this Location</h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            All registered shops are outside their configured delivery radius from {locationLabel}. Try selecting Indiranagar above to test serviceable stores!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {shops.map((shop) => (
            <div
              key={shop.id}
              className="p-5 rounded-2xl glass-panel hover:border-emerald-500/40 transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {shop.category}
                  </span>
                  <span className="text-xs font-bold text-emerald-300 bg-slate-800 px-2.5 py-1 rounded-lg">
                    {shop.distanceKm?.toFixed(2)} km away
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white mt-3 group-hover:text-emerald-400 transition-colors">
                  {shop.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  {shop.description}
                </p>

                <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  <span className="truncate">{shop.address}</span>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-800 flex justify-between items-center">
                <span className="text-[11px] text-slate-500">
                  Max Radius: {shop.serviceRadiusKm} km
                </span>
                <Link
                  to={`/shop/${shop.id}`}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20"
                >
                  Browse Catalog →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
