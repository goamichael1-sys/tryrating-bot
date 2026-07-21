const express = require('express');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ============================================================
// YOUR BOT TOKEN
// ============================================================

const BOT_TOKEN = '8854314913:AAFRG1nLNCDbpso8vJg_PnraKzgUn2qoNXk';

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
// STORAGE
// ============================================================

const userTokens = new Map();

// ============================================================
// LOAD TOKENS FROM FILE
// ============================================================

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
            
            console.log(`[TryRating Bot] ✅ Loaded ${userTokens.size} tokens from file`);
            return true;
        } else {
            console.log('[TryRating Bot] 📄 No token file found, starting fresh');
        }
    } catch (e) {
        console.error('[TryRating Bot] Error loading tokens:', e);
    }
    return false;
}

// ============================================================
// SAVE TOKENS TO FILE
// ============================================================

function saveTokens() {
    try {
        const data = {
            userTokens: Object.fromEntries(userTokens)
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`[TryRating Bot] 💾 Saved ${userTokens.size} tokens to file`);
        return true;
    } catch (e) {
        console.error('[TryRating Bot] Error saving tokens:', e);
        return false;
    }
}

// ============================================================
// INITIALIZE BOT
// ============================================================

loadTokens();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('[TryRating Bot] 🤖 Bot started!');

// Save tokens every 10 seconds
const saveInterval = setInterval(() => {
    if (userTokens.size > 0) {
        saveTokens();
    }
}, 10000);

// Save on exit
process.on('SIGINT', () => { saveTokens(); clearInterval(saveInterval); process.exit(0); });
process.on('SIGTERM', () => { saveTokens(); clearInterval(saveInterval); process.exit(0); });

// ============================================================
// HELPER FUNCTIONS
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
    
    const welcomeMessage = `
🎯 *TryRating Assistant*

*Marketplace*

Notifications for TryRating Tasks

---

*What can this bot do?*

Get notifications for TryRating tasks.

Install TryRating Assistant extension on your browser and enable Telegram notifications in the extension.

---

Send /sub to get your token
Or send /help for more info.`;

    bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                ['/sub', '/help'],
                ['/status']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
});

// ============================================================
// COMMAND: /sub - Returns TOKEN ONLY (no code)
// ============================================================

bot.onText(/\/sub/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const username = msg.from.username || msg.from.first_name || 'User';
    
    try {
        // ✅ Check if user already has a token
        if (userTokens.has(userId)) {
            const existing = userTokens.get(userId);
            
            bot.sendMessage(
                chatId,
                `🔑 *Your token is:*
\`${existing.token}\`

This token can be used on any Chrome profile.

*Status:* ✅ Active

Enter this token in the extension to start receiving notifications.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        // ✅ Generate new token
        const token = generateToken();
        
        userTokens.set(userId, {
            userId: userId,
            chatId: chatId,
            username: username,
            token: token,
            authCode: token,
            createdAt: new Date().toISOString(),
            isActive: true,  // ✅ Always active immediately
            verifiedAt: new Date().toISOString()
        });
        
        // ✅ Immediate save
        saveTokens();
        
        bot.sendMessage(
            chatId,
            `🔑 *Your token is:*
\`${token}\`

This token can be used on any Chrome profile.

*Status:* ✅ Active

Enter this token in the extension to start receiving notifications.`,
            { parse_mode: 'Markdown' }
        );
        
        console.log(`[TryRating Bot] 📝 New token for user ${userId}: ${token}`);
        
    } catch (error) {
        console.error('[TryRating Bot] Error:', error);
        bot.sendMessage(chatId, '❌ Sorry, there was an error. Please try again.');
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

/sub - Get your token
/status - Check your token status
/help - Show this help message

---

*How to use:*

1. Send /sub to get your token
2. Copy the token
3. Open TryRating Assistant extension
4. Enter your token
5. Start receiving notifications instantly!

---

*Note:*
- Each Telegram account gets ONE unique token (same token always)
- Your token works on any Chrome profile
- No verification code needed
- Keep your token secure

*Ready to start? Send /sub!*`;

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
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
                `❌ *No token found*

You don't have a token yet. Send /sub to generate one.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        const tokenData = userTokens.get(userId);
        
        let message = `
📊 *Token Status*

🔑 Token: \`${tokenData.token}\`
📋 Status: ✅ Active
👤 User: ${tokenData.username || 'Unknown'}
📅 Created: ${new Date(tokenData.createdAt).toLocaleString()}
✅ Verified: ${new Date(tokenData.verifiedAt).toLocaleString()}

Your token is active and can be used on any Chrome profile!`;

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('[TryRating Bot] Error:', error);
        bot.sendMessage(chatId, '❌ Sorry, there was an error.');
    }
});

// ============================================================
// API: GET TOKEN STATUS - Simple token check
// ============================================================

async function getTokenStatus(token) {
    try {
        console.log(`[TryRating Bot] 🔍 Looking for token: ${token}`);
        
        let userId = null;
        let tokenData = null;
        
        for (const [id, data] of userTokens) {
            if (data.token === token) {
                userId = id;
                tokenData = data;
                break;
            }
        }
        
        if (!userId || !tokenData) {
            console.log(`[TryRating Bot] ❌ Token not found: ${token}`);
            return { success: false, error: 'Invalid token' };
        }
        
        console.log(`[TryRating Bot] ✅ Token found for user ${userId}`);
        
        return { 
            success: true, 
            token: token, 
            user: tokenData,
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
🎯 *New TryRating Tasks Available!*

${description || 'New tasks are now available on TryRating.'}

_TryRating Assistant_`;

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
            health: '/health',
            status: '/api/status',
            debug: '/api/debug-tokens',
            verify: '/api/verify (POST)',
            notify: '/api/notify (POST)'
        },
        telegram: {
            bot_name: 'TryRating Assistant Bot',
            commands: ['/start', '/sub', '/status', '/help']
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
        activeTokens: userTokens.size
    });
});

// ✅ Debug endpoint
app.get('/api/debug-tokens', (req, res) => {
    loadTokens();
    
    const tokens = [];
    for (const [id, data] of userTokens) {
        tokens.push({
            userId: id,
            token: data.token,
            isActive: data.isActive,
            chatId: data.chatId,
            username: data.username,
            createdAt: data.createdAt,
            verifiedAt: data.verifiedAt
        });
    }
    res.json({ 
        total: userTokens.size,
        tokens: tokens 
    });
});

// ✅ SIMPLE VERIFY - Just checks if token exists (NO CODE)
app.post('/api/verify', async (req, res) => {
    console.log('[TryRating Bot] 📥 /api/verify called');
    console.log('[TryRating Bot] 📦 Request body:', req.body);
    
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
            user: {
                userId: result.user.userId,
                chatId: result.user.chatId,
                username: result.user.username
            }
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error
        });
    }
});

// POST /api/notify
app.post('/api/notify', async (req, res) => {
    console.log('[TryRating Bot] 📥 /api/notify called');
    console.log('[TryRating Bot] 📦 Request body:', req.body);
    
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
    console.log(`[TryRating Bot] 📍 Health: https://your-domain.com/health`);
    console.log(`[TryRating Bot] 📍 Debug: https://your-domain.com/api/debug-tokens`);
});

console.log('[TryRating Bot] ==================================');
console.log('[TryRating Bot] 🤖 TryRating Assistant Bot');
console.log('[TryRating Bot] 📋 Commands: /start, /sub, /status, /help');
console.log('[TryRating Bot] ✅ Bot is ready!');
console.log('[TryRating Bot] ==================================');
