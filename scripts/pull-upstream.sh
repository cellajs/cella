#!/bin/bash

# Navigate to the repository
# (e.g. if the script is in a directory called "scripts", point it to the root like: cd "$(dirname "$0")/..")
cd "$(dirname "$0")/.."  # Ensures the script runs in its (root) directory

# Path to the configuration file (can be .json, .ts, or .js)
CONFIG_FILE="cella.config.js"

# Determine the file extension of the configuration file
FILE_EXT="${CONFIG_FILE##*.}"

# Default variables
IGNORE_FILE=""
IGNORE_LIST=""
UPSTREAM_BRANCH="development"  # Default value set to 'development'
LOCAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Function to extract paths from .json (simple key-value pairs)
extract_from_json() {
    IGNORE_FILE=$(grep '"ignore_file":' "$CONFIG_FILE" | sed 's/.*"ignore_file": *"\([^"]*\)".*/\1/')
    IGNORE_LIST=$(grep '"ignore_list":' "$CONFIG_FILE" | sed 's/.*"ignore_list": *\[\([^]]*\)\].*/\1/' | tr -d '" ' | tr ',' '\n')
    UPSTREAM_BRANCH=$(grep '"upstream_branch":' "$CONFIG_FILE" | sed 's/.*"upstream_branch": *"\([^"]*\)".*/\1/' || echo "$UPSTREAM_BRANCH")
}

# Function to extract paths from .ts or .js using grep/sed
extract_from_ts() {
    IGNORE_FILE=$(grep 'ignoreFile:' "$CONFIG_FILE" | sed 's/.*ignoreFile: *"\([^"]*\)".*/\1/')
    IGNORE_LIST=$(grep 'ignoreList:' "$CONFIG_FILE" | sed 's/.*ignoreList: *\[\([^]]*\)\].*/\1/' | tr -d '" ' | tr ',' '\n')
    UPSTREAM_BRANCH=$(grep 'upstreamBranch:' "$CONFIG_FILE" | sed 's/.*upstreamBranch: *"\([^"]*\)".*/\1/' || echo "$UPSTREAM_BRANCH")
}

# Function to extract paths from .js or .ts using node (with dynamic import for ES modules)
extract_from_js() {
    IGNORE_FILE=$(node -e "import('./$CONFIG_FILE').then(m => console.info(m.config.ignoreFile))")
    IGNORE_LIST=$(node -e "import('./$CONFIG_FILE').then(m => console.info(m.config.ignoreList.join('\n')))") 
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

# Output the variables for verification (optional)
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

# Merge upstream changes without committing
git merge --no-commit "upstream/$UPSTREAM_BRANCH"

# If neither `ignoreList` nor `ignoreFile` exists or is empty, skip the reset/checkout process
if [[ -n "$IGNORE_LIST" || ( -f "$IGNORE_FILE" && -s "$IGNORE_FILE" ) ]]; then
    echo "Applying reset/checkout based on ignoreList or ignoreFile..."

    # If `ignoreList` is provided, use it; otherwise, fall back to `ignoreFile`
    if [[ -n "$IGNORE_LIST" ]]; then
        # Loop through each pattern in the ignoreList and process it
        for pattern in $IGNORE_LIST; do
            for file in $(git ls-files); do
                if [[ "$file" == "$pattern" ]]; then
                    echo "Keeping $file from current branch"
                    git reset "$file"
                    git checkout --ours -- "$file"
                fi
            done
        done
    elif [[ -f "$IGNORE_FILE" ]]; then
        # Process each line in the ignoreFile
        while IFS= read -r pattern || [[ -n "$pattern" ]]; do
            for file in $(git ls-files); do
                if [[ "$file" == "$pattern" ]]; then
                    echo "Keeping $file from current branch"
                    git reset "$file"
                    git checkout --ours -- "$file"
                fi
            done
        done < "$IGNORE_FILE"
    fi
else
    echo "No files to ignore. Skipping reset/checkout."
fi

# Check for merge conflicts
if git diff --check > /dev/null; then
    echo "No merge conflicts detected, proceeding with commit."
    
    # Stage the changes
    git add .

    # Commit the merge
    git commit -m "Merged upstream changes, keeping files listed in $IGNORE_FILE."

    # Push changes to your fork
    # git push origin branch
else
    echo "Merge conflicts detected. Resolve conflicts before committing."
    exit 1
fi