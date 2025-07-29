#!/bin/bash

# Navigate to your local git repository folder
cd /Users/tatianadzhambinova/PonyHof || {
  echo "Error: Unable to access repo path"
  exit 1
}

# Stage all changes
git add .

# Commit with a timestamp message
commit_message="Auto commit on $(date +"%Y-%m-%d %H:%M:%S")"
git commit -m "$commit_message" || {
  echo "No changes to commit"
  exit 0
}

# Push changes to origin main
git push PonyHof main || {
  echo "Failed to push changes"
  exit 1
}

echo "Changes committed and pushed successfully"
