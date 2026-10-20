#!/usr/bin/env bash
set -eo pipefail

case "${1:-}" in
  "") options=(-i) ;;
  --check) options=(--dry-run --Werror) ;;
  *) echo "Usage: $0 [--check]" >&2; exit 1 ;;
esac
source "$(dirname "$0")/format-files.sh" \
  '*.c' '*.h' '*.cc' '*.hh' '*.cpp' '*.hpp' '*.cxx' '*.hxx' '*.m' '*.mm'
[[ ${#files[@]} -eq 0 ]] && exit 0
clang-format --style=file:config/.clang-format "${options[@]}" "${files[@]}"
