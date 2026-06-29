#!/usr/bin/env bash
# Manage isolated git worktrees for parallel feature sessions.
# Usage:
#   pnpm session new <slug>   create feat/<slug> worktree from latest origin/main
#   pnpm session pr           push current branch and open a PR
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
worktrees="$root/.kilo/worktrees"

cmd="${1:-}"
slug="${2:-}"

case "$cmd" in
  new)
    if [[ -z "$slug" ]]; then
      read -rp "slug: " slug
    fi
    [[ -z "$slug" ]] && { echo "error: slug required" >&2; exit 1; }
    branch="feat/$slug"
    dir="$worktrees/$slug"
    git -C "$root" fetch origin main --quiet
    git -C "$root" worktree add -b "$branch" "$dir" origin/main
    echo "$dir"
    echo "open: code \"$dir\""
    ;;
  pr)
    branch="$(git branch --show-current)"
    git push -u origin "$branch"
    gh pr create --fill --base main
    ;;
  *)
    echo "usage: pnpm session new <slug> | pr" >&2
    exit 1
    ;;
esac
