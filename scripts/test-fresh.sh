#!/usr/bin/env bash
# Честный прогон тестов.
#
# Обычный `ng test` может взять УСТАРЕВШУЮ копию модуля, если изменился только исходник, а файл
# спеки — нет (замечено вместе с работающим `ng serve`, общий каталог .angular/cache). Тест тогда
# «зелёный» на старом коде. Этот скрипт копирует проект во временную папку и дописывает в каждую
# спеку уникальный комментарий — так сборка гарантированно берёт свежий код. Ваше дерево не меняется.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rsync -a --exclude node_modules --exclude .angular --exclude dist --exclude .git "$SRC/" "$TMP/"
ln -s "$SRC/node_modules" "$TMP/node_modules"

STAMP="$(date +%s)$RANDOM"
find "$TMP/src" -name '*.spec.ts' -exec sh -c 'echo "// run $0" >> "$1"' "$STAMP" {} \;

cd "$TMP"
npx ng test --watch=false "$@"
