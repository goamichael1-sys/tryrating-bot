const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================================
// BOT TOKEN
// ============================================================

const BOT_TOKEN = '8936546304:AAEvFN9gM2-IFWrfX1U0YquKDxDyylHv2wc';
const WEBHOOK_URL = 'https://tryrating-bot-tcbr.onrender.com';

console.log('[TryRating Bot] 🤖 Starting bot...');
console.log('[TryRating Bot] 📋 Token:', BOT_TOKEN.substring(0, 15) + '...');

// ============================================================
// STORAGE
// ============================================================

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tokens.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const userTokens = new Map();

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
            console.log(`[TryRating Bot] ✅ Loaded ${userTokens.size} tokens`);
        }
    } catch (e) {
        console.error('[TryRating Bot] Error loading tokens:', e);
    }
}

function saveTokens() {
    try {
        const data = {
            userTokens: Object.fromEntries(userTokens),
            savedAt: new Date().toISOString()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`[TryRating Bot] 💾 Saved ${userTokens.size} tokens`);
    } catch (e) {
        console.error('[TryRating Bot] Error saving tokens:', e);
    }
}

loadTokens();

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
// SEND TELEGRAM MESSAGE
// ============================================================

async function sendMessage(chatId, text) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            })
        });
        const result = await response.json();
        if (result.ok) {
            console.log(`[TryRating Bot] ✅ Message sent to ${chatId}`);
        } else {
            console.error('[TryRating Bot] ❌ Send error:', result.description);
        }
        return result;
    } catch (error) {
        console.error('[TryRating Bot] ❌ Send error:', error.message);
        return null;
    }
}

// ============================================================
// PROCESS COMMANDS
// ============================================================

async function processCommand(chatId, userId, username, text) {
    console.log(`[TryRating Bot] 📨 Command: "${text}" from ${username || userId}`);
    
    // /start
    if (text === '/start') {
        const welcome = `
🎯 *Welcome to TryRating Assistant Bot!*

Send /sub to get your unique token.

*Commands:*
/sub - Get your token
/status - Check your token
/help - Show help`;
        await sendMessage(chatId, welcome);
        return;
    }
    
    // /sub
    if (text === '/sub') {
        if (userTokens.has(userId)) {
            const data = userTokens.get(userId);
            await sendMessage(chatId, `🔑 *Your token:*\n\`${data.token}\`\n\n✅ Active`);
            return;
        }
        
        const token = generateToken();
        userTokens.set(userId, {
            userId: userId,
            chatId: chatId,
            username: username || 'User',
            token: token,
            authCode: token,
            createdAt: new Date().toISOString(),
            isActive: true
        });
        saveTokens();
        
        await sendMessage(chatId, `🔑 *Your unique token:*\n\`${token}\`\n\n✅ Active\n\nEnter this in the Chrome extension.`);
        console.log(`[TryRating Bot] 📝 New token for ${username || userId}: ${token}`);
        return;
    }
    
    // /status
    if (text === '/status') {
        if (!userTokens.has(userId)) {
            await sendMessage(chatId, '❌ No token found. Send /sub to get one.');
            return;
        }
        const data = userTokens.get(userId);
        await sendMessage(chatId, `📊 *Token Status*\n\n🔑 Token: \`${data.token}\`\n✅ Active\n👤 ${data.username || 'User'}`);
        return;
    }
    
    // /help
    if (text === '/help') {
        const help = `
📖 *TryRating Assistant Help*

/sub - Get your token
/status - Check your token
/help - Show this message

Send /sub to get started!`;
        await sendMessage(chatId, help);
        return;
    }
    
    // Unknown
    await sendMessage(chatId, `❌ Unknown command: ${text}\nSend /help for commands.`);
}

// ============================================================
// EXPRESS APP
// ============================================================

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// ============================================================
// WEBHOOK ENDPOINT
// ============================================================

app.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        console.log('[TryRating Bot] 📨 Webhook received');
        
        if (update.message) {
            const msg = update.message;
            const chatId = msg.chat.id;
            const userId = String(msg.from.id);
            const username = msg.from.username || msg.from.first_name;
            const text = msg.text || '';
            
            await processCommand(chatId, userId, username, text);
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('[TryRating Bot] ❌ Webhook error:', error);
        res.sendStatus(500);
    }
});

// ============================================================
// API ENDPOINTS
// ============================================================

app.get('/', (req, res) => {
    res.json({
        name: 'TryRating Assistant Bot',
        status: 'running',
        webhook: `${WEBHOOK_URL}/webhook`,
        endpoints: {
            health: 'GET /health',
            verify: 'POST /api/verify',
            notify: 'POST /api/notify'
        },
        stats: { activeTokens: userTokens.size }
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', activeTokens: userTokens.size });
});

app.post('/api/verify', async (req, res) => {
    const { token } = req.body;
    console.log(`[TryRating Bot] 🔍 Verifying: ${token}`);
    
    if (!token) {
        return res.status(400).json({ success: false, error: 'Token required' });
    }
    
    let found = null;
    for (const [id, data] of userTokens) {
        if (data.token === token || data.authCode === token) {
            found = { userId: id, ...data };
            break;
        }
    }
    
    if (found && found.isActive !== false) {
        res.json({
            success: true,
            token: token,
            authCode: token,
            user: { userId: found.userId, username: found.username }
        });
    } else {
        res.status(400).json({ success: false, error: 'Invalid token' });
    }
});

app.post('/api/notify', async (req, res) => {
    const { authCode, title, description } = req.body;
    console.log(`[TryRating Bot] 📨 Notify: ${authCode}`);
    
    if (!authCode) {
        return res.status(400).json({ success: false, error: 'authCode required' });
    }
    
    let found = null;
    for (const [id, data] of userTokens) {
        if (data.token === authCode || data.authCode === authCode) {
            found = data;
            break;
        }
    }
    
    if (!found || found.isActive === false) {
        return res.status(400).json({ success: false, error: 'Invalid authCode' });
    }
    
    const message = `🎯 *${title || 'New TryRating Task!'}*\n\n${description || 'Tasks available.'}\n\n🤖 TryRating Assistant`;
    await sendMessage(found.chatId, message);
    
    res.json({ success: true });
});

// ============================================================
// SETUP WEBHOOK
// ============================================================

async function setupWebhook() {
    try {
        const webhookUrl = `${WEBHOOK_URL}/webhook`;
        console.log(`[TryRating Bot] 🔗 Setting webhook: ${webhookUrl}`);
        
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl })
        });
        const result = await response.json();
        
        if (result.ok) {
            console.log('[TryRating Bot] ✅ Webhook set!');
        } else {
            console.error('[TryRating Bot] ❌ Webhook error:', result.description);
        }
        return result;
    } catch (error) {
        console.error('[TryRating Bot] ❌ Webhook error:', error.message);
        return null;
    }
}

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[TryRating Bot] 🌐 Server running on port ${PORT}`);
    await setupWebhook();
});

console.log('[TryRating Bot] ==================================');
console.log('[TryRating Bot] 🤖 TryRating Assistant Bot');
console.log('[TryRating Bot] 📋 Commands: /start, /sub, /status, /help');
console.log('[TryRating Bot] ==================================');
