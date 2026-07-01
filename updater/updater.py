import os
import hmac
import hashlib
import json
import subprocess
import logging
import time
import asyncio
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

# Initialize FastAPI app
app = FastAPI(title="STBet Tracker Auto-Updater", version="1.0.0")

# Setup Paths & Configurations
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(WORKSPACE_DIR, "updater", "config.json")
LOG_FILE = os.path.join(WORKSPACE_DIR, "updater", "deploy.log")

# Setup Logging
logger = logging.getLogger("updater")
logger.setLevel(logging.INFO)
# Prevent duplicate handlers
if not logger.handlers:
    file_handler = logging.FileHandler(LOG_FILE)
    console_handler = logging.StreamHandler()
    formatter = logging.Formatter('[%(asctime)s] [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

# Default configuration values
DEFAULT_CONFIG = {
    "github_webhook_secret": "",
    "repo_path": WORKSPACE_DIR,
    "tracker_service_name": "tracker.service",
    "health_check_delay": 5
}

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                return {**DEFAULT_CONFIG, **json.load(f)}
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
    return DEFAULT_CONFIG

config = load_config()
GITHUB_WEBHOOK_SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET") or config.get("github_webhook_secret")
REPO_PATH = config.get("repo_path")
TRACKER_SERVICE = config.get("tracker_service_name")
HEALTH_CHECK_DELAY = config.get("health_check_delay")

# Global Deployment Lock to prevent concurrent deployments
deploy_lock = asyncio.Lock()

def run_cmd(args, cwd=None):
    """Run a shell command, capture stdout/stderr, and return stdout. Raise on error."""
    result = subprocess.run(args, capture_output=True, text=True, cwd=cwd)
    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            result.returncode, args, output=result.stdout, stderr=result.stderr
        )
    return result.stdout.strip()

def get_venv_paths(repo_path):
    """Retrieve python and pip paths depending on virtualenv presence."""
    python_path = os.path.join(repo_path, ".venv", "bin", "python")
    if not os.path.exists(python_path):
        python_path = os.path.join(repo_path, ".venv", "Scripts", "python.exe")
        if not os.path.exists(python_path):
            python_path = "python3"

    pip_path = os.path.join(repo_path, ".venv", "bin", "pip")
    if not os.path.exists(pip_path):
        pip_path = os.path.join(repo_path, ".venv", "Scripts", "pip.exe")
        if not os.path.exists(pip_path):
            pip_path = "pip3"
            
    return python_path, pip_path

def perform_deployment() -> dict:
    """Executes the core deployment steps and handles rollbacks on failure."""
    logger.info("Starting deployment process...")
    python_path, pip_path = get_venv_paths(REPO_PATH)
    
    # 1. Fetch current state for rollback reference
    try:
        previous_commit = run_cmd(["git", "rev-parse", "HEAD"], cwd=REPO_PATH)
        logger.info(f"Current commit: {previous_commit}")
    except Exception as e:
        logger.error(f"Failed to get current commit hash: {e}")
        return {"status": "error", "message": f"Git initialization error: {e}"}

    # 2. Fetch latest changes from remote
    try:
        logger.info("Fetching latest changes from remote...")
        run_cmd(["git", "fetch", "origin", "main"], cwd=REPO_PATH)
        target_commit = run_cmd(["git", "rev-parse", "origin/main"], cwd=REPO_PATH)
        logger.info(f"Target remote commit: {target_commit}")
    except Exception as e:
        err_msg = getattr(e, 'stderr', str(e)) or str(e)
        logger.error(f"Git fetch failed: {err_msg.strip()}")
        return {"status": "error", "message": f"Git fetch failed: {err_msg.strip()}"}

    # 3. Prevent restart if no new commits exist
    if previous_commit == target_commit:
        logger.info("No new commits detected. Skipping deployment and restart.")
        return {"status": "skipped", "message": "No new commits. Repo is up to date."}

    # 4. Perform deployment steps with rollback capability
    rollback_needed = False
    requirements_changed = False
    
    try:
        # Check if requirements.txt changed
        diff = run_cmd(["git", "diff", "--name-only", previous_commit, target_commit], cwd=REPO_PATH)
        requirements_changed = "requirements.txt" in diff.splitlines()
        
        # Reset hard to origin/main
        logger.info(f"Resetting repository to {target_commit}...")
        run_cmd(["git", "reset", "--hard", "origin/main"], cwd=REPO_PATH)
        rollback_needed = True # From here on, rollback is active

        # Install requirements if changed
        if requirements_changed:
            logger.info("requirements.txt changed. Installing new dependencies...")
            run_cmd([pip_path, "install", "-r", "requirements.txt"], cwd=REPO_PATH)
            
        # Run migration if migrate_db.py exists
        migrate_script = os.path.join(REPO_PATH, "migrate_db.py")
        if os.path.exists(migrate_script):
            logger.info("Running database migrations...")
            run_cmd([python_path, "migrate_db.py"], cwd=REPO_PATH)

        # Restart tracker service
        logger.info(f"Restarting systemd service: {TRACKER_SERVICE}...")
        run_cmd(["sudo", "systemctl", "restart", TRACKER_SERVICE])

        # Health Check
        logger.info(f"Waiting {HEALTH_CHECK_DELAY} seconds for service initialization health check...")
        time.sleep(HEALTH_CHECK_DELAY)
        
        service_status = run_cmd(["sudo", "systemctl", "is-active", TRACKER_SERVICE])
        if service_status != "active":
            raise Exception(f"Service status is '{service_status}' (expected 'active')")
            
        logger.info("Deployment completed successfully and health check passed!")
        return {
            "status": "success", 
            "previous_commit": previous_commit, 
            "deployed_commit": target_commit,
            "requirements_installed": requirements_changed
        }

    except Exception as e:
        err_msg = getattr(e, 'stderr', str(e)) or str(e)
        logger.error(f"Deployment failed: {err_msg.strip()}. Initiating rollback...")
        
        if rollback_needed:
            try:
                # 1. Rollback code version
                logger.info(f"Rolling back to previous commit: {previous_commit}...")
                run_cmd(["git", "reset", "--hard", previous_commit], cwd=REPO_PATH)
                
                # 2. Re-install previous requirements if they changed
                if requirements_changed:
                    logger.info("Re-installing previous dependencies...")
                    run_cmd([pip_path, "install", "-r", "requirements.txt"], cwd=REPO_PATH)
                    
                # 3. Restart previous version of the service
                logger.info(f"Restarting service {TRACKER_SERVICE} with rolled-back code...")
                run_cmd(["sudo", "systemctl", "restart", TRACKER_SERVICE])
                
                logger.info("Rollback completed successfully. Previous version restored and restarted.")
            except Exception as rollback_err:
                rollback_err_msg = getattr(rollback_err, 'stderr', str(rollback_err)) or str(rollback_err)
                logger.critical(f"FATAL: Rollback failed! System might be in a broken state: {rollback_err_msg.strip()}")
                return {"status": "critical_error", "message": f"Deployment failed: {err_msg.strip()}. Rollback also failed: {rollback_err_msg.strip()}"}
                
        return {"status": "error", "message": f"Deployment failed: {err_msg.strip()}. Rolled back to previous version."}

@app.post("/webhook")
async def github_webhook(request: Request):
    global GITHUB_WEBHOOK_SECRET
    
    # Reload config to fetch dynamic secrets
    config = load_config()
    GITHUB_WEBHOOK_SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET") or config.get("github_webhook_secret")
    
    # Verify signature
    signature = request.headers.get("X-Hub-Signature-256")
    if not signature:
        logger.warning("Rejecting request: Missing X-Hub-Signature-256 header")
        raise HTTPException(status_code=401, detail="Missing signature header")
        
    body = await request.body()
    
    # If GITHUB_WEBHOOK_SECRET is empty, reject to force security setup
    if not GITHUB_WEBHOOK_SECRET:
        logger.error("GITHUB_WEBHOOK_SECRET is not configured in environment variables or config.json.")
        raise HTTPException(status_code=500, detail="Webhook secret is not configured on the server")

    mac = hmac.new(GITHUB_WEBHOOK_SECRET.encode(), body, hashlib.sha256)
    expected_signature = "sha256=" + mac.hexdigest()
    
    if not hmac.compare_digest(signature, expected_signature):
        logger.warning("Rejecting request: HMAC signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse GitHub Payload
    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    # Check if push is to main branch
    ref = payload.get("ref", "")
    if ref != "refs/heads/main":
        logger.info(f"Ignoring push event to non-main branch: {ref}")
        return {"status": "skipped", "message": "Only deployments on refs/heads/main are processed"}

    # Acquire deployment lock to prevent concurrent deployments
    if deploy_lock.locked():
        logger.warning("Rejecting deployment request: Deployment is already in progress.")
        return JSONResponse(status_code=429, content={"status": "error", "message": "Deployment already in progress"})

    async with deploy_lock:
        # Run deployment blocking steps in executor
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, perform_deployment)
        
        if result.get("status") in ["success", "skipped"]:
            return result
        else:
            status_code = 500
            if result.get("status") == "critical_error":
                status_code = 503
            return JSONResponse(status_code=status_code, content=result)

@app.get("/status")
async def system_status():
    """Exposes health metrics and Git commit details of the running system."""
    try:
        current_commit = run_cmd(["git", "rev-parse", "HEAD"], cwd=REPO_PATH)
        commit_subject = run_cmd(["git", "log", "-1", "--format=%s"], cwd=REPO_PATH)
        tracker_status = run_cmd(["sudo", "systemctl", "is-active", TRACKER_SERVICE])
    except Exception as e:
        current_commit = "unknown"
        commit_subject = f"Error reading git: {e}"
        tracker_status = "unknown"
        
    return {
        "status": "online",
        "lock_active": deploy_lock.locked(),
        "tracker_service": {
            "name": TRACKER_SERVICE,
            "status": tracker_status
        },
        "git": {
            "current_commit": current_commit,
            "subject": commit_subject
        }
    }
