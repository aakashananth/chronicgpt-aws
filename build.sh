#!/usr/bin/env bash
set -euo pipefail

# Always run from this script's directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "▶ Cleaning old build artifacts..."
rm -rf dist layer_build
mkdir -p dist
mkdir -p layer_build/python

echo "▶ Building dependency layer in Docker..."
# Uses the official Lambda Python 3.11 ARM image so binaries match Lambda
docker run --rm \
  -v "$PWD":/var/task \
  --entrypoint /bin/bash \
  public.ecr.aws/lambda/python:3.11-arm64 \
  -c "
    set -e
    cd /var/task
    pip install --upgrade pip >/dev/null
    pip install -r requirements.txt -t layer_build/python
  "

echo "▶ Packaging Lambda layer..."
(
  cd layer_build
  zip -r ../dist/layer_health_metrics_python311.zip . >/dev/null
)

build_lambda() {
  local name="$1"
  local tmp_dir="dist/${name}_tmp"

  echo "▶ Packaging function: ${name}"

  rm -rf "$tmp_dir"
  mkdir -p "$tmp_dir"

  # Copy shared code
  cp -r common "$tmp_dir/common"

  # Copy this function's handler
  cp "${name}/handler.py" "$tmp_dir/handler.py"

  # Create the zip right next to it
  (
    cd "$tmp_dir"
    zip -r "../${name}.zip" . >/dev/null
  )

  rm -rf "$tmp_dir"
}

build_lambda "lambda_fetch_raw"
build_lambda "lambda_process_metrics"
build_lambda "lambda_generate_explanation"

echo "✅ Done. Built packages in ./dist:"
ls -lh dist

