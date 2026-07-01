# STBet Cricket-SuperOver Live Tracker & Analytics Dashboard

A production-grade virtual sports analytics platform that continuously tracks, stores, and visualizes STBet Cricket Super-Over virtual matches in real-time. 

Designed for running on **Azure Ubuntu 24.04** VM, it features rotating proxy support, a rich analytics dashboard hosted on **GitHub Pages**, and a secure **CI/CD Auto-Updater** webhook.

---

## 🚀 Key Features

* **Continuous Tracking (`tracker.py`)**: Automated scraper querying the STBet virtual API every 4 minutes.
* **Smart Data Warehousing**:
  * Persistent SQLite storage for long-term records.
  * Structured JSON files (`summary.json`, `details.json`) acting as the web data source.
  * Daily-appended CSV logs (`cricket_superover_summary.csv`, `cricket_superover_details.csv`).
  * Styled Microsoft Excel spreadsheets (`cricket_superover_results.xlsx`) containing soft-color highlighting (yellow highlights for first ball outcome columns; soft green highlights for winning selections).
* **Rich Web Dashboard**: Beautiful Glassmorphism dark-mode UI displaying live metrics, donut charts, full text search, and advanced filtering options.
* **Dual Inning Filtering**: The analytics filter allows checking first ball outcomes across **both** 1st and 2nd innings simultaneously.
* **Fail-Safe CI/CD Auto-Updater (`updater/`)**: A FastAPI webhook service running behind Nginx that verifies GitHub HMAC-SHA256 signatures, stops the tracker service, pulls updates, handles dependency management, and safely restarts the service using an EXIT trap callback.
* **Robust Proxy Rotation**: Built-in support for ScraperAPI, ZenRows, custom proxy endpoints, or random rotation from local `proxies.txt` fallbacks to circumvent IP-blocking.

---

## 📂 Project Directory Structure

```
STBet-Tracker/
├── .github/
│   └── workflows/
│       └── tracker.yml          # Backup GitHub Action scraper (Run every 5 min)
├── data/                        # JSON database and files read by the web app
│   ├── meetings.json
│   ├── summary.json
│   ├── details.json
│   ├── cricket_superover_summary.csv
│   ├── cricket_superover_details.csv
│   └── cricket_superover_results.xlsx
├── nginx/
│   └── stbet-updater.conf       # Reverse proxy configuration block
├── systemd/
│   └── updater.service          # Webhook FastAPI service configuration
├── updater/
│   ├── config.json.example      # Webhook secrets configuration template
│   ├── deploy.log               # Deployment log (created dynamically)
│   ├── deploy.sh                # Auto-update deployment bash script
│   └── updater.py               # Webhook FastAPI application
├── app.js                       # Frontend dashboard control & dynamic filters
├── index.html                   # Glassmorphism HTML dashboard page
├── style.css                    # Dashboard responsive layout stylesheet
├── tracker.py                   # Main continuous tracker and scraper
├── tracker_v3.py                # Alternate SQLite-based tracker script
├── migrate_db.py                # Helper script to export SQLite records to JSON
├── requirements.txt             # Project Python dependencies
└── CNAME                        # Custom Domain configurations
```

---

## 🛠️ Installation & Setup on VM

### 1. Requirements & Setup
Clone the repository to your home folder on the Azure VM:
```bash
cd /home/azureuser
git clone https://github.com/YOUR_USERNAME/STBet-Tracker.git
cd STBet-Tracker

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Scraper Proxies
Create a `.env` file in the root folder to configure your proxies:
```env
PROXY_URL=http://username:password@proxy.example.com:port
# Or use API keys:
SCRAPER_API_KEY=your_scraperapi_key
ZENROWS_API_KEY=your_zenrows_key
```

### 3. Deploy the Tracker Service
Copy the systemd configuration file (or reuse your existing one), register, and start it:
```bash
sudo cp systemd/tracker.service /etc/systemd/system/stbet-tracker.service
sudo systemctl daemon-reload
sudo systemctl enable stbet-tracker.service
sudo systemctl start stbet-tracker.service
```

---

## 🔄 Secure Auto-Update Webhook

The auto-update system runs as a FastAPI service (`updater.service`) listening on port `8000` behind Nginx. It verifies HMAC webhook signatures sent by GitHub and triggers a deployment script.

### 1. Sudoers Setup
To allow the updater (running under the `azureuser` user) to stop and start the systemd tracker service without asking for a password, add a restricted rule:
```bash
sudo visudo -f /etc/sudoers.d/stbet-updater
```
Insert the following configuration:
```sudoers
azureuser ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop stbet-tracker.service, /usr/bin/systemctl start stbet-tracker.service
```

### 2. Service Registration
Configure your webhook secret in `updater/config.json`:
```bash
cp updater/config.json.example updater/config.json
nano updater/config.json
```
```json
{
  "github_webhook_secret": "your_secure_webhook_secret"
}
```
Now register and start the updater service:
```bash
chmod +x updater/deploy.sh
sudo cp systemd/updater.service /etc/systemd/system/updater.service
sudo systemctl daemon-reload
sudo systemctl enable updater.service
sudo systemctl start updater.service
```

### 3. Nginx Reverse Proxy Setup
Copy the Nginx configuration to direct webhook traffic to the FastAPI app:
```bash
sudo cp nginx/stbet-updater.conf /etc/nginx/sites-available/stbet-updater
sudo ln -s /etc/nginx/sites-available/stbet-updater /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
```

---

## 📈 Monitoring Logs

You can monitor deployment actions and scraping activities directly through systemd and local logs:

```bash
# View Webhook deployment activities and pulls
tail -f /home/azureuser/STBet-Tracker/updater/deploy.log

# View Scraper logs
journalctl -u stbet-tracker.service -n 100 -f

# View Webhook API service logs
journalctl -u updater.service -n 100 -f
```
