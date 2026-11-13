#!/usr/bin/env bash
# Vercel "Ignored Build Step" (web/vercel.json ignoreCommand, run from web/).
# Exit 0 = skip the build, exit 1 = build.
# Production always builds: a Deploy Hook's build of the same HEAD (a new
# place set in the dataset snapshot, web/lib/dataset-sync.ts) must never be
# skipped, and VERCEL_GIT_PREVIOUS_SHA is the last successful deployment,
# so a docs-only merge before it would skip it. A Preview skips only when
# every file changed since the previous deployed commit is docs or tests:
# docs/**, any *.md, *.test.* / *.spec.*, __tests__/. When in doubt (no
# previous deployed commit, or not in the clone, a git error, nothing
# changed), it builds: never a guess such as HEAD^, which on a branch's
# first push compares against the wrong commit.

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "vercel-ignore: production, building"
  exit 1
fi

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ]; then
  echo "vercel-ignore: no previous deployed commit, building"
  exit 1
fi
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "vercel-ignore: previous deployed commit not in the clone, building"
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
