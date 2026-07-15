#!/bin/sh
# Container startup: apply migrations, seed baseline data, then run the API.
# The DB is guaranteed reachable because compose waits for its healthcheck.
set -e

echo "→ Applying database migrations..."
npm run migration:run:prod

echo "→ Seeding baseline data (idempotent)..."
npm run seed:prod || echo "  (seed skipped or already applied)"

echo "→ Starting Customer Portal API..."
exec node dist/server.js
