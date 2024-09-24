#!/bin/bash

# Path to the file where changed files will be listed
CHANGED_FILES="cella-changed.txt"

# Path to the ignore file
IGNORE_FILE="cella-ignore.txt"

# Navigate to the repository
cd "$(dirname "$0")"  # Ensures the script runs in its directory

# Fetch upstream changes
git fetch upstream

# Checkout the main branch
git checkout main

# Get the list of tracked files from upstream/main
UPSTREAM_FILES=$(git ls-tree -r upstream/main --name-only)

# Get the list of tracked files from local main branch
MAIN_FILES=$(git ls-tree -r main --name-only)

# Find common files between upstream/main and local main branch
COMMON_FILES=$(comm -12 <(echo "$UPSTREAM_FILES" | sort) <(echo "$MAIN_FILES" | sort))

# Compare the local main branch with upstream/main to get the changed files
git diff --name-only main upstream/main > "$CHANGED_FILES.tmp"

# Read ignore file and store files to ignore
if [[ -f "$IGNORE_FILE" ]]; then
    IGNORE_PATTERNS=$(cat "$IGNORE_FILE")
else
    echo "Ignore file $IGNORE_FILE not found! Proceeding without ignoring files."
    IGNORE_PATTERNS=""
fi

# Filter changed files:
# 1. Files must be present in both upstream and main branches
# 2. Exclude files listed in the ignore file
grep -Fxf <(echo "$COMMON_FILES") "$CHANGED_FILES.tmp" | grep -vFxf <(echo "$IGNORE_PATTERNS") > "$CHANGED_FILES"

# Check if any files were changed and are present in both branches, but not ignored
if [[ -s "$CHANGED_FILES" ]]; then
    echo "The following files have changed, are present in both branches, and are not ignored:"
    cat "$CHANGED_FILES"
else
    echo "No files have changed between upstream/main and local main that are not ignored."
fi

# Clean up temporary file
rm "$CHANGED_FILES.tmp"
