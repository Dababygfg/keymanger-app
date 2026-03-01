const crypto = require('crypto');

// In-memory storage (in production, use a real database)
let users = [
    { id: 1, username: 'admin', password: 'admin123', name: 'Admin User', email: 'admin@example.com', is_admin: true },
    { id: 2, username: 'seller', password: 'seller123', name: 'Seller User', email: 'seller@example.com', is_admin: false }
];

let apps = [
    { id: 1, name: 'Test App', description: 'A test application', version: '1.0.0', status: 'active', seller_id: 2, key_count: 0 }
];

let keys = [];

let nextUserId = 3;
let nextAppId = 2;
let nextKeyId = 1;

// Helper functions
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function findUser(username, password) {
    const user = users.find(u => u.username === username);
    if (user && user.password === password) {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
    return null;
}

function generateKey() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let newKey = "";
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) newKey += "-";
        newKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return newKey;
}

// Main handler
exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { action, payload } = JSON.parse(event.body);
        let response;

        switch (action) {
            // Authentication
            case 'login':
                response = handleLogin(payload);
                break;
            
            case 'register':
                response = handleRegister(payload);
                break;

            // Applications
            case 'getApps':
                response = handleGetApps(payload);
                break;

            case 'createApp':
                response = handleCreateApp(payload);
                break;

            case 'updateApp':
                response = handleUpdateApp(payload);
                break;

            case 'deleteApp':
                response = handleDeleteApp(payload);
                break;

            // Keys
            case 'getKeys':
                response = handleGetKeys(payload);
                break;

            case 'createKey':
                response = handleCreateKey(payload);
                break;

            case 'updateKey':
                response = handleUpdateKey(payload);
                break;

            case 'deleteKey':
                response = handleDeleteKey(payload);
                break;

            // Users (Admin only)
            case 'getSellers':
                response = handleGetSellers(payload);
                break;

            case 'createSeller':
                response = handleCreateSeller(payload);
                break;

            case 'deleteSeller':
                response = handleDeleteSeller(payload);
                break;

            default:
                response = { ok: false, error: 'Unknown action' };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ ok: false, error: 'Internal server error' })
        };
    }
};

// Authentication handlers
function handleLogin(payload) {
    const { username, password } = payload;
    const user = findUser(username, password);
    
    if (user) {
        return { ok: true, user };
    } else {
        return { ok: false, error: 'Invalid credentials' };
    }
}

function handleRegister(payload) {
    const { name, email, username, password } = payload;
    
    // Check if user already exists
    if (users.find(u => u.username === username)) {
        return { ok: false, error: 'Username already exists' };
    }
    
    if (users.find(u => u.email === email)) {
        return { ok: false, error: 'Email already exists' };
    }

    const newUser = {
        id: nextUserId++,
        username,
        password, // In production, hash this
        name,
        email,
        is_admin: false
    };

    users.push(newUser);
    const { password: _, ...userWithoutPassword } = newUser;
    
    return { ok: true, user: userWithoutPassword };
}

// Application handlers
function handleGetApps(payload) {
    const { isAdmin, sellerId } = payload;
    
    if (isAdmin) {
        return { ok: true, data: apps };
    } else {
        const userApps = apps.filter(app => app.seller_id === sellerId);
        return { ok: true, data: userApps };
    }
}

function handleCreateApp(payload) {
    const { name, description, version, status, seller_id } = payload;
    
    const newApp = {
        id: nextAppId++,
        name,
        description,
        version,
        status,
        seller_id,
        key_count: 0
    };

    apps.push(newApp);
    return { ok: true, data: newApp };
}

function handleUpdateApp(payload) {
    const { id, name, description, version, status } = payload;
    
    const appIndex = apps.findIndex(app => app.id == id);
    if (appIndex === -1) {
        return { ok: false, error: 'Application not found' };
    }

    apps[appIndex] = { ...apps[appIndex], name, description, version, status };
    return { ok: true };
}

function handleDeleteApp(payload) {
    const { id } = payload;
    
    const appIndex = apps.findIndex(app => app.id == id);
    if (appIndex === -1) {
        return { ok: false, error: 'Application not found' };
    }

    // Delete associated keys
    keys = keys.filter(key => key.app_id != id);
    
    // Delete app
    apps.splice(appIndex, 1);
    
    return { ok: true };
}

// Key handlers
function handleGetKeys(payload) {
    const { appId, isAdmin, sellerId, showAll } = payload;
    
    let appKeys = keys.filter(key => key.app_id == appId);
    
    if (!isAdmin && !showAll) {
        appKeys = appKeys.filter(key => key.seller_id == sellerId);
    }

    // Add seller names
    const keysWithSellerNames = appKeys.map(key => {
        const seller = users.find(u => u.id == key.seller_id);
        return {
            ...key,
            seller_name: seller ? seller.username : 'Unknown'
        };
    });

    return { ok: true, data: keysWithSellerNames };
}

function handleCreateKey(payload) {
    const { key, is_active, duration, seller_id, app_id } = payload;
    
    const newKey = {
        id: nextKeyId++,
        key,
        is_active,
        duration,
        seller_id,
        app_id,
        hwid: null,
        hwid_banned: false,
        note: null,
        created_at: new Date().toISOString()
    };

    keys.push(newKey);
    
    // Update app key count
    const app = apps.find(a => a.id == app_id);
    if (app) {
        app.key_count = keys.filter(k => k.app_id == app_id).length;
    }

    return { ok: true };
}

function handleUpdateKey(payload) {
    const { id, duration, note, is_active, hwid, hwid_banned } = payload;
    
    const keyIndex = keys.findIndex(key => key.id == id);
    if (keyIndex === -1) {
        return { ok: false, error: 'Key not found' };
    }

    if (duration !== undefined) keys[keyIndex].duration = duration;
    if (note !== undefined) keys[keyIndex].note = note;
    if (is_active !== undefined) keys[keyIndex].is_active = is_active;
    if (hwid !== undefined) keys[keyIndex].hwid = hwid;
    if (hwid_banned !== undefined) keys[keyIndex].hwid_banned = hwid_banned;

    return { ok: true };
}

function handleDeleteKey(payload) {
    const { id } = payload;
    
    const keyIndex = keys.findIndex(key => key.id == id);
    if (keyIndex === -1) {
        return { ok: false, error: 'Key not found' };
    }

    const key = keys[keyIndex];
    keys.splice(keyIndex, 1);
    
    // Update app key count
    const app = apps.find(a => a.id == key.app_id);
    if (app) {
        app.key_count = keys.filter(k => k.app_id == key.app_id).length;
    }

    return { ok: true };
}

// User handlers (Admin only)
function handleGetSellers(payload) {
    const usersWithoutPasswords = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    });
    
    return { ok: true, data: usersWithoutPasswords };
}

function handleCreateSeller(payload) {
    const { username, password, is_admin } = payload;
    
    if (users.find(u => u.username === username)) {
        return { ok: false, error: 'Username already exists' };
    }

    const newUser = {
        id: nextUserId++,
        username,
        password, // In production, hash this
        name: username,
        email: `${username}@example.com`,
        is_admin: is_admin || false
    };

    users.push(newUser);
    const { password: _, ...userWithoutPassword } = newUser;
    
    return { ok: true, data: userWithoutPassword };
}

function handleDeleteSeller(payload) {
    const { id } = payload;
    
    const userIndex = users.findIndex(user => user.id == id);
    if (userIndex === -1) {
        return { ok: false, error: 'User not found' };
    }

    users.splice(userIndex, 1);
    return { ok: true };
}
