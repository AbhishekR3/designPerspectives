#!/usr/bin/env bash
# W0-SPIKE-FIXTURES probe: shallow-clone one repo into a temp dir, print facts, delete the clone.
# Usage: probe.sh <owner/repo> <workdir>
set -u
repo="$1"; work="$2"; d="$work/$(echo "$repo" | tr '/' '_')"
rm -rf "$d"; mkdir -p "$work"
echo "=== $repo"
timeout 300 git clone -q --depth 1 "https://github.com/$repo" "$d" 2>&1 | tail -1
cd "$d" || { echo "CLONE FAILED"; exit 0; }
echo "branch=$(git rev-parse --abbrev-ref HEAD) sha=$(git rev-parse HEAD) date=$(git log -1 --format=%cI)"
git ls-files > "$work/files.txt"
echo "files=$(wc -l < "$work/files.txt") worktreeMB=$(du -sm --exclude=.git . | cut -f1) gitMB=$(du -sm .git | cut -f1)"
lic=$(ls | grep -iE '^(LICEN[CS]E|COPYING)' | head -1); echo "licenceFile=$lic :: $(grep -vE '^\s*$' "$lic" 2>/dev/null | head -3 | tr -s ' ' | tr '\n' '|' | cut -c1-200)"
echo "ext: $(grep -vE '(^|/)(node_modules|vendor)/' "$work/files.txt" | grep -oE '\.[A-Za-z0-9]+$' | sort | uniq -c | sort -rn | head -14 | awk '{printf "%s=%s ", $2, $1}')"
c(){ grep -ciE "$1" "$work/files.txt"; }
echo "compose=$(c '(^|/)(docker-)?compose[^/]*\.ya?ml$') dockerfile=$(c '(^|/)Dockerfile') k8sDir=$(c '(^|/)(kubernetes|k8s|kustomize|kubernetes-manifests)/') kustomization=$(c 'kustomization\.ya?ml$') helmChart=$(c '(^|/)Chart\.yaml$') tf=$(c '\.tf$') proto=$(c '\.proto$') openapi=$(c '(openapi|swagger)[^/]*\.(ya?ml|json)$') pnpmWs=$(c '^pnpm-workspace\.yaml$') turbo=$(c '^turbo\.jsonc?$') pkgJson=$(c '(^|/)package\.json$') csproj=$(c '\.csproj$') pom=$(c '(^|/)pom\.xml$') gradle=$(c 'build\.gradle')"
echo "k8sManifestsByContent=$(grep -rlE '^kind: (Deployment|StatefulSet|Service)$' --include=*.yaml --include=*.yml . 2>/dev/null | grep -v '^./.git/' | wc -l)"
echo "top: $(ls | tr '\n' ' ' | cut -c1-400)"
cd /; rm -rf "$d" "$work/files.txt"
