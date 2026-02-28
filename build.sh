#!/usr/bin/env bash
# Build PIP-BOY 4000 as a macOS .app bundle.
# Usage: bash build.sh
set -euo pipefail

echo "==> Installing PyInstaller..."
pip install pyinstaller

echo "==> Building .app bundle..."
pyinstaller pipboy.spec --noconfirm

echo "==> Ad-hoc code signing..."
codesign --deep --force --sign - "dist/PIP-BOY 4000.app"

echo "==> Done! App is at: dist/PIP-BOY 4000.app"
