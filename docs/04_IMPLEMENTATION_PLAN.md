# ShopRight — Implementation Plan (Phase by Phase)

Timeframe: August–December 2026 semester (~16–18 working weeks). Three-person team. This plan assumes AI-assisted coding (per the project doc) is used to accelerate CRUD/boilerplate so the team's own time goes to the parts that need real understanding: pricing engine, state machine, auth, assignment logic.

Each milestone lists: goals, concrete tasks, tests to write alongside the code (not after), and exit criteria before moving on.

---

## Milestone 0 — Project Setup (Week 1–2)

**Goals:** everyone can run the full stack locally; CI catches basic breakage from day one.

**Tasks:**
- Initialize monorepo structure (per Design Doc §6).
- Postgres running locally (Docker Compose recommended) + Prisma schema for all entities in Design Doc §4.
- Base Express app with health-check route, error-handling middleware, request logging.
- Base Vite/React app shells for all four frontends with routing skeleton and Tailwind configured.
- CI pipeline: lint + typecheck + test run on every push.
- `.env.example` committed; secrets story decided (per Security Doc §11).

**Tests:** CI pipeline itself passing on an empty/skeleton codebase counts as the milestone's test.

**Exit criteria:** all three team members can clone, `install`, and run backend + all four frontends locally with no manual undocumented steps.

---

## Milestone 1 — Core Backend: Auth, Data Model, Pricing Engine, State Machine (Week 3–5)

**Goals:** the parts everything else depends on, built and tested in isolation before any UI touches them.

**Tasks:**
- Implement `User`, `Address`, `Shop`, `Product`, `Order`, `OrderItem`, `DeliveryPartnerProfile`, `Rating`, `Payment`, `DeliveryFeeRule` models via Prisma migrations.
- Auth: register/login/refresh/logout, JWT issuing, bcrypt/argon2 hashing, role-based middleware (`requireRole`), ownership-check helper.
- Pricing engine module: pure function(s) that take `{ shopId, items, deliveryAddress }` and DB state, return `{ subtotal, deliveryFee, total }`. Keep it pure and unit-testable — no HTTP concerns inside it.
- Haversine serviceability function: pure function `isWithinRange(shopLatLng, customerLatLng, radiusKm)`.
- Order state machine module: `transition(order, event, actorRole, actorId)` with the full transition table from Design Doc §5.3, throwing on illegal transitions.
- `PaymentProvider` interface + `CodProvider` implementation (Razorpay test-mode provider can land in Milestone 5 alongside checkout, or here if time allows).

**Tests (write these now, not later):**
- Pricing engine: correct subtotal/fee/total for a known cart; forged client price is ignored (Security Doc §3).
- Serviceability: in-range and out-of-range cases, boundary case (exactly at radius).
- State machine: every legal transition succeeds; every illegal transition throws; wrong-actor-role transition is rejected.
- Auth: password hashing round-trip, token issuance/refresh, role middleware blocks wrong role.

**Exit criteria:** these four modules have passing unit tests and no frontend has been touched yet. This is the foundation everything else sits on — do not let schedule pressure skip this milestone's tests.

---

## Milestone 2 — Customer App (Week 6–8)

**Goals:** a customer can discover a shop, build a cart, see a real server-computed total, and place an order.

**Tasks:**
- Shop discovery screen using browser Geolocation API (with manual address fallback) → `GET /shops/nearby`.
- Product browse/search within a shop.
- Single-shop cart (client-side state only — server recomputes at checkout, per Design Doc §5.2).
- Checkout screen: submit cart, display the **server-returned** total, never a client-computed one.
- Order confirmation, live tracking screen (initially via REST polling of `/orders/:id/status` — sockets wired in during Milestone 6), order history list, post-delivery rating form.

**Tests:**
- Integration test: full order-placement flow from cart submission to created `Order` row with correct server-computed total.
- Integration test: attempting checkout on an out-of-range shop is rejected with `SHOP_OUT_OF_RANGE`.
- Integration test: ordering an out-of-stock item is rejected with `PRODUCT_OUT_OF_STOCK`.

**Exit criteria:** a customer can complete an order end-to-end against the real backend (no mocked pricing).

---

## Milestone 3 — Merchant Dashboard (Week 8–10)

**Goals:** a shopkeeper can register, get approved (via a stubbed/manual admin action if Admin Console isn't done yet), manage products, and process orders.

**Tasks:**
- Shop registration form → `POST /shops` (lands as `PENDING`).
- Product CRUD screens, stock toggle.
- Incoming orders inbox (`GET /shops/:id/orders?status=PLACED`), accept/reject actions.
- Status update controls: `PREPARING → READY`.
- Basic sales dashboard (orders/day, top products) from `GET /shops/:id/analytics`.

**Tests:**
- Integration test: shopkeeper cannot edit/view another shop's products or orders (ownership check).
- Integration test: an unapproved shop's products never appear via the customer discovery endpoint.
- Integration test: accept/reject/status-update routes reject illegal transitions.

**Exit criteria:** a shopkeeper can take an order from `PLACED` through `READY` using only the dashboard UI.

---

## Milestone 4 — Delivery Partner Interface + Assignment Engine (Week 10–12)

**Goals:** orders that reach `READY` get auto-assigned to a nearest available partner, and that partner can complete the delivery.

**Tasks:**
- Delivery partner availability toggle, location ping endpoint + periodic client-side update.
- Assignment engine: on `READY`, find nearest `isAvailable` partner via Haversine, assign; retry logic for when none are available.
- Partner interface: view assigned order(s), `PICKED_UP` / `DELIVERED` actions.

**Tests:**
- Unit test: assignment picks the genuinely nearest available partner among several candidates.
- Integration test: a partner cannot mark an order they are not assigned to as picked up/delivered (Security Doc §4).
- Integration test: no-partner-available case leaves order `READY` and unassigned without erroring.

**Exit criteria:** an order can go from `READY` to `DELIVERED` driven entirely by the delivery partner interface, with correct assignment.

---

## Milestone 5 — Admin Console (Week 12–13)

**Goals:** admin can run the approval workflow and configure pricing without touching the DB directly.

**Tasks:**
- Shop approval queue (`PENDING` list, approve/reject actions).
- All-orders view with filters.
- Manual reassignment override.
- Delivery-fee rule editor (versioned, per Design Doc §4.3).
- Marketplace-wide analytics view.

**Tests:**
- Integration test: only `ADMIN` role can hit any `/admin/*` route.
- Integration test: updating the delivery-fee rule doesn't retroactively change existing orders' stored `deliveryFee`.

**Exit criteria:** the full shop-approval → order lifecycle can be run end to end using only the four UIs, no direct DB edits.

---

## Milestone 6 — Realtime Integration (Week 13–14)

**Goals:** replace/augment polling with live push updates across all four surfaces, without breaking the REST fallback.

**Tasks:**
- Socket.IO gateway, JWT-authenticated handshake, per-order and per-user rooms (Design Doc §5.5).
- Emit events on every state-machine transition (`order:statusChanged`, `order:assigned`, `shop:newOrder`, `partner:newAssignment`).
- Wire each frontend to subscribe and update UI on these events, while keeping the REST polling path functional and tested independently.

**Tests:**
- Integration test: REST fallback endpoint still returns correct current status with sockets disabled/disconnected.
- Manual/integration test: a status change made via one role's action is received in real time by the other relevant roles.

**Exit criteria:** killing the socket connection mid-session degrades gracefully to polling, not to a broken UI.

---

## Milestone 7 — Hardening, Security Pass, Bug Bash (Week 15–16)

**Goals:** close gaps before the demo, not during it.

**Tasks:**
- Run through every checklist item in `03_SECURITY_DOC.md` explicitly and check it off.
- Add rate limiting to auth and order-creation routes.
- Full regression pass on the pricing engine and state machine test suites.
- Cross-role penetration-style manual testing: try to access other users'/shops'/orders' data with a valid-but-wrong-role or valid-but-wrong-owner token.
- Fix any bugs found; do not add new features this week.

**Tests:** expand automated suite to cover every gap found manually during this pass.

**Exit criteria:** every item in the security doc's testing section (§12) has a passing automated test, not just a manual check.

---

## Milestone 8 — Demo Prep, Deployment, Docs (Week 17–18)

**Goals:** a working, deployed (or reliably runnable) system, and a team that can explain every core piece in a viva.

**Tasks:**
- Deploy backend + frontends to whatever free/low-cost hosting is chosen (or prepare a rock-solid local demo script if deployment is out of scope).
- Seed demo data: a handful of approved shops with products, a couple of demo customer/partner accounts.
- Rehearse a full demo script covering all four roles and the deferred-items conversation (why Phase 0 pilot, route optimization, production payments, and multi-city aren't built — see `05_DECISION_DOC.md`).
- Each team member reviews and can explain, unassisted: the pricing engine, the state machine, and the auth/ownership logic (per the project doc's note on AI-assisted development).

**Exit criteria:** full run-through of the demo script with no manual DB intervention required.

---

## Cross-Cutting Testing Strategy (applies throughout, not just Milestone 7)

- **Unit tests:** pricing engine, Haversine/serviceability, state machine transition table, assignment selection logic. These are pure functions — no excuse to skip them.
- **Integration tests:** every route in `02_API_DOCUMENTATION.md` that touches money, auth, or state transitions gets at least one happy-path and one rejection-path test.
- **Manual test pass:** full four-role demo script run at the end of every milestone from Milestone 2 onward, not saved for the end.
