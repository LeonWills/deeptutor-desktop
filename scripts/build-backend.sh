#!/bin/bash
# Build the DeepTutor backend as a standalone binary for macOS / Linux.
#
# Usage:  bash scripts/build-backend.sh
# Env:    DEEPTUTOR_SRC — path to the DeepTutor checkout (default: ../DeepTutor)
#
# Result: build/dist/deeptutor-backend/  (consumed by electron-builder)

set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEEPTUTOR_SRC="${DEEPTUTOR_SRC:-$(cd "$DESKTOP_DIR/.." && pwd)/DeepTutor}"

echo ">> DeepTutor source: $DEEPTUTOR_SRC"

PYTHON=""
for candidate in python3.12 python3.11 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
        version="$("$candidate" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
        case "$version" in
            3.11|3.12|3.13|3.14) PYTHON="$candidate"; break ;;
        esac
    fi
done
[ -n "$PYTHON" ] || { echo "Python 3.11+ is required"; exit 1; }
echo ">> Using $PYTHON ($version)"

if [ ! -x "$DEEPTUTOR_SRC/.venv/bin/python" ]; then
    echo ">> Creating venv"
    "$PYTHON" -m venv "$DEEPTUTOR_SRC/.venv"
fi

echo ">> Installing deeptutor + pyinstaller"
"$DEEPTUTOR_SRC/.venv/bin/pip" install --quiet --upgrade pip
"$DEEPTUTOR_SRC/.venv/bin/pip" install --quiet -e "$DEEPTUTOR_SRC" pyinstaller

echo ">> Running PyInstaller"
rm -rf "$DESKTOP_DIR/build/dist/deeptutor-backend"
DESKTOP_DIR="$DESKTOP_DIR" DEEPTUTOR_SRC="$DEEPTUTOR_SRC" \
    "$DEEPTUTOR_SRC/.venv/bin/pyinstaller" --noconfirm \
    --distpath "$DESKTOP_DIR/build/dist" \
    --workpath "$DESKTOP_DIR/build/work" \
    "$DESKTOP_DIR/build/deeptutor-backend.spec"

echo ">> Done: $DESKTOP_DIR/build/dist/deeptutor-backend"
