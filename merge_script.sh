#!/bin/bash

# Path to the ignore file
IGNORE_FILE="cella.ignore.txt"

# Navigate to the repository
cd "$(dirname "$0")"  # Ensures the script runs in its directory

# Fetch upstream changes
git fetch upstream

# Checkout the development branch
git checkout development

# Merge upstream changes without committing
git merge --no-commit upstream/development

# Ensure the ignore file exists
if [[ -f "$IGNORE_FILE" ]]; then
    # Loop through each line in the ignore file and process it
    while IFS= read -r file || [[ -n "$file" ]]; do
        # Checkout the excluded files from the current branch
        if git ls-files --error-unmatch "$file" &> /dev/null; then
            echo "Keeping $file from current branch"
            git reset "$file"
            git checkout --ours -- "$file"
        else
            echo "$file not found in the repo"
        fi
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