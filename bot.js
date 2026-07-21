const express = require('express');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');

// ============================================================
// YOUR BOT TOKEN
// ============================================================

const BOT_TOKEN = '8854314913:AAFRG1nLNCDbpso8vJg_PnraKzgUn2qoNXk';

// ============================================================
// STORAGE
// ============================================================

const userTokens = new Map(); // userId -> { token, chatId, username, createdAt, isActive, verifiedAt }
const pendingVerifications = new Map(); // userId -> { code, token, expiresAt }

// ============================================================
// INITIALIZE BOT
// ============================================================

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('[TryRating Bot] 🤖 Bot started!');

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

function generateVerificationCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
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
// COMMAND: /sub - ALWAYS returns the SAME token
// ============================================================

bot.onText(/\/sub/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const firstName = msg.from.first_name || 'User';
    
    try {
        // ✅ Check if user already has a token
        if (userTokens.has(userId)) {
            const existing = userTokens.get(userId);
            
            // ✅ Always return the SAME token - no "already verified" message
            bot.sendMessage(
                chatId,
                `🔑 *Your token is:*
\`${existing.token}\`

This token can be used on any Chrome profile.

*Status:* ${existing.isActive ? '✅ Active' : '⏳ Pending Verification'}

*Next step:* Enter this token in the extension, and we'll send a verification code to your Telegram.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        // ✅ First time user - generate new token
        const token = generateToken();
        
        userTokens.set(userId, {
            userId: userId,
            chatId: chatId,
            username: username,
            firstName: firstName,
            token: token,
            authCode: token,
            createdAt: new Date().toISOString(),
            isActive: false,
            verifiedAt: null
        });
        
        bot.sendMessage(
            chatId,
            `🔑 *Your token is:*
\`${token}\`

This token can be used on any Chrome profile.

*Status:* ⏳ Pending Verification

*Next step:* Enter this token in the extension, and we'll send a verification code to your Telegram.`,
            { parse_mode: 'Markdown' }
        );
        
        console.log(`[TryRating Bot] 📝 New token for user ${userId} (${username})`);
        
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
4. Enter your token and click "Request Code"
5. Check Telegram for verification code
6. Enter the code and click "Verify"
7. Start receiving notifications!

---

*Note:*
- Each Telegram account gets one unique token (same token always)
- Your token works on any Chrome profile
- Keep your token secure

*Ready to start? Send /sub!*`;

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// ============================================================
// COMMAND: /status
// ============================================================

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
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
        const status = tokenData.isActive ? '✅ Active' : '⏳ Pending Verification';
        
        let message = `
📊 *Token Status*

🔑 Token: \`${tokenData.token}\`
📋 Status: ${status}
👤 User: ${tokenData.username || 'Unknown'}
📅 Created: ${new Date(tokenData.createdAt).toLocaleString()}`;

        if (tokenData.verifiedAt) {
            message += `\n✅ Verified: ${new Date(tokenData.verifiedAt).toLocaleString()}`;
        }

        message += `\n\n${tokenData.isActive ? '✅ Your token is active and can be used on any Chrome profile!' : '⏳ Please verify your token in the extension.'}`;

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('[TryRating Bot] Error:', error);
        bot.sendMessage(chatId, '❌ Sorry, there was an error.');
    }
});

// ============================================================
// API: REQUEST VERIFICATION CODE
// ============================================================

async function requestVerificationCode(token) {
    try {
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
            return { success: false, error: 'Invalid token' };
        }
        
        // ✅ If already active, just return success - NO ERROR
        if (tokenData.isActive) {
            return { 
                success: true, 
                message: 'Token already active. You can use it on any profile.',
                alreadyActive: true 
            };
        }
        
        // Generate new verification code
        const verificationCode = generateVerificationCode();
        
        pendingVerifications.set(userId, {
            code: verificationCode,
            token: token,
            expiresAt: Date.now() + 10 * 60 * 1000
        });
        
        await bot.sendMessage(
            tokenData.chatId,
            `🔢 *Your verification code is:* \`${verificationCode}\`

Enter this code in the TryRating Assistant extension to activate your token.

⏰ This code expires in 10 minutes.

*Token:* \`${token}\``,
            { parse_mode: 'Markdown' }
        );
        
        return { success: true, message: 'Verification code sent to Telegram' };
        
    } catch (error) {
        console.error('[TryRating Bot] Request code error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// API: VERIFY CODE - Always returns success for valid token
// ============================================================

async function verifyCode(token, code) {
    try {
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
            return { success: false, error: 'Invalid token' };
        }
        
        // ✅ If already active, return success (NO ERROR)
        if (tokenData.isActive) {
            return { 
                success: true, 
                token: token, 
                user: tokenData, 
                authCode: token,
                alreadyActive: true 
            };
        }
        
        // Check pending verification for new tokens
        const pending = pendingVerifications.get(userId);
        if (!pending) {
            return { success: false, error: 'No verification code requested' };
        }
        
        if (pending.token !== token) {
            return { success: false, error: 'Token mismatch' };
        }
        
        if (pending.code !== code) {
            return { success: false, error: 'Invalid verification code' };
        }
        
        if (Date.now() > pending.expiresAt) {
            return { success: false, error: 'Verification code expired. Request a new one.' };
        }
        
        tokenData.isActive = true;
        tokenData.verifiedAt = new Date().toISOString();
        tokenData.authCode = token;
        pendingVerifications.delete(userId);
        
        bot.sendMessage(
            tokenData.chatId,
            `✅ *Token Verified Successfully!*

Your TryRating Assistant token is now active.

🔑 Token: \`${token}\`

You can now use this token on any Chrome profile!

*Happy rating! 🎯*`,
            { parse_mode: 'Markdown' }
        );
        
        return { success: true, token: token, user: tokenData, authCode: token };
        
    } catch (error) {
        console.error('[TryRating Bot] Verification error:', error);
        return { success: false, error: 'Verification failed' };
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

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'TryRating Assistant Bot',
        status: 'running',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            status: '/api/status',
            requestCode: '/api/request-code (POST)',
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

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        bot: 'TryRating Assistant Bot',
        activeTokens: userTokens.size,
        pendingVerifications: pendingVerifications.size,
        timestamp: new Date().toISOString()
    });
});

// GET /api/status
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'ok', 
        activeTokens: userTokens.size,
        pendingVerifications: pendingVerifications.size
    });
});

// POST /api/request-code
app.post('/api/request-code', async (req, res) => {
    console.log('[TryRating Bot] 📥 /api/request-code called');
    console.log('[TryRating Bot] 📦 Request body:', req.body);
    
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({ 
            success: false, 
            error: 'Token required' 
        });
    }
    
    const result = await requestVerificationCode(token);
    
    if (result.success) {
        res.json({ 
            success: true, 
            message: result.message,
            alreadyActive: result.alreadyActive || false
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error
        });
    }
});

// POST /api/verify
app.post('/api/verify', async (req, res) => {
    console.log('[TryRating Bot] 📥 /api/verify called');
    console.log('[TryRating Bot] 📦 Request body:', req.body);
    
    const { token, code } = req.body;
    
    if (!token || !code) {
        return res.status(400).json({ 
            success: false, 
            error: 'Token and code required' 
        });
    }
    
    const result = await verifyCode(token, code);
    
    if (result.success) {
        res.json({
            success: true,
            token: result.token,
            authCode: result.authCode,
            alreadyActive: result.alreadyActive || false,
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
    console.log(`[TryRating Bot] 📍 Root: https://your-domain.com/`);
    console.log(`[TryRating Bot] 📍 Health: https://your-domain.com/health`);
    console.log(`[TryRating Bot] 📍 Request Code: https://your-domain.com/api/request-code`);
    console.log(`[TryRating Bot] 📍 Verify: https://your-domain.com/api/verify`);
    console.log(`[TryRating Bot] 📍 Notify: https://your-domain.com/api/notify`);
});

console.log('[TryRating Bot] ==================================');
console.log('[TryRating Bot] 🤖 TryRating Assistant Bot');
console.log('[TryRating Bot] 📋 Commands: /start, /sub, /status, /help');
console.log('[TryRating Bot] ✅ Bot is ready!');
console.log('[TryRating Bot] ==================================');
