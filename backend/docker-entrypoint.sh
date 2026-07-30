#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
npm run migration:run

seed_enabled="${AUTO_SEED:-${SEED_ON_BOOT:-false}}"
if [ "$seed_enabled" = "true" ]; then
  echo "[entrypoint] Running database seeds..."
  npm run seed
else
  echo "[entrypoint] Skipping database seeds; set AUTO_SEED=true to run them"
fi

# The standalone seed already ran above when enabled; never repeat it at app bootstrap.
export AUTO_SEED=false

echo "[entrypoint] Starting backend..."
exec node dist/main.js
