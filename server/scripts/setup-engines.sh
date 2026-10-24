#!/usr/bin/env bash
# NOVARA Commerce — Prisma engine setup for restricted networks.
#
# On some networks, Node's fetch (used by Prisma's postinstall) cannot download
# engine binaries from binaries.prisma.sh (connection reset), while curl works.
# This script downloads the engines with curl into node_modules/@prisma/engines
# and prints the PRISMA_*_BINARY exports needed by the Prisma CLI.
#
# Usage:
#   ./scripts/setup-engines.sh
#   eval "$(./scripts/setup-engines.sh)"   # to export the vars in your shell
set -euo pipefail
cd "$(dirname "$0")/.."

COMMIT="$(node -e "const p=require('./node_modules/@prisma/engines-version/package.json'); console.log(typeof p.prisma === 'string' ? p.prisma : (p.prisma && p.prisma.enginesVersion) || '')" 2>/dev/null || true)"
if [ -z "$COMMIT" ]; then
  COMMIT="$(node -p "require('./node_modules/@prisma/engines-version/dist/index.js').enginesVersion" 2>/dev/null || true)"
fi
# Fallback: read from the installed package directly
if [ -z "$COMMIT" ]; then
  COMMIT="$(node -e "const v=require('./node_modules/@prisma/engines-version/package.json'); console.log(v.prisma || v.enginesVersion)" 2>/dev/null || true)"
fi
if [ -z "$COMMIT" ]; then
  echo "Could not determine Prisma engines commit. Run 'npm install --ignore-scripts' first." >&2
  exit 1
fi

TARGET="debian-openssl-3.0.x"
ENGINES_DIR="node_modules/@prisma/engines"
mkdir -p "$ENGINES_DIR"

dl() { # $1 = remote name, $2 = local name, $3 = extra dest dir (optional)
  if [ ! -x "$ENGINES_DIR/$2" ]; then
    curl -sSL -o "/tmp/$2.gz" "https://binaries.prisma.sh/all_commits/${COMMIT}/${TARGET}/$1.gz"
    gunzip -f "/tmp/$2.gz"
    mv "/tmp/$2" "$ENGINES_DIR/$2"
    chmod +x "$ENGINES_DIR/$2"
  fi
  if [ -n "${3:-}" ]; then
    cp "$ENGINES_DIR/$2" "$3/$2"
    chmod +x "$3/$2"
  fi
}

dl "schema-engine" "schema-engine-${TARGET}"
dl "libquery_engine.so.node" "libquery_engine-${TARGET}.so.node" "node_modules/prisma"
dl "query-engine" "query-engine-${TARGET}"

echo "export PRISMA_SCHEMA_ENGINE_BINARY=$PWD/$ENGINES_DIR/schema-engine-${TARGET}"
echo "export PRISMA_QUERY_ENGINE_BINARY=$PWD/$ENGINES_DIR/libquery_engine-${TARGET}.so.node"
echo "# Engines ready (commit ${COMMIT}). Source the exports above, then run prisma generate / migrate." >&2
