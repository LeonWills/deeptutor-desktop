#!/bin/bash
# Download a standalone Node.js runtime for the frontend server into build/node/.
# Usage: bash scripts/fetch-node.sh [darwin-arm64|darwin-x64|linux-x64|linux-arm64]
set -euo pipefail

NODE_VERSION="v22.21.0"
PLATFORM="${1:-darwin-arm64}"
DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$DESKTOP_DIR/build/node"

TARBALL="node-${NODE_VERSION}-${PLATFORM}.tar.gz"
URL="https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo ">> $URL"
curl -fsSL -o "$TMP/$TARBALL" "$URL"
tar -xzf "$TMP/$TARBALL" -C "$TMP"

mkdir -p "$OUT"
cp "$TMP/node-${NODE_VERSION}-${PLATFORM}/bin/node" "$OUT/node"
cp "$TMP/node-${NODE_VERSION}-${PLATFORM}/LICENSE" "$OUT/LICENSE.node"
xattr -d com.apple.quarantine "$OUT/node" 2>/dev/null || true

"$OUT/node" --version
echo ">> Done: $OUT/node"
