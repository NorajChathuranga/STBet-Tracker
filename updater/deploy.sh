#!/bin/bash
# STBet-Tracker Auto-Deployment and Rollback script
# This script can be executed manually for testing or updates.
# Usage: ./deploy.sh [target_commit_or_branch]

set -e

# Configuration
REPO_DIR="/home/ubuntu/STBet-Tracker"
TRACKER_SERVICE="tracker.service"
HEALTH_CHECK_DELAY=5

cd "$REPO_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting deployment workflow..."

# 1. Fetch current version for rollback
PREV_COMMIT=$(git rev-parse HEAD)
echo "Current commit: $PREV_COMMIT"

# 2. Fetch remote changes
echo "Fetching from origin..."
git fetch origin main

# Determine target branch/commit
TARGET=${1:-"origin/main"}
TARGET_COMMIT=$(git rev-parse "$TARGET")
echo "Target commit: $TARGET_COMMIT"

# 3. Check if changes exist
if [ "$PREV_COMMIT" = "$TARGET_COMMIT" ] && [ -z "$1" ]; then
    echo "No new changes detected. Exiting deployment."
    exit 0
fi

# Rollback handler function
rollback() {
    echo "=========================================================="
    echo "FATAL: Deployment step failed. Triggering automatic rollback..."
    echo "=========================================================="
    
    # Reset git back to starting commit
    git reset --hard "$PREV_COMMIT"
    
    # Reinstall previous requirements
    if [ -f ".venv/bin/pip" ]; then
        .venv/bin/pip install -r requirements.txt
    else
        pip install -r requirements.txt
    fi
    
    # Restart the previous tracker service
    echo "Restoring previous service state..."
    sudo systemctl restart "$TRACKER_SERVICE"
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rollback complete. Original version restored."
}

# Trap any error and execute the rollback handler
trap rollback ERR

# 4. Pull code
echo "Resetting repository code to target commit..."
git reset --hard "$TARGET_COMMIT"

# 5. Check if requirements changed and reinstall
REQ_CHANGED=false
if git diff --name-only "$PREV_COMMIT" "$TARGET_COMMIT" | grep -q "requirements.txt"; then
    REQ_CHANGED=true
fi

if [ "$REQ_CHANGED" = true ]; then
    echo "requirements.txt changed. Installing dependencies..."
    if [ -f ".venv/bin/pip" ]; then
        .venv/bin/pip install -r requirements.txt
    else
        pip install -r requirements.txt
    fi
fi

# 6. Run database migration if migrate_db.py exists
if [ -f "migrate_db.py" ]; then
    echo "Running migrations..."
    if [ -f ".venv/bin/python" ]; then
        .venv/bin/python migrate_db.py
    else
        python3 migrate_db.py
    fi
fi

# 7. Restart tracker service
echo "Restarting service $TRACKER_SERVICE..."
sudo systemctl restart "$TRACKER_SERVICE"

# 8. Service health check
echo "Waiting $HEALTH_CHECK_DELAY seconds for health check..."
sleep $HEALTH_CHECK_DELAY

STATUS=$(sudo systemctl is-active "$TRACKER_SERVICE")
if [ "$STATUS" != "active" ]; then
    echo "Health check failed: tracker.service is '$STATUS' (expected 'active')"
    false # Trigger trap
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deployment completed successfully!"
