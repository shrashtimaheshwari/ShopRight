# ShopRight — Decision Document (ADRs)

Lightweight Architecture Decision Records for the choices already made in the project document, so the "why" survives past the semester and is ready for a viva. Format: Context / Decision / Alternatives Considered / Consequences.

---

## ADR-001: Server-Authoritative Pricing Engine

**Context:** The customer, merchant, and admin all touch order pricing in some form. If any client is trusted to send a subtotal or total, that value is trivially forgeable.

**Decision:** The backend recomputes subtotal, delivery fee, and total from live DB data on every order creation. Clients only ever *display* a total the server returned; they never *compute* one that gets submitted back.

**Alternatives considered:** Client computes total, server "validates" it against its own calculation and rejects mismatches. Rejected because it adds complexity for no benefit over simply never trusting the client value in the first place — validation-of-an-untrusted-value is strictly worse than not accepting the value at all.

**Consequences:** Slightly more backend logic per order-creation call; in exchange, an entire class of price-tampering bugs is structurally impossible rather than merely checked-for.

---

## ADR-002: PostgreSQL + Prisma over a NoSQL Store

**Context:** Orders, shops, products, and users are fundamentally relational — orders reference shops and customers, order items reference products and orders.

**Decision:** PostgreSQL with Prisma ORM.

**Alternatives considered:** MongoDB — faster to prototype with no schema, but relational integrity (foreign keys, transactions across order + order-items + payment) would have to be hand-rolled in application code, which is exactly the kind of thing that causes pricing/consistency bugs under time pressure. Prisma's type-safe query builder also directly supports the "no context switching" goal already stated for the rest of the stack.

**Consequences:** A small upfront migration-writing cost, in exchange for DB-enforced referential integrity on the money-and-state-critical tables.

---

## ADR-003: WebSockets/Socket.IO with a Mandatory REST Polling Fallback

**Context:** Live order-status updates are core to the product experience across all four roles, but a first-time or under-time-pressure realtime implementation is a common source of demo-day failure.

**Decision:** Build Socket.IO for realtime push, but treat the REST polling endpoint (`GET /orders/:id/status`) as a first-class, independently tested feature from Milestone 2 onward — not a fallback bolted on afterward.

**Alternatives considered:** Pure REST polling only (simpler, but a noticeably worse live-tracking UX, and the project doc explicitly flags this as newly in-scope because of AI-assisted dev speed). Pure WebSocket-only (rejected — a single dropped connection during the demo would break the tracking UI entirely, with no graceful degradation).

**Consequences:** Slightly more surface area to test, but a demo that survives a flaky Wi-Fi connection rather than one that visibly breaks.

---

## ADR-004: Haversine + Browser Geolocation + OpenStreetMap/Leaflet over Google Maps API

**Context:** Serviceability checking and shop discovery need distance calculation and a map UI.

**Decision:** Haversine formula (straight-line distance) for serviceability logic; OpenStreetMap tiles via Leaflet for the map UI; browser Geolocation API for customer location.

**Alternatives considered:** Google Maps Platform (Distance Matrix / Directions API) for real road-distance and travel-time. Rejected for this semester specifically because of API-key billing risk for a student project with no revenue and uncertain traffic, and because neighbourhood-scale serviceability doesn't need road-accurate distance to be useful — straight-line distance with a sensible radius is an acceptable approximation at this scale.

**Consequences:** Distance figures are approximate (as-the-crow-flies, not as-the-road-goes), which is an explicit, documented simplification appropriate to MVP scope — worth stating plainly in a viva rather than presenting Haversine as if it were road-accurate.

---

## ADR-005: JWT Access + Refresh Tokens over Server-Side Sessions

**Context:** Four different frontends need to authenticate against one backend.

**Decision:** Short-lived JWT access tokens plus longer-lived, server-revocable refresh tokens.

**Alternatives considered:** Traditional cookie-based sessions — simpler in some ways, but four separate SPA frontends talking to one API make token-based auth a more natural fit than session/cookie management across origins.

**Consequences:** Need to actually implement refresh-token revocation (Security Doc §2) — a stateless-only JWT scheme without a revocation path was explicitly rejected as insufficient for a system moving money, even in sandbox mode.

---

## ADR-006: One Shared Order State Machine Across All Four Roles

**Context:** Each role's UI only shows/triggers a subset of order-status transitions, but there is only one underlying order lifecycle.

**Decision:** A single backend state-machine module is the only code path allowed to mutate `Order.status`; every role-specific route calls into it rather than each maintaining separate status logic.

**Alternatives considered:** Per-role status update logic embedded in each route handler. Rejected — this is exactly the kind of duplication that causes one role's UI to eventually disagree with another's about what state an order is in, which is a worse bug in a four-sided marketplace than in a typical two-sided app.

**Consequences:** One well-tested module (Milestone 1) that every later milestone depends on and must not bypass.

---

## ADR-007: Nearest-Available-Partner Auto-Assignment (Simple) — Not Route/Batch Optimization

**Context:** Someone has to be assigned to each ready order.

**Decision:** Simple nearest-available-partner selection via Haversine distance at the moment an order becomes `READY`.

**Alternatives considered:** Multi-stop batching / route optimization across several simultaneous orders. Explicitly deferred (see project doc's "Deferring" section) — this only becomes a meaningful problem once there's enough concurrent order volume for batching to matter, and that volume doesn't exist without a real pilot first. Building it now would be unused, untestable-against-real-data code.

**Consequences:** Assignment is not delivery-time-optimal at high order density, but is correct and sufficient at MVP/demo scale, and is honestly documented as a Phase 2 item rather than silently missing.

---

## ADR-008: Sandbox/Test-Mode Payment Gateway Behind a PaymentProvider Interface

**Context:** Real payment processing needs business KYC/verification that's a paperwork timeline outside the team's control this semester.

**Decision:** Cash on Delivery plus a sandbox/test-mode gateway (e.g. Razorpay test mode), both implemented behind a shared `PaymentProvider` interface.

**Alternatives considered:** Skipping online payment entirely (COD only) — rejected because demonstrating the payment-integration pattern, even in test mode, is part of what the project is meant to show; and a live production gateway — rejected due to the KYC timeline being outside the team's control, not a technical limitation.

**Consequences:** A production gateway can be swapped in later purely by adding a new `PaymentProvider` implementation, without touching order logic — this isolation was a deliberate design goal, not an accident.

---

## ADR-009: Monorepo for Four Frontends + One Backend

**Context:** Three people need to split work across four frontend surfaces and one shared backend without types/contracts drifting apart.

**Decision:** Single monorepo with a shared types/DTO package, per Design Doc §6.

**Alternatives considered:** Four separate repos, one per frontend, plus a backend repo. Rejected for a three-person team on a semester timeline — the coordination overhead of keeping five repos' API contracts in sync outweighs any benefit of separation at this scale.

**Consequences:** Everyone can see the whole system in one place; shared types make it structurally harder for one frontend to silently drift from the backend's actual contract.

---

## ADR-010: What's Deferred, and Why (Consolidated)

| Deferred item | Why it's deferred, specifically |
|---|---|
| Phase 0 live pilot (5–10 real shops) | Depends on other people's time and willingness to participate — AI-assisted dev speed doesn't shorten this, since it isn't a coding bottleneck. |
| Delivery batching / route optimization | Only meaningful with real concurrent order volume, which doesn't exist pre-pilot; building it now is speculative, untestable code. |
| Production payment gateway | Requires business KYC/verification — a paperwork timeline outside the team's control, not a technical gap. |
| New categories / multi-city | A scope-expansion decision for a later roadmap phase, not something the current build needs to structurally support yet (though the `PaymentProvider`-style interface pattern is applied elsewhere so future expansion isn't blocked by bad coupling). |

**Consequences of documenting this explicitly:** in a viva or code walkthrough, "why didn't you build X" has a specific, defensible answer tied to a real constraint (people, data, paperwork, or scope) rather than "we ran out of time" — because in each case, the constraint isn't actually about time.

---

## ADR-011: Scope of AI-Assisted Development

**Context:** The team is using AI coding tools (Claude Code and similar) to implement faster than a fully manual build would allow.

**Decision:** AI assistance is used for scaffolding, boilerplate, CRUD routes, and test-case generation across the stack. It is explicitly *not* a substitute for every team member understanding the pricing engine, the order state machine, and the auth/ownership logic well enough to explain and defend them unassisted.

**Consequences:** This is why Milestone 1 (Implementation Plan) and the security-critical modules get dedicated, protected time and testing even though AI could generate a first draft quickly — speed of writing code and depth of understanding it are treated as separate goals, and the second one is graded.
