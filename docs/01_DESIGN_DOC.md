# ShopRight — Design Document

Scope: Phase 1 only (this semester's build), per `ShopRight_Final_Project_Document`. Anything under "Deferred" in that document is explicitly out of scope here and should not be scaffolded.

---

## 1. Overview

ShopRight is a hyperlocal marketplace connecting customers to nearby physical shops, with shop-set pricing, a transparent delivery fee, and delivery fulfilled by an assigned delivery partner. Four roles share one backend and one order state machine: **Customer**, **Shopkeeper**, **Delivery Partner**, **Administrator**.

Design principles that should hold across every module:

1. **The server is the source of truth for money.** No price, subtotal, delivery fee, or total is ever accepted from the client. The backend recomputes it every time.
2. **One order state machine, four viewers.** All four surfaces read/write the same `Order.status` enum via the same backend logic — there is no separate "merchant order status" and "customer order status."
3. **Serviceability is checked before checkout, not assumed.** A shop only appears as orderable if Haversine distance from the customer's location to the shop is within that shop's configured service radius.
4. **Everything shippable this semester, nothing else.** Route optimization, multi-shop cart, production payments, and multi-city are deliberately absent from this design — see §9.

---

## 2. High-Level Architecture

```
┌────────────────┐   ┌──────────────────┐   ┌─────────────────────┐   ┌────────────────┐
│  Customer App   │   │ Merchant Dashboard│   │ Delivery Partner App │   │  Admin Console  │
│  (React/Vite)   │   │  (React/Vite)     │   │   (React/Vite)       │   │  (React/Vite)   │
└────────┬────────┘   └─────────┬─────────┘   └──────────┬───────────┘   └────────┬────────┘
         │                      │                        │                        │
         │            REST (HTTPS) + WebSocket (Socket.IO)                        │
         └──────────────────────┴───────────┬────────────┴────────────────────────┘
                                             │
                                   ┌─────────▼──────────┐
                                   │  Express API server │
                                   │  - Auth middleware   │
                                   │  - Role guards       │
                                   │  - Pricing engine    │
                                   │  - Serviceability    │
                                   │  - Order state engine│
                                   │  - Assignment logic   │
                                   │  - Socket.IO gateway  │
                                   └─────────┬──────────┘
                                             │ Prisma ORM
                                   ┌─────────▼──────────┐
                                   │     PostgreSQL       │
                                   └──────────────────────┘

External: Cloudinary (images), Razorpay test mode (payments, behind PaymentProvider interface)
```

All four frontends are separate Vite apps (or separate route trees in one app — team's call) hitting the **same** Express/TypeScript backend. There is no per-role backend.

---

## 3. System Components

### 3.1 Customer App
Nearby shop discovery, product browse/search, single-shop cart, checkout with server-computed total, live order tracking, order history, post-delivery rating.

### 3.2 Merchant Dashboard
Shop registration (goes to `PENDING`, blocked from listing until admin approves), product CRUD, stock toggle, accept/reject incoming orders, status updates `PREPARING → READY`, basic sales view (orders/day, top products).

### 3.3 Delivery Partner Interface
View auto-assigned orders, update `PICKED_UP` / `DELIVERED`, availability toggle. No route planning UI — one order at a time, no batching.

### 3.4 Admin Console
Approve/reject shop registrations, view all orders, override delivery-partner assignment, configure the delivery-fee rule, marketplace-wide analytics (orders, revenue, active shops).

### 3.5 Backend Core
- Auth & role-based middleware
- **Pricing engine** — single function, single source of truth (see §6.2)
- **Serviceability check** — Haversine distance vs shop radius
- **Order state machine** — one shared module, imported by every route that mutates order status
- **Assignment engine** — nearest-available-partner selection when an order hits `READY`
- Socket.IO gateway for realtime status push, with REST polling as an explicit fallback path (not just a UI afterthought — build the polling endpoint from day one)

---

## 4. Data Model

### 4.1 Entities

| Entity | Key Fields |
|---|---|
| **User** | id, name, email (unique), phone, passwordHash, role (`CUSTOMER`\|`SHOPKEEPER`\|`DELIVERY_PARTNER`\|`ADMIN`), createdAt |
| **Address** | id, userId, label, line1, city, lat, lng, isDefault |
| **Shop** | id, ownerId → User, name, description, category, lat, lng, address, status (`PENDING`\|`APPROVED`\|`REJECTED`\|`SUSPENDED`), serviceRadiusKm, createdAt |
| **Product** | id, shopId, name, description, price (decimal), unit, imageUrl, inStock (bool), createdAt, updatedAt |
| **Order** | id, customerId, shopId, deliveryPartnerId (nullable), status (see §6.3), subtotal, deliveryFee, total, deliveryAddressId, createdAt, updatedAt |
| **OrderItem** | id, orderId, productId, quantity, unitPriceAtOrder (snapshot, not live product price) |
| **DeliveryPartnerProfile** | userId, currentLat, currentLng, isAvailable (bool), vehicleType |
| **Rating** | id, orderId, customerId, shopId, stars (1–5), comment, createdAt |
| **Payment** | id, orderId, method (`COD`\|`RAZORPAY_TEST`), status, providerRef |
| **DeliveryFeeRule** | id, baseFee, perKmFee, freeDeliveryThreshold (nullable), effectiveFrom |

### 4.2 Relationships
- User 1—N Address, Shop (as owner), Order (as customer)
- Shop 1—N Product, Order
- Order 1—N OrderItem, 1—1 Payment, 1—0/1 Rating
- DeliveryPartnerProfile 1—1 User; DeliveryPartnerProfile 1—N Order (as assigned partner)

### 4.3 Key design choices
- `OrderItem.unitPriceAtOrder` is a **snapshot** — if a shopkeeper edits a product's price after an order is placed, historical orders must not change.
- `Shop.status` gates visibility: only `APPROVED` shops are returned to the customer discovery endpoint, regardless of distance.
- `DeliveryFeeRule` is versioned by `effectiveFrom` so admin can change pricing without rewriting historical orders' stored `deliveryFee`.

---

## 5. Core Flows

### 5.1 Serviceability Check
1. Customer app sends browser geolocation (or manually entered address) lat/lng to `GET /shops/nearby`.
2. Backend computes Haversine distance from customer point to every `APPROVED` shop's lat/lng.
3. Shop is returned only if `distance <= shop.serviceRadiusKm`.
4. Same check is re-run server-side at checkout time (not just at discovery time) — a customer's location or a shop's radius could change between browse and checkout.

### 5.2 Order Placement & Pricing
1. Client sends `{ shopId, items: [{productId, quantity}], deliveryAddressId }`. **Client never sends prices or totals.**
2. Backend:
   - Re-validates serviceability (§5.1).
   - Fetches live `Product.price` and `inStock` for each item from DB — rejects if any item is out of stock or belongs to a different shop than `shopId`.
   - Computes `subtotal = Σ(price × quantity)`.
   - Looks up the active `DeliveryFeeRule` and computes `deliveryFee` from distance.
   - `total = subtotal + deliveryFee`.
   - Persists `Order` + `OrderItem` snapshots with these server-computed values.
3. Response returns the authoritative total. Frontend never computes or displays a total it derived itself — it only ever displays what the server returned.

### 5.3 Order State Machine
See dedicated section in `03_SECURITY_DOC.md` for who is allowed to trigger which transition. States:

```
PLACED ──accept(shopkeeper)──► ACCEPTED ──► PREPARING ──► READY
  │                                              │             │
  └──reject(shopkeeper)──► REJECTED        cancel(customer/admin)   auto-assign partner
                                                  │             │
                                                  ▼             ▼
                                             CANCELLED      PICKED_UP (partner)
                                                                  │
                                                                  ▼
                                                              DELIVERED (partner)
```
- `CANCELLED` is only reachable from `PLACED`/`ACCEPTED`/`PREPARING` — never after `READY` (partner is already committed).
- Transitions are enforced in one shared backend module (`orderStateMachine.ts`), not duplicated per-route — every route that changes status calls the same `transition(orderId, event, actorRole)` function, which throws on an illegal transition.

### 5.4 Delivery Partner Assignment
1. On `Order.status → READY`, backend queries `DeliveryPartnerProfile` where `isAvailable = true`, computes Haversine distance from each partner's `currentLat/Lng` to the shop, and assigns the nearest.
2. If no partner is available, order stays `READY` unassigned; a background check (poll or event) retries on the next partner availability change.
3. Admin can override the assignment manually at any time.

### 5.5 Realtime Updates
- Every order status transition emits a Socket.IO event scoped to a room per order (`order:{orderId}`) and per relevant user (`user:{userId}`).
- Customer app, merchant dashboard, and delivery partner interface all subscribe to the rooms relevant to their own orders.
- **Fallback:** `GET /orders/:id/status` REST endpoint must exist and work correctly even if no socket connection is ever made — build and test this path independently of sockets.

---

## 6. Suggested Repo Structure

```
shopright/
├── apps/
│   ├── customer-web/
│   ├── merchant-web/
│   ├── delivery-web/
│   └── admin-web/
├── server/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── shops/
│   │   │   ├── products/
│   │   │   ├── orders/
│   │   │   ├── pricing/          # pricing engine — single source of truth
│   │   │   ├── serviceability/   # Haversine logic
│   │   │   ├── assignment/       # delivery partner auto-assign
│   │   │   ├── payments/         # PaymentProvider interface + COD + Razorpay-test impl
│   │   │   └── realtime/         # Socket.IO gateway
│   │   ├── stateMachine/orderStateMachine.ts
│   │   └── prisma/schema.prisma
│   └── test/
└── packages/
    └── shared-types/   # order status enum, DTOs shared FE/BE
```

A shared `shared-types` package (or generated types from Prisma/Zod) prevents the order-status enum and DTO shapes from drifting between the four frontends and the backend.

---

## 7. Non-Functional Notes (MVP scale)
- Target scale: single-city, hundreds of shops, low thousands of orders/day — do not over-engineer for national scale.
- Haversine is sufficient; no need for a routing engine or real road-distance API this semester.
- WebSocket connections: one per active session per app; Socket.IO's built-in reconnection is enough, no need for a custom presence system.

---

## 8. Out of Scope (Phase 1)
Matches the project document's deferred list exactly — do not build:
- Multi-stop route optimization / delivery batching
- Production payment gateway (stay in COD + sandbox mode)
- New categories or multi-city expansion
- Phase 0 live pilot operations tooling

These are documented in `05_DECISION_DOC.md` with rationale, in case they come up in a viva.
