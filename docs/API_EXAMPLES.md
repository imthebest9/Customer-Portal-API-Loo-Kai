# API walkthrough — Swagger UI

A click-by-click run through the whole API in **Swagger UI**, in the order a real client would call it. No tooling to install: everything below happens in the browser.

**Customer flow**

1. [Register a customer](#1-register-a-customer)
2. [Log in and authorize](#2-log-in-and-authorize)
3. [View your profile](#3-view-your-profile)
4. [Update your profile](#4-update-your-profile)
5. [Change your password](#5-change-your-password)
6. [List products](#6-list-products)
7. [Place an order](#7-place-an-order)
8. [List your orders (paginated)](#8-list-your-orders-paginated)
9. [Track an order's status](#9-track-an-orders-status)
10. [Cancel the order](#10-cancel-the-order)

**Admin flow** — [view all customers](#11-view-all-customers), [view all orders](#12-view-all-orders), [advance an order](#13-advance-an-orders-status), [deactivate / delete a customer](#14-deactivate-or-delete-a-customer).

**Reference** — [order lifecycle](#reference-order-lifecycle), [error responses](#reference-error-responses), [pagination](#reference-pagination).

---

## Before you start

Start the stack (`docker compose up --build`), then open:

**→ <http://localhost:3000/api-docs>** — or just <http://localhost:3000>, which redirects there.

Every endpoint has a **Try it out** button: click it, edit the pre-filled JSON body, then **Execute**. The response body, status code and headers appear right below.

Two things worth knowing:

- **`Authorize` (top right) is how you authenticate.** Paste a token there once and every protected call carries it. Steps 3 onwards need it.
- **`GET /health`** needs no auth and confirms the stack is up.

Seeded logins: admin is **`admin@portal.local` / `Admin123!`**. The five seeded products are Wireless Mouse, Mechanical Keyboard, USB-C Hub, 27" Monitor, and Laptop Stand.

---

## 1. Register a customer

**`POST /api/auth/register`** → **Try it out** → paste the body → **Execute**.

`name`, `email`, `password` (min 8 chars) are required; `phone` and `address` are optional.

```json
{
  "name": "Jane Customer",
  "email": "jane@example.com",
  "password": "Password123!",
  "phone": "+60 12-345 6789",
  "address": "12 Market Street, Kuala Lumpur"
}
```

**Response `201`** — the customer, plus a ready-to-use token:

```json
{
  "customer": {
    "id": "aafd9fc0-…",
    "name": "Jane Customer",
    "email": "jane@example.com",
    "role": "customer",
    "phone": "+60 12-345 6789",
    "address": "12 Market Street, Kuala Lumpur",
    "isActive": true,
    "createdAt": "2026-07-16T13:12:14.362Z",
    "updatedAt": "2026-07-16T13:12:14.362Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
}
```

The password hash is never returned by any endpoint. Registering the same email twice gives `409 Conflict`; a malformed body gives `422` — see [error responses](#reference-error-responses).

`phone` is validated on the digits it carries, not its punctuation: `+60 12-345 6789`, `(03) 2345 6789` and `0123456789` are all accepted, while anything outside 7–15 digits (E.164's ceiling) is `422`. Formatting is preserved as the customer typed it.

---

## 2. Log in and authorize

**`POST /api/auth/login`**. (Register already returned a token, so this step is really for logging in later.)

```json
{
  "email": "jane@example.com",
  "password": "Password123!"
}
```

**Response `200`** — same shape as register (`{ customer, token }`).

> **Now authorize:** copy the `token` value (without the quotes), click **Authorize** at the top right, paste it, **Authorize** → **Close**. Every protected call from here on carries it automatically.

A wrong email and a wrong password both return the same `401 Invalid credentials`, on purpose: a distinct "no such user" message would let an attacker enumerate registered emails.

Tokens expire after `JWT_EXPIRES_IN` (default **1 hour**) — if calls suddenly start returning `401`, log in again and re-authorize. A token also stops working the moment an admin deactivates or deletes the account ([step 14](#14-deactivate-or-delete-a-customer)).

---

## 3. View your profile

**`GET /api/customers/me`** — returns the profile of whoever the token belongs to. There's no "get customer by id" for customers; your identity comes from the JWT, never from the URL.

**Response `200`**

```json
{
  "id": "aafd9fc0-…",
  "name": "Jane Customer",
  "email": "jane@example.com",
  "role": "customer",
  "phone": "+60 12-345 6789",
  "address": "12 Market Street, Kuala Lumpur",
  "isActive": true,
  "createdAt": "2026-07-16T13:12:14.362Z",
  "updatedAt": "2026-07-16T13:12:14.362Z"
}
```

This read is cached, so repeat calls within `CACHE_TTL_SECONDS` (default 60s) are served from cache. Any write in step 4 or 5 invalidates it immediately — you'll never read a stale profile.

---

## 4. Update your profile

**`PATCH /api/customers/me`** — send **only** the fields you want to change: `name`, `phone`, `address`. At least one is required (an empty body is `422`).

`email` and `role` are deliberately **not** updatable here — email is the login identity, and letting a customer set their own role would be a privilege-escalation hole. `phone` and `address` accept `null` to clear them.

```json
{
  "phone": "+60 19-888 7777",
  "address": "88 Jalan Ampang, Kuala Lumpur"
}
```

**Response `200`** — the full updated profile (note `updatedAt` has moved):

```json
{
  "id": "aafd9fc0-…",
  "name": "Jane Customer",
  "email": "jane@example.com",
  "role": "customer",
  "phone": "+60 19-888 7777",
  "address": "88 Jalan Ampang, Kuala Lumpur",
  "isActive": true,
  "createdAt": "2026-07-16T13:12:14.362Z",
  "updatedAt": "2026-07-16T13:12:14.397Z"
}
```

---

## 5. Change your password

**`PATCH /api/customers/me/password`** — requires the **current** password as well as the new one, so a stolen token alone can't lock the real owner out. New password must be at least 8 characters.

```json
{
  "currentPassword": "Password123!",
  "newPassword": "NewPassword456!"
}
```

**Response `204 No Content`** — empty body. Log in again with the new password; the old one now returns `401`.

Get `currentPassword` wrong and you get `401`:

```json
{ "error": { "name": "UnauthorizedError", "message": "Current password is incorrect" } }
```

> **Note:** your existing token stays valid until it expires — changing a password does not retroactively revoke tokens already issued. Token revocation on password change is listed as a next step in [`WRITEUP.md`](../WRITEUP.md).

---

## 6. List products

**`GET /api/products`** — protected; paginated (`page` and `limit` fields appear under **Try it out**). You need a `productId` from here to place an order. Only active products are listed.

**Response `200`**

```json
{
  "data": [
    {
      "id": "a1111111-…",
      "name": "Wireless Mouse",
      "price": 25.5,
      "isActive": true,
      "createdAt": "2026-07-16T13:12:14.247Z",
      "updatedAt": "2026-07-16T13:12:14.247Z"
    },
    { "id": "b2222222-…", "name": "Mechanical Keyboard", "price": 89.99, "isActive": true },
    { "id": "c3333333-…", "name": "USB-C Hub", "price": 45, "isActive": true },
    { "id": "d4444444-…", "name": "27\" Monitor", "price": 299, "isActive": true },
    { "id": "e5555555-…", "name": "Laptop Stand", "price": 39.95, "isActive": true }
  ],
  "page": 1,
  "limit": 10,
  "total": 5,
  "totalPages": 1
}
```

Prices come back as real JSON **numbers**, not strings — PostgreSQL returns `numeric` columns as strings, so a value transformer converts them on the way out.

**Copy one or two `id` values** for the next step.

---

## 7. Place an order

**`POST /api/orders`** — body is a list of `items`, each `{ productId, quantity }`. `productId` must be a real UUID from step 6; `quantity` is a positive integer. The server computes `totalAmount` from live product prices (the client never sends a price, so it can't order a $2000 monitor for $1).

**Request body** (replace the UUIDs with real ones from step 6)

```json
{
  "items": [
    { "productId": "a1111111-1111-1111-1111-111111111111", "quantity": 2 },
    { "productId": "b2222222-2222-2222-2222-222222222222", "quantity": 1 }
  ]
}
```

**Response `201`** — a new order in `Pending` status. **Copy the order `id`** for the next steps:

```json
{
  "id": "f7777777-…",
  "customerId": "aafd9fc0-…",
  "status": "Pending",
  "totalAmount": 140.99,
  "items": [
    {
      "id": "…",
      "productId": "a1111111-…",
      "productName": "Wireless Mouse",
      "quantity": 2,
      "unitPrice": 25.5
    },
    {
      "id": "…",
      "productId": "b2222222-…",
      "productName": "Mechanical Keyboard",
      "quantity": 1,
      "unitPrice": 89.99
    }
  ],
  "createdAt": "2026-07-16T13:15:00.000Z"
}
```

`productName` and `unitPrice` are **copied onto the order line** rather than looked up through the product. That's deliberate: if the catalogue later renames the product or changes its price, this order still shows what the customer actually bought at the price they actually paid.

**One line per product.** Listing the same `productId` twice is `422` — two lines for the same product are the same purchase written twice, and leave an order with indistinguishable duplicate rows. Order three of something as `quantity: 3`, not as `2` plus `1`:

```json
{
  "error": {
    "name": "ValidationError",
    "message": "Validation failed",
    "details": [
      {
        "field": "items",
        "message": "Each product may appear only once — combine duplicates into a single item with a higher quantity"
      }
    ]
  }
}
```

Referencing a product that doesn't exist (or is inactive) gives `400`:

```json
{ "error": { "name": "BadRequestError", "message": "Product 00000000-… is unavailable" } }
```

Placing an order fires an order-confirmation email. With the default `console` email driver it's logged to the container output rather than sent — a mail failure is caught and logged, never failing the order itself.

---

## 8. List your orders (paginated)

**`GET /api/orders`** — set `page` and `limit` under **Try it out**. Returns only the logged-in customer's orders, newest first.

**Response `200`**

```json
{
  "data": [
    {
      "id": "f7777777-…",
      "customerId": "aafd9fc0-…",
      "status": "Pending",
      "totalAmount": 140.99,
      "items": [ /* … */ ],
      "createdAt": "2026-07-16T13:15:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 1,
  "totalPages": 1
}
```

**`GET /api/orders/{id}`** returns a single order. It must be **yours** — asking for another customer's order returns `403 Forbidden`, while an id that doesn't exist at all returns `404`.

---

## 9. Track an order's status

**`GET /api/orders/{id}/status`** — the lightweight "where's my order?" endpoint. Paste the order `id` from step 7. Same ownership rule as above.

**Response `200`**

```json
{ "status": "Pending" }
```

This response is cached (default 60s TTL). The cache is invalidated whenever the status actually changes — by a customer cancelling ([step 10](#10-cancel-the-order)) or an admin advancing the order ([step 13](#13-advance-an-orders-status)) — so you always see the current status, and ownership is still enforced on a cache hit.

---

## 10. Cancel the order

**`PATCH /api/orders/{id}/cancel`** — allowed **only while the order is `Pending`**. No body.

**Response `200`** — the order comes back with `status: "Cancelled"`:

```json
{
  "id": "f7777777-…",
  "status": "Cancelled",
  "totalAmount": 140.99,
  "items": [ /* … */ ],
  "createdAt": "2026-07-16T13:15:00.000Z"
}
```

Cancel it a second time (or after an admin moves it to `Shipped`) and you'll get a `409 Conflict` — cancellation is only valid from `Pending`. That's the business rule working as intended:

```json
{
  "error": {
    "name": "ConflictError",
    "message": "Order cannot be cancelled while its status is \"Shipped\""
  }
}
```

---

## Admin flow

Log in as the seeded admin via **`POST /api/auth/login`**:

```json
{ "email": "admin@portal.local", "password": "Admin123!" }
```

Copy that token, click **Authorize**, and replace the customer token with it. (Swapping back and forth between the two tokens is how you demo the role boundary below.)

Every `/api/admin/*` route needs a token whose `role` is `admin`. A customer token gets `403 Forbidden`; no token at all gets `401 Unauthorized`.

### 11. View all customers

**`GET /api/admin/customers`** — every customer, paginated, newest first. Same `Customer` shape as step 3 (never any password hash).

### 12. View all orders

**`GET /api/admin/orders`** — all orders across every customer, not just the caller's.

### 13. Advance an order's status

**`PATCH /api/admin/orders/{id}/status`** with body:

```json
{ "status": "Shipped" }
```

**Response `200`** — the updated order. Moving an order to `Shipped` fires a shipment-notification email (logged to the container output with the default `console` driver).

Admins move orders **along** the lifecycle, not arbitrarily — see [order lifecycle](#reference-order-lifecycle). An illegal jump is rejected with `409`, and the error tells you what *is* legal from here:

```json
{
  "error": {
    "name": "ConflictError",
    "message": "An order cannot move from \"Cancelled\" to \"Shipped\"",
    "details": { "from": "Cancelled", "to": "Shipped", "allowedTransitions": [] }
  }
}
```

### 14. Deactivate or delete a customer

**`PATCH /api/admin/customers/{id}/deactivate`** → `200` with the customer, now `"isActive": false`.

**`DELETE /api/admin/customers/{id}`** → `204 No Content`. The delete cascades to that customer's orders and order items via foreign keys.

Both take effect **immediately**, including for tokens already in the customer's hands: every authenticated request re-checks that the account is still live, so a deactivated customer's existing token starts returning `401` on the very next call rather than lingering until it expires. To see it, **Authorize** with the customer token again and call `GET /api/customers/me`:

```json
{ "error": { "name": "UnauthorizedError", "message": "Account is deactivated" } }
```

Either way they also can no longer log in — login returns the same uniform `401 Invalid credentials`.

---

## Reference: order lifecycle

Valid statuses are `Pending`, `Shipped`, `Delivered`, `Cancelled`. Orders start at `Pending` and may only move along these edges:

```
                 ┌─────────► Cancelled   (terminal)
                 │             ▲
   Pending ──────┤             │ customer cancel, or admin
                 │             │
                 └─────────► Shipped ──────────► Delivered   (terminal)
```

| From | May move to | Who |
| --- | --- | --- |
| `Pending` | `Shipped` | admin |
| `Pending` | `Cancelled` | customer (`/cancel`) or admin |
| `Shipped` | `Delivered` | admin |
| `Delivered` | — | terminal |
| `Cancelled` | — | terminal |

`Delivered` and `Cancelled` are **terminal**: nothing moves out of them. That's what stops a cancelled order from later being shipped, and stops an order being walked backwards from `Shipped` to `Pending`. Any other move returns `409 Conflict`.

---

## Reference: error responses

Every error — from any endpoint — comes back in the same envelope, produced by one global error-handling middleware:

```json
{ "error": { "name": "ValidationError", "message": "Validation failed", "details": [ /* optional */ ] } }
```

| Status | `name` | When |
| --- | --- | --- |
| `400` | `BadRequestError` | Malformed JSON, or semantically bad input — e.g. ordering an unavailable product |
| `401` | `UnauthorizedError` | Missing/malformed/expired token, bad credentials, wrong current password, or a deactivated/deleted account |
| `403` | `ForbiddenError` | Valid token, insufficient rights — a customer hitting `/api/admin/*`, or reading another customer's order |
| `404` | `NotFoundError` | No such order/customer, or an unmatched route |
| `409` | `ConflictError` | Duplicate email on register, or an illegal order-status transition |
| `413` | `PayloadTooLargeError` | Request body over 100 KB |
| `422` | `ValidationError` | Request body/query failed schema validation — includes per-field `details` |
| `500` | `InternalServerError` | Unexpected failure; details are logged server-side, never returned |

`500` should be unreachable from anything a client sends: broken JSON, a `null` body, wrong types and unknown fields all map to a 4xx above. If you can provoke a `500` with a request body, that's a bug worth reporting.

Bodies are validated **strictly** — an unknown field is rejected rather than ignored, so a typo (or a hopeful `"role": "admin"` on register) gets told about instead of silently dropped:

```json
{
  "error": {
    "name": "ValidationError",
    "message": "Validation failed",
    "details": [{ "field": "role", "message": "Unrecognized field: role" }]
  }
}
```

`422` is the only one that always carries field-level `details`:

```json
{
  "error": {
    "name": "ValidationError",
    "message": "Validation failed",
    "details": [
      { "field": "name", "message": "Name is required" },
      { "field": "email", "message": "A valid email is required" },
      { "field": "password", "message": "Password must be at least 8 characters" }
    ]
  }
}
```

The `401` vs `403` split is the meaningful one: `401` means *we don't know who you are* (log in again), `403` means *we know exactly who you are and you still can't do that* (logging in again won't help).

---

## Reference: pagination

Every listing endpoint (`/api/products`, `/api/orders`, `/api/admin/customers`, `/api/admin/orders`) takes `page` and `limit` and returns the same envelope:

```json
{ "data": [ /* … */ ], "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
```

`page` is 1-based and defaults to `1`; `limit` defaults to `10` and is capped at `100` (asking for more is `422`, so no client can request the entire table in one call). Both must be positive integers.
