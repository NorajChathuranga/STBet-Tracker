import os
import hmac
import hashlib
import json
import subprocess
import logging
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

# Initialize FastAPI app
app = FastAPI(title="STBet Auto-Updater", version="1.0.0")

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("updater")

WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(WORKSPACE_DIR, "updater", "config.json")

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
    return {"github_webhook_secret": ""}

def run_deploy_script():
    """Execute the deploy.sh script and log results."""
    script_path = os.path.join(WORKSPACE_DIR, "updater", "deploy.sh")
    try:
        logger.info(f"Running deploy script: {script_path}")
        result = subprocess.run(["/bin/bash", script_path], capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"Deploy script failed (code {result.returncode}): {result.stderr.strip()}")
        else:
            logger.info("Deploy script executed successfully.")
    except Exception as e:
        logger.error(f"Error running deploy script: {e}")

@app.post("/webhook")
async def github_webhook(request: Request, background_tasks: BackgroundTasks):
    config = load_config()
    secret = os.environ.get("GITHUB_WEBHOOK_SECRET") or config.get("github_webhook_secret")
    
    # 1. Verify header signature presence
    signature = request.headers.get("X-Hub-Signature-256")
    if not signature:
        logger.warning("Missing X-Hub-Signature-256 header")
        raise HTTPException(status_code=401, detail="Missing signature")
        
    body = await request.body()
    
    # 2. Verify HMAC SHA-256 signature
    if not secret:
        logger.error("GITHUB_WEBHOOK_SECRET is not configured.")
        raise HTTPException(status_code=500, detail="Server webhook secret not configured")
        
    mac = hmac.new(secret.encode(), body, hashlib.sha256)
    expected_signature = "sha256=" + mac.hexdigest()
    
    if not hmac.compare_digest(signature, expected_signature):
        logger.warning("HMAC verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse payload
    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    # Check if push event is to main branch
    ref = payload.get("ref", "")
    if ref != "refs/heads/main":
        logger.info(f"Skipping non-main branch push: {ref}")
        return {"status": "skipped", "message": "Branch is not main"}

    # 3. Trigger deploy.sh in the background
    background_tasks.add_task(run_deploy_script)
    
    return {"status": "accepted", "message": "Deployment triggered in background"}

@app.get("/status")
async def status():
    return {"status": "online"}
