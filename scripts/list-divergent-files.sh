#!/bin/bash

# Navigate to the repository
# (e.g. if the script is in a directory called "scripts", point it to the root like: cd "$(dirname "$0")/..")
cd "$(dirname "$0")/.."  # Ensures the script runs in its (root) directory

# Path to the configuration file (can be .json, .ts, or .js)
CONFIG_FILE="cella.config.js"

# Determine the file extension of the configuration file
FILE_EXT="${CONFIG_FILE##*.}"

# Default variables
DIVERGENT_FILE=""
IGNORE_FILE=""
IGNORE_LIST=""

# Function to extract paths from .json (simple key-value pairs)
extract_from_json() {
    DIVERGENT_FILE=$(grep '"divergent_file":' "$CONFIG_FILE" | sed 's/.*"divergent_file": *"\([^"]*\)".*/\1/')
    IGNORE_FILE=$(grep '"ignore_file":' "$CONFIG_FILE" | sed 's/.*"ignore_file": *"\([^"]*\)".*/\1/')
    IGNORE_LIST=$(grep '"ignore_list":' "$CONFIG_FILE" | sed 's/.*"ignore_list": *\[\([^]]*\)\].*/\1/' | tr -d '" ' | tr ',' '\n')
}

# Function to extract paths from .ts or .js using grep/sed
extract_from_ts() {
    DIVERGENT_FILE=$(grep 'divergentFile:' "$CONFIG_FILE" | sed 's/.*divergentFile: *"\([^"]*\)".*/\1/')
    IGNORE_FILE=$(grep 'ignoreFile:' "$CONFIG_FILE" | sed 's/.*ignoreFile: *"\([^"]*\)".*/\1/')
    IGNORE_LIST=$(grep 'ignoreList:' "$CONFIG_FILE" | sed 's/.*ignoreList: *\[\([^]]*\)\].*/\1/' | tr -d '" ' | tr ',' '\n')
}

# Function to extract paths from .js or .ts using node (with dynamic import for ES modules)
extract_from_js() {
    # Use node to run a script that dynamically imports the JavaScript/TypeScript configuration and outputs the values
    DIVERGENT_FILE=$(node -e "import('./$CONFIG_FILE').then(m => console.log(m.config.divergentFile))")
    IGNORE_FILE=$(node -e "import('./$CONFIG_FILE').then(m => console.log(m.config.ignoreFile))")
    IGNORE_LIST=$(node -e "
        import('./$CONFIG_FILE').then(m => {
            if (Array.isArray(m.config.ignoreList)) {
                console.log(m.config.ignoreList.join(','));
            } else {
                console.log('');
            }
        })
    ")
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
if [[ -z "$DIVERGENT_FILE" ]]; then
    echo "Failed to extract divergent_file path from the configuration file."
    exit 1
fi

# Output the extracted values for debugging purposes
echo "Divergent files will be listed in: $DIVERGENT_FILE"
echo "Ignoring files listed in: $IGNORE_FILE or provided via ignoreList."

# Fetch upstream changes
git fetch upstream

# Checkout the development branch
# git checkout development

# Get the list of tracked files from upstream/development
UPSTREAM_FILES=$(git ls-tree -r upstream/development --name-only)

# Get the list of tracked files from local development branch
MAIN_FILES=$(git ls-tree -r development --name-only)

# Find common files between upstream/development and local development branch
COMMON_FILES=$(comm -12 <(echo "$UPSTREAM_FILES" | sort) <(echo "$MAIN_FILES" | sort))

# Compare the local development branch with upstream/development to get the divergent files
git diff --name-only development upstream/development > "$DIVERGENT_FILE.tmp"

# Check if the ignore list was specified directly in the config
if [[ -n "$IGNORE_LIST" ]]; then
    echo "Using ignore list from config."
    echo "$IGNORE_LIST" | tr ',' '\n' > "$DIVERGENT_FILE.ignore.tmp"
# Otherwise, check if an ignore file was specified
elif [[ -n "$IGNORE_FILE" && -f "$IGNORE_FILE" ]]; then
    echo "Using ignore file: $IGNORE_FILE"
    cp "$IGNORE_FILE" "$DIVERGENT_FILE.ignore.tmp"
else
    echo "No ignore list or ignore file found, proceeding without ignoring files."
    > "$DIVERGENT_FILE.ignore.tmp"  # Create an empty file
fi

# Read the ignore patterns
IGNORE_PATTERNS=$(cat "$DIVERGENT_FILE.ignore.tmp")

# Filter divergent files:
# 1. Files must be present in both upstream and development branches
# 2. Exclude files listed in the ignore file
grep -Fxf <(echo "$COMMON_FILES") "$DIVERGENT_FILE.tmp" > "$DIVERGENT_FILE.tmp.filtered"

# Now apply the ignore patterns
if [[ -n "$IGNORE_PATTERNS" ]]; then
    # Create a temporary filtered file
    cp "$DIVERGENT_FILE.tmp.filtered" "$DIVERGENT_FILE.tmp.new"
    
    for pattern in $IGNORE_PATTERNS; do
        grep -v -E "$pattern" "$DIVERGENT_FILE.tmp.new" > "$DIVERGENT_FILE.tmp.filtered" 
        mv "$DIVERGENT_FILE.tmp.filtered" "$DIVERGENT_FILE.tmp.new"  # Update the temporary filtered file
    done
    
    mv "$DIVERGENT_FILE.tmp.new" "$DIVERGENT_FILE.tmp.filtered"  # Rename back for final output
fi

# Store the final list of divergent files in DIVERGENT_FILE
mv "$DIVERGENT_FILE.tmp.filtered" "$DIVERGENT_FILE"

# Check if any files were divergent and are present in both branches, but not ignored
if [[ -s "$DIVERGENT_FILE" ]]; then
    echo "The following files have divergent, are present in both branches, and are not ignored:"
    cat "$DIVERGENT_FILE"
else
    echo "No files have divergent between upstream/development and local development that are not ignored."
    # Optionally, remove the DIVERGENT_FILE if it's empty
    rm -f "$DIVERGENT_FILE"
fi

# Clean up temporary files
rm -f "$DIVERGENT_FILE.tmp"
rm -f "$DIVERGENT_FILE.ignore.tmp"