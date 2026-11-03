# ShopRight — Hyperlocal Marketplace

<div align="center">

![ShopRight](https://img.shields.io/badge/ShopRight-Hyperlocal%20Marketplace-emerald?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**A production-grade, type-safe hyperlocal delivery marketplace with four distinct frontends sharing one battle-hardened backend.**

[Architecture](#architecture) · [Quick Start](#quick-start) · [API Reference](#api-reference) · [Testing](#testing) · [ADRs](#architecture-decision-records)

</div>

---

## Overview

ShopRight is a full-stack hyperlocal marketplace platform connecting customers, shopkeepers, and delivery partners within a configurable geographic radius. It is designed from first principles around four core security properties:

1. **Server-authoritative pricing** — clients never send prices, subtotals, fees, or totals. The backend recalculates everything from the database on every order.
2. **Single shared state machine** — all `Order.status` mutations flow through one module; no per-route status logic.
3. **Role + ownership checks on every resource mutation** — every route that touches a specific order, shop, or delivery verifies both role and ownership.
4. **Revocable refresh tokens** — SHA-256-hashed refresh tokens stored in the database with `revokedAt`, enabling instant token revocation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MONOREPO ROOT                               │
│                       (npm workspaces)                               │
│                                                                      │
│  apps/                    packages/              server/             │
│  ├─ customer-web (5173)  ├─ shared-types        ├─ Express + Prisma │
│  ├─ merchant-web (5174)  │   └─ enums/DTOs       ├─ PostgreSQL 16    │
│  ├─ delivery-web (5175)  │                       ├─ Socket.IO        │
│  └─ admin-web    (5176)  │                       └─ Vitest tests     │
└─────────────────────────────────────────────────────────────────────┘
```

```mermaid
flowchart TD
    subgraph Frontends
        CW["customer-web\n:5173 Emerald"]
        MW["merchant-web\n:5174 Orange"]
        DW["delivery-web\n:5175 Blue"]
        AW["admin-web\n:5176 Purple"]
    end

    subgraph Backend ["Express API :3001"]
        AUTH["Auth Module\n/api/v1/auth"]
        SHOPS["Shops Module\n/api/v1/shops"]
        ORDERS["Orders Module\n/api/v1/orders"]
        MERCHANT["Merchant Module\n/api/v1/merchant"]
        DELIVERY["Delivery Module\n/api/v1/delivery"]
        ADMIN["Admin Module\n/api/v1/admin"]
        SM["Shared Order\nState Machine"]
        PE["Pricing Engine\n(server-auth)"]
        IO["Socket.IO"]
    end

    subgraph Data
        PG[("PostgreSQL 16\nport 5432")]
    end

    CW --> AUTH
    CW --> SHOPS
    CW --> ORDERS
    MW --> AUTH
    MW --> MERCHANT
    DW --> AUTH
    DW --> DELIVERY
    AW --> AUTH
    AW --> ADMIN

    ORDERS --> PE
    ORDERS --> SM
    MERCHANT --> SM
    DELIVERY --> SM

    AUTH --> PG
    SHOPS --> PG
    ORDERS --> PG
    MERCHANT --> PG
    DELIVERY --> PG
    ADMIN --> PG

    SM --> IO
    IO -.->|"order:status_changed"| CW
    IO -.->|"order:status_changed"| MW
    IO -.->|"order:status_changed"| DW
```

### Request Flow — Place an Order

```mermaid
sequenceDiagram
    participant C as Customer App
    participant API as Express API
    participant PE as Pricing Engine
    participant DB as PostgreSQL

    C->>API: POST /api/v1/orders<br/>{shopId, deliveryAddressId, items:[{productId, qty}]}
    Note over C,API: ❌ No price/subtotal/total/fee in body
    API->>DB: Fetch shop, products, active fee rule
    API->>PE: calculateOrderPricing(shop, customer loc, items, fee rule)
    PE->>PE: Validate shop APPROVED
    PE->>PE: Check Haversine serviceability
    PE->>PE: Validate stock, ownership
    PE->>PE: Compute subtotal, deliveryFee, total (all paise)
    PE-->>API: { subtotal, deliveryFee, total, itemSnapshots }
    API->>DB: INSERT order + items + payment (atomic transaction)
    API-->>C: 201 { success: true, data: order }
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Backend Runtime** | Node.js 20 + TypeScript | Type safety end-to-end |
| **Backend Framework** | Express 4 | Mature, minimal, well-understood |
| **ORM** | Prisma 5 | Type-safe DB client, declarative migrations |
| **Database** | PostgreSQL 16 | ACID transactions, reliable |
| **Authentication** | JWT (access) + SHA-256 hashed refresh tokens | Stateless access + revocable sessions |
| **Password Hashing** | bcrypt, cost factor 12 | Security doc §2 |
| **Input Validation** | Zod | Runtime schema enforcement |
| **Realtime** | Socket.IO | Order status push to clients |
| **Frontend Framework** | React 18 + Vite | Fast builds, RSC-ready |
| **Styling** | Tailwind CSS 3 | Utility-first, dark mode |
| **Routing** | React Router 6 | Declarative SPA routing |
| **Monorepo** | npm workspaces | Zero-config hoisting |
| **Testing** | Vitest + Supertest | Fast, ESM-native |
| **CI** | GitHub Actions | Lint + typecheck + test on every push |

---

## Prerequisites

- **Node.js 20+** (`node --version` → `v20.x.x`)
- **npm 10+** (ships with Node 20)
- **Docker Desktop** (for PostgreSQL 16)
- **Git**

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-org/shop-right.git
cd shop-right

# 2. Install all workspace dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# Edit .env — ensure DATABASE_URL matches your Docker setup

# 4. Start PostgreSQL via Docker
docker compose up -d

# 5. Wait ~5 seconds for Postgres to be healthy, then run migrations
cd server
npx prisma migrate deploy
cd ..

# 6. Seed admin user (idempotent — safe to run multiple times)
npm run seed:admin

# 7. Seed demo data (shops, products, users)
npm run seed:data

# 8. Start all dev servers in parallel
npm run dev
```

### Dev Server Ports

| App | URL | Role | Theme |
|---|---|---|---|
| **API** | http://localhost:3001 | Backend | — |
| **Customer Web** | http://localhost:5173 | Customer | Emerald/Teal |
| **Merchant Web** | http://localhost:5174 | Shopkeeper | Orange/Amber |
| **Delivery Web** | http://localhost:5175 | Delivery Partner | Blue |
| **Admin Web** | http://localhost:5176 | Admin | Purple |

### Demo Accounts

All accounts use password: `Password123!`

| Role | Email |
|---|---|
| Admin | `admin@shopright.local` |
| Merchant | `merchant@shopright.local` |
| Customer | `customer@shopright.local` |
| Delivery Partner | `partner@shopright.local` |

---

## Monorepo Structure

```
shop-right/
├── .github/
│   └── workflows/
│       └── ci.yml                  # Lint + typecheck + test on PR
├── apps/
│   ├── customer-web/               # React 18 + Vite (port 5173)
│   │   └── src/
│   │       ├── api/client.ts       # Typed fetch wrapper
│   │       ├── context/
│   │       │   ├── AuthContext.tsx  # JWT auth state
│   │       │   └── CartContext.tsx  # Shopping cart
│   │       └── pages/
│   │           ├── NearbyShopsPage.tsx
│   │           ├── ShopCatalogPage.tsx
│   │           ├── CheckoutPage.tsx
│   │           ├── OrderTrackingPage.tsx
│   │           └── OrderHistoryPage.tsx
│   ├── merchant-web/               # React 18 + Vite (port 5174)
│   │   └── src/
│   │       ├── api/client.ts
│   │       ├── context/AuthContext.tsx
│   │       └── App.tsx             # Dashboard + Orders + Products + Register Shop
│   ├── delivery-web/               # React 18 + Vite (port 5175)
│   │   └── src/
│   │       ├── api/client.ts
│   │       ├── context/AuthContext.tsx
│   │       └── App.tsx             # Duty toggle + Order queue
│   └── admin-web/                  # React 18 + Vite (port 5176)
│       └── src/
│           ├── api/client.ts
│           ├── context/AuthContext.tsx
│           └── App.tsx             # Analytics + Shop approval + Fee rules
├── packages/
│   └── shared-types/               # ESM package — shared enums + DTOs
│       └── src/
│           ├── enums.ts            # Role, ShopStatus, OrderStatus, etc.
│           ├── models.ts           # All DTO interfaces
│           ├── api.ts              # ApiResponse<T>, ApiErrorCode
│           └── index.ts
├── server/
│   ├── prisma/
│   │   ├── schema.prisma           # 11 models, all migrations
│   │   └── migrations/
│   ├── src/
│   │   ├── app.ts                  # Express app factory
│   │   ├── index.ts                # HTTP + Socket.IO entrypoint
│   │   ├── prisma.ts               # Singleton Prisma client
│   │   ├── config/env.ts           # Zod-validated env
│   │   ├── middleware/
│   │   │   ├── asyncHandler.ts     # Async error forwarding (Express 4)
│   │   │   ├── errorHandler.ts     # AppError + envelope handler
│   │   │   └── requestLogger.ts    # Morgan (no PII)
│   │   ├── stateMachine/
│   │   │   └── orderStateMachine.ts  # THE shared state machine
│   │   ├── routes/health.ts
│   │   └── modules/
│   │       ├── auth/               # register, login, refresh, logout, me
│   │       ├── shops/              # getNearbyShops + merchant CRUD
│   │       ├── orders/             # place order, track, rate, cancel
│   │       ├── delivery/           # availability, location, pickup, deliver
│   │       ├── admin/              # shop moderation, fee rules, analytics
│   │       ├── pricing/            # server-authoritative pricing engine
│   │       ├── serviceability/     # Haversine distance calculator
│   │       ├── payments/           # COD provider (extensible interface)
│   │       └── realtime/           # Socket.IO server + typed events
│   ├── tests/                      # Vitest integration + unit tests
│   │   ├── health.test.ts
│   │   ├── auth.test.ts
│   │   ├── serviceability.test.ts
│   │   ├── pricingEngine.test.ts
│   │   ├── orderStateMachine.test.ts
│   │   ├── customerOrders.test.ts
│   │   ├── merchantOrders.test.ts
│   │   ├── deliveryPartner.test.ts
│   │   └── admin.test.ts
│   └── package.json
├── docker-compose.yml              # PostgreSQL 16
├── .env.example
├── .gitignore
├── tsconfig.base.json
└── package.json                    # Workspace root + scripts
```

---

## API Reference

All responses follow this envelope:

```json
// Success
{ "success": true, "data": <payload>, "meta": <pagination | null> }

// Error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable" } }
```

### Authentication (`/api/v1/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | None | Register new user (ADMIN role blocked) |
| `POST` | `/auth/login` | None | Login → access + refresh token |
| `POST` | `/auth/google` | None | Sign in / register via Google OAuth ID token |
| `POST` | `/auth/refresh` | None | Rotate refresh token |
| `POST` | `/auth/logout` | Bearer | Revoke refresh token |
| `GET` | `/auth/me` | Bearer | Current user profile |

**Google Sign-In body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIs...",
  "role": "CUSTOMER"
}
```
*Note: ADMIN self-registration via Google OAuth is blocked with `403 FORBIDDEN_ROLE` per Security Doc §4.*

**Register body:**
```json
{
  "name": "Alice Sharma",
  "email": "alice@example.com",
  "phone": "9876543210",
  "password": "Password123!",
  "role": "CUSTOMER"
}
```

**Login response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "raw-refresh-token",
    "user": { "id": "uuid", "name": "Alice", "email": "alice@example.com", "role": "CUSTOMER" }
  }
}
```

### Customer Shops (`/api/v1/shops`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/shops?lat=12.97&lng=77.59` | None | Nearby APPROVED shops sorted by distance |
| `GET` | `/shops/:shopId/products` | None | Products for a shop |

### Customer Orders (`/api/v1/orders`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/orders` | CUSTOMER | Place order (server computes all prices) |
| `GET` | `/orders` | CUSTOMER | Order history (paginated) |
| `GET` | `/orders/:id` | Owner/Admin | Full order details |
| `GET` | `/orders/:id/status` | Owner | Lightweight status poll |
| `POST` | `/orders/:id/rating` | CUSTOMER | Rate a DELIVERED order |
| `POST` | `/orders/:id/cancel` | CUSTOMER/ADMIN | Cancel a cancellable order |

**Place order body (ONLY these fields):**
```json
{
  "shopId": "uuid",
  "deliveryAddressId": "uuid",
  "items": [
    { "productId": "uuid", "quantity": 2 }
  ],
  "idempotencyKey": "optional-client-key"
}
```

> ⚠️ Any attempt to send `price`, `subtotal`, `deliveryFee`, or `total` in the body results in a `400 VALIDATION_ERROR`.

### Merchant (`/api/v1/merchant`) — requires `SHOPKEEPER` role

| Method | Path | Description |
|---|---|---|
| `POST` | `/merchant/shops` | Register shop (starts PENDING) |
| `GET` | `/merchant/shops` | My shops |
| `GET` | `/merchant/shops/:shopId/orders` | Order inbox (paginated, status filter) |
| `PATCH` | `/merchant/shops/:shopId/orders/:orderId/status` | Advance order state |
| `GET` | `/merchant/products?shopId=...` | List products |
| `POST` | `/merchant/products` | Create product |
| `PATCH` | `/merchant/products/:productId` | Update product |
| `PATCH` | `/merchant/products/:productId/stock` | Toggle inStock |

**Update order status body:**
```json
{ "event": "ACCEPT" }
// Valid events for shopkeepers: ACCEPT, REJECT, START_PREPARING, MARK_READY
```

### Delivery Partner (`/api/v1/delivery`) — requires `DELIVERY_PARTNER` role

| Method | Path | Description |
|---|---|---|
| `PATCH` | `/delivery/availability` | Toggle duty on/off + update location |
| `PATCH` | `/delivery/location` | Update GPS coordinates |
| `GET` | `/delivery/orders` | My assigned orders |
| `POST` | `/delivery/orders/:orderId/pickup` | READY → PICKED_UP |
| `POST` | `/delivery/orders/:orderId/deliver` | PICKED_UP → DELIVERED |

### Admin (`/api/v1/admin`) — requires `ADMIN` role

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/shops` | All shops (status filter) |
| `PATCH` | `/admin/shops/:shopId/approve` | Approve → APPROVED |
| `PATCH` | `/admin/shops/:shopId/reject` | Reject → REJECTED |
| `PATCH` | `/admin/shops/:shopId/suspend` | Suspend → SUSPENDED |
| `GET` | `/admin/orders` | All orders (paginated) |
| `POST` | `/admin/fee-rules` | Create new versioned fee rule |
| `GET` | `/admin/fee-rules` | List fee rules (newest first) |
| `GET` | `/admin/analytics` | System-wide metrics |

---

## Order State Machine

```mermaid
stateDiagram-v2
    [*] --> PLACED : Customer places order
    PLACED --> ACCEPTED : Shopkeeper ACCEPT
    PLACED --> REJECTED : Shopkeeper REJECT
    PLACED --> CANCELLED : Customer/Admin CANCEL
    ACCEPTED --> PREPARING : Shopkeeper START_PREPARING
    ACCEPTED --> CANCELLED : Customer/Admin CANCEL
    PREPARING --> READY : Shopkeeper MARK_READY
    PREPARING --> CANCELLED : Admin CANCEL
    READY --> PICKED_UP : Assigned Partner PICKUP
    PICKED_UP --> DELIVERED : Assigned Partner DELIVER
    REJECTED --> [*]
    CANCELLED --> [*]
    DELIVERED --> [*]
```

**Key rules:**
- All transitions go through `executeOrderTransition()` in `server/src/stateMachine/orderStateMachine.ts`
- Every event checks: ① valid current status → ② allowed role → ③ resource ownership
- Terminal states (`DELIVERED`, `CANCELLED`, `REJECTED`) cannot be transitioned from
- Auto-assignment: when shopkeeper calls MARK_READY, the nearest available delivery partner is auto-assigned (ADR-007)

---

## Database Schema

```mermaid
erDiagram
    User {
        uuid id PK
        string name
        string email UK
        string phone
        string passwordHash
        enum role
    }
    RefreshToken {
        uuid id PK
        string tokenHash UK
        string userId FK
        datetime expiresAt
        datetime revokedAt
    }
    Shop {
        uuid id PK
        string ownerId FK
        string name
        string category
        float lat
        float lng
        float serviceRadiusKm
        enum status
    }
    Product {
        uuid id PK
        string shopId FK
        string name
        int price
        string unit
        bool inStock
    }
    Order {
        uuid id PK
        string customerId FK
        string shopId FK
        string deliveryPartnerId FK
        string deliveryAddressId FK
        enum status
        int subtotal
        int deliveryFee
        int total
    }
    OrderItem {
        uuid id PK
        string orderId FK
        string productId FK
        int quantity
        int unitPriceAtOrder
    }
    Payment {
        uuid id PK
        string orderId FK
        enum method
        enum status
    }
    Rating {
        uuid id PK
        string orderId FK
        string customerId FK
        string shopId FK
        int stars
    }
    DeliveryPartnerProfile {
        uuid id PK
        string userId FK
        float currentLat
        float currentLng
        bool isAvailable
    }
    DeliveryFeeRule {
        uuid id PK
        int baseFee
        int perKmFee
        int freeDeliveryThreshold
        datetime effectiveFrom
    }
    Address {
        uuid id PK
        string userId FK
        string label
        float lat
        float lng
    }

    User ||--o{ RefreshToken : has
    User ||--o{ Shop : owns
    User ||--o{ Order : places
    User ||--o{ Order : delivers
    User ||--|| DeliveryPartnerProfile : profile
    User ||--o{ Rating : writes
    User ||--o{ Address : has
    Shop ||--o{ Product : has
    Shop ||--o{ Order : receives
    Shop ||--o{ Rating : receives
    Order ||--o{ OrderItem : contains
    Order ||--|| Payment : has
    Order ||--o| Rating : gets
    Product ||--o{ OrderItem : referenced_in
    Address ||--o{ Order : delivery_to
```

> **All monetary values are integers in paise (₹1 = 100 paise).** This eliminates floating-point rounding errors.

---

## Security Architecture

| Property | Implementation | Doc Reference |
|---|---|---|
| Password hashing | bcrypt, cost factor 12 | Security Doc §2 |
| Access tokens | JWT, 15 min expiry | Security Doc §5 |
| Refresh tokens | SHA-256 hashed, stored in DB, revocable via `revokedAt` | Security Doc §5 |
| Pricing integrity | Backend recalculates all prices from DB; client body is `strict()` — extra keys rejected | Security Doc §3, ADR-001 |
| Role enforcement | `requireRole(Role.X)` middleware on all protected routes | Security Doc §4 |
| Ownership checks | Explicit `userId === resource.ownerId` check on every mutation | Security Doc §4 |
| State machine | Single `executeOrderTransition()` enforces all legal transitions | Security Doc §4, ADR-006 |
| ADMIN registration | `POST /auth/register` with `role: "ADMIN"` returns 403 | Security Doc §4 |
| CORS | Allowlist-based, only configured origins | Security Doc §8 |
| Security headers | Helmet.js on all responses | Security Doc §8 |
| Request logging | Morgan — no body/auth headers logged | Security Doc §7 |
| SQL injection | Prisma ORM parameterises all queries | — |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
# Server
NODE_ENV=development
PORT=3001

# Database (Docker default)
DATABASE_URL="postgresql://shopright:shopright@localhost:5432/shopright"

# JWT
JWT_ACCESS_SECRET=your-long-random-secret-here
JWT_REFRESH_SECRET=another-long-random-secret-here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# CORS (comma-separated list of allowed origins)
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176

# Google OAuth
GOOGLE_CLIENT_ID=582096119859-2frlksmhqmtaoris57b8c43br29hembu.apps.googleusercontent.com

# Frontend (Vite)
VITE_API_URL=http://localhost:3001/api/v1
VITE_GOOGLE_CLIENT_ID=582096119859-2frlksmhqmtaoris57b8c43br29hembu.apps.googleusercontent.com
```

---

## Testing

### Run all tests

```bash
npm run test
```

### Test suites

| Suite | Type | Tests | Coverage |
|---|---|---|---|
| `health.test.ts` | Integration (no DB) | 3 | Health endpoints, 404 envelope |
| `serviceability.test.ts` | Unit | 12 | Haversine distance, edge cases, antipodal, equatorial |
| `pricingEngine.test.ts` | Unit | 15 | Subtotal, delivery fee, free threshold, stock, auth, edge cases |
| `orderStateMachine.test.ts` | Unit | 28 | All transitions, all terminal states, all role violations, all ownership violations |
| `auth.test.ts` | Integration (DB) | ~14 | Register, login, refresh, logout, ADMIN block |
| `customerOrders.test.ts` | Integration (DB) | ~14 | Place order, get orders, rate, cancel, price tampering rejection |
| `merchantOrders.test.ts` | Integration (DB) | ~18 | Shop/product CRUD, order inbox, state transitions, ownership |
| `deliveryPartner.test.ts` | Integration (DB) | ~14 | Availability, location, pickup, deliver, ownership |
| `admin.test.ts` | Integration (DB) | ~13 | Role enforcement, shop approval, fee rules, analytics |

**Total: 130+ tests**

### Run only unit tests (no DB required)

```bash
cd server
npx vitest run tests/serviceability.test.ts tests/pricingEngine.test.ts tests/orderStateMachine.test.ts
```

### Typecheck all workspaces

```bash
npm run typecheck
```

### Build all workspaces

```bash
npm run build
```

---

## Real-Time Events (Socket.IO)

The server emits Socket.IO events for order status changes. Clients join typed rooms:

```typescript
// Client joins a room
socket.emit('join:order', orderId);
socket.emit('join:shop', shopId);

// Server emits when order status changes
socket.on('order:status_changed', (payload) => {
  // { orderId, shopId, status, updatedAt }
});
```

Server listens on the same port as the API (3001). CORS is configured from `CORS_ORIGINS`.

---

## CI/CD Pipeline

GitHub Actions runs on every push and pull request to `main`:

```yaml
# .github/workflows/ci.yml
jobs:
  quality:
    - npm install
    - npm run typecheck     # 0 errors required across all 6 workspaces
    - npm run lint          # ESLint passes
    - npm run test          # All unit tests pass (DB tests skipped in CI)
    - npm run build         # All workspaces build cleanly
```

Integration tests (requiring Postgres) can be run locally with Docker running.

---

## Deployment Notes

### Backend

The backend is a standard Express + Prisma app. Key production considerations:

1. **Database**: Run `prisma migrate deploy` (not `migrate dev`) in production.
2. **Environment**: Set `NODE_ENV=production` — disables Morgan request logging.
3. **JWT Secrets**: Use cryptographically random 256-bit secrets.
4. **CORS Origins**: Set `CORS_ORIGINS` to your actual frontend domains.
5. **Seed Admin**: Run `npm run seed:admin` once after first deployment.

### Frontend

All four frontends are static Vite builds. Set `VITE_API_URL` at build time:

```bash
VITE_API_URL=https://api.your-domain.com/api/v1 npm run build
```

Deploy `apps/*/dist/` to any static host (Netlify, Vercel, Cloudflare Pages, S3+CloudFront).

---

## Architecture Decision Records

| ADR | Title | Decision |
|---|---|---|
| ADR-001 | Server-Authoritative Pricing | Backend always recomputes prices from DB. Client sends only `{ shopId, deliveryAddressId, items }`. |
| ADR-002 | Monorepo with npm Workspaces | Single repo, single `npm install`, shared types package. No Turborepo/Nx complexity. |
| ADR-003 | PostgreSQL + Prisma | ACID transactions for order creation, type-safe ORM with codegen, declarative migrations. |
| ADR-004 | Haversine Only (No Maps API) | Self-contained distance calculation. No external API cost or rate limits. |
| ADR-005 | bcrypt Cost Factor 12 | Balance between security (preimage attack resistance) and latency (~200ms). Never lower. |
| ADR-006 | Single Shared State Machine | All `Order.status` mutations go through `executeOrderTransition()`. Prevents ad-hoc status logic. |
| ADR-007 | Nearest-Partner Auto-Assignment | When MARK_READY fires, system assigns the geographically nearest available delivery partner. Non-blocking. |
| ADR-008 | Integer Paise for All Money | Eliminates floating-point rounding. ₹1 = 100 paise. All monetary DB columns are `Int`. |
| ADR-009 | Revocable Refresh Tokens | SHA-256 hash stored in DB with `revokedAt`. Enables instant logout and token rotation. |
| ADR-010 | Vite + React for All Frontends | Fast HMR, ESM-native, Tailwind integration. Same toolchain for all 4 apps. |
| ADR-011 | Role + Ownership on Every Route | `requireRole` + explicit ownership check. Defense-in-depth. |

---

## Contributing

1. Fork the repo and create a feature branch
2. Follow the ground rules in `/docs/03_SECURITY_DOC.md` and `/docs/04_IMPLEMENTATION_PLAN.md`
3. Write tests alongside every piece of logic (not after the fact)
4. Run `npm run typecheck && npm run test && npm run build` before opening a PR
5. Open a PR with a description referencing the relevant ADR if your change affects architecture

---

## License

MIT © ShopRight Contributors

