# ShopRight — Technical Deep Dive

> **Repo**: `github.com/shrashtimaheshwari/ShopRight` · **Branch**: `main` · **Last stable**: `aa57106`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Database Schema](#4-database-schema)
5. [Data Flow](#5-data-flow)
6. [API Contract](#6-api-contract)
7. [Order State Machine](#7-order-state-machine)
8. [Pricing Engine](#8-pricing-engine)
9. [Payment System](#9-payment-system)
10. [Real-time System](#10-real-time-system)
11. [Security Architecture](#11-security-architecture)
12. [Shared Types Package](#12-shared-types-package)
13. [Testing Strategy](#13-testing-strategy)
14. [CI/CD Pipeline](#14-cicd-pipeline)
15. [Environment Variables](#15-environment-variables)
16. [Architectural Decision Records (ADRs)](#16-architectural-decision-records-adrs)
17. [Running Locally](#17-running-locally)

---

## 1. Project Overview

**ShopRight** is a hyperlocal marketplace that connects customers to nearby shops for on-demand delivery. The core idea is a four-sided platform:

| Actor | App | Port | Role |
|---|---|---|---|
| Customer | `customer-web` | 5173 | Browse shops, place and track orders, pay |
| Merchant | `merchant-web` | 5174 | Manage shop, catalog, and incoming orders |
| Delivery Partner | `delivery-web` | 5175 | Accept pickups, update delivery status |
| Admin | `admin-web` | 5176 | Approve/suspend shops, manage delivery fee rules |

The backend enforces a single source of truth for every business rule. The client never provides a price or total — the server computes everything authoritatively from the database, making price-tampering impossible by design.

**Key design principles:**
- **Zero client-price trust**: Zod `.strict()` schemas reject any price field sent from the client
- **Geography-first**: Shops define a `serviceRadiusKm`; Haversine distance gates every order
- **Atomic state machine**: Every order status transition goes through a single `executeOrderTransition()` function that enforces role, ownership, and legal state in one pass
- **Integer money**: All monetary values stored as paise (`Int`) — ₹1 = 100 paise — eliminating floating-point rounding errors entirely

---

## 2. Tech Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | 22.x | Runtime |
| **TypeScript** | 5.x | Language |
| **Express** | 4.x | HTTP framework |
| **Prisma** | 5.x | ORM + schema migrations |
| **PostgreSQL** | 16 | Primary relational database |
| **Socket.IO** | 4.x | Real-time bidirectional events |
| **Zod** | 3.x | Runtime schema validation and env parsing |
| **bcrypt** | — | Password hashing (cost factor 12) |
| **jsonwebtoken** | — | JWT access + refresh token generation/verification |
| **Helmet** | — | HTTP security headers |
| **CORS** | — | Origin allowlist enforcement |

### Frontend (all 4 apps share identical stack)
| Technology | Version | Purpose |
|---|---|---|
| **React** | 18.x | UI framework |
| **Vite** | 6.x | Dev server + bundler |
| **TypeScript** | 5.x | Language |
| **Tailwind CSS** | 3.x | Utility-first styling |
| **React Router** | 6.x | Client-side routing |
| **Socket.IO Client** | 4.x | Real-time updates |

### Shared / Infrastructure
| Technology | Purpose |
|---|---|
| **npm workspaces** | Monorepo dependency management |
| **`@shopright/shared-types`** | Shared enums, DTOs, API contracts across all packages |
| **Vitest** | Test runner |
| **Supertest** | HTTP integration testing |
| **GitHub Actions** | CI pipeline (lint, typecheck, test, build) |
| **Docker Compose** | Local PostgreSQL 16 + (optional) YouPI-PG |
| **YouPI-PG** | Self-hosted UPI QR payment gateway |
| **concurrently** | Parallel dev server launcher |

---

## 3. Monorepo Structure

```
shop-right/
├── package.json              # Root: npm workspaces, dev scripts, pretypecheck/pretest hooks
├── tsconfig.base.json        # Base TS config (strict, ESNext, ESM)
├── docker-compose.yml        # postgres:16-alpine + (optional) youpi-pg service
├── .env / .env.example       # Root env vars for server
│
├── packages/
│   └── shared-types/         # @shopright/shared-types (ESM library)
│       ├── src/
│       │   ├── enums.ts      # Role, OrderStatus, PaymentMethod, PaymentStatus, ShopStatus
│       │   ├── models.ts     # DTO interfaces (UserDto, OrderDto, PaymentDto, …)
│       │   ├── api.ts        # ApiResponse<T>, ApiErrorCode, request/response shapes
│       │   └── index.ts      # Barrel re-export
│       ├── package.json      # name: @shopright/shared-types, type: module, main: dist/index.js
│       └── tsconfig.json
│
├── apps/
│   ├── customer-web/         # :5173 — Customer SPA
│   │   └── src/
│   │       ├── api/client.ts               # Axios instance → http://localhost:3001/api/v1
│   │       ├── context/AuthContext.tsx     # JWT state + refresh logic
│   │       ├── context/CartContext.tsx     # In-memory cart (productId → quantity)
│   │       └── pages/
│   │           ├── NearbyShopsPage.tsx     # Geolocation → GET /shops/nearby
│   │           ├── ShopCatalogPage.tsx     # GET /shops/:id/products
│   │           ├── CheckoutPage.tsx        # Place order + choose payment method
│   │           ├── OrderTrackingPage.tsx   # Live status via Socket.IO + payment card
│   │           └── OrderHistoryPage.tsx    # GET /orders (customer's list)
│   │
│   ├── merchant-web/         # :5174 — Shopkeeper SPA
│   │   └── src/
│   │       ├── api/client.ts               # → http://localhost:3001/api/v1
│   │       └── context/AuthContext.tsx
│   │       └── App.tsx                     # Order queue + product management
│   │
│   ├── delivery-web/         # :5175 — Delivery partner SPA
│   │   └── src/
│   │       ├── api/client.ts               # → http://localhost:3001/api/v1
│   │       └── App.tsx                     # Available orders + pickup/deliver actions
│   │
│   └── admin-web/            # :5176 — Admin SPA
│       └── src/
│           ├── api/client.ts               # → http://localhost:3001/api/v1
│           └── App.tsx                     # Shop approval, delivery fee rule editor
│
├── server/                   # Express API
│   ├── package.json          # name: server, type: module
│   ├── tsconfig.json
│   ├── vitest.config.ts      # Test configuration
│   ├── .env                  # Local override (gitignored)
│   │
│   ├── prisma/
│   │   ├── schema.prisma     # 11 models, 5 enums, PostgreSQL
│   │   └── migrations/
│   │       ├── 20260917080709_init/migration.sql
│   │       └── add_upi_qr_payment/migration.sql
│   │
│   └── src/
│       ├── index.ts          # HTTP server startup, Socket.IO init
│       ├── app.ts            # Express app factory (middleware stack, route mounting)
│       ├── prisma.ts         # Singleton PrismaClient export
│       │
│       ├── config/
│       │   └── env.ts        # Zod env schema validation, config object export
│       │
│       ├── middleware/
│       │   ├── asyncHandler.ts    # Wraps async route handlers, forwards errors
│       │   ├── errorHandler.ts    # Global AppError → JSON envelope
│       │   └── requestLogger.ts   # Sanitized request logging (excludes auth headers)
│       │
│       ├── stateMachine/
│       │   └── orderStateMachine.ts  # executeOrderTransition() — single source of truth
│       │
│       ├── modules/
│       │   ├── auth/          # Register, login, refresh, logout
│       │   ├── shops/         # Public shop/product browsing + merchant CRUD
│       │   ├── orders/        # Customer order placement + addresses
│       │   ├── payments/      # COD provider, YouPI UPI provider, webhook handler
│       │   ├── delivery/      # Delivery partner profile + order actions
│       │   ├── admin/         # Shop approval, DeliveryFeeRule management
│       │   ├── pricing/       # pricingEngine.ts — server-authoritative calculation
│       │   ├── serviceability/ # haversine.ts — distance + range check
│       │   ├── realtime/      # Socket.IO init + event emitters
│       │   └── assignment/    # Order → delivery partner assignment
│       │
│       ├── routes/
│       │   └── health.ts      # GET / and GET /api/v1/health
│       │
│       └── scripts/
│           ├── seedAdmin.ts   # Create initial admin user
│           ├── seedData.ts    # Populate shops, products, demo orders
│           └── testE2E.ts     # Manual E2E test script
│
└── docs/
    ├── 01_DESIGN_DOC.md       # Architecture and design decisions
    ├── 02_API_DOCUMENTATION.md
    ├── 03_SECURITY_DOC.md
    ├── 04_IMPLEMENTATION_PLAN.md
    ├── 05_DECISION_DOC.md     # ADRs
    └── 06_VERDICT_DOC.md
```

---

## 4. Database Schema

**Provider**: PostgreSQL 16  
**ORM**: Prisma 5 (Prisma Client JS, ESM)  
**All monetary values**: `Int` in paise (₹1 = 100)  
**Primary keys**: UUID v4 (`@default(uuid())`)

### Enums

```prisma
enum Role          { CUSTOMER | SHOPKEEPER | DELIVERY_PARTNER | ADMIN }
enum ShopStatus    { PENDING | APPROVED | REJECTED | SUSPENDED }
enum OrderStatus   { PLACED | ACCEPTED | PREPARING | READY | PICKED_UP | DELIVERED | CANCELLED | REJECTED }
enum PaymentMethod { COD | RAZORPAY_TEST | UPI_QR }
enum PaymentStatus { PENDING | COMPLETED | FAILED | REFUNDED }
```

### Models

#### `User`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID v4 |
| `name` | `String` | |
| `email` | `String` UNIQUE | Indexed |
| `phone` | `String` | |
| `passwordHash` | `String` | bcrypt, cost 12 |
| `role` | `Role` | Indexed |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | @updatedAt |

**Relations**: `addresses[]`, `shops[]` (as ShopOwner), `customerOrders[]`, `assignedDeliveries[]`, `deliveryProfile?`, `ratings[]`, `refreshTokens[]`

#### `RefreshToken`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID |
| `tokenHash` | `String` UNIQUE | SHA-256 of the actual token; never store raw token |
| `userId` | `String` FK | Cascade delete with User |
| `expiresAt` | `DateTime` | |
| `revokedAt` | `DateTime?` | NULL = active; non-NULL = revoked |
| `createdAt` | `DateTime` | |

**Indexes**: `userId`, `tokenHash`

#### `Address`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID |
| `userId` | `String` FK | Cascade delete |
| `label` | `String` | e.g. "Home", "Office" |
| `line1` | `String` | |
| `city` | `String` | |
| `lat` | `Float` | WGS84 latitude |
| `lng` | `Float` | WGS84 longitude |
| `isDefault` | `Boolean` | Default false |

**Relations**: `orders[]` (as DeliveryAddress)

#### `Shop`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID |
| `ownerId` | `String` FK | Restrict delete (shopkeeper must exist) |
| `name` | `String` | |
| `description` | `String` | `@db.Text` |
| `category` | `String` | e.g. "Grocery", "Pharmacy" |
| `lat` | `Float` | Shop's geographic location |
| `lng` | `Float` | |
| `address` | `String` | Human-readable address |
| `status` | `ShopStatus` | Default PENDING, indexed |
| `serviceRadiusKm` | `Float` | Default 5.0 — gate for order placement |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | @updatedAt |

**Relations**: `products[]`, `orders[]`, `ratings[]`  
**Indexes**: `ownerId`, `status`

#### `Product`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID |
| `shopId` | `String` FK | Cascade delete with Shop |
| `name` | `String` | |
| `description` | `String` | `@db.Text` |
| `price` | `Int` | **Paise**. E.g. `29900` = ₹299.00 |
| `unit` | `String` | e.g. "500g", "1 piece" |
| `imageUrl` | `String` | |
| `inStock` | `Boolean` | Default true, indexed |

**Indexes**: `shopId`, `inStock`

#### `Order`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID |
| `customerId` | `String` FK | Restrict delete |
| `shopId` | `String` FK | Restrict delete |
| `deliveryPartnerId` | `String?` FK | SetNull on partner delete |
| `deliveryAddressId` | `String` FK | Restrict delete |
| `status` | `OrderStatus` | Default PLACED, indexed |
| `subtotal` | `Int` | Server-computed, paise |
| `deliveryFee` | `Int` | Server-computed, paise |
| `total` | `Int` | Server-computed, paise |
| `idempotencyKey` | `String?` UNIQUE | Prevents duplicate order submissions |

**Relations**: `items[]`, `payment?`, `rating?`  
**Indexes**: `customerId`, `shopId`, `deliveryPartnerId`, `status`

#### `OrderItem`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID |
| `orderId` | `String` FK | Cascade delete |
| `productId` | `String` FK | Restrict delete |
| `quantity` | `Int` | Positive integer |
| `unitPriceAtOrder` | `Int` | **Price snapshot in paise** at time of order — immutable after creation |

**Indexes**: `orderId`, `productId`

#### `Payment`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID |
| `orderId` | `String` UNIQUE FK | 1:1 with Order, cascade delete |
| `method` | `PaymentMethod` | COD / UPI_QR / RAZORPAY_TEST |
| `status` | `PaymentStatus` | Default PENDING |
| `providerRef` | `String?` | Gateway session/transaction ID (e.g. YouPI payment ID) |
| `checkoutUrl` | `String?` | YouPI checkout URL (UPI_QR only) |
| `expiresAt` | `DateTime?` | YouPI session expiry (UPI_QR only) |

#### `DeliveryPartnerProfile`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID |
| `userId` | `String` UNIQUE FK | 1:1 with User, cascade delete |
| `currentLat` | `Float?` | Live GPS (optional) |
| `currentLng` | `Float?` | |
| `isAvailable` | `Boolean` | Default false, indexed |
| `vehicleType` | `String?` | e.g. "bike", "cycle" |

#### `Rating`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID |
| `orderId` | `String` UNIQUE | 1:1 — one rating per order |
| `customerId` | `String` FK | Restrict delete |
| `shopId` | `String` FK | Cascade delete with Shop |
| `stars` | `Int` | 1–5 |
| `comment` | `String?` | `@db.Text` |

#### `DeliveryFeeRule`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | UUID |
| `baseFee` | `Int` | Base fee in paise (e.g. 2000 = ₹20) |
| `perKmFee` | `Int` | Per-km fee in paise (e.g. 500 = ₹5/km) |
| `freeDeliveryThreshold` | `Int?` | Nullable — if subtotal ≥ this, delivery is free |
| `effectiveFrom` | `DateTime` | Indexed — latest rule by date is active |

**Rule selection**: The pricing engine fetches `findFirst({ orderBy: { effectiveFrom: 'desc' } })` — most recently created rule wins.

### Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Address : "has"
    User ||--o{ Shop : "owns"
    User ||--o{ Order : "places (customerOrders)"
    User ||--o{ Order : "delivers (assignedDeliveries)"
    User ||--o| DeliveryPartnerProfile : "has"
    User ||--o{ Rating : "writes"
    User ||--o{ RefreshToken : "has"

    Shop ||--o{ Product : "lists"
    Shop ||--o{ Order : "receives"
    Shop ||--o{ Rating : "receives"

    Order ||--|{ OrderItem : "contains"
    Order ||--o| Payment : "has"
    Order ||--o| Rating : "gets"
    Order }o--|| Address : "delivers to"

    OrderItem }o--|| Product : "references"
```

---

## 5. Data Flow

### 5.1 Order Placement (Primary Flow)

```mermaid
sequenceDiagram
    participant C as Customer Browser
    participant API as Express API :3001
    participant DB as PostgreSQL
    participant SK as Merchant Browser
    participant DP as Delivery Browser

    C->>API: POST /api/v1/orders<br/>{shopId, addressId, items:[{productId, qty}], paymentMethod}
    API->>DB: Fetch Shop (status, lat, lng, serviceRadiusKm)
    API->>DB: Fetch Products by ID
    Note over API: pricingEngine.calculateOrderPricing()<br/>1. Validate shop=APPROVED<br/>2. Haversine distance ≤ serviceRadiusKm<br/>3. All products inStock, belong to shop<br/>4. Compute subtotal, deliveryFee, total (paise)<br/>5. Snapshot unitPriceAtOrder per item
    API->>DB: prisma.$transaction — create Order + OrderItems + Payment
    API-->>C: 201 { orderId, subtotal, deliveryFee, total, payment }
    API->>SK: Socket.IO → shop:{shopId} emit order:status_changed (PLACED)
    
    SK->>API: PATCH /api/v1/orders/:id/status {event: "ACCEPT"}
    API->>DB: Fetch order (status, shopOwnerId)
    Note over API: executeOrderTransition()<br/>Role=SHOPKEEPER ✓<br/>From=PLACED → To=ACCEPTED ✓<br/>actorId === shopOwnerId ✓
    API->>DB: UPDATE order status=ACCEPTED
    API-->>SK: 200
    API->>C: Socket.IO → order:{orderId} emit order:status_changed (ACCEPTED)

    SK->>API: PATCH … {event: "START_PREPARING"} → PREPARING
    SK->>API: PATCH … {event: "MARK_READY"} → READY
    API->>DP: Socket.IO → available delivery partners notified

    DP->>API: PATCH /api/v1/delivery/orders/:id/assign (self-assignment)
    DP->>API: PATCH … {event: "PICKUP"} → PICKED_UP
    DP->>API: PATCH … {event: "DELIVER"} → DELIVERED
    API->>C: Socket.IO → order:{orderId} emit order:status_changed (DELIVERED)
```

### 5.2 Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant API as Express API
    participant DB as PostgreSQL

    C->>API: POST /api/v1/auth/register {name,email,phone,password,role}
    API->>DB: bcrypt.hash(password, 12) → store passwordHash
    API-->>C: 201 {accessToken, refreshToken}

    C->>API: POST /api/v1/auth/login {email, password}
    API->>DB: find User by email
    API->>API: bcrypt.compare(password, passwordHash)
    API->>DB: SHA-256(refreshToken) → store RefreshToken row (expiresAt +7d)
    API-->>C: 200 {accessToken (15m), refreshToken (7d)}

    Note over C: accessToken expires
    C->>API: POST /api/v1/auth/refresh {refreshToken}
    API->>DB: find RefreshToken by SHA-256(token), check revokedAt=null, expiresAt > now
    API->>DB: UPDATE revokedAt=now (token rotation — old token is invalidated)
    API->>DB: INSERT new RefreshToken
    API-->>C: 200 {accessToken, refreshToken}

    C->>API: POST /api/v1/auth/logout {refreshToken}
    API->>DB: UPDATE RefreshToken SET revokedAt=now
    API-->>C: 200 {success: true}
```

### 5.3 YouPI UPI Payment Flow

```mermaid
sequenceDiagram
    participant C as Customer
    participant API as Express API
    participant YouPI as YouPI-PG Gateway
    participant DB as PostgreSQL

    C->>API: POST /api/v1/orders/:id/pay {method: "UPI_QR"}
    API->>API: Verify: order.customerId === JWT sub
    API->>API: Verify: payment.status ≠ COMPLETED
    API->>YouPI: POST /api/v1/payments {amount, currency:"INR", orderId}
    YouPI-->>API: {id, checkoutUrl, expiresAt}
    API->>DB: Payment.upsert {method:UPI_QR, status:PENDING, providerRef:id, checkoutUrl, expiresAt}
    API-->>C: 200 {payment: {checkoutUrl, expiresAt, status:PENDING}}

    C->>YouPI: Opens checkoutUrl (UPI QR page in new tab)
    C->>C: Scans QR, pays via UPI

    YouPI->>API: POST /api/v1/payments/webhook/youpi<br/>Header: x-youpi-signature: sha256=<hmac>
    Note over API: express.raw() buffers body before express.json()<br/>verifyYoupiWebhookSignature(rawBody, signature)<br/>HMAC-SHA256 + crypto.timingSafeEqual
    
    alt event = payment.reconciled
        API->>DB: UPDATE Payment SET status=COMPLETED (transaction)
        API->>C: Socket.IO emit payment status update
    else event = payment.observed_success
        Note over API: Bank credit seen, not yet settled — keep PENDING, log only
    else event = payment.failed or payment.expired
        API->>DB: UPDATE Payment SET status=FAILED
    end
    API-->>YouPI: 200 {received: true}
```

---

## 6. API Contract

All endpoints are served at both `/api/v1/<path>` and `/<path>` (legacy). JSON envelope:

```json
{ "success": true, "data": <payload> }
{ "success": false, "error": { "code": "ERROR_CODE", "message": "...", "details": {} } }
```

Auth header: `Authorization: Bearer <accessToken>`

### Auth (`/api/v1/auth`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create account; returns token pair |
| POST | `/login` | — | Returns token pair |
| POST | `/refresh` | — | Rotate refresh token; returns new pair |
| POST | `/logout` | Bearer | Revoke refresh token |
| GET | `/me` | Bearer | Current user profile |

### Shops & Products (`/api/v1/shops`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/nearby?lat=&lng=` | — | Shops within their `serviceRadiusKm` of the given coordinate |
| GET | `/:id` | — | Single shop detail |
| GET | `/:id/products` | — | Product catalog for a shop |

### Addresses (`/api/v1/addresses`)
| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/` | Bearer | CUSTOMER — own addresses |
| POST | `/` | Bearer | CUSTOMER — create address |
| PATCH | `/:id` | Bearer | CUSTOMER — update address |
| DELETE | `/:id` | Bearer | CUSTOMER — delete address |

### Orders (`/api/v1/orders`)
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/` | Bearer | CUSTOMER | Place order (triggers pricing engine) |
| GET | `/` | Bearer | CUSTOMER | Own order history |
| GET | `/:id` | Bearer | Any | Get single order (ownership enforced) |
| PATCH | `/:id/status` | Bearer | SHOPKEEPER/DELIVERY/ADMIN | Trigger state machine event |
| POST | `/:id/pay` | Bearer | CUSTOMER | Initiate or update payment |

### Merchant (`/api/v1/merchant`)
| Method | Path | Auth | Role |
|---|---|---|---|
| POST | `/shops` | Bearer | SHOPKEEPER — create shop |
| GET | `/shops` | Bearer | SHOPKEEPER — own shops |
| PATCH | `/shops/:id` | Bearer | SHOPKEEPER — update shop |
| POST | `/shops/:id/products` | Bearer | SHOPKEEPER — add product |
| PATCH | `/products/:id` | Bearer | SHOPKEEPER — update product |
| DELETE | `/products/:id` | Bearer | SHOPKEEPER — delete product |
| GET | `/orders` | Bearer | SHOPKEEPER — incoming orders |

### Delivery (`/api/v1/delivery`)
| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/profile` | Bearer | DELIVERY_PARTNER |
| PATCH | `/profile` | Bearer | DELIVERY_PARTNER — update availability/GPS |
| GET | `/orders` | Bearer | DELIVERY_PARTNER — available/assigned orders |
| PATCH | `/orders/:id/assign` | Bearer | DELIVERY_PARTNER — self-assign |

### Admin (`/api/v1/admin`)
| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/shops` | Bearer | ADMIN — all shops |
| PATCH | `/shops/:id/status` | Bearer | ADMIN — approve/reject/suspend |
| GET | `/users` | Bearer | ADMIN — all users |
| GET | `/delivery-fee-rules` | Bearer | ADMIN — fee rule history |
| POST | `/delivery-fee-rules` | Bearer | ADMIN — create new rule (becomes active) |

### Payments (`/api/v1/payments`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/webhook/youpi` | HMAC signature | YouPI gateway webhook (raw body) |

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/` or `/api/v1/health` | `{status:"ok", timestamp}` |

---

## 7. Order State Machine

The single function `executeOrderTransition(ctx: OrderTransitionContext): OrderStatus` in [`server/src/stateMachine/orderStateMachine.ts`](file:///c:/projects/shop-right/server/src/stateMachine/orderStateMachine.ts) is the **only place** order status can change. It performs three sequential checks:

1. **Role gate**: Is `actorRole` in the event's `allowedRoles`? → 403 `FORBIDDEN_ROLE`
2. **State legality**: Is `currentStatus` in the event's `from[]`? → 409 `INVALID_STATE_TRANSITION`
3. **Ownership/assignment**: Is `actorId` the right person for this event? → 403 `FORBIDDEN_RESOURCE`

### Transition Table

```mermaid
stateDiagram-v2
    [*] --> PLACED : POST /orders (CUSTOMER)

    PLACED --> ACCEPTED : ACCEPT (SHOPKEEPER — owner)
    PLACED --> REJECTED : REJECT (SHOPKEEPER — owner)
    PLACED --> CANCELLED : CANCEL (CUSTOMER — own / ADMIN)

    ACCEPTED --> PREPARING : START_PREPARING (SHOPKEEPER — owner)
    ACCEPTED --> CANCELLED : CANCEL (CUSTOMER — own / ADMIN)

    PREPARING --> READY : MARK_READY (SHOPKEEPER — owner)
    PREPARING --> CANCELLED : CANCEL (CUSTOMER — own / ADMIN)

    READY --> PICKED_UP : PICKUP (DELIVERY_PARTNER — assigned only)

    PICKED_UP --> DELIVERED : DELIVER (DELIVERY_PARTNER — assigned only)

    DELIVERED --> [*]
    CANCELLED --> [*]
    REJECTED --> [*]
```

| Event | From | To | Allowed Roles | Ownership Rule |
|---|---|---|---|---|
| `ACCEPT` | PLACED | ACCEPTED | SHOPKEEPER | `actorId === shopOwnerId` |
| `REJECT` | PLACED | REJECTED | SHOPKEEPER | `actorId === shopOwnerId` |
| `START_PREPARING` | ACCEPTED | PREPARING | SHOPKEEPER | `actorId === shopOwnerId` |
| `MARK_READY` | PREPARING | READY | SHOPKEEPER | `actorId === shopOwnerId` |
| `PICKUP` | READY | PICKED_UP | DELIVERY_PARTNER | `actorId === assignedPartnerId` |
| `DELIVER` | PICKED_UP | DELIVERED | DELIVERY_PARTNER | `actorId === assignedPartnerId` |
| `CANCEL` | PLACED/ACCEPTED/PREPARING | CANCELLED | CUSTOMER, ADMIN | CUSTOMER: `actorId === customerId`; ADMIN: unrestricted |

---

## 8. Pricing Engine

**File**: [`server/src/modules/pricing/pricingEngine.ts`](file:///c:/projects/shop-right/server/src/modules/pricing/pricingEngine.ts)

The function `calculateOrderPricing()` is called during `POST /orders` and is the **only source of prices** in the system. The client body schema uses `.strict()` to reject any price/total field that the client might send.

### Steps (in order)

1. **Shop approval check** — `shop.status !== APPROVED` → 403 `SHOP_NOT_APPROVED`
2. **Serviceability check** — `Haversine(shop, customer) > shop.serviceRadiusKm` → 422 `SHOP_OUT_OF_RANGE`
3. **Items validation** — empty list → 400; non-integer quantity → 400; product not found → 404; product belongs to a different shop → 400 (prevents multi-shop cart injection)
4. **Stock check** — `product.inStock === false` → 422 `PRODUCT_OUT_OF_STOCK`
5. **Subtotal** — `Σ(product.price × quantity)` — all from DB
6. **Price snapshot** — Each `unitPriceAtOrder = product.price` stored in `OrderItem` immutably
7. **Delivery fee**:
   - Fetch active `DeliveryFeeRule` (latest by `effectiveFrom`)
   - If `subtotal ≥ freeDeliveryThreshold` → `deliveryFee = 0`
   - Else `deliveryFee = baseFee + Math.round(distanceKm × perKmFee)`
8. **Total** — `subtotal + deliveryFee`

### Haversine Formula

**File**: [`server/src/modules/serviceability/haversine.ts`](file:///c:/projects/shop-right/server/src/modules/serviceability/haversine.ts)

```
R = 6371.0 km (Earth radius)
dLat = lat2 - lat1  (radians)
dLng = lng2 - lng1  (radians)
a = sin²(dLat/2) + cos(lat1)·cos(lat2)·sin²(dLng/2)
c = 2·atan2(√a, √(1-a))
d = R·c  (rounded to 2 decimal places)
```

---

## 9. Payment System

### Architecture

The payment system uses a **provider pattern** with a shared interface:

```typescript
interface PaymentProvider {
  method: PaymentMethod;
  createPayment(orderId: string, amountPaise: number): Promise<PaymentInitiationResult>;
  verifyPayment(orderId: string, payload?: unknown): Promise<boolean>;
}
```

`getPaymentProvider(method)` dispatches to the correct implementation.

### COD Provider

**File**: `server/src/modules/payments/codProvider.ts`

- `createPayment()` → returns `{ status: PENDING }` immediately (no external call)
- Delivery partner marks payment collected when delivering (domain business rule, not a separate API call in current implementation)
- Payment stays `PENDING` until delivery confirmation

### YouPI UPI Provider

**File**: [`server/src/modules/payments/youpiProvider.ts`](file:///c:/projects/shop-right/server/src/modules/payments/youpiProvider.ts)

**Dev mode** (triggered when `YOUPI_API_KEY === 'dev_youpi_api_key'` or `NODE_ENV === 'test'`):
- Returns a mock session `{ providerRef: "mock-session-<orderId[0:8]>", checkoutUrl: "https://pay.dev.local/...", expiresAt: now+15min }` with no HTTP calls
- `verifyPayment()` returns `true` for any non-empty providerRef

**Production mode**:
- `createPayment()` → `POST {YOUPI_API_URL}/api/v1/payments` with `x-api-key` header
  - Body: `{ amount (paise), currency: "INR", orderId, customerDetails }`
  - Response: `{ id, checkoutUrl, expiresAt }` → stored to `Payment.providerRef`, `.checkoutUrl`, `.expiresAt`
- Returns `{ status: PENDING, providerRef: id, checkoutUrl, expiresAt }`

### Webhook Handler

**File**: [`server/src/modules/payments/paymentsController.ts`](file:///c:/projects/shop-right/server/src/modules/payments/paymentsController.ts)

**Middleware order** (critical): `express.raw({ type: 'application/json' })` is applied to `/payments/webhook/youpi` **before** `express.json()` in `app.ts`. This preserves the raw `Buffer` for HMAC verification.

**HMAC verification** (`verifyYoupiWebhookSignature`):
1. Extract `x-youpi-signature: sha256=<hex>` header
2. Compute `HMAC-SHA256(rawBody, YOUPI_WEBHOOK_SECRET).digest('hex')`
3. Compare using `crypto.timingSafeEqual()` (prevents timing attacks)
4. Return 401 on mismatch

**Event mapping**:

| YouPI Event | Action |
|---|---|
| `payment.observed_success` | Log only — bank credit seen but not yet reconciled; keep `PENDING` (intentional — avoids premature success) |
| `payment.reconciled` | `UPDATE Payment SET status=COMPLETED` in a Prisma transaction + Socket.IO emit |
| `payment.failed` | `UPDATE Payment SET status=FAILED` |
| `payment.expired` | `UPDATE Payment SET status=FAILED` |
| Unknown event | Log + 200 acknowledge (YouPI won't retry unknown events) |

Unknown `providerRef`: always respond `200 { received: true }` to prevent gateway retry storms.

---

## 10. Real-time System

**File**: [`server/src/modules/realtime/socketServer.ts`](file:///c:/projects/shop-right/server/src/modules/realtime/socketServer.ts)

Socket.IO is initialized once from `server/src/index.ts` via `initSocketIO(httpServer)`. It shares the same HTTP server as Express (no separate port).

### Room Model

| Room | Subscribers | Events received |
|---|---|---|
| `order:<orderId>` | Customer tracking an order | `order:status_changed` |
| `shop:<shopId>` | Merchant's order queue | `order:status_changed` |

Clients join/leave rooms by emitting:
- `join:order_room` / `leave:order_room` with `orderId`
- `join:shop_room` / `leave:shop_room` with `shopId`

### Events

| Event | Direction | Payload |
|---|---|---|
| `order:status_changed` | Server → Client | `{ orderId, shopId, status, updatedAt }` |
| `join:order_room` | Client → Server | `orderId` |
| `leave:order_room` | Client → Server | `orderId` |
| `join:shop_room` | Client → Server | `shopId` |
| `leave:shop_room` | Client → Server | `shopId` |

`emitOrderStatusChanged()` broadcasts to both `order:<orderId>` and `shop:<shopId>` rooms simultaneously, ensuring the merchant's order queue updates live as well as the customer's tracking page.

**CORS**: Socket.IO uses the same `corsOriginsList` derived from `CORS_ORIGINS` env var.

---

## 11. Security Architecture

### Threat Model & Mitigations

#### Price Manipulation
- **Threat**: Client sends a fake low price in the order body
- **Mitigation**: Order placement Zod schema uses `.strict()` — any unexpected field (including `price`, `subtotal`, `total`) is rejected with 400. All prices are computed server-side from DB records.

#### Authentication
- **Access tokens**: JWT, 15-minute expiry, signed with `JWT_ACCESS_SECRET`
- **Refresh tokens**: 7-day expiry. The raw token is **never stored** — only `SHA-256(token)` is stored in `RefreshToken.tokenHash`. On refresh, the old token is immediately revoked (`revokedAt = now()`), preventing token reuse.
- **Password hashing**: bcrypt with cost factor 12 (balances security and login latency)

#### Authorization (3-layer check on every protected route)
1. **Authentication middleware** (`authMiddleware.ts`): Validates JWT signature and expiry; sets `req.user = { sub, role }`
2. **Role gate**: Each router checks `req.user.role` against allowed roles for that endpoint
3. **Resource ownership**: Business logic (or state machine) verifies `actorId === ownerId/customerId/assignedPartnerId`

#### CORS
- Strict allowlist: `config.corsOriginsList` (parsed from `CORS_ORIGINS` env var)
- In `test` environment only, all origins are allowed
- `credentials: true` for cookie support

#### HTTP Security Headers
- `helmet()` applied as the first middleware, sets:
  - `Content-Security-Policy`
  - `X-Frame-Options: SAMEORIGIN`
  - `X-Content-Type-Options: nosniff`
  - `Strict-Transport-Security` (HSTS)

#### SQL Injection
- 100% parameterized queries via Prisma Client — no raw string interpolation in production code

#### Webhook Security
- Raw body buffered before JSON parsing (necessary for HMAC over exact bytes)
- HMAC-SHA256 with `crypto.timingSafeEqual` (constant-time comparison)
- Always returns `200` to prevent exponential retry backoff storms on legitimate unknown events

#### Multi-Shop Cart Injection
- Pricing engine verifies `product.shopId === order.shopId` for every item → prevents mixing products from different shops in one order

---

## 12. Shared Types Package

**Package**: `@shopright/shared-types`  
**Location**: `packages/shared-types/`  
**Type**: ESM library (`"type": "module"`)  
**Output**: `dist/index.js` + `dist/index.d.ts`

### Why It Exists

The backend (server), all 4 frontend apps, and the CI pipeline need consistent type definitions. Without a shared package, enums and DTO shapes would drift between the server TypeScript and the client TypeScript, causing silent type mismatches.

### Build Requirement

`dist/` is gitignored. Before running typecheck or tests:
- **Locally**: `npm run build --workspace=packages/shared-types`
- **Root hooks**: `pretypecheck` and `pretest` in root `package.json` auto-build it
- **CI**: Explicit "Build shared packages" step runs before typecheck

### Exports

**`enums.ts`** — String enums (compatible with Prisma):
```typescript
Role, ShopStatus, OrderStatus, PaymentMethod, PaymentStatus
```

**`models.ts`** — DTO interfaces used across API responses:
```typescript
UserDto, ShopDto, ProductDto, OrderDto, OrderItemDto,
PaymentDto, AddressDto, DeliveryPartnerProfileDto, RatingDto
```
`PaymentDto` includes: `method`, `status`, `providerRef?`, `checkoutUrl?`, `expiresAt?`

**`api.ts`** — API contract shapes:
```typescript
ApiResponse<T>        // { success: true, data: T }
ApiErrorResponse      // { success: false, error: { code, message, details? } }
ApiErrorCode          // All typed error codes (UNAUTHORIZED, NOT_FOUND, SHOP_OUT_OF_RANGE, …)
PlaceOrderRequest     // Client-side order body (no price fields)
```

---

## 13. Testing Strategy

**Runner**: Vitest  
**HTTP testing**: Supertest  
**Location**: `server/tests/`  
**Count**: 134+ tests across 9 test files

### Test Files

| File | Type | Focus |
|---|---|---|
| `health.test.ts` | Unit | Health endpoint, server boot |
| `auth.test.ts` | Integration | Register, login, refresh, logout, /me |
| `customerOrders.test.ts` | Integration | Order placement, pricing, idempotency, cancel |
| `merchantOrders.test.ts` | Integration | Accept, prepare, mark ready, reject |
| `deliveryPartner.test.ts` | Integration | Profile, assign, pickup, deliver |
| `admin.test.ts` | Integration | Shop approval, delivery fee rules |
| `payments.test.ts` | Integration | COD + UPI_QR initiation, YouPI webhook (all 4 events), signature rejection |
| `orderStateMachine.test.ts` | Unit | All valid transitions, all invalid transitions, role and ownership failures |
| `pricingEngine.test.ts` | Unit | Subtotal, delivery fee, free delivery threshold, out-of-range, out-of-stock |
| `serviceability.test.ts` | Unit | Haversine distance accuracy, `isWithinRange` |

### Integration Test Pattern

Each integration test file:
1. `beforeAll`: Creates a fresh Express app via `createApp()`, binds Supertest
2. Each test suite (`describe`) creates its own test users, shops, products via the API
3. Tests are **not stateless** per-file but create fresh entities to avoid interference
4. The DB is a real PostgreSQL 16 instance (local or CI service)
5. YouPI provider auto-detects dev mode (`YOUPI_API_KEY=dev_youpi_api_key`) — no real HTTP calls

### Unit Test Pattern

Pure function tests with no DB:
- State machine: exhaustive coverage of all 7 events × all invalid source states × wrong roles × wrong actor IDs
- Pricing engine: boundary conditions (threshold exactly at, threshold just below, out-of-range, out-of-stock, empty items)
- Haversine: known geographic coordinate pairs verified against published values

---

## 14. CI/CD Pipeline

**File**: [`.github/workflows/ci.yml`](file:///c:/projects/shop-right/.github/workflows/ci.yml)  
**Trigger**: Push or PR to `main` / `master`  
**Runner**: `ubuntu-latest`  
**Node**: 22.x

### Steps (sequential, fail-fast)

```mermaid
flowchart LR
    A["actions/checkout@v4"] --> B["setup-node@v4<br/>Node 22, cache: npm"]
    B --> C["npm ci"]
    C --> D["npm run build<br/>--workspace=packages/shared-types"]
    D --> E["npx prisma generate<br/>(server workspace)"]
    E --> F["npx prisma migrate deploy<br/>against shopright_test DB"]
    F --> G["npm run typecheck<br/>(all workspaces)"]
    G --> H["npm run lint<br/>(all workspaces)"]
    H --> I["npm run test<br/>(server only — Vitest)"]
    I --> J["npm run build<br/>(all workspaces)"]
```

### PostgreSQL Service Container

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: shopright_test }
    ports: ["5432:5432"]
    options: --health-cmd pg_isready --health-interval 10s --health-retries 5
```

### Test Environment Secrets (injected as env)

```
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shopright_test?schema=public
JWT_ACCESS_SECRET=test_jwt_access_secret_12345
JWT_REFRESH_SECRET=test_jwt_refresh_secret_67890
PORT=3001
YOUPI_API_URL=http://localhost:6100
YOUPI_API_KEY=dev_youpi_api_key         ← triggers mock mode (no real HTTP)
YOUPI_WEBHOOK_SECRET=dev_youpi_webhook_secret_32chars_min
```

---

## 15. Environment Variables

All parsed and validated by Zod schema in [`server/src/config/env.ts`](file:///c:/projects/shop-right/server/src/config/env.ts). Process crash on invalid config (fail-fast).

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `PORT` | `3001` | API server port (3001 chosen — 4000 blocked by Windows Hyper-V NAT) |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/shopright?schema=public` | Prisma connection string |
| `JWT_ACCESS_SECRET` | `dev_jwt_access_secret_…` | **Change in production** — signs access tokens |
| `JWT_REFRESH_SECRET` | `dev_jwt_refresh_secret_…` | **Change in production** — signs refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `CORS_ORIGINS` | `http://localhost:5173,…5176` | Comma-separated allowlist |
| `GOOGLE_CLIENT_ID` | _(OAuth client ID)_ | Google OAuth integration (future) |
| `YOUPI_API_URL` | `http://localhost:6100` | YouPI-PG gateway base URL |
| `YOUPI_API_KEY` | `dev_youpi_api_key` | Gateway API key — **`dev_youpi_api_key` triggers mock mode** |
| `YOUPI_WEBHOOK_SECRET` | `dev_youpi_webhook_secret_32chars_min` | Minimum 16 chars; used for HMAC-SHA256 webhook verification |

> [!CAUTION]
> Never deploy with any default secret values. The Zod schema's `default()` values are dev-only conveniences. All `*_SECRET` and `*_API_KEY` vars must be strong random values in production.

---

## 16. Architectural Decision Records (ADRs)

| ADR | Decision | Rationale |
|---|---|---|
| **ADR-001** | Server-authoritative pricing (Zod `.strict()`) | Prevents any client-side price tampering; single source of truth |
| **ADR-002** | Integer paise for all money | Eliminates floating-point rounding errors; ₹1 = 100 paise |
| **ADR-003** | npm workspaces monorepo | Single repo, shared `node_modules`, atomic commits across frontend/backend |
| **ADR-004** | Haversine for serviceability | Simple, accurate for city-scale distances; no external map API dependency |
| **ADR-005** | JWT + revocable refresh tokens (SHA-256 hash stored) | Raw tokens never in DB; immediate revocation on logout/refresh |
| **ADR-006** | Single shared `executeOrderTransition()` | All order status logic in one place; impossible to bypass role/ownership checks |
| **ADR-007** | `@shopright/shared-types` package | Prevents enum/DTO drift between server and all 4 frontends |
| **ADR-008** | Socket.IO on same HTTP port | No separate WebSocket server; simpler deployment and CORS |
| **ADR-009** | YouPI-PG for UPI payments | Self-hosted UPI gateway; dev mode avoids real HTTP in tests |
| **ADR-010** | `express.raw()` before `express.json()` for webhook | HMAC must compute over raw bytes; JSON parse after signature verification |
| **ADR-011** | `payment.observed_success` → keep PENDING | Bank credit is not guaranteed settlement; only `payment.reconciled` is authoritative |

---

## 17. Running Locally

### Prerequisites

- Node.js 22+
- Docker (for PostgreSQL)

### Setup

```bash
# 1. Install all dependencies
npm ci

# 2. Start PostgreSQL
npm run db:up        # docker compose up -d (postgres:16-alpine on :5432)

# 3. Build shared types (required before typecheck/tests)
npm run build --workspace=packages/shared-types

# 4. Generate Prisma client
npm run prisma:generate

# 5. Run migrations
npm run prisma:migrate

# 6. (Optional) Seed demo data
npm run seed:data

# 7. Start all services in parallel
npm run dev
```

### Service Ports

| Service | URL |
|---|---|
| API (Express + Socket.IO) | http://localhost:3001 |
| Customer Web | http://localhost:5173 |
| Merchant Web | http://localhost:5174 |
| Delivery Web | http://localhost:5175 |
| Admin Web | http://localhost:5176 |
| PostgreSQL | localhost:5432 |

### If Ports Are Stuck

```bash
npm run clean:ports   # Kills processes on 3001, 5173-5176 (Windows PowerShell)
```

> [!NOTE]
> Port 4000 is permanently unavailable on Windows machines with Hyper-V / WSL2 enabled — Windows dynamically reserves it. The API server uses 3001.

### Running Tests

```bash
# Requires running PostgreSQL (npm run db:up)
npm run test         # pretest hook builds shared-types first automatically
```

### Docker Compose

[`docker-compose.yml`](file:///c:/projects/shop-right/docker-compose.yml) defines:
- `postgres`: `postgres:16-alpine`, port 5432, volume `pgdata`

### Production Checklist

- [ ] Set all `*_SECRET` environment variables to strong random values (min 32 chars)
- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGINS` to your production domain(s) only
- [ ] Set `YOUPI_API_URL` and `YOUPI_API_KEY` to production YouPI credentials
- [ ] Set `YOUPI_WEBHOOK_SECRET` to a strong secret and configure it in YouPI dashboard
- [ ] Run `prisma migrate deploy` (not `migrate dev`) on the production DB
- [ ] Use a process manager (PM2 / systemd) or container orchestrator
- [ ] Enable HTTPS; HSTS is already set by Helmet
