#!/bin/bash
# Build Lambda deployment packages using Docker
# This ensures dependencies are built for the correct architecture (arm64)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Building Lambda deployment packages using Docker...${NC}"
echo -e "${BLUE}Using Python 3.11 arm64 Lambda base image${NC}"
echo ""

# Create dist directory
mkdir -p dist
rm -rf dist/*

# Use AWS Lambda Python 3.11 arm64 base image
LAMBDA_IMAGE="public.ecr.aws/lambda/python:3.11-arm64"

echo -e "${YELLOW}Installing dependencies in Docker container...${NC}"

# Run Docker container to install dependencies and build packages
docker run --rm \
    -v "$SCRIPT_DIR:/app" \
    -w /app \
    "$LAMBDA_IMAGE" \
    /bin/bash -c "
        set -e
        echo 'Installing build tools...'
        yum install -y zip gcc gcc-c++ python3-devel 2>/dev/null || apt-get update && apt-get install -y zip gcc g++ python3-dev 2>/dev/null || true
        
        echo 'Installing Python dependencies...'
        mkdir -p packages
        pip install --upgrade pip
        pip install -r requirements.txt -t packages --no-cache-dir
        
        echo 'Building Lambda ZIP packages...'
        python3 build_lambdas.py packages
        
        echo ''
        echo 'Build complete!'
    "

echo ""
echo -e "${GREEN}✓ All Lambda packages built successfully!${NC}"
echo -e "${BLUE}Packages are in: dist/${NC}"
ls -lh dist/*.zip

# Display package sizes
echo ""
echo -e "${BLUE}Package sizes:${NC}"
du -h dist/*.zip

