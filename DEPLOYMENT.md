# Deployment Guide

This guide walks you through setting up the PS5 Stock Alert dashboard on Vercel and the background worker on GitHub Actions.

---

## 1. Setup GitHub Repository

1. Push this codebase to your own private or public GitHub repository (e.g., `github.com/your-username/ps5-stock-alert`).
2. Make sure `config.json` and `state.json` are present at the root of the repository.

---

## 2. Setup Vercel (Dashboard Frontend)

The `web/` directory contains a Next.js application that serves as your configuration dashboard.

1. Import your repository into [Vercel](https://vercel.com).
2. Configure the following project settings on Vercel:
   - **Framework Preset**: Next.js
   - **Root Directory**: `web`
3. Add the following **Environment Variables** in Vercel settings:
   - `ACCESS_PASSWORD`: A secure password of your choice to protect your dashboard from unauthorized changes. (If left empty, the dashboard is open to anyone).
   - `GITHUB_REPO`: Your repository path (e.g. `your-username/ps5-stock-alert`).
   - `GITHUB_TOKEN`: A GitHub Fine-grained Personal Access Token (PAT) with the following permissions:
     - **Repository permissions**: `Contents` (Read and Write).
     - To create one: Go to GitHub Settings -> Developer Settings -> Personal Access Tokens -> Fine-grained tokens -> Generate new token. Set the target to your specific repository and grant the permissions.
4. Deploy the project. The dashboard will now read from and write to your repository's `config.json` via the GitHub API.

---

## 3. Setup GitHub Actions (Worker)

The background worker runs automatically every 5 minutes (or as configured) via the workflow defined in `.github/workflows/stock-check.yml`.

To receive alerts, you must configure your repository secrets:

1. Go to your GitHub repository -> **Settings** -> **Secrets and variables** -> **Actions** -> **Repository Secrets**.
2. Add your secrets (Telegram, WhatsApp, etc.).

### ⚠️ Note on GitHub Actions Cron Schedules
GitHub Actions `schedule` cron jobs are **best-effort and run on a shared queue**. A schedule set for every 5 minutes (`*/5 * * * *`) will often experience delays of 10 to 45 minutes (or more) depending on GitHub's load.

If you need **guaranteed, precise 5-minute runs**, use a free external trigger service:
1. Create a free account on [cron-job.org](https://cron-job.org/).
2. Create a new cron job with the following configuration:
   - **Title**: PS5 Stock Check
   - **URL**: `https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/actions/workflows/stock-check.yml/dispatches`
   - **Schedule**: Every 5 minutes
   - **Request Method**: `POST`
   - **Request Headers**:
     - `Authorization`: `Bearer YOUR_GITHUB_TOKEN` (Use the same Fine-grained PAT created for Vercel)
     - `Accept`: `application/vnd.github+json`
     - `X-GitHub-Api-Version`: `2022-11-28`
     - `User-Agent`: `CronJob-Client`
   - **Request Body (raw JSON)**: `{"ref": "main"}`

This will trigger the workflow precisely every 5 minutes using the GitHub Actions API.

### For Telegram Notifications (Recommended)
1. **Create a Telegram Bot**:
   - Message `@BotFather` on Telegram and send `/newbot`.
   - Follow the prompts to get your bot token (looks like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
   - Save this as `TELEGRAM_BOT_TOKEN`.
2. **Find Your Chat ID**:
   - Start a conversation with your new bot on Telegram.
   - Message `@userinfobot` to get your Telegram user ID (looks like a 9-10 digit number).
   - Alternatively, add the bot to a group chat and use a tool or bot to find the group's Chat ID.
   - Save this as `TELEGRAM_CHAT_ID`.

### For WhatsApp Notifications (Optional)
1. Message `+34 644 97 53 59` (CallMeBot service) on WhatsApp with the text `I allow callmebot to send me messages`.
2. Wait for the API key response.
3. Add the following secrets:
   - `CALLMEBOT_PHONE`: Your phone number including country code (e.g. `+919876543210`).
   - `CALLMEBOT_APIKEY`: The API key sent by CallMeBot.

### Bypassing Bot Blocking with Proxies (Recommended for GitHub Actions)
If you run the worker on GitHub Actions, major retailers like Amazon, Flipkart, and Blinkit may block requests with `503` or `403` errors because of datacenter IP reputation. To solve this, you can configure a proxy:
1. **Get a Proxy**: Register with a proxy provider (residential proxy networks work best).
2. **Add the Secret**:
   - `SCRAPER_PROXY`: Your proxy connection URL (e.g., `http://username:password@proxy_host:port`).
This will automatically route all standard fetch requests and Impit (TLS-fingerprinted) requests through your proxy.

---

## 4. How it Works

1. Every 5 minutes, GitHub Actions runs the worker script (`worker/index.js`).
2. The worker reads the current search configuration and pincodes from `config.json`.
3. It performs parallel search requests and filters for console inventory serviceable at your pincodes.
4. If a console is found in-stock, it triggers a Telegram or WhatsApp notification.
5. The worker commits any state changes (like last check time, historical stock, or site errors) back to `state.json` in your repository.
6. When you modify settings via the Vercel dashboard, it commits the changes directly to `config.json` in the repo. The worker picks up the changes on the very next run.
