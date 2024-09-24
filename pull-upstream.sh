#!/bin/bash

# Navigate to the repository
# (e.g. if the script is in a directory called "scripts", point it to the root like: cd "$(dirname "$0")/..")
cd "$(dirname "$0")"  # Ensures the script runs in its (root) directory

# Path to the configuration file (can be .json, .ts, or .js)
CONFIG_FILE="cella.config.json"

# Determine the file extension of the configuration file
FILE_EXT="${CONFIG_FILE##*.}"

# Function to extract paths from .json (simple key-value pairs)
extract_from_json() {
    IGNORE_FILE=$(grep '"ignore_file":' "$CONFIG_FILE" | sed 's/.*"ignore_file": *"\([^"]*\)".*/\1/')
}

# Function to extract paths from .ts or .js using grep/sed
extract_from_ts_js() {
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
if [[ -z "$IGNORE_FILE" ]]; then
    echo "Failed to extract file paths from the configuration file."
    exit 1
fi

# Output the extracted values for debugging purposes
echo "Ignoring files listed in: $IGNORE_FILE"

# Fetch upstream changes
git fetch upstream

# Checkout the development branch
git checkout development

# Merge upstream changes without committing
git merge --no-commit upstream/development

# Ensure the ignore file exists
if [[ -f "$IGNORE_FILE" ]]; then
    # Loop through each line in the ignore file and process it
    while IFS= read -r pattern || [[ -n "$pattern" ]]; do
        # Use git ls-files to get the list of tracked files
        # and filter them based on the pattern
        for file in $(git ls-files); do
            if [[ "$file" == $pattern ]]; then
                echo "Keeping $file from current branch"
                git reset "$file"
                git checkout --ours -- "$file"
            fi
        done
    done < "$IGNORE_FILE"
else
    echo "Ignore file $IGNORE_FILE not found!"
    exit 1
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