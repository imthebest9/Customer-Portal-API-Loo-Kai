# API walkthrough — example requests

A copy-paste-able run through the main customer flow:

1. Register a customer
2. Log in and get a JWT
3. List products
4. Place an order
5. List your orders (paginated)
6. Cancel the order (allowed while `Pending`)

You can do all of this two ways:

- **Swagger UI** (easiest) — open <http://localhost:3000/api-docs>, use **Try it out** on each endpoint, and paste the JSON bodies below. After logging in, click **Authorize** and paste the `token` so protected calls are authenticated.
- **curl** — examples below. On Windows PowerShell use **`curl.exe`** (plain `curl` is an alias for `Invoke-WebRequest` and won't accept these flags).

The API base URL is `http://localhost:3000`. All bodies are JSON, so send `Content-Type: application/json`.

Seeded logins (from the seed script): admin is `admin@portal.local` / `Admin123!`. The five seeded products are Wireless Mouse, Mechanical Keyboard, USB-C Hub, 27" Monitor, and Laptop Stand.

---

## 1. Register a customer

`POST /api/auth/register` — `name`, `email`, `password` (min 8 chars) are required; `phone` and `address` are optional.

**Request body**
```json
{
  "name": "Jane Customer",
  "email": "jane@example.com",
  "password": "Password123!",
  "phone": "+60 12-345 6789",
  "address": "12 Market Street, Kuala Lumpur"
}
```

**curl**
```bash
curl.exe -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Jane Customer\",\"email\":\"jane@example.com\",\"password\":\"Password123!\"}"
```

**Response `201`** — returns the customer plus a ready-to-use token:
```json
{
  "customer": {
    "id": "e6b9…",
    "name": "Jane Customer",
    "email": "jane@example.com",
    "role": "customer",
    "phone": "+60 12-345 6789",
    "address": "12 Market Street, Kuala Lumpur",
    "isActive": true,
    "createdAt": "2026-07-15T09:00:00.000Z",
    "updatedAt": "2026-07-15T09:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
}
```

---

## 2. Log in

`POST /api/auth/login`. (Register already returns a token, so this step is really for logging in later.)

**Request body**
```json
{
  "email": "jane@example.com",
  "password": "Password123!"
}
```

**curl**
```bash
curl.exe -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"jane@example.com\",\"password\":\"Password123!\"}"
```

**Response `200`** — same shape as register (`{ customer, token }`). Copy the `token`.

> **In Swagger:** click **Authorize** (top right), paste the token, **Authorize** → **Close**. Every protected call now carries it.
>
> **With curl:** save the token and send it as a Bearer header on the calls below:
> ```powershell
> $TOKEN = "eyJhbGciOiJ…"   # paste your token
> ```

---

## 3. List products

`GET /api/products` — protected; paginated (`?page=&limit=`). You need a `productId` from here to place an order.

**curl**
```bash
curl.exe http://localhost:3000/api/products -H "Authorization: Bearer $TOKEN"
```

**Response `200`**
```json
{
  "data": [
    { "id": "a1111111-…", "name": "Wireless Mouse", "price": 25.5, "isActive": true },
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

Grab one or more `id` values for the next step.

---

## 4. Place an order

`POST /api/orders` — body is a list of `items`, each `{ productId, quantity }`. `productId` must be a real UUID from step 3; `quantity` is a positive integer. The server computes `totalAmount` from live product prices (the client never sends a price).

**Request body** (replace the UUIDs with real ones from step 3)
```json
{
  "items": [
    { "productId": "a1111111-1111-1111-1111-111111111111", "quantity": 2 },
    { "productId": "b2222222-2222-2222-2222-222222222222", "quantity": 1 }
  ]
}
```

**curl**
```bash
curl.exe -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"productId\":\"a1111111-1111-1111-1111-111111111111\",\"quantity\":2}]}"
```

**Response `201`** — a new order in `Pending` status. **Copy the order `id`** for the next steps:
```json
{
  "id": "f7777777-…",
  "customerId": "e6b9…",
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
  "createdAt": "2026-07-15T09:05:00.000Z"
}
```

---

## 5. List your orders (paginated)

`GET /api/orders?page=1&limit=10` — returns only the logged-in customer's orders.

**curl**
```bash
curl.exe "http://localhost:3000/api/orders?page=1&limit=10" -H "Authorization: Bearer $TOKEN"
```

**Response `200`**
```json
{
  "data": [
    {
      "id": "f7777777-…",
      "customerId": "e6b9…",
      "status": "Pending",
      "totalAmount": 140.99,
      "items": [ /* … */ ],
      "createdAt": "2026-07-15T09:05:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 1,
  "totalPages": 1
}
```

Related reads:
- `GET /api/orders/:id` — one order (must be yours, else `404`).
- `GET /api/orders/:id/status` — just `{ "status": "Pending" }` (this response is cached).

---

## 6. Cancel the order

`PATCH /api/orders/:id/cancel` — allowed **only while the order is `Pending`**. No body.

**curl** (use the order `id` from step 4)
```bash
curl.exe -X PATCH http://localhost:3000/api/orders/f7777777-…/cancel \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`** — the order comes back with `status: "Cancelled"`:
```json
{
  "id": "f7777777-…",
  "status": "Cancelled",
  "totalAmount": 140.99,
  "items": [ /* … */ ],
  "createdAt": "2026-07-15T09:05:00.000Z"
}
```

Cancel it a second time (or after an admin moves it to `Shipped`) and you'll get a `409 Conflict` — cancellation is only valid from `Pending`. That's the business rule working as intended.

---

## Admin bonus flow

Log in as the seeded admin (`admin@portal.local` / `Admin123!`) to get an admin token, then:

- `GET /api/admin/customers?page=1&limit=10` — all customers.
- `GET /api/admin/orders?page=1&limit=10` — all orders across customers.
- `PATCH /api/admin/orders/:id/status` with body `{ "status": "Shipped" }` — advance an order (fires an order-notification email; with the default `console` email driver it's logged to the container output).
- `PATCH /api/admin/customers/:id/deactivate` — after this, that customer can no longer log in.

A customer JWT calling any `/api/admin/*` route gets `403 Forbidden`; no token gets `401 Unauthorized`.

Valid order statuses: `Pending`, `Shipped`, `Delivered`, `Cancelled`.
