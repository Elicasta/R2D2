#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEBAPP="$ROOT/native/Shared/WebApp"

cd "$ROOT"

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run build

rm -rf "$WEBAPP"
mkdir -p "$WEBAPP"
cp -R "$ROOT/dist/." "$WEBAPP/"

echo "Synced web build to native/Shared/WebApp"
