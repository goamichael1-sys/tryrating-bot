# 🤖 TryRating Assistant Bot

Telegram bot that provides unique tokens for TryRating Chrome Extension users.

## ⚙️ Setup

This bot reads its Telegram token from an environment variable — it is **never** hardcoded in source.

**Local development:**
1. Copy `.env.example` to `.env`
2. Fill in `BOT_TOKEN` (get one from [@BotFather](https://t.me/BotFather)) and `WEBHOOK_URL`
3. `npm install && npm start`

**Render deployment:**
1. In your Render service, go to **Environment** → **Environment Variables**
2. Add `BOT_TOKEN` and `WEBHOOK_URL` there directly (do not put them in a committed file)
3. Redeploy

⚠️ If you ever rotate your bot token, only one Render service should have a live webhook pointing at it at a time. Visit `/api/debug/webhook-info` on your deployed service (or `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` directly) to confirm which URL Telegram currently has on file, especially after redeploys or if you're running more than one bot/service.

## 🚀 Features

- 🔑 Generate unique tokens per user
- 📬 Send notifications via API
- 💾 Persistent token storage
- 🌐 REST API endpoints

## 📋 Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/sub` | Get your unique token |
| `/status` | Check your token status |
| `/help` | Help message |

## 🔧 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/status` | GET | Bot stats |
| `/api/verify` | POST | Verify token |
| `/api/notify` | POST | Send notification |

### Example: Verify Token

```bash
POST /api/verify
{
    "token": "xxxx-xxxx-xxxx-xxxx"
}
