# ShopRight — Security Document

This is a checklist and set of concrete rules, not a general security essay — treat every unchecked item here as a build task, and treat the pricing and auth sections as the ones most likely to come up in a viva.

---

## 1. Threat Model Summary

Who could attack what, realistically, for a student MVP with real money (even if sandboxed) flowing through it:

| Actor | Could try to... | Mitigated by |
|---|---|---|
| Malicious customer | Submit a fake lower total, order out-of-stock items, order from a shop outside their delivery range | Server-side pricing engine (§3), stock re-check at order time, serviceability re-check at order time |
| Malicious shopkeeper | Self-approve their own shop, see/edit other shops' orders | Admin-only approval endpoint, ownership checks on every merchant route |
| Malicious delivery partner | Mark an order they're not assigned to as delivered, see other partners' location data | Assignment ownership check on every delivery route |
| Any authenticated user | Escalate role, hit another role's endpoints | Role-based middleware on every route, not just UI-level hiding |
| Outsider | Brute-force login, scrape all shop/product data, upload malicious files as product images | Rate limiting, pagination limits, file type/size validation on upload |

---

## 2. Authentication & Authorization

- **JWT access + refresh tokens.** Access token short-lived (15 min), refresh token longer-lived (7–30 days), refresh tokens stored server-side (DB or Redis) so they can be revoked on logout — do not rely on stateless-only refresh tokens with no revocation path.
- **Password hashing:** bcrypt or argon2, cost factor high enough to be slow (bcrypt cost ≥ 12). Never store or log plaintext passwords.
- **Role-based middleware, applied at the route layer, not just hidden in the UI.** Every route in `02_API_DOCUMENTATION.md` has an implicit role requirement — enforce it with a single reusable `requireRole(...)` middleware, not ad hoc `if` checks scattered per-handler.
- **Ownership checks are separate from role checks.** A shopkeeper role check confirms "this is *a* shopkeeper" — it does not confirm "this is *the* shopkeeper who owns *this* shop/order." Every merchant, delivery, and customer route that operates on a specific resource ID must additionally verify the requester owns/is-assigned-to that resource. This is the most common real-world authorization bug — treat it as mandatory, not optional hardening.
- **Admin accounts are never self-registered** through the public `/auth/register` endpoint (see API doc §2) — seed the first admin via a script/migration, and let existing admins create further admins through an admin-only route.

---

## 3. Server-Side Pricing Integrity (highest priority)

This is the single most important security property in the whole system, and the project document explicitly calls it out as a core requirement, not a nice-to-have.

- The client **never** sends `price`, `subtotal`, `deliveryFee`, or `total` in any request. If any of these fields appear in an incoming order-creation payload, ignore them entirely (don't just overwrite — actively strip/reject to catch bugs early in dev).
- Every price used in a calculation is fetched fresh from the DB at the moment of order creation, never trusted from an earlier API response the client might replay.
- `OrderItem.unitPriceAtOrder` is written once, at creation, and never recalculated later — this is what makes historical order totals stable even if a shopkeeper changes prices afterward.
- Write an automated test that specifically attempts to submit a forged total/price and asserts the server ignores it and computes its own (see `04_IMPLEMENTATION_PLAN.md`, testing sections).
- Idempotency: give order-creation an idempotency key (e.g. client-generated UUID, deduped server-side for a short window) so a double-tap or network retry doesn't create two orders/charges.

---

## 4. Order State Machine Integrity

- All status transitions go through one shared function (see Design Doc §5.3), which checks **both** "is this transition legal from the current state" **and** "is this actor role/identity allowed to trigger this specific transition" (e.g. only the assigned delivery partner can fire `PICKED_UP`, only the owning shopkeeper can fire `ACCEPTED`/`REJECTED`).
- Reject illegal transitions with `409 INVALID_STATE_TRANSITION` rather than silently no-op'ing — silent failures hide bugs.
- `CANCELLED` is blocked once a delivery partner has been assigned/picked up — don't let a race condition let a customer cancel an order a partner already collected.

---

## 5. Input Validation & Sanitization

- Validate every request body against a schema (Zod or equivalent) at the route boundary — reject malformed input before it reaches business logic.
- Enforce types and bounds server-side even though the frontend also validates (e.g. `quantity > 0`, `stars` between 1 and 5, lat/lng within valid ranges) — frontend validation is a UX nicety, not a security control.
- Sanitize any free-text fields that get rendered elsewhere (product descriptions, rating comments) to prevent stored XSS if these are ever rendered as raw HTML anywhere.

---

## 6. Rate Limiting & Abuse Prevention

- Rate-limit `/auth/login` and `/auth/register` per IP and per email to slow brute-force and signup spam.
- Rate-limit order creation per customer account to prevent order-spam abuse of shopkeepers.
- Apply a global request rate limit at the reverse proxy or middleware layer as a baseline.

---

## 7. Data Privacy

- Location data (customer address lat/lng, delivery partner live location) is sensitive — only expose a delivery partner's live location to the customer/shop tied to their *current* assigned order, never broadcast it broadly.
- Don't expose a customer's full address or phone number to a shopkeeper before an order is placed — only what's needed to fulfil it, and only after acceptance.
- Don't log PII (passwords, full addresses, phone numbers, tokens) in application logs. Log user IDs and order IDs instead.

---

## 8. Transport & Headers

- HTTPS only in any deployed environment (even a free-tier host) — no plaintext HTTP for auth or payment-adjacent traffic.
- Use `helmet` (or equivalent) for standard secure headers.
- CORS: restrict allowed origins to the actual frontend deployment URLs, not `*`, especially once cookies/refresh tokens are involved.

---

## 9. File Upload Security

- Product images go to Cloudinary (per the tech stack) — validate MIME type and size **before** upload, not just rely on Cloudinary's own limits, so bad uploads fail fast with a clear error.
- Never trust a client-supplied file extension alone; check actual content type.

---

## 10. Payments

- Stay in COD + sandbox/test-mode gateway this semester (per the project scope) — do not wire in a production key or handle real card data anywhere in this codebase.
- Build against a `PaymentProvider` interface (per the tech stack decision) so swapping in a production gateway later doesn't touch order logic — this is a security benefit too, since it keeps payment-provider-specific code isolated and easier to audit later.
- If/when webhooks are used (e.g. Razorpay test-mode payment confirmation), verify the webhook signature — never trust an unsigned callback as proof of payment.

---

## 11. Secrets Management

- All secrets (DB URL, JWT signing secret, Cloudinary keys, payment gateway keys) live in environment variables, never committed to the repo.
- Add `.env` to `.gitignore` from commit #1; commit an `.env.example` with placeholder keys instead.
- Use different JWT secrets and DB instances for dev vs. any deployed/demo environment.

---

## 12. Testing Security-Critical Paths

Per the tech stack's testing commitment, these are non-negotiable test cases, not optional extras:
- Auth: cannot access another role's routes; cannot access another user's resource by guessing an ID.
- Pricing: forged client-sent totals/prices are ignored; recomputed total matches expected value for a known cart.
- State machine: illegal transitions are rejected for every role; only the correct actor can fire each transition.
- Shop approval: an unapproved shop never appears in `/shops/nearby` results and cannot receive orders even via a direct API call.
