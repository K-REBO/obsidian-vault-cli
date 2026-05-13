#!/usr/bin/env bash
# Install obsidian-vault CLI to ~/.local/bin
#
# Pi 4B / ARM64: copies precompiled binary from dist/ if present, else falls back to bun source.
# x86_64:        symlinks bin/obsidian-vault (requires bun in PATH).
set -e

CLI_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="${HOME}/.local/bin"
ARCH="$(uname -m)"

mkdir -p "$BIN_DIR"

install_symlink() {
    ln -sf "$CLI_DIR/bin/obsidian-vault" "$BIN_DIR/obsidian-vault"
    echo "Installed (bun source): $BIN_DIR/obsidian-vault"
}

install_binary() {
    local src="$1"
    cp "$src" "$BIN_DIR/obsidian-vault"
    chmod +x "$BIN_DIR/obsidian-vault"
    echo "Installed (precompiled binary): $BIN_DIR/obsidian-vault"
}

case "$ARCH" in
  aarch64)
    BINARY="$CLI_DIR/dist/obsidian-vault-arm64"
    if [[ -f "$BINARY" ]]; then
        install_binary "$BINARY"
    elif command -v bun &>/dev/null; then
        echo "No precompiled binary found. Falling back to bun source."
        echo "  To build the binary: bash build-release.sh"
        install_symlink
    else
        echo "Error: neither dist/obsidian-vault-arm64 nor bun found."
        echo "  Option 1: copy the precompiled binary — bash build-release.sh on an x86 machine, then scp dist/obsidian-vault-arm64 here"
        echo "  Option 2: install bun — curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
    ;;
  x86_64|amd64)
    if ! command -v bun &>/dev/null; then
        echo "Error: bun not found. Install from https://bun.sh"
        exit 1
    fi
    install_symlink
    ;;
  *)
    echo "Unsupported architecture: $ARCH"
    echo "Supported: x86_64, aarch64 (Raspberry Pi 4/5)"
    exit 1
    ;;
esac

if ! command -v obsidian-vault &>/dev/null; then
    echo "Add to PATH: export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
