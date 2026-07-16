# Design Write-Up — Customer Portal API

## Approach

I built the Customer Portal API as a layered **Clean Architecture** application in TypeScript. The guiding rule is that dependencies point inward: the innermost **domain** layer knows nothing about the web or the database, and the outer layers depend on it — never the reverse. This keeps the business rules isolated from framework and infrastructure concerns.

The four layers:

- **Domain** — framework-free models, enums, the `AppError` hierarchy, and **repository interfaces**. Nothing here imports Express or TypeORM.
- **Application** — use-case **services**, DTOs, Zod validators, and outbound **ports** (`ILogger`, `ICacheService`, `IEmailService`, `ITokenService`, `IHasher`). Services depend only on interfaces.
- **Infrastructure** — the implementations: TypeORM entities and repositories, config, Pino logging, cache and email adapters, JWT and bcrypt.
- **Presentation** — Express controllers, routes, middleware (auth, role guard, validation, error handling), and Swagger.

A single **composition root** (`container.ts`) wires interfaces to implementations with **tsyringe**: every class receives its dependencies by constructor injection — Dependency Inversion in practice.

## Adapting the brief to Node.js

The brief says "using NodeJS" up front, while two of its requirement lines name **.NET-only tools**: logging "using a logging library like Serilog", and abstracting **Entity Framework Core** from business logic. Neither runs on Node, so the two requirements can't both be satisfied as written. I resolved it in favour of the stated platform and read each .NET reference as naming a **capability** rather than a product: **TypeORM** for the ORM with code-first migrations, and **Pino** for structured logging. The brief's **Dependency Injection** requirement is a language-agnostic principle rather than a .NET tool; I implemented it with **tsyringe**.

Other deliberate choices: **PostgreSQL**; **Express 5** with hand-built layers (rather than a batteries-included framework) so the Clean-Architecture structure is explicit; **Zod** for boundary validation; and **JWT + bcryptjs** for auth. A `Product` entity was introduced so orders reference real line items and totals are computed server-side rather than trusted from the client.

## Key design decisions

- **Repository Pattern abstracts the ORM.** Services never touch TypeORM; they depend on repository interfaces, and the TypeORM implementations map persistence entities to plain domain models. This satisfies the brief's "abstract EF Core from business logic", and made database-free testing possible.
- **Code-first migrations, `synchronize` off.** The schema is owned by an explicit, reviewable migration — never auto-synced in production.
- **Global error handling, and no 500 the client can cause.** A custom `AppError` hierarchy carries HTTP status codes; one middleware maps them to consistent JSON responses. A `500` should mean *we* broke, so anything the caller can provoke must be a 4xx: malformed JSON is rejected by the body parser before any route runs, where Zod never sees it, so the handler restates those as `400`/`413` rather than letting them fall through. Unexpected errors are logged and returned as a generic 500 so internals never leak.
- **The order lifecycle is a domain rule, not a controller check.** Legal transitions live in one policy in the domain layer, with `Delivered` and `Cancelled` terminal. Both the customer cancel path and the admin status-update path consult it, so "you can't cancel a shipped order" and "an admin can't ship a cancelled one" are the same rule enforced once rather than two checks that can drift apart.
- **Security.** Passwords are bcrypt-hashed; login returns a uniform "Invalid credentials" message to avoid user enumeration; JWTs carry the role for authorization; Helmet, CORS, and rate-limiting protect the surface.
- **Deactivation takes effect immediately.** A JWT outlives the account it was signed for, so verifying the signature isn't enough: the auth middleware also confirms the subject still resolves to a live, active customer. Without it, deactivating an account would leave the customer with a fully working token until it expired. The check reads through the profile cache — already invalidated on deactivate/delete — so on a warm cache it costs no extra query.
- **Input is validated on meaning, not shape.** Phone numbers are checked on the digits they carry (7–15, per E.164) rather than their punctuation, so real formats like `+60 12-345 6789` are accepted while nonsense is rejected. An order may list a product only once, so quantities can't be split across duplicate lines. Bodies are strict: an unknown field is a 422 rather than an ignored key, so a typo — or a hopeful `"role": "admin"` on register — gets a straight answer instead of a 201 that quietly dropped it.
- **Logging is operator data, not an API surface.** Pino emits one terse line per request plus explicit events for login, order placement and every admin action, with credentials redacted — JSON for aggregators, human-readable when `LOG_PRETTY` is set. I exposed no log endpoint: logs carry customer emails and login events, so serving them over the API would turn an operations concern into an information-disclosure risk. An optional Compose profile wires in a log viewer instead.
- **Bonus features, all behind interfaces.** Pagination on every listing endpoint; an `ICacheService` (in-memory by default, Redis-swappable) caching profile and order-status reads with write-invalidation; and `IEmailService` notifications on order placed / shipped, failures caught so they never fail the order. The order-status cache stores the owner alongside the status, so a hit can be authorized without re-reading the order — otherwise the "cached" read would still hit the database.

## Challenges & solutions

- **A passing test suite didn't mean the app ran.** The DI container works out what each class needs from type information the compiler leaves behind. The test runner produced it; the dev runner didn't — so every test passed while the app itself crashed on startup. The fix was to name each dependency explicitly rather than rely on that inference. The lesson stuck: green tests prove the code they cover, not that the thing boots.
- **The database returned money as text.** PostgreSQL hands back decimal columns as strings to protect precision, so a 25.50 price arrived as `"25.50"` — and in JavaScript, adding that to a number joins them as text instead of summing. A transformer now converts decimals at the database boundary, so totals are real numbers everywhere above it.
- **Swagger quietly documented nothing.** The docs page loaded fine but listed zero endpoints: the library that scans files for annotations treats `\` as an escape character, so the Windows paths matched nothing — and it returned an empty result rather than an error. Forward slashes fixed it. That's why I now check the generated spec itself instead of trusting that the page came up.
- **Using AI agents moved where the effort goes.** I built this with heavy use of AI coding agents. Producing a layered app that way is fast, so the real work becomes deciding what to accept: agents write confident code that passes its own tests, which makes "it looks correct" worth very little. I treated agent output as unverified until I had driven the endpoints myself and read the responses. That caught two bugs that read perfectly well on the page — an admin could move a cancelled order back to `Shipped`, and deactivating a customer left their token working until it expired — each now a single rule in the domain layer, pinned by a test that fails without the fix.

## Testing & verification

The Jest/Supertest suite exercises the **real Express app** wired to in-memory repositories through the production DI tokens — no database required — covering auth, profile and password flows, input validation, the order lifecycle rules, ownership checks, pagination, and role-based authorization.

That suite deliberately swaps the database out, so it can't vouch for the persistence layer — and a console email driver proves nothing about SMTP. Both are verified by running the whole stack under Docker: migrations applying to an empty database, the decimal transformer returning real numbers, the foreign-key cascade when a customer with orders is deleted, and the order emails genuinely arriving in a real inbox (Compose starts a Mailpit SMTP server alongside the API, so a reviewer can watch them land). Knowing which claims a given test can and cannot support is the point.

## Possible next steps

Refresh tokens and token revocation; transactional order creation with stock decrement; structured audit logging; integration tests against a disposable Postgres in CI; and OpenAPI-driven contract tests.
