const express = require('express');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ============================================================
// BOT TOKEN - From Environment Variable
// ============================================================

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('[TryRating Bot] ❌ BOT_TOKEN environment variable is required!');
    console.error('[TryRating Bot] 📋 Please set BOT_TOKEN in Render environment variables.');
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
// INITIALIZE BOT
// ============================================================

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('[TryRating Bot] 🤖 Bot started!');
console.log('[TryRating Bot] 📋 Bot Token:', BOT_TOKEN.substring(0, 10) + '...');

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
// COMMAND: /start
// ============================================================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'User';
    
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
/help - Show this message

*Need help?* Send /help`;

    bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                ['/sub', '/status'],
                ['/help']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
});

// ============================================================
// COMMAND: /sub
// ============================================================

bot.onText(/\/sub/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const username = msg.from.username || msg.from.first_name || 'User';
    
    const lastRequest = processingSub.get(userId);
    const now = Date.now();
    
    if (lastRequest && (now - lastRequest) < SUB_COOLDOWN) {
        console.log(`[TryRating Bot] ⏳ Cooldown for user ${userId}`);
        if (userTokens.has(userId)) {
            const existing = userTokens.get(userId);
            bot.sendMessage(
                chatId,
                `🔑 *Your token is:*\n\`${existing.token}\`\n\n✅ Active\n\nEnter this in the Chrome extension.`,
                { parse_mode: 'Markdown' }
            );
        }
        return;
    }
    
    processingSub.set(userId, now);
    
    try {
        if (userTokens.has(userId)) {
            const existing = userTokens.get(userId);
            bot.sendMessage(
                chatId,
                `🔑 *Your token is:*\n\`${existing.token}\`\n\n✅ Active\n\nEnter this in the Chrome extension.`,
                { parse_mode: 'Markdown' }
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
        
        bot.sendMessage(
            chatId,
            `🔑 *Your unique token is:*\n\`${token}\`\n\n✅ Active\n\n📋 *Next steps:*\n1. Copy this token\n2. Open TryRating Chrome Extension\n3. Paste token in settings\n4. Start receiving notifications!\n\n⚠️ Keep this token secure!`,
            { parse_mode: 'Markdown' }
        );
        
        console.log(`[TryRating Bot] 📝 New token for ${username} (${userId}): ${token}`);
        
        setTimeout(() => processingSub.delete(userId), SUB_COOLDOWN);
        
    } catch (error) {
        console.error('[TryRating Bot] Error:', error);
        bot.sendMessage(chatId, '❌ Sorry, there was an error. Please try again.');
        processingSub.delete(userId);
    }
});

// ============================================================
// COMMAND: /status
// ============================================================

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    
    try {
        if (!userTokens.has(userId)) {
            bot.sendMessage(
                chatId,
                `❌ *No token found*\n\nSend /sub to generate your token.`,
                { parse_mode: 'Markdown' }
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

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('[TryRating Bot] Error:', error);
        bot.sendMessage(chatId, '❌ Sorry, there was an error.');
    }
});

// ============================================================
// COMMAND: /help
// ============================================================

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
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

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

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

        await bot.sendMessage(tokenData.chatId, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        
        console.log(`[TryRating Bot] ✅ Notification sent to user ${userId}`);
        return { success: true };
        
    } catch (error) {
        console.error('[TryRating Bot] Notification error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// EXPRESS API SERVER
// ============================================================

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.get('/', (req, res) => {
    res.json({
        name: 'TryRating Assistant Bot',
        status: 'running',
        version: '1.0.0',
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
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TryRating Bot] 🌐 API server running on port ${PORT}`);
    console.log(`[TryRating Bot] 📍 Health: http://localhost:${PORT}/health`);
});

console.log('[TryRating Bot] ==================================');
console.log('[TryRating Bot] 🤖 TryRating Assistant Bot');
console.log('[TryRating Bot] 📋 Commands: /start, /sub, /status, /help');
console.log('[TryRating Bot] ✅ Bot is ready!');
console.log('[TryRating Bot] ==================================');
