#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
npm run migration:run

echo "[entrypoint] Running database seeds..."
npm run seed

echo "[entrypoint] Starting backend..."
exec node dist/main.js
