#!/bin/bash

# Navigate to the repository
# (e.g. if the script is in a directory called "scripts", point it to the root like: cd "$(dirname "$0")/..")
cd "$(dirname "$0")/.."  # Ensures the script runs in its (root) directory

# Path to the configuration file (can be .json, .ts, or .js)
CONFIG_FILE="cella.config.js"

# Determine the file extension of the configuration file
FILE_EXT="${CONFIG_FILE##*.}"

# Default variables
DIVERGED_FILE=""
IGNORE_FILE=""
IGNORE_LIST=""
UPSTREAM_BRANCH="development"  # Default value set to 'development'
LOCAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Function to extract paths from .json (simple key-value pairs)
extract_from_json() {
    DIVERGED_FILE=$(grep '"diverged_file":' "$CONFIG_FILE" | sed 's/.*"diverged_file": *"\([^"]*\)".*/\1/')
    IGNORE_FILE=$(grep '"ignore_file":' "$CONFIG_FILE" | sed 's/.*"ignore_file": *"\([^"]*\)".*/\1/')
    IGNORE_LIST=$(grep '"ignore_list":' "$CONFIG_FILE" | sed 's/.*"ignore_list": *\[\([^]]*\)\].*/\1/' | tr -d '" ' | tr ',' '\n')
    UPSTREAM_BRANCH=$(grep '"upstream_branch":' "$CONFIG_FILE" | sed 's/.*"upstream_branch": *"\([^"]*\)".*/\1/' || echo "$UPSTREAM_BRANCH")
}

# Function to extract paths from .ts or .js using grep/sed
extract_from_ts() {
    DIVERGED_FILE=$(grep 'divergedFile:' "$CONFIG_FILE" | sed 's/.*divergedFile: *"\([^"]*\)".*/\1/')
    IGNORE_FILE=$(grep 'ignoreFile:' "$CONFIG_FILE" | sed 's/.*ignoreFile: *"\([^"]*\)".*/\1/')
    IGNORE_LIST=$(grep 'ignoreList:' "$CONFIG_FILE" | sed 's/.*ignoreList: *\[\([^]]*\)\].*/\1/' | tr -d '" ' | tr ',' '\n')
    UPSTREAM_BRANCH=$(grep 'upstreamBranch:' "$CONFIG_FILE" | sed 's/.*upstreamBranch: *"\([^"]*\)".*/\1/' || echo "$UPSTREAM_BRANCH")
}

# Function to extract paths from .js or .ts using node (with dynamic import for ES modules)
extract_from_js() {
    # Use node to run a script that dynamically imports the JavaScript/TypeScript configuration and outputs the values
    DIVERGED_FILE=$(node -e "import('./$CONFIG_FILE').then(m => console.info(m.config.divergedFile))")
    IGNORE_FILE=$(node -e "import('./$CONFIG_FILE').then(m => console.info(m.config.ignoreFile))")
    IGNORE_LIST=$(node -e "
        import('./$CONFIG_FILE').then(m => {
            if (Array.isArray(m.config.ignoreList)) {
                console.info(m.config.ignoreList.join(','));
            } else {
                console.info('');
            }
        })
    ")
    UPSTREAM_BRANCH=$(node -e "import('./$CONFIG_FILE').then(m => console.info(m.config.upstreamBranch))" || echo "$UPSTREAM_BRANCH")
}

# Extract values based on the file extension
if [[ "$FILE_EXT" == "json" ]]; then
    # Extract from JSON (using grep for simple key-value pairs)
    extract_from_json
elif [[ "$FILE_EXT" == "ts" ]]; then
    # Extract from TypeScript/JavaScript
    extract_from_ts
elif [[ "$FILE_EXT" == "js" ]]; then
    # Extract from JavaScript (using node for dynamic imports)
    extract_from_js
else
    echo "Unsupported file format: $FILE_EXT. Only .json, .ts, and .js are supported."
    exit 1
fi

# Check if the values were extracted successfully
if [[ -z "$DIVERGED_FILE" ]]; then
    echo "Failed to extract diverged_file path from the configuration file."
    exit 1
fi

# Output the variables for verification (optional)
echo "DIVERGED_FILE: $DIVERGED_FILE"
echo "UPSTREAM_BRANCH: $UPSTREAM_BRANCH"
echo "LOCAL_BRANCH: $LOCAL_BRANCH"

# Updated echo statements for ignore files
if [ -n "$IGNORE_FILE" ]; then
    echo "Ignore files by IGNORE_FILE: $IGNORE_FILE"
fi

if [ -n "$IGNORE_LIST" ]; then
    IFS=',' read -ra IGNORE_ARRAY <<< "$IGNORE_LIST"  # Convert the comma-separated list to an array
    echo "Ignore files by configured list (IGNORE_LIST length: ${#IGNORE_ARRAY[@]})"
fi

# Fetch upstream changes
git fetch upstream

# Checkout the local branch
git checkout "$LOCAL_BRANCH"

# Get the list of tracked files from upstream branch
UPSTREAM_FILES=$(git ls-tree -r "upstream/$UPSTREAM_BRANCH" --name-only)

# Get the list of tracked files from local branch
MAIN_FILES=$(git ls-tree -r "$LOCAL_BRANCH" --name-only)

# Find common files between upstream and local branch
COMMON_FILES=$(comm -12 <(echo "$UPSTREAM_FILES" | sort) <(echo "$MAIN_FILES" | sort))

# Compare the local branch with upstream branch to get the diverged files
git diff --name-only "$LOCAL_BRANCH" "upstream/$UPSTREAM_BRANCH" > "$DIVERGED_FILE.tmp"

# Check if the ignore list was specified directly in the config
if [[ -n "$IGNORE_LIST" ]]; then
    echo "Using ignore list from config."
    echo "$IGNORE_LIST" | tr ',' '\n' > "$DIVERGED_FILE.ignore.tmp"
# Otherwise, check if an ignore file was specified
elif [[ -n "$IGNORE_FILE" && -f "$IGNORE_FILE" ]]; then
    echo "Using ignore file: $IGNORE_FILE"
    cp "$IGNORE_FILE" "$DIVERGED_FILE.ignore.tmp"
else
    echo "No ignore list or ignore file found, proceeding without ignoring files."
    > "$DIVERGED_FILE.ignore.tmp"  # Create an empty file
fi

# Read the ignore patterns
IGNORE_PATTERNS=$(cat "$DIVERGED_FILE.ignore.tmp")

# Filter diverged files:
# 1. Files must be present in both upstream and local branches
# 2. Exclude files listed in the ignore file
grep -Fxf <(echo "$COMMON_FILES") "$DIVERGED_FILE.tmp" > "$DIVERGED_FILE.tmp.filtered"

# Now apply the ignore patterns
if [[ -n "$IGNORE_PATTERNS" ]]; then
    # Create a temporary filtered file
    cp "$DIVERGED_FILE.tmp.filtered" "$DIVERGED_FILE.tmp.new"
    
    for pattern in $IGNORE_PATTERNS; do
        grep -v -E "$pattern" "$DIVERGED_FILE.tmp.new" > "$DIVERGED_FILE.tmp.filtered" 
        mv "$DIVERGED_FILE.tmp.filtered" "$DIVERGED_FILE.tmp.new"  # Update the temporary filtered file
    done
    
    mv "$DIVERGED_FILE.tmp.new" "$DIVERGED_FILE.tmp.filtered"  # Rename back for final output
fi

# Store the final list of diverged files in DIVERGED_FILE
mv "$DIVERGED_FILE.tmp.filtered" "$DIVERGED_FILE"

# Check if any files were diverged and are present in both branches, but not ignored
if [[ -s "$DIVERGED_FILE" ]]; then
    echo "The following files have diverged, are present in both branches, and are not ignored:"
    cat "$DIVERGED_FILE"
else
    echo "No files have diverged between upstream and local branch that are not ignored."
    # Optionally, remove the DIVERGED_FILE if it's empty
    rm -f "$DIVERGED_FILE"
fi

# Clean up temporary files
rm -f "$DIVERGED_FILE.tmp"
rm -f "$DIVERGED_FILE.ignore.tmp"