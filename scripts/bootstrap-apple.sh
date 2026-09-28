#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required."
  exit 1
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install xcodegen
  else
    echo "XcodeGen is required. Install it, then run this script again."
    exit 1
  fi
fi

bash "$ROOT/scripts/sync-native-web.sh"

cd "$ROOT/native/Apple"
xcodegen generate

echo
echo "Generated native/Apple/R2Remote.xcodeproj"
echo "Open it in Xcode, choose R2Remote-iOS or R2Remote-macOS, then Run."
