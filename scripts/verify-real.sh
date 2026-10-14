#!/usr/bin/env bash
# Сверка с настоящим инструментарием LLVM (clang + lld + llvm-mc, цель riscv32).
# Нужно: brew install llvm lld (или переменные LLVM_BIN / LLD_BIN с путями к bin).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${LLVM_BIN:-}" ]; then
  for d in /opt/homebrew/opt/llvm/bin /opt/homebrew/Cellar/llvm@*/*/bin /usr/local/opt/llvm/bin /usr/lib/llvm-*/bin; do
    [ -x "$d/llvm-mc" ] && LLVM_BIN="$d" && break
  done
fi
if [ -z "${LLD_BIN:-}" ]; then
  for d in /opt/homebrew/opt/lld/bin /opt/homebrew/Cellar/lld@*/*/bin /usr/local/opt/lld/bin; do
    [ -x "$d/ld.lld" ] && LLD_BIN="$d" && break
  done
fi
: "${LLVM_BIN:?не найден llvm-mc: установите llvm или задайте LLVM_BIN}"
if [ -z "${LLD_BIN:-}" ] && [ -x "$LLVM_BIN/ld.lld" ]; then LLD_BIN="$LLVM_BIN"; fi
export LLVM_BIN LLD_BIN="${LLD_BIN:-}"

out="$(mktemp -d)/verify-real.mjs"
npx esbuild scripts/verify-real.entry.ts --bundle --platform=node --format=esm --log-level=error --outfile="$out"
node "$out"
