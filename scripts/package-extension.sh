#!/bin/bash

# =============================================================================
# AnkiBeam - Extension Packaging Script
# =============================================================================
# 
# This script creates a production-ready ZIP package for Chrome Web Store
# 
# Usage:
#   ./scripts/package-extension.sh [version]
#
# Examples:
#   ./scripts/package-extension.sh          # Uses version from manifest.json
#   ./scripts/package-extension.sh 1.0.1    # Overrides with specified version
#
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Output directory
OUTPUT_DIR="$PROJECT_ROOT/dist"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AnkiBeam Packager${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Navigate to project root
cd "$PROJECT_ROOT"

# Get version from manifest.json or command line
if [ -n "$1" ]; then
    VERSION="$1"
    echo -e "${YELLOW}Using specified version: $VERSION${NC}"
else
    VERSION=$(grep '"version"' manifest.json | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    echo -e "${GREEN}Using manifest version: $VERSION${NC}"
fi

# Validate version
if [ -z "$VERSION" ]; then
    echo -e "${RED}Error: Could not determine version${NC}"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Define output filename
OUTPUT_FILE="$OUTPUT_DIR/ankibeam-v${VERSION}.zip"

# Remove existing package if exists
if [ -f "$OUTPUT_FILE" ]; then
    echo -e "${YELLOW}Removing existing package...${NC}"
    rm "$OUTPUT_FILE"
fi

echo ""
echo -e "${BLUE}Packaging extension...${NC}"
echo ""

# Create ZIP with only required files
zip -r "$OUTPUT_FILE" \
    manifest.json \
    LICENSE \
    PRIVACY.md \
    README.md \
    background/ \
    content/ \
    icons/ \
    options/ \
    popup/ \
    services/ \
    styles/*.css \
    styles/*.min.css \
    utils/ \
    _locales/ \
    -x "*.DS_Store" \
    -x "*__MACOSX*" \
    -x "*.map" \
    -x "*test*" \
    -x "*.test.js" \
    -x "*node_modules*" \
    -x "*.git*" \
    -x "*dist*" \
    -x "scripts/*" \
    -x "docs/*" \
    -x "*.md" \
    -x "LICENSE" \
    -x "PRIVACY.md" \
    -x "README.md"

# Re-add specific markdown files (we excluded all .md above to avoid docs/)
zip "$OUTPUT_FILE" LICENSE PRIVACY.md README.md 2>/dev/null || true

# Show package info
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✅ Package created successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "📦 Output: ${BLUE}$OUTPUT_FILE${NC}"
echo -e "📏 Size:   $(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""

# List package contents
echo -e "${YELLOW}Package contents:${NC}"
unzip -l "$OUTPUT_FILE" | tail -n +4 | head -n -2 | awk '{print "  " $4}'

echo ""
echo -e "${GREEN}Ready to upload to Chrome Web Store!${NC}"
echo ""
