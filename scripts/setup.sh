#!/usr/bin/env bash
set -euo pipefail

ln -sf "$CONDUCTOR_ROOT_PATH/apps/web/.env.local" apps/web/.env.local
ln -sf "$CONDUCTOR_ROOT_PATH/apps/dashboard/.env.local" apps/dashboard/.env.local
ln -sf "$CONDUCTOR_ROOT_PATH/packages/backend/.env.local" packages/backend/.env.local
ln -sf "$CONDUCTOR_ROOT_PATH/packages/backend/convex/.env" packages/backend/convex/.env

bun install
