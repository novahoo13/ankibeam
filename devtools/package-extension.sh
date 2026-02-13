#!/bin/bash

# AnkiBeam - Extension Packaging Script
#
# Usage:
#   ./scripts/package-extension.sh [version]
#
# Examples:
#   ./scripts/package-extension.sh          # Uses version from manifest.json
#   ./scripts/package-extension.sh 1.0.1    # Overrides with specified version

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/dist"
STAGING_DIR="$OUTPUT_DIR/_staging"

cd "$PROJECT_ROOT"

# Get version
if [ -n "$1" ]; then
    VERSION="$1"
else
    VERSION=$(grep '"version"' manifest.json | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
fi

if [ -z "$VERSION" ]; then
    echo "Error: Could not determine version"
    exit 1
fi

echo "Packaging AnkiBeam v${VERSION}..."

# Clean previous build
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

# Copy extension files to staging
cp manifest.json LICENSE PRIVACY.md "$STAGING_DIR/"
cp -r background content icons options popup services utils _locales "$STAGING_DIR/"

# Copy only CSS files from styles (not source maps)
mkdir -p "$STAGING_DIR/styles"
cp styles/*.css "$STAGING_DIR/styles/"

# Remove test files from staging
find "$STAGING_DIR" -name '*.test.js' -delete
find "$STAGING_DIR" -name '*.map' -delete

# Create zip
OUTPUT_FILE="$OUTPUT_DIR/ankibeam-v${VERSION}.zip"
rm -f "$OUTPUT_FILE"
cd "$STAGING_DIR"
zip -r "$OUTPUT_FILE" . -x '*.DS_Store' '*__MACOSX*'
cd "$PROJECT_ROOT"

# Clean staging
rm -rf "$STAGING_DIR"

# Report
echo ""
echo "Package created: $OUTPUT_FILE"
echo "Size: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo "Contents:"
unzip -l "$OUTPUT_FILE" | tail -n +4 | head -n -2 | awk '{print "  " $4}'
