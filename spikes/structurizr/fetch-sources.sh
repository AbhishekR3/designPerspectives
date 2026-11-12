#!/usr/bin/env bash
# Fetches the two upstream files this spike read, at the commits recorded in the report. Nothing upstream is vendored.
# Usage: fetch-sources.sh <empty-output-dir>     then: python3 -I validate.py <dir>/structurizr.yaml sample.workspace.json
set -euo pipefail
out="$1"; mkdir -p "$out"
get() { # repo sha path dest
  git clone -q --filter=blob:none --no-checkout "https://github.com/$1" "$out/_c"
  git -C "$out/_c" show "$2:$3" > "$out/$4"; rm -rf "$out/_c"
}
get structurizr/structurizr ad34036c5a1227535fc9adea9a0f97de5962189d structurizr-json/structurizr.yaml structurizr.yaml
get structurizr/structurizr.github.io 530a96451b93f8fb96337b58aaaa1ec8c0ad4589 dsl/71-language.md dsl-language.md
