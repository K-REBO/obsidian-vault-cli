#!/usr/bin/env bash
# Build precompiled binaries for release.
# Run this on an x86_64 machine (bun cross-compilation).
# Output goes to dist/; copy to target machines manually or via scp.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p dist

echo "Building linux-arm64 (Raspberry Pi 4/5)..."
bun build \
  --compile \
  --target=bun-linux-arm64 \
  --outfile=dist/obsidian-vault-arm64 \
  --define 'process.env.NODE_ENV="production"' \
  ./src/index.ts

echo ""
echo "Done:"
ls -lh dist/obsidian-vault-arm64
echo ""
echo "Deploy to Pi:"
echo "  scp dist/obsidian-vault-arm64 pi@<host>:~/.local/bin/obsidian-vault"
echo "  ssh pi@<host> chmod +x ~/.local/bin/obsidian-vault"
