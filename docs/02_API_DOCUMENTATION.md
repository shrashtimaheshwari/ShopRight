# ShopRight — API Documentation

Base URL (dev): `http://localhost:4000/api/v1`

This is the contract all four frontends build against. Update this file whenever a route changes — it should never drift from the actual implementation.

---

## 1. Conventions

**Auth header:** `Authorization: Bearer <accessToken>` on every route except `/auth/*` and public `GET /shops/nearby`.

**Response envelope (success):**
```json
{ "success": true, "data": { ... } }
```

**Response envelope (error):**
```json
{ "success": false, "error": { "code": "SHOP_OUT_OF_RANGE", "message": "This shop does not deliver to your location." } }
```

**Pagination** (list endpoints): query params `?page=1&limit=20`, response includes `"meta": { "page": 1, "limit": 20, "total": 134 }`.

**Money:** always returned as integers in the smallest currency unit (paise) to avoid float rounding bugs. Frontend divides by 100 for display only.

**Standard HTTP codes:** `200` OK, `201` Created, `400` validation error, `401` not authenticated, `403` wrong role / not permitted, `404` not found, `409` invalid state transition, `422` semantically invalid (e.g. out-of-stock item), `500` server error.

---

## 2. Auth

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/register` | public | body: `{ name, email, phone, password, role }`. `role` must be `CUSTOMER` or `SHOPKEEPER` or `DELIVERY_PARTNER` at self-signup — `ADMIN` accounts are seeded/created by another admin, never self-registered. |
| POST | `/auth/login` | public | body: `{ email, password }` → `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | public | body: `{ refreshToken }` → new `{ accessToken }` |
| POST | `/auth/logout` | authenticated | invalidates refresh token server-side |
| GET | `/auth/me` | authenticated | returns current user profile |

---

## 3. Customer Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/shops/nearby?lat=&lng=` | Returns `APPROVED` shops within their own `serviceRadiusKm` of the given point, with distance included. |
| GET | `/shops/:shopId/products` | List products for a shop (only `inStock` ones by default; `?includeOutOfStock=true` for merchant view reuse). |
| POST | `/orders` | Place an order. Body: `{ shopId, items: [{ productId, quantity }], deliveryAddressId }`. **No price fields accepted** — server computes subtotal/fee/total (see Design Doc §5.2). Returns the created order with server-computed total. |
| GET | `/orders/:id` | Get a single order (must belong to requesting customer, or be requester's assigned shop/delivery order — enforced by ownership check, not just role). |
| GET | `/orders/:id/status` | Lightweight status-only poll endpoint — the REST fallback for when no socket connection is live. |
| GET | `/orders` | Customer's own order history, paginated. |
| POST | `/orders/:id/rating` | Body: `{ stars, comment }`. Only allowed when `order.status === 'DELIVERED'` and no existing rating. |
| GET | `/addresses` / POST `/addresses` | Manage saved delivery addresses. |

---

## 4. Shopkeeper Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/shops` | Register a shop. Always created with `status: PENDING`. Not listed to customers until admin approves. |
| GET | `/shops/mine` | The requesting shopkeeper's own shop(s). |
| PATCH | `/shops/:id` | Edit shop details (name, description, serviceRadiusKm, lat/lng). Cannot self-approve — `status` field is ignored if sent by a non-admin. |
| POST | `/shops/:id/products` | Add product. Body: `{ name, description, price, unit, imageUrl }`. |
| PATCH | `/products/:id` | Edit product (price, description, imageUrl). |
| PATCH | `/products/:id/stock` | Body: `{ inStock: boolean }` — quick toggle, separate from full edit for UI convenience. |
| GET | `/shops/:id/orders?status=` | Incoming/active orders for the shop. |
| POST | `/orders/:id/accept` | Transitions `PLACED → ACCEPTED`. Only the owning shopkeeper. |
| POST | `/orders/:id/reject` | Transitions `PLACED → REJECTED`. Body: `{ reason }`. |
| PATCH | `/orders/:id/status` | Body: `{ status: 'PREPARING' | 'READY' }`. Rejected with `409` if not a legal transition from current state. |
| GET | `/shops/:id/analytics` | Basic sales dashboard: orders/day, top products, for the shop's own owner only. |

---

## 5. Delivery Partner Endpoints

| Method | Path | Description |
|---|---|---|
| PATCH | `/delivery/me/availability` | Body: `{ isAvailable: boolean }`. |
| PATCH | `/delivery/me/location` | Body: `{ lat, lng }` — periodic ping from the app while online. |
| GET | `/delivery/me/orders` | Orders currently assigned to this partner. |
| POST | `/orders/:id/pickup` | Transitions `READY → PICKED_UP`. Only the assigned partner. |
| POST | `/orders/:id/deliver` | Transitions `PICKED_UP → DELIVERED`. Only the assigned partner. |

---

## 6. Admin Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/admin/shops?status=PENDING` | List shops by status for approval queue. |
| POST | `/admin/shops/:id/approve` | `PENDING → APPROVED`. |
| POST | `/admin/shops/:id/reject` | `PENDING → REJECTED`. Body: `{ reason }`. |
| GET | `/admin/orders` | All orders, filterable by status/shop/date. |
| POST | `/admin/orders/:id/reassign` | Body: `{ deliveryPartnerId }` — manual override of auto-assignment. |
| GET/PUT | `/admin/delivery-fee-rule` | View/update the active `DeliveryFeeRule`. Creates a new versioned row rather than mutating history. |
| GET | `/admin/analytics` | Marketplace-wide: total orders, revenue, active shops, active partners. |

---

## 7. WebSocket Events (Socket.IO)

Namespace: `/realtime`. Client authenticates the socket handshake with the same access token.

| Event (server → client) | Payload | Who receives it |
|---|---|---|
| `order:statusChanged` | `{ orderId, status, timestamp }` | Everyone subscribed to `order:{orderId}` room (customer, shop, assigned partner) |
| `order:assigned` | `{ orderId, deliveryPartnerId }` | Customer, shop, and the newly assigned partner |
| `shop:newOrder` | `{ orderId, shopId }` | Shopkeeper of that shop (merchant dashboard inbox) |
| `partner:newAssignment` | `{ orderId }` | Assigned delivery partner |

Client → server: `subscribe:order` with `{ orderId }` to join a room after fetching an order via REST.

**Fallback contract:** every state exposed via socket must also be fetchable via the REST endpoints in §3–§6. Do not build any feature that is socket-only.

---

## 8. Error Codes (non-exhaustive, extend as built)

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Login failed |
| `FORBIDDEN_ROLE` | 403 | Endpoint not permitted for this role |
| `SHOP_NOT_APPROVED` | 403 | Action blocked because shop isn't `APPROVED` |
| `SHOP_OUT_OF_RANGE` | 422 | Customer location outside shop's service radius |
| `PRODUCT_OUT_OF_STOCK` | 422 | Item unavailable at order time |
| `INVALID_STATE_TRANSITION` | 409 | Requested order status change isn't legal from current state |
| `NOT_ASSIGNED_PARTNER` | 403 | Delivery partner acting on an order not assigned to them |
