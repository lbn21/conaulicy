#!/usr/bin/env bash
# Vercel "Ignored Build Step" (web/vercel.json ignoreCommand, run from web/).
# Exit 0 = skip the build, exit 1 = build.
# Skips only when every file changed since the previous deployed commit is
# docs or tests: docs/**, any *.md, *.test.* / *.spec.*, __tests__/.
# When in doubt (no base commit, git error, nothing changed), it builds.

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  base="HEAD^"
fi
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "vercel-ignore: no base commit, building"
  exit 1
fi

if ! changed="$(git diff --name-only "$base" HEAD)"; then
  echo "vercel-ignore: git diff failed, building"
  exit 1
fi
if [ -z "$changed" ]; then
  echo "vercel-ignore: no changed files, building"
  exit 1
fi

while IFS= read -r file; do
  case "$file" in
    docs/*) ;;
    *.md) ;;
    *.test.* | *.spec.*) ;;
    __tests__/* | */__tests__/*) ;;
    *)
      echo "vercel-ignore: $file needs a build"
      exit 1
      ;;
  esac
done <<< "$changed"

echo "vercel-ignore: docs and tests only since ${base}, skipping the build"
exit 0
