import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bike, Clock3, MapPin, Search, ShieldCheck, SlidersHorizontal, Sparkles, Store, LocateFixed, RefreshCw, AlertTriangle } from 'lucide-react';
import { ShopDto } from '@shopright/shared-types';
import { apiRequest } from '../api/client';

const categories = ['All shops', 'Grocery', 'Bakery', 'Pharmacy', 'Produce'];

// Fix 1: no duplicate URLs — 4 distinct Unsplash images
const art = [
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1608198093002-ad4e005484df?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1534723452862-4c874986ebad?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1000&q=85',
];

type SortOrder = 'distance' | 'name';

export function NearbyShopsPage() {
  const [lat, setLat] = useState(12.9784);
  const [lng, setLng] = useState(77.6408);
  const [locationLabel, setLocationLabel] = useState('Indiranagar, Bengaluru');
  const [shops, setShops] = useState<ShopDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All shops');
  // Fix 2: proper retry counter — no lat nudge hack
  const [retryKey, setRetryKey] = useState(0);
  // Fix 3: wired sort state
  const [sortOrder, setSortOrder] = useState<SortOrder>('distance');

  useEffect(() => {
    let active = true;
    setIsLoading(true); setError(null);
    apiRequest<ShopDto[]>(`/shops/nearby?lat=${lat}&lng=${lng}`)
      .then(data => { if (active) setShops(data); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load nearby shops.'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [lat, lng, retryKey]);

  const visibleShops = useMemo(() => {
    const filtered = shops.filter(shop => {
      const matchName = `${shop.name} ${shop.description ?? ''} ${shop.category}`.toLowerCase().includes(query.toLowerCase());
      const matchCategory = category === 'All shops' || String(shop.category).toLowerCase().includes(category.toLowerCase());
      return matchName && matchCategory;
    });
    // Fix 3: sort button is now functional
    if (sortOrder === 'distance') {
      return [...filtered].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [shops, query, category, sortOrder]);

  // Fix 4: renamed from useGeo (misleading hook name) → handleGeoDetect
  function handleGeoDetect() {
    if (!navigator.geolocation) { setError('Location is not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      setLat(pos.coords.latitude); setLng(pos.coords.longitude); setLocationLabel('Your current location');
    }, () => setError('Location permission was not available. You can keep browsing Indiranagar.'));
  }

  const nextSortOrder: SortOrder = sortOrder === 'distance' ? 'name' : 'distance';
  const sortLabel = sortOrder === 'distance' ? 'Closest first' : 'A → Z';

  return <div className="storefront">
    <section className="welcome-strip"><span><Sparkles size={14}/> Your neighbourhood, delivered</span><span className="welcome-right"><ShieldCheck size={14}/> Local shops. Real people. Fair prices.</span></section>
    <section className="hero-shop">
      <div className="hero-copy">
        <div className="eyebrow"><span className="live-dot"/> FRESH FROM YOUR NEIGHBOURHOOD</div>
        <h1>Good things are<br/><em>closer than you think.</em></h1>
        <p>Shop the independent stores around you. Your next favourite is just around the corner.</p>
        <div className="hero-search"><Search size={19}/><input aria-label="Search local shops" placeholder={'Try \u201cfresh fruit\u201d or \u201cbakery\u201d\u2026'} value={query} onChange={e => setQuery(e.target.value)}/><button onClick={() => document.getElementById('shops')?.scrollIntoView({ behavior: 'smooth' })}>Explore shops <ArrowRight size={15}/></button></div>
        <div className="hero-perks"><span><Bike size={16}/> Quick local delivery</span><span><ShieldCheck size={16}/> Verified stores</span></div>
      </div>
      <div className="hero-art"><div className="hero-photo"/><div className="delivery-note"><span className="note-icon"><Clock3 size={17}/></span><span><b>Around the corner</b><small>Supporting your local high street</small></span></div><div className="hero-stamp">SHOP<br/>LOCAL<br/><span>♡</span></div></div>
    </section>

    <section className="location-row">
      <div className="location-label"><span className="location-icon"><MapPin size={17}/></span><span><small>DELIVERING TO</small><b>{locationLabel}</b></span></div>
      <button className="location-change" onClick={handleGeoDetect}><LocateFixed size={15}/> Use my location</button>
      <span className="location-divider"/><span className="service-note"><span className="live-dot"/> Showing stores that deliver to you</span>
    </section>

    <section id="shops" className="shops-section">
      <div className="section-heading"><div><span className="eyebrow muted-eyebrow">THE GOOD STUFF, NEARBY</span><h2>Shops around you <span className="shop-count">{shops.length || ''}</span></h2><p>Small shops, thoughtful finds, right on your doorstep.</p></div>
        {/* Fix 3: sort button is now functional — toggles distance ↔ name */}
        <button className="sort-button" onClick={() => setSortOrder(nextSortOrder)} title={`Switch to sort by ${nextSortOrder}`}><SlidersHorizontal size={16}/> {sortLabel}</button>
      </div>
      <div className="category-row">{categories.map((item, i) => <button key={item} className={`category-chip ${category === item ? 'selected' : ''}`} onClick={() => setCategory(item)}>{i === 0 ? <Store size={15}/> : null}{item}</button>)}</div>
      {isLoading ? <div className="shop-state"><RefreshCw className="spin"/><b>Finding your local favourites…</b><span>Checking which shops deliver to your area.</span></div>
        : error ? <div className="shop-state error-state"><AlertTriangle/><b>We couldn't load nearby shops</b><span>{error}</span>
            {/* Fix 2: proper retry via retryKey, no lat nudge */}
            <button onClick={() => setRetryKey(k => k + 1)}>Try again</button></div>
        : visibleShops.length === 0 ? <div className="shop-state"><Store/><b>{shops.length ? 'No matches just yet' : 'No shops in this area yet'}</b><span>{shops.length ? 'Try a different search or category.' : 'Try another location to discover more local stores.'}</span></div>
        : <div className="shop-grid">{visibleShops.map((shop, index) => <article className="shop-card" key={shop.id}>
          <Link to={`/shop/${shop.id}`} className="shop-image-link" aria-label={`Browse ${shop.name}`}><img className="shop-image" src={art[index % art.length]} alt="Fresh goods from a local store"/><span className="image-tag">{shop.category}</span><span className="distance-tag"><MapPin size={12}/>{shop.distanceKm?.toFixed(1) ?? '—'} km</span><span className="image-arrow"><ArrowRight size={17}/></span></Link>
          <div className="shop-card-body"><div className="shop-title-row"><h3>{shop.name}</h3><span className="rating"><span>★</span> Local</span></div><p className="shop-description">{shop.description || 'A neighbourhood favourite with hand-picked essentials and friendly service.'}</p><div className="shop-meta"><span><Clock3 size={14}/> 20–35 min</span><i/><span><Bike size={14}/> Local delivery</span></div><div className="shop-card-footer"><span className="shop-address"><MapPin size={13}/>{shop.address}</span><Link to={`/shop/${shop.id}`} className="browse-link">Shop now <ArrowRight size={15}/></Link></div></div>
        </article>)}</div>}
    </section>
    <section className="local-note"><span className="note-sparkle"><Sparkles size={20}/></span><span><b>Every order makes a difference.</b><small>Shopping local keeps your neighbourhood thriving.</small></span><span className="note-heart">Made nearby, for you <span>♥</span></span></section>
  </div>;
}
