# CLAUDE.md

Guidance for AI agents (and humans) working in this repository.

## What this is

A **Customer Portal API** — the backend for a customer-facing portal. Customers register, log in (JWT), manage their profile/password, and place / view / cancel / track orders. Admins manage customers and orders via role-protected endpoints.

The full requirements are in **`Technical_Scenario_API 2.docx`** at the repo root (the original task brief). Treat that document as the source of truth for *what* the API must do. Note: the brief says "using NodeJS" up front, but two of its requirement lines name **.NET-specific tools** (Serilog, Entity Framework Core) — a leftover from a .NET template. Those are substituted with Node-native equivalents (see below). `WRITEUP.md` explains the design decisions; `README.md` covers how to run it.

## Brief → implementation substitutions

The brief names two .NET-only technologies; this codebase uses the Node equivalents. Keep using the right-hand column:

| Brief (.NET) | Used here | Notes |
| --- | --- | --- |
| Entity Framework Core | **TypeORM** | Code-first migrations, entities, repository pattern |
| Serilog | **Pino** | Structured JSON logging (`src/infrastructure/logging`) |

The brief also mandates **Dependency Injection** — a language-agnostic pattern, not a .NET tool. It's implemented here with **tsyringe** (constructor injection; composition root is `src/container.ts`).

Other choices: **TypeScript** (compiled to CommonJS), **Express 5**, **PostgreSQL**, **Zod** for validation, **bcryptjs** + **jsonwebtoken** for auth.

## Architecture — the one rule that matters

Clean Architecture with dependencies pointing **inward**. Layers, from core outward:

- `src/domain/` — framework-free models, enums, **repository interfaces**, `AppError` hierarchy. Imports nothing from Express/TypeORM.
- `src/application/` — use-case **services**, DTOs, Zod validators, and outbound **ports** (`ILogger`, `ICacheService`, `IEmailService`, `ITokenService`, `IHasher`). Depends only on interfaces.
- `src/infrastructure/` — concrete implementations: TypeORM entities/repositories, config, logging, cache, email, security.
- `src/presentation/http/` — Express controllers, routes, middlewares, Swagger.

**Services must never import TypeORM or Express.** They depend on repository interfaces (`src/domain/repositories/*`) and ports (`src/application/ports/*`), which are bound to implementations in `src/container.ts`. This is what makes the app testable without a database.

## Commands

```bash
npm run dev            # start with hot reload (tsx)
npm run build          # compile to dist/
npm start              # run compiled build
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # jest + supertest (NO database needed)
npm run migration:run  # apply migrations (needs a running Postgres)
npm run migration:generate  # generate a migration from entity changes (needs a running DB)
npm run seed           # seed admin + sample products

docker compose up --build   # run the whole stack (API + Postgres); migrations+seed run on startup
docker compose up -d db      # run only Postgres, then `npm run dev` on the host
```

Always run `npm run typecheck && npm run lint && npm test` before considering a change done.

## Testing

Tests live in `tests/` and use **Supertest against the real Express app wired to in-memory repositories** (`tests/fakes/in-memory-repositories.ts`), registered through the same DI tokens as production (`tests/helpers/build-test-app.ts`). **No PostgreSQL or Docker is required.** `tests/setup-env.ts` sets required env vars before modules load. Add new HTTP behavior tests here; prefer exercising the real service/controller stack over mocking internals.

## Conventions & gotchas (learned the hard way)

- **Controllers need explicit `@inject()`.** The `tsx`/esbuild dev runner does **not** emit `design:paramtypes` metadata (only `ts-jest` does). Any class resolved by tsyringe with a bare class-typed constructor param will fail at runtime with *"TypeInfo not known"*. So controllers use `@inject(SomeService)` on every param, and services/repositories use `@inject(TOKENS.X)`. Keep this up when adding classes. TypeORM entities avoid the trap by declaring an explicit `type:` on every `@Column`.
- **DI tokens** for interfaces live in `src/shared/tokens.ts` (interfaces don't exist at runtime, so they're resolved by string token).
- **Express 5 `req.query` is read-only.** The `validate` middleware (`src/presentation/http/middlewares/validate.ts`) writes Zod-parsed input to **`req.validated`** (`{ body, query, params }`), not back onto `req.query`. Controllers read from `req.validated`.
- **Windows glob paths.** The `glob` lib treats `\` as an escape char. Any glob built with `path.join` must be `.replace(/\\/g, '/')` — see `swagger.ts` and `data-source.ts`. Symptom if forgotten: Swagger shows 0 paths, or migrations aren't found.
- **`data-source.ts` must export exactly one `DataSource`.** The TypeORM CLI errors on "more than one export of DataSource instance." Don't add a second (e.g. a default) export.
- **Postgres `numeric` → JS number.** Decimal columns use `numericTransformer` (`src/infrastructure/database/entities/numeric.transformer.ts`) so money values are real numbers, not strings.
- **Config fails fast.** `src/infrastructure/config/env.ts` validates env with Zod at import time and throws if `JWT_SECRET` (etc.) is missing. Tests/scripts must set env **before** importing app modules.
- **Migrations, not `synchronize`.** The schema is owned by explicit migrations in `src/infrastructure/database/migrations/`. `synchronize` is off. Change an entity → generate/write a migration.

## Adding a new endpoint (the pattern)

1. If it needs new persistence, add a method to the relevant interface in `src/domain/repositories/` and implement it in `src/infrastructure/database/repositories/`.
2. Put business logic in a service under `src/application/services/` (depend on interfaces via `@inject(TOKENS.X)`).
3. Add a Zod schema in `src/application/validators/schemas.ts`.
4. Add a controller method (`@inject` the service) and wire the route in `src/presentation/http/routes/`, using `validate(schema)`, `authenticate`, and `requireRole(...)` as needed.
5. Add an `@openapi` JSDoc block on the route so Swagger documents it; register any new response shape in `src/presentation/http/docs/swagger.ts`.
6. Add a Supertest case in `tests/`.

## Auth model

Single `customers` table with a `role` column (`customer` | `admin`). JWT carries `{ sub, email, role }`. `authenticate` middleware verifies the token and sets `req.user`; `requireRole(Role.Admin)` guards admin routes. Deactivated/deleted customers cannot log in. The seeded admin comes from `ADMIN_*` env vars.

## Do not commit

`.env` (secrets), `node_modules/`, `dist/`. See `.gitignore`. Use `.env.example` as the template.
