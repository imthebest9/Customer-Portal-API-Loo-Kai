# API walkthrough — Swagger UI

A click-by-click run through the API in the order a real client would call it. Nothing to install: it all happens in the browser.

Start the stack (`docker compose up --build`), then open **<http://localhost:3000>**.

Every endpoint has a **Try it out** button: click it, edit the JSON body, then **Execute**. Two things worth knowing:

- **`Authorize` (top right) is how you authenticate.** Paste a token there once and every protected call carries it. Steps 3 onwards need it.
- Seeded admin is **`admin@portal.local` / `Admin123!`**. The five seeded products are Wireless Mouse, Mechanical Keyboard, USB-C Hub, 27" Monitor and Laptop Stand.

---

## 1. Register a customer

**`POST /api/auth/register`** — `name`, `email`, `password` (min 8 chars) required; `phone` and `address` optional.

```json
{
  "name": "Jane Customer",
  "email": "jane@example.com",
  "password": "Password123!",
  "phone": "+60 12-345 6789",
  "address": "12 Market Street, Kuala Lumpur"
}
```

**`201`** returns the customer plus a ready-to-use token:

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

The password hash is never returned by any endpoint. A duplicate email is `409`; a malformed body is `422`.

`phone` is validated on the digits it carries, not its punctuation: `+60 12-345 6789`, `(03) 2345 6789` and `0123456789` all pass, while anything outside 7–15 digits (E.164's ceiling) is `422`.

## 2. Log in and authorize

**`POST /api/auth/login`** — register already returned a token, so this is really for logging in later.

```json
{ "email": "jane@example.com", "password": "Password123!" }
```

**`200`** returns the same `{ customer, token }` shape.

> **Now authorize:** copy the `token` value (without quotes), click **Authorize** top right, paste, **Authorize** → **Close**.

A wrong email and a wrong password both return the same `401 Invalid credentials`, on purpose — a distinct "no such user" would let an attacker enumerate registered emails.

Tokens last `JWT_EXPIRES_IN` (default 1 hour). A token also stops working the moment an admin deactivates or deletes the account (step 9).

## 3. View and update your profile

**`GET /api/customers/me`** returns the profile of whoever the token belongs to — there's no "get customer by id" for customers; identity comes from the JWT, never the URL. This read is cached, and any write invalidates it immediately.

**`PATCH /api/customers/me`** — send only what you're changing (`name`, `phone`, `address`); at least one is required. `email` and `role` are deliberately **not** updatable: email is the login identity, and letting a customer set their own role would be a privilege-escalation hole. `null` clears `phone` / `address`.

```json
{ "phone": "+60 19-888 7777", "address": "88 Jalan Ampang, Kuala Lumpur" }
```

**`200`** returns the full updated profile with `updatedAt` moved on.

## 4. Change your password

**`PATCH /api/customers/me/password`** — requires the **current** password too, so a stolen token alone can't lock the real owner out.

```json
{ "currentPassword": "Password123!", "newPassword": "NewPassword456!" }
```

**`204 No Content`**. The old password now returns `401`; a wrong `currentPassword` returns `401` as well.

> Your existing token stays valid until it expires — changing a password doesn't retroactively revoke issued tokens. Token revocation is listed as a next step in [`WRITEUP.md`](../WRITEUP.md).

## 5. List products

**`GET /api/products`** — protected and paginated. **Copy one or two `id` values** for the next step.

```json
{
  "data": [
    { "id": "a1111111-…", "name": "Wireless Mouse", "price": 25.5, "isActive": true },
    { "id": "b2222222-…", "name": "Mechanical Keyboard", "price": 89.99, "isActive": true }
  ],
  "page": 1, "limit": 10, "total": 5, "totalPages": 1
}
```

Prices come back as real JSON **numbers**, not strings — PostgreSQL returns `numeric` columns as strings, so a value transformer converts them on the way out.

## 6. Place an order

**`POST /api/orders`** — a list of `items`, each `{ productId, quantity }`. The server computes `totalAmount` from live prices, so a client can't order a $2000 monitor for $1.

```json
{
  "items": [
    { "productId": "a1111111-1111-1111-1111-111111111111", "quantity": 2 },
    { "productId": "b2222222-2222-2222-2222-222222222222", "quantity": 1 }
  ]
}
```

**`201`** returns the order in `Pending`. **Copy the order `id`.**

```json
{
  "id": "f7777777-…",
  "customerId": "aafd9fc0-…",
  "status": "Pending",
  "totalAmount": 140.99,
  "items": [
    { "id": "…", "productId": "a1111111-…", "productName": "Wireless Mouse", "quantity": 2, "unitPrice": 25.5 },
    { "id": "…", "productId": "b2222222-…", "productName": "Mechanical Keyboard", "quantity": 1, "unitPrice": 89.99 }
  ],
  "createdAt": "2026-07-16T13:15:00.000Z"
}
```

`productName` and `unitPrice` are **copied onto the order line** rather than looked up through the product: if the catalogue later renames the product or changes its price, this order still shows what the customer actually bought at the price they paid.

Placing an order sends a confirmation email — **see it at <http://localhost:8025>**, itemised with each product's unit price, quantity and line amount.

Two rejections worth trying:

- The **same product on two lines** is `422` — that's the same purchase written twice. Order three of something as `quantity: 3`, not `2` plus `1`.
- An unknown or inactive `productId` is `400 Product … is unavailable`.

## 7. List and track your orders

**`GET /api/orders`** — only the logged-in customer's orders, newest first, paginated.

**`GET /api/orders/{id}`** — a single order. It must be **yours**: another customer's order is `403`, one that doesn't exist is `404`.

**`GET /api/orders/{id}/status`** — the lightweight "where's my order?" read:

```json
{ "status": "Pending" }
```

Cached (60s), invalidated whenever the status actually changes, and ownership is still enforced on a cache hit.

## 8. Cancel the order

**`PATCH /api/orders/{id}/cancel`** — no body; allowed **only while `Pending`**.

**`200`** returns the order with `status: "Cancelled"`, and sends a cancellation email — the customer's receipt for it, and the same message an admin-initiated cancel sends.

Cancel again (or after an admin ships it) and you get `409` — that's the lifecycle rule working:

```json
{
  "error": {
    "name": "ConflictError",
    "message": "Order cannot be cancelled while its status is \"Shipped\""
  }
}
```

## 9. Admin

Log in as `admin@portal.local` / `Admin123!` and re-**Authorize** with that token. Every `/api/admin/*` route needs `role: admin` — a customer token gets `403`, no token gets `401`.

- **`GET /api/admin/customers`** — all customers, paginated (never any password hash).
- **`GET /api/admin/orders`** — all orders across every customer.
- **`PATCH /api/admin/orders/{id}/status`** with `{ "status": "Shipped" }` — `Shipped`, `Delivered` and `Cancelled` each email the customer (again, <http://localhost:8025>).
- **`PATCH /api/admin/customers/{id}/deactivate`** → `200`, now `"isActive": false`.
- **`DELETE /api/admin/customers/{id}`** → `204`. Cascades to that customer's orders and order items.

Admins move orders **along** the lifecycle, not arbitrarily. An illegal jump is `409`, and the error says what *is* legal from here:

```json
{
  "error": {
    "name": "ConflictError",
    "message": "An order cannot move from \"Cancelled\" to \"Shipped\"",
    "details": { "from": "Cancelled", "to": "Shipped", "allowedTransitions": [] }
  }
}
```

Deactivate and delete both take effect **immediately**, including for tokens already in the customer's hands: every authenticated request re-checks the account is live, so an existing token starts returning `401 Account is deactivated` on the very next call rather than lingering until it expires. To see it, re-**Authorize** with the customer token and call `GET /api/customers/me`.

---

## Reference: order lifecycle

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
| `Delivered` / `Cancelled` | — | terminal |

`Delivered` and `Cancelled` are **terminal**: nothing moves out of them. That's what stops a cancelled order from later being shipped, or an order being walked backwards from `Shipped` to `Pending`. Any other move is `409`.

## Reference: errors

Every error, from any endpoint, comes back in the same envelope from one global middleware:

```json
{ "error": { "name": "ValidationError", "message": "Validation failed", "details": [ /* optional */ ] } }
```

| Status | When |
| --- | --- |
| `400` | Malformed JSON, or bad input — e.g. an unavailable product |
| `401` | Missing/expired token, bad credentials, or a deactivated/deleted account |
| `403` | Valid token, insufficient rights — a customer hitting `/api/admin/*`, or another customer's order |
| `404` | No such order/customer, or an unmatched route |
| `409` | Duplicate email on register, or an illegal status transition |
| `413` | Body over 100 KB |
| `422` | Schema validation failed — always carries field-level `details` |
| `500` | Unexpected failure; logged server-side, never leaked |

**`500` should be unreachable from anything a client sends** — broken JSON, wrong types and unknown fields all map to a 4xx above.

The `401` vs `403` split is the meaningful one: `401` means *we don't know who you are* (log in again), `403` means *we know exactly who you are and you still can't do that* (logging in again won't help).
