// ============================================================
// STORAGE - WITH MEMORY BACKUP
// ============================================================

const userTokens = new Map();
let memoryBackup = {};  // ← In-memory backup

function loadTokens() {
    try {
        // Try main file
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
        
        // Try backup
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
            // Restore main file from backup
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            console.log(`[TryRating Bot] ✅ Loaded ${userTokens.size} tokens from backup, restored main file`);
            return true;
        }
        
        console.log('[TryRating Bot] 📄 No token file found, starting fresh');
        return false;
    } catch (e) {
        console.error('[TryRating Bot] Error loading tokens:', e);
        // Try to restore from memory backup if available
        if (Object.keys(memoryBackup).length > 0) {
            userTokens.clear();
            for (const [key, value] of Object.entries(memoryBackup)) {
                userTokens.set(key, value);
            }
            saveTokens();
            console.log(`[TryRating Bot] 🔄 Restored ${userTokens.size} tokens from memory backup`);
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
        
        // Save to main file
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        
        // Save to backup
        const backupFile = DATA_FILE + '.backup';
        fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
        
        // Save to memory backup
        memoryBackup = Object.fromEntries(userTokens);
        
        console.log(`[TryRating Bot] 💾 Saved ${userTokens.size} tokens to file + backup`);
        return true;
    } catch (e) {
        console.error('[TryRating Bot] Error saving tokens:', e);
        // Keep memory backup safe
        memoryBackup = Object.fromEntries(userTokens);
        return false;
    }
}

// ✅ Save on every change
function updateUserToken(userId, data) {
    userTokens.set(userId, data);
    saveTokens();  // Immediate save!
}

function deleteUserToken(userId) {
    userTokens.delete(userId);
    saveTokens();  // Immediate save!
}

// Load on startup
loadTokens();

// Save on exit (extra safety)
process.on('SIGINT', () => { saveTokens(); process.exit(0); });
process.on('SIGTERM', () => { saveTokens(); process.exit(0); });

// Also save every 5 seconds as fallback
setInterval(() => {
    if (userTokens.size > 0) {
        saveTokens();
    }
}, 5000);
