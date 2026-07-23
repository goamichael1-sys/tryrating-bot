const express = require('express');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ============================================================
// BOT TOKEN - From Environment Variable
// ============================================================

const BOT_TOKEN = process.env.BOT_TOKEN || '8936546304:AAEvFN9gM2-IFWrfX1U0YquKDxDyylHv2wc';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://tryrating-bot-tcbr.onrender.com';

console.log('[TryRating Bot] 🤖 Starting bot...');
console.log('[TryRating Bot] 📋 Token:', BOT_TOKEN ? BOT_TOKEN.substring(0, 15) + '...' : 'MISSING!');
console.log('[TryRating Bot] 🔗 Webhook URL:', WEBHOOK_URL);

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('[TryRating Bot] ❌ ERROR: BOT_TOKEN is missing or invalid!');
    process.exit(1);
}

// ============================================================
// PERSISTENT STORAGE
// ============================================================

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tokens.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('[TryRating Bot] 📁 Created data directory');
}

// ============================================================
// TOKEN STORAGE
// ============================================================

const userTokens = new Map();
let memoryBackup = {};
const processingSub = new Map();
const SUB_COOLDOWN = 5000;

function loadTokens() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            userTokens.clear();
            if (data.userTokens) {
                for (const [key, value] of Object.entries(data.userTokens)) {
                    userTokens.set(key, value);
                }
            }
            memoryBackup = Object.fromEntries(userTokens);
            console.log(`[TryRating Bot] ✅ Loaded ${userTokens.size} tokens from file`);
            return true;
        }
        
        const backupFile = DATA_FILE + '.backup';
        if (fs.existsSync(backupFile)) {
            const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
            userTokens.clear();
            if (data.userTokens) {
                for (const [key, value] of Object.entries(data.userTokens)) {
                    userTokens.set(key, value);
                }
            }
            memoryBackup = Object.fromEntries(userTokens);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            console.log(`[TryRating Bot] ✅ Loaded ${userTokens.size} tokens from backup`);
            return true;
        }
        
        console.log('[TryRating Bot] 📄 No token file found, starting fresh');
        return false;
    } catch (e) {
        console.error('[TryRating Bot] Error loading tokens:', e);
        if (Object.keys(memoryBackup).length > 0) {
            userTokens.clear();
            for (const [key, value] of Object.entries(memoryBackup)) {
                userTokens.set(key, value);
            }
            saveTokens();
            console.log(`[TryRating Bot] 🔄 Restored ${userTokens.size} tokens from memory`);
            return true;
        }
        return false;
    }
}

function saveTokens() {
    try {
        const data = {
            userTokens: Object.fromEntries(userTokens),
            savedAt: new Date().toISOString(),
            totalTokens: userTokens.size
        };
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        fs.writeFileSync(DATA_FILE + '.backup', JSON.stringify(data, null, 2));
        memoryBackup = Object.fromEntries(userTokens);
        
        console.log(`[TryRating Bot] 💾 Saved ${userTokens.size} tokens`);
        return true;
    } catch (e) {
        console.error('[TryRating Bot] Error saving tokens:', e);
        memoryBackup = Object.fromEntries(userTokens);
        return false;
    }
}

loadTokens();

process.on('SIGINT', () => { saveTokens(); process.exit(0); });
process.on('SIGTERM', () => { saveTokens(); process.exit(0); });

setInterval(() => {
    if (userTokens.size > 0) {
        saveTokens();
    }
}, 30000);

// ============================================================
// GENERATE TOKEN
// ============================================================

function generateToken() {
    const parts = [];
    for (let i = 0; i < 4; i++) {
        parts.push(crypto.randomBytes(4).toString('hex'));
    }
    return parts.join('-');
}

// ============================================================
// EXPRESS APP (API + Webhook)
// ============================================================

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// ============================================================
// TELEGRAM WEBHOOK HANDLER
// ============================================================

// This is where Telegram will send updates
app.post('/webhook', (req, res) => {
    try {
        const update = req.body;
        console.log('[TryRating Bot] 📨 Webhook received:', update.message?.text || 'non-text');
        
        // Process the update
        processUpdate(update);
        
        res.sendStatus(200);
    } catch (error) {
        console.error('[TryRating Bot] ❌ Webhook error:', error);
        res.sendStatus(500);
    }
});

// ============================================================
// PROCESS TELEGRAM UPDATES
// ============================================================

async function processUpdate(update) {
    try {
        if (!update.message) return;
        
        const msg = update.message;
        const chatId = msg.chat.id;
        const text = msg.text || '';
        
        console.log(`[TryRating Bot] 📨 Message from ${msg.from?.username || msg.from?.id}: ${text}`);
        
        // Handle /start
        if (text === '/start') {
            const firstName = msg.from?.first_name || 'User';
            const welcomeMessage = `
🎯 *Welcome ${firstName}!*

I'm the *TryRating Assistant Bot* 🔔

I'll send you notifications when new tasks become available on TryRating.

---

*How to get started:*

1️⃣ Send /sub to get your unique token
2️⃣ Copy the token
3️⃣ Open the TryRating Chrome Extension
4️⃣ Enter your token in settings
5️⃣ Start receiving notifications!

---

*Commands:*
/sub - Get your token
/status - Check your token
/help - Show this message`;

            await sendTelegramMessage(chatId, welcomeMessage);
            return;
        }
        
        // Handle /sub
        if (text === '/sub') {
            await handleSubCommand(chatId, msg);
            return;
        }
        
        // Handle /status
        if (text === '/status') {
            await handleStatusCommand(chatId, msg);
            return;
        }
        
        // Handle /help
        if (text === '/help') {
            const helpMessage = `
📖 *TryRating Assistant Help*

*Commands:*

/sub - Get your unique token
/status - Check your token status
/help - Show this help message

---

*How to use:*

1. Send /sub to get your token
2. Copy the token
3. Open TryRating Chrome Extension
4. Paste token in settings
5. Receive notifications when tasks appear!

---

*Note:*
- Each Telegram account gets ONE unique token
- Your token works on any Chrome profile
- Keep your token secure
- Token never expires

*Ready? Send /sub!*`;

            await sendTelegramMessage(chatId, helpMessage);
            return;
        }
        
        // Unknown command
        await sendTelegramMessage(chatId, `❌ Unknown command: ${text}\n\nSend /help for available commands.`);
        
    } catch (error) {
        console.error('[TryRating Bot] ❌ Process update error:', error);
    }
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

async function handleSubCommand(chatId, msg) {
    const userId = String(msg.from.id);
    const username = msg.from.username || msg.from.first_name || 'User';
    
    const lastRequest = processingSub.get(userId);
    const now = Date.now();
    
    if (lastRequest && (now - lastRequest) < SUB_COOLDOWN) {
        console.log(`[TryRating Bot] ⏳ Cooldown for user ${userId}`);
        if (userTokens.has(userId)) {
            const existing = userTokens.get(userId);
            await sendTelegramMessage(
                chatId,
                `🔑 *Your token is:*\n\`${existing.token}\`\n\n✅ Active\n\nEnter this in the Chrome extension.`
            );
        }
        return;
    }
    
    processingSub.set(userId, now);
    
    try {
        if (userTokens.has(userId)) {
            const existing = userTokens.get(userId);
            await sendTelegramMessage(
                chatId,
                `🔑 *Your token is:*\n\`${existing.token}\`\n\n✅ Active\n\nEnter this in the Chrome extension.`
            );
            setTimeout(() => processingSub.delete(userId), SUB_COOLDOWN);
            return;
        }
        
        const token = generateToken();
        
        userTokens.set(userId, {
            userId: userId,
            chatId: chatId,
            username: username,
            token: token,
            authCode: token,
            createdAt: new Date().toISOString(),
            isActive: true,
            verifiedAt: new Date().toISOString()
        });
        
        saveTokens();
        
        await sendTelegramMessage(
            chatId,
            `🔑 *Your unique token is:*\n\`${token}\`\n\n✅ Active\n\n📋 *Next steps:*\n1. Copy this token\n2. Open TryRating Chrome Extension\n3. Paste token in settings\n4. Start receiving notifications!\n\n⚠️ Keep this token secure!`
        );
        
        console.log(`[TryRating Bot] 📝 New token for ${username} (${userId}): ${token}`);
        
        setTimeout(() => processingSub.delete(userId), SUB_COOLDOWN);
        
    } catch (error) {
        console.error('[TryRating Bot] Error:', error);
        await sendTelegramMessage(chatId, '❌ Sorry, there was an error. Please try again.');
        processingSub.delete(userId);
    }
}

async function handleStatusCommand(chatId, msg) {
    const userId = String(msg.from.id);
    
    try {
        if (!userTokens.has(userId)) {
            await sendTelegramMessage(
                chatId,
                `❌ *No token found*\n\nSend /sub to generate your token.`
            );
            return;
        }
        
        const tokenData = userTokens.get(userId);
        
        const message = `
📊 *Token Status*

🔑 Token: \`${tokenData.token}\`
📋 Status: ✅ Active
👤 User: ${tokenData.username || 'Unknown'}
📅 Created: ${new Date(tokenData.createdAt).toLocaleString()}

Your token is active and ready to use!`;

        await sendTelegramMessage(chatId, message);
        
    } catch (error) {
        console.error('[TryRating Bot] Error:', error);
        await sendTelegramMessage(chatId, '❌ Sorry, there was an error.');
    }
}

// ============================================================
// SEND TELEGRAM MESSAGE
// ============================================================

async function sendTelegramMessage(chatId, text) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        ['/sub', '/status'],
                        ['/help']
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            })
        });
        
        const result = await response.json();
        if (result.ok) {
            console.log(`[TryRating Bot] ✅ Message sent to ${chatId}`);
        } else {
            console.error(`[TryRating Bot] ❌ Failed to send message:`, result.description);
        }
        return result;
    } catch (error) {
        console.error('[TryRating Bot] ❌ Send message error:', error);
        return null;
    }
}

// ============================================================
// API: VERIFY TOKEN
// ============================================================

async function getTokenStatus(token) {
    try {
        console.log(`[TryRating Bot] 🔍 Verifying token: ${token}`);
        
        let userId = null;
        let tokenData = null;
        
        for (const [id, data] of userTokens) {
            if (data.token === token || data.authCode === token) {
                userId = id;
                tokenData = data;
                break;
            }
        }
        
        if (!userId || !tokenData) {
            console.log(`[TryRating Bot] ❌ Token not found: ${token}`);
            return { success: false, error: 'Invalid token' };
        }
        
        if (!tokenData.isActive) {
            console.log(`[TryRating Bot] ❌ Token inactive: ${token}`);
            return { success: false, error: 'Token is inactive' };
        }
        
        console.log(`[TryRating Bot] ✅ Token verified for user ${userId}`);
        
        return { 
            success: true, 
            token: token, 
            user: {
                userId: tokenData.userId,
                chatId: tokenData.chatId,
                username: tokenData.username || 'User'
            },
            isActive: tokenData.isActive
        };
        
    } catch (error) {
        console.error('[TryRating Bot] Error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// API: SEND NOTIFICATION
// ============================================================

async function sendNotification(authCode, title, description) {
    try {
        console.log(`[TryRating Bot] 📨 Sending notification with authCode: ${authCode}`);
        
        let userId = null;
        let tokenData = null;
        
        for (const [id, data] of userTokens) {
            if (data.token === authCode || data.authCode === authCode) {
                userId = id;
                tokenData = data;
                break;
            }
        }
        
        if (!userId || !tokenData) {
            return { success: false, error: 'Invalid authCode' };
        }
        
        if (!tokenData.isActive) {
            return { success: false, error: 'Token not active' };
        }
        
        const message = `
🎯 *${title || 'New TryRating Task Available!'}*

${description || 'New tasks are now available on TryRating.'}

---
🤖 *TryRating Assistant*`;

        await sendTelegramMessage(tokenData.chatId, message);
        
        console.log(`[TryRating Bot] ✅ Notification sent to user ${userId}`);
        return { success: true };
        
    } catch (error) {
        console.error('[TryRating Bot] Notification error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// API ENDPOINTS
// ============================================================

app.get('/', (req, res) => {
    res.json({
        name: 'TryRating Assistant Bot',
        status: 'running',
        version: '1.0.0',
        webhook: `${WEBHOOK_URL}/webhook`,
        endpoints: {
            health: 'GET /health',
            status: 'GET /api/status',
            verify: 'POST /api/verify',
            notify: 'POST /api/notify'
        },
        telegram: {
            bot_name: 'TryRating Assistant Bot',
            commands: ['/start', '/sub', '/status', '/help']
        },
        stats: {
            activeTokens: userTokens.size,
            totalUsers: userTokens.size
        },
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        bot: 'TryRating Assistant Bot',
        activeTokens: userTokens.size,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'ok', 
        activeTokens: userTokens.size,
        totalUsers: userTokens.size
    });
});

app.post('/api/verify', async (req, res) => {
    console.log('[TryRating Bot] 📥 /api/verify called');
    
    loadTokens();
    
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({ 
            success: false, 
            error: 'Token required' 
        });
    }
    
    const result = await getTokenStatus(token);
    
    if (result.success) {
        res.json({
            success: true,
            token: result.token,
            authCode: result.token,
            alreadyActive: true,
            user: result.user
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error
        });
    }
});

app.post('/api/notify', async (req, res) => {
    console.log('[TryRating Bot] 📥 /api/notify called');
    
    loadTokens();
    
    const { authCode, title, description } = req.body;
    
    if (!authCode) {
        return res.status(400).json({ 
            success: false, 
            error: 'authCode required' 
        });
    }
    
    const result = await sendNotification(authCode, title, description);
    
    if (result.success) {
        res.json({ success: true });
    } else {
        res.status(400).json({
            success: false,
            error: result.error
        });
    }
});

// ============================================================
// SETUP WEBHOOK
// ============================================================

async function setupWebhook() {
    try {
        const webhookUrl = `${WEBHOOK_URL}/webhook`;
        console.log(`[TryRating Bot] 🔗 Setting webhook to: ${webhookUrl}`);
        
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                allowed_updates: ['message']
            })
        });
        
        const result = await response.json();
        if (result.ok) {
            console.log('[TryRating Bot] ✅ Webhook set successfully!');
            console.log(`[TryRating Bot] 🔗 Webhook URL: ${webhookUrl}`);
        } else {
            console.error('[TryRating Bot] ❌ Failed to set webhook:', result.description);
        }
        return result;
    } catch (error) {
        console.error('[TryRating Bot] ❌ Webhook setup error:', error);
        return null;
    }
}

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[TryRating Bot] 🌐 API server running on port ${PORT}`);
    console.log(`[TryRating Bot] 📍 Health: ${WEBHOOK_URL}/health`);
    
    // Setup webhook after server starts
    await setupWebhook();
});

console.log('[TryRating Bot] ==================================');
console.log('[TryRating Bot] 🤖 TryRating Assistant Bot');
console.log('[TryRating Bot] 📋 Commands: /start, /sub, /status, /help');
console.log('[TryRating Bot] 🔗 Webhook Mode Enabled');
console.log('[TryRating Bot] ==================================');
