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
    # Refuse to PR from main, or from a branch that already has an open PR
    # (a likely-reused old branch). Offer a fresh feat/<slug> branch instead.
    has_pr=""
    [[ "$branch" != "main" ]] && has_pr="$(gh pr list --head "$branch" --state open --json number --jq '.[0].number' 2>/dev/null || true)"
    if [[ "$branch" == "main" || -n "$has_pr" ]]; then
      [[ "$branch" == "main" ]] && echo "on main — need a feature branch" || echo "branch '$branch' already has PR #$has_pr"
      read -rp "new slug: " slug
      [[ -z "$slug" ]] && { echo "error: slug required" >&2; exit 1; }
      branch="feat/$slug"
      git switch -c "$branch"
    fi
    git push -u origin "$branch"
    gh pr create --fill --base main
    # Return to main so the next session starts from a clean base.
    git switch main
    ;;
  *)
    echo "usage: pnpm session new <slug> | pr" >&2
    exit 1
    ;;
esac
