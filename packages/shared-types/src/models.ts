import { Role, ShopStatus, OrderStatus, PaymentMethod, PaymentStatus } from './enums.js';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  createdAt: string;
}

export interface AddressDto {
  id: string;
  userId: string;
  label: string;
  line1: string;
  city: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export interface ShopDto {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  category: string;
  lat: number;
  lng: number;
  address: string;
  status: ShopStatus;
  serviceRadiusKm: number;
  distanceKm?: number;
  createdAt: string;
}

export interface ProductDto {
  id: string;
  shopId: string;
  name: string;
  description: string;
  price: number; // in paise
  unit: string;
  imageUrl: string;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemDto {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceAtOrder: number; // in paise
  product?: ProductDto;
}

export interface OrderDto {
  id: string;
  customerId: string;
  shopId: string;
  deliveryPartnerId?: string | null;
  deliveryAddressId: string;
  status: OrderStatus;
  subtotal: number; // in paise
  deliveryFee: number; // in paise
  total: number; // in paise
  createdAt: string;
  updatedAt: string;
  items?: OrderItemDto[];
  shop?: ShopDto;
  deliveryAddress?: AddressDto;
  rating?: RatingDto | null;
}

export interface DeliveryPartnerProfileDto {
  id: string;
  userId: string;
  currentLat: number | null;
  currentLng: number | null;
  isAvailable: boolean;
  vehicleType: string | null;
}

export interface RatingDto {
  id: string;
  orderId: string;
  customerId: string;
  shopId: string;
  stars: number;
  comment?: string | null;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  providerRef?: string | null;
}

export interface DeliveryFeeRuleDto {
  id: string;
  baseFee: number; // in paise
  perKmFee: number; // in paise
  freeDeliveryThreshold?: number | null; // in paise
  effectiveFrom: string;
}
