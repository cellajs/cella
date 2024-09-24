#!/bin/bash

# Path to the file where changed files will be listed
CHANGED_FILES="cella.changed.txt"

# Path to the ignore file
IGNORE_FILE="cella.ignore.txt"

# Navigate to the repository
cd "$(dirname "$0")"  # Ensures the script runs in its directory

# Fetch upstream changes
git fetch upstream

# Checkout the development branch
git checkout development

# Get the list of tracked files from upstream/development
UPSTREAM_FILES=$(git ls-tree -r upstream/development --name-only)

# Get the list of tracked files from local development branch
MAIN_FILES=$(git ls-tree -r development --name-only)

# Find common files between upstream/development and local development branch
COMMON_FILES=$(comm -12 <(echo "$UPSTREAM_FILES" | sort) <(echo "$MAIN_FILES" | sort))

# Compare the local development branch with upstream/development to get the changed files
git diff --name-only development upstream/development > "$CHANGED_FILES.tmp"

# Read ignore file and store files to ignore
if [[ -f "$IGNORE_FILE" ]]; then
    IGNORE_PATTERNS=$(cat "$IGNORE_FILE")
else
    echo "Ignore file $IGNORE_FILE not found! Proceeding without ignoring files."
    IGNORE_PATTERNS=""
fi

# Filter changed files:
# 1. Files must be present in both upstream and development branches
# 2. Exclude files listed in the ignore file
grep -Fxf <(echo "$COMMON_FILES") "$CHANGED_FILES.tmp" | grep -vFxf <(echo "$IGNORE_PATTERNS") > "$CHANGED_FILES"

# Check if any files were changed and are present in both branches, but not ignored
if [[ -s "$CHANGED_FILES" ]]; then
    echo "The following files have changed, are present in both branches, and are not ignored:"
    cat "$CHANGED_FILES"
else
    echo "No files have changed between upstream/development and local development that are not ignored."
fi

# Clean up temporary file
rm "$CHANGED_FILES.tmp"
