#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run build
node "$ROOT/scripts/inline-native-web.mjs"

echo "Synced self-contained web build to native/Shared/WebApp"
