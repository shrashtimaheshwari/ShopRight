import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ProductDto, ShopDto } from '@shopright/shared-types';
import { ShoppingBag, ArrowLeft, Check, Plus, AlertCircle, RefreshCw } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useCart } from '../context/CartContext';

export function ShopCatalogPage() {
  const { id: shopId } = useParams<{ id: string }>();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [shop, setShop] = useState<ShopDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { addToCart, items, indicativeSubtotalPaise } = useCart();

  useEffect(() => {
    async function loadCatalog() {
      if (!shopId) return;
      setIsLoading(true);
      setError(null);
      try {
        const prodData = await apiRequest<ProductDto[]>(
          `/shops/${shopId}/products?includeOutOfStock=true`
        );
        setProducts(prodData);

        // Fetch shop details via nearby endpoint or fallback
        const nearbyShops = await apiRequest<ShopDto[]>(`/shops/nearby?lat=12.9784&lng=77.6408`);
        const found = nearbyShops.find((s) => s.id === shopId);
        if (found) setShop(found);
      } catch (err: any) {
        setError(err.message || 'Failed to load shop catalog.');
      } finally {
        setIsLoading(false);
      }
    }
    loadCatalog();
  }, [shopId]);

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to nearby shops
      </Link>

      {/* Shop Info Header */}
      <div className="p-6 rounded-2xl glass-panel border border-emerald-500/20 bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {shop?.category || 'Local Shop'}
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2">
            {shop?.name || 'Shop Catalog'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {shop?.description || 'Browse physical store items available for local delivery.'}
          </p>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-4 bg-slate-900 p-3 rounded-xl border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Indicative Cart</span>
              <span className="text-sm font-bold text-emerald-400">
                ₹{(indicativeSubtotalPaise / 100).toFixed(2)}
              </span>
            </div>
            <Link
              to="/checkout"
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Go to Checkout
            </Link>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 glass-panel rounded-2xl space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading live inventory from store database...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl glass-panel border border-red-500/20 bg-red-950/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : products.length === 0 ? (
        <div className="p-12 rounded-2xl glass-panel text-center text-slate-400">
          No products listed for this shop yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map((product) => {
            const inCart = items.find((i) => i.product.id === product.id);

            return (
              <div
                key={product.id}
                className={`p-5 rounded-2xl glass-panel flex flex-col justify-between transition-all ${
                  !product.inStock ? 'opacity-60 border-slate-800/50' : 'hover:border-emerald-500/30'
                }`}
              >
                <div>
                  <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 mb-4">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80';
                      }}
                    />
                    {!product.inStock && (
                      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                          Out of Stock
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-white leading-snug">{product.name}</h3>
                    <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                      per {product.unit}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{product.description}</p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Unit Price</span>
                    <span className="text-lg font-black text-emerald-400">
                      ₹{(product.price / 100).toFixed(2)}
                    </span>
                  </div>

                  <button
                    disabled={!product.inStock}
                    onClick={() =>
                      addToCart(
                        { id: shopId!, name: shop?.name || 'Shop' },
                        product,
                        1
                      )
                    }
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                      !product.inStock
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                        : inCart
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                    }`}
                  >
                    {inCart ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        In Cart ({inCart.quantity})
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </>
                    )}
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
