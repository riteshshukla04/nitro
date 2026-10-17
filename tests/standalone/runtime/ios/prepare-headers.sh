#!/bin/sh
set -eu

# Nitrogen uses flat <NitroModules/Header.hpp> imports. Keep that include layout
# without copying or maintaining a second list of the native source headers.
headers="${BUILT_PRODUCTS_DIR:?}/include/NitroModules"
staging=$(mktemp -d "${BUILT_PRODUCTS_DIR}/NitroModules-headers.XXXXXX")
trap 'rm -rf "$staging"' EXIT HUP INT TERM

find "${NITRO_NATIVE:?}/cpp" "${NITRO_NATIVE}/apple" -type f \
  \( -name '*.hpp' -o -name '*.h' \) \
  ! -path '*/cpp/views/*' ! -path '*/apple/turbomodule/*' \
  ! -name 'CallInvokerDispatcher.hpp' | sort | while IFS= read -r header; do
  destination="$staging/$(basename "$header")"
  if [ -L "$destination" ]; then
    echo "error: Duplicate Nitro header name: $(basename "$header")" >&2
    exit 1
  fi
  ln -s "$header" "$destination"
done

mkdir -p "$(dirname "$headers")"
rm -rf "$headers"
mv "$staging" "$headers"
