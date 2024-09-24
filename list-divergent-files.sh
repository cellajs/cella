#!/bin/bash

# Path to the configuration file (can be .json, .ts, or .js)
CONFIG_FILE="cella.config.json"

# Determine the file extension of the configuration file
FILE_EXT="${CONFIG_FILE##*.}"

# Function to extract paths from .json (simple key-value pairs)
extract_from_json() {
    CHANGED_FILES=$(grep '"changed_files":' "$CONFIG_FILE" | sed 's/.*"changed_files": *"\([^"]*\)".*/\1/')
    IGNORE_FILE=$(grep '"ignore_file":' "$CONFIG_FILE" | sed 's/.*"ignore_file": *"\([^"]*\)".*/\1/')
}

# Function to extract paths from .ts or .js using grep/sed
extract_from_ts_js() {
    CHANGED_FILES=$(grep 'changedFiles:' "$CONFIG_FILE" | sed 's/.*changedFiles: *"\([^"]*\)".*/\1/')
    IGNORE_FILE=$(grep 'ignoreFile:' "$CONFIG_FILE" | sed 's/.*ignoreFile: *"\([^"]*\)".*/\1/')
}

# Extract values based on the file extension
if [[ "$FILE_EXT" == "json" ]]; then
    # Extract from JSON (using grep for simple key-value pairs)
    extract_from_json
elif [[ "$FILE_EXT" == "ts" || "$FILE_EXT" == "js" ]]; then
    # Extract from TypeScript/JavaScript
    extract_from_ts_js
else
    echo "Unsupported file format: $FILE_EXT. Only .json, .ts, and .js are supported."
    exit 1
fi

# Check if the values were extracted successfully
if [[ -z "$CHANGED_FILES" || -z "$IGNORE_FILE" ]]; then
    echo "Failed to extract file paths from the configuration file."
    exit 1
fi

# Output the extracted values for debugging purposes
echo "Changed files will be listed in: $CHANGED_FILES"
echo "Ignoring files listed in: $IGNORE_FILE"

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
grep -Fxf <(echo "$COMMON_FILES") "$CHANGED_FILES.tmp" > "$CHANGED_FILES.tmp.filtered"

# Now apply the ignore patterns
if [[ -n "$IGNORE_PATTERNS" ]]; then
    # Create a temporary filtered file
    cp "$CHANGED_FILES.tmp.filtered" "$CHANGED_FILES.tmp.new"
    
    for pattern in $IGNORE_PATTERNS; do
        grep -v -E "$pattern" "$CHANGED_FILES.tmp.new" > "$CHANGED_FILES.tmp.filtered" 
        mv "$CHANGED_FILES.tmp.filtered" "$CHANGED_FILES.tmp.new"  # Update the temporary filtered file
    done
    
    mv "$CHANGED_FILES.tmp.new" "$CHANGED_FILES.tmp.filtered"  # Rename back for final output
fi

# Store the final list of changed files in CHANGED_FILES
mv "$CHANGED_FILES.tmp.filtered" "$CHANGED_FILES"

# Check if any files were changed and are present in both branches, but not ignored
if [[ -s "$CHANGED_FILES" ]]; then
    echo "The following files have changed, are present in both branches, and are not ignored:"
    cat "$CHANGED_FILES"
else
    echo "No files have changed between upstream/main and local main that are not ignored."
    # Optionally, remove the CHANGED_FILES if it's empty
    rm -f "$CHANGED_FILES"
fi

# Clean up temporary files
rm -f "$CHANGED_FILES.tmp"