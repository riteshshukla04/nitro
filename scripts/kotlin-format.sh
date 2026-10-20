#!/usr/bin/env bash
set -eo pipefail

case "${1:-}" in
  "") options=(--format) ;;
  --check) options=() ;;
  *) echo "Usage: $0 [--check]" >&2; exit 1 ;;
esac
# The scaffold has unsubstituted $$ identifiers, which are not valid Kotlin.
source "$(dirname "$0")/format-files.sh" '*.kt' '*.kts' \
  ':(exclude)packages/template/android/src/main/java/com/margelo/nitro/$$androidNamespace$$/*.kt'
[[ ${#files[@]} -eq 0 ]] && exit 0
ktlint --editorconfig=.editorconfig "${options[@]}" "${files[@]}"
