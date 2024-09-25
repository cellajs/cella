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

# Function to extract paths from .json (simple key-value pairs)
extract_from_json() {
    IGNORE_FILE=$(grep '"ignore_file":' "$CONFIG_FILE" | sed 's/.*"ignore_file": *"\([^"]*\)".*/\1/')
    IGNORE_LIST=$(grep '"ignore_list":' "$CONFIG_FILE" | sed 's/.*"ignore_list": *\[\([^]]*\)\].*/\1/' | tr -d '" ' | tr ',' '\n')
}

# Function to extract paths from .ts or .js using grep/sed
extract_from_ts() {
    IGNORE_FILE=$(grep 'ignoreFile:' "$CONFIG_FILE" | sed 's/.*ignoreFile: *"\([^"]*\)".*/\1/')
    IGNORE_LIST=$(grep 'ignoreList:' "$CONFIG_FILE" | sed 's/.*ignoreList: *\[\([^]]*\)\].*/\1/' | tr -d '" ' | tr ',' '\n')
}

# Function to extract paths from .js or .ts using node (with dynamic import for ES modules)
extract_from_js() {
    IGNORE_FILE=$(node -e "import('./$CONFIG_FILE').then(m => console.log(m.config.ignoreFile))")
    IGNORE_LIST=$(node -e "import('./$CONFIG_FILE').then(m => console.log(m.config.ignoreList.join('\n')))") 
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

# Output extracted values for debugging purposes
if [[ -n "$IGNORE_LIST" ]]; then
    echo "Ignoring files from ignoreList: $IGNORE_LIST"
else
    echo "Ignoring files listed in: $IGNORE_FILE"
fi

# Fetch upstream changes
git fetch upstream

# Checkout the development branch
# git checkout development

# Merge upstream changes without committing
git merge --no-commit upstream/development

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
    # git push origin development
else
    echo "Merge conflicts detected. Resolve conflicts before committing."
    exit 1
fi