import React, { createContext, useContext, useState, useEffect } from 'react';
import { ProductDto } from '@shopright/shared-types';

export interface CartItem {
  product: ProductDto;
  quantity: number;
}

interface CartContextType {
  shopId: string | null;
  shopName: string | null;
  items: CartItem[];
  itemCount: number;
  indicativeSubtotalPaise: number;
  addToCart: (shop: { id: string; name: string }, product: ProductDto, quantity?: number) => boolean;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [shopId, setShopId] = useState<string | null>(() => localStorage.getItem('shopright_cart_shop_id'));
  const [shopName, setShopName] = useState<string | null>(() => localStorage.getItem('shopright_cart_shop_name'));
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('shopright_cart_items');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    if (shopId) localStorage.setItem('shopright_cart_shop_id', shopId);
    else localStorage.removeItem('shopright_cart_shop_id');

    if (shopName) localStorage.setItem('shopright_cart_shop_name', shopName);
    else localStorage.removeItem('shopright_cart_shop_name');

    localStorage.setItem('shopright_cart_items', JSON.stringify(items));
  }, [shopId, shopName, items]);

  function addToCart(shop: { id: string; name: string }, product: ProductDto, quantity = 1): boolean {
    // Single-shop cart enforcement (Design Doc §3.1)
    if (shopId && shopId !== shop.id && items.length > 0) {
      const confirmSwitch = window.confirm(
        `Your cart already contains items from "${shopName}". Would you like to clear your cart to add items from "${shop.name}"?`
      );
      if (!confirmSwitch) return false;

      // Clear previous shop cart
      setShopId(shop.id);
      setShopName(shop.name);
      setItems([{ product, quantity }]);
      return true;
    }

    setShopId(shop.id);
    setShopName(shop.name);

    setItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.product.id === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += quantity;
        return updated;
      }
      return [...prev, { product, quantity }];
    });
    return true;
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i))
    );
  }

  function removeFromCart(productId: string) {
    setItems((prev) => {
      const filtered = prev.filter((i) => i.product.id !== productId);
      if (filtered.length === 0) {
        setShopId(null);
        setShopName(null);
      }
      return filtered;
    });
  }

  function clearCart() {
    setItems([]);
    setShopId(null);
    setShopName(null);
  }

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const indicativeSubtotalPaise = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        shopId,
        shopName,
        items,
        itemCount,
        indicativeSubtotalPaise,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
