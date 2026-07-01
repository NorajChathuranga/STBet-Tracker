#!/bin/bash
# STBet-Tracker Webhook Deployment Script
# Automatically stops the service, pulls new code, installs deps, and restarts the service.

REPO_DIR="/home/ubuntu/STBet-Tracker"
LOG_FILE="$REPO_DIR/updater/deploy.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Redirect stdout and stderr to the log file
exec >> "$LOG_FILE" 2>&1

echo "=========================================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Auto-update deployment triggered"
echo "=========================================================="

cd "$REPO_DIR"

# Ensure tracker service is restarted at the end of the deployment, regardless of success/failure
ensure_restart() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting stbet-tracker.service..."
    sudo systemctl start stbet-tracker.service
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Auto-update deployment finished."
}
trap ensure_restart EXIT

# 1. Fetch remote changes to compare diffs
echo "Fetching origin..."
git fetch origin main

# Check if requirements.txt changed
REQ_CHANGED=false
if git diff --name-only HEAD origin/main | grep -q "requirements.txt"; then
    REQ_CHANGED=true
    echo "requirements.txt changed. Dependency re-installation is marked."
fi

# 2. Stop tracker service
echo "Stopping stbet-tracker.service..."
sudo systemctl stop stbet-tracker.service

# 3. Pull latest code from origin main
echo "Pulling latest code..."
git pull origin main

# 4. If requirements.txt changed, install dependencies
if [ "$REQ_CHANGED" = true ]; then
    echo "Installing updated requirements..."
    if [ -f ".venv/bin/pip" ]; then
        .venv/bin/pip install -r requirements.txt
    else
        pip install -r requirements.txt
    fi
fi
