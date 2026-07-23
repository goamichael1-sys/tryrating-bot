# 🤖 TryRating Assistant Bot

Telegram bot that provides unique tokens for TryRating Chrome Extension users.

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
