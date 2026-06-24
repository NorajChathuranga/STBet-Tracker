# STBet Cricket-SuperOver Tracker Deployment Guide

Follow these steps to upload your tracker and dashboard website to GitHub and activate the automatic scraper.

## Step 1: Initialize Git and Link to GitHub

Open a terminal (e.g. PowerShell or Command Prompt) in this workspace directory:
`C:\Users\Noraj\Desktop\New folder (2)`

Run these commands to initialize git and commit your files:

```bash
# 1. Initialize local repository
git init -b main

# 2. Add all files to staging area
git add .

# 3. Create initial commit
git commit -m "Initial commit of tracker and dashboard web interface"
```

## Step 2: Push to GitHub

1. Create a new repository on your GitHub account (do not add a README, license, or `.gitignore` when creating it on GitHub).
2. Get the remote repository URL (looks like `https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git`).
3. Link your local repo to GitHub and push the code:

```bash
# Replace with your actual repository URL
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git

# Push code to GitHub
git push -u origin main
```

---

## Step 3: Enable Scraper (GitHub Action) Permissions

Because the scraper commits data updates back into the repository, you need to grant the GitHub Action **write permissions**:

1. Go to your repository on **GitHub.com**.
2. Click on **Settings** (tab at the top).
3. In the left sidebar, expand **Actions** and click on **General**.
4. Scroll down to the **Workflow permissions** section.
5. Select **Read and write permissions**.
6. Click **Save**.

Now, the automatic workflow will run every 5 minutes, fetch results from the STBet API, merge them, and save them in the repository.

---

## Step 4: Enable the Dashboard Website (GitHub Pages)

To host your beautiful dashboard website on GitHub for free:

1. In your GitHub repository, click on **Settings** (tab at the top).
2. In the left sidebar, click on **Pages**.
3. Under **Build and deployment** -> **Source**, select **Deploy from a branch**.
4. Under **Branch**, select `main` (and `/ (root)` folder).
5. Click **Save**.

Within a couple of minutes, GitHub will give you a live URL (e.g., `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY_NAME/`) where you and others can view the live dashboard!
