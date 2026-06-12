import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db';
// Import routes
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import billRoutes from './routes/bills';
import customerRoutes from './routes/customers';
import userRoutes from './routes/users';
import analyticsRoutes from './routes/analytics';
import settingsRoutes from './routes/settings';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Initialize Database
console.log('Initializing SQLite database...');
initDb();
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
// Basic Middlewares
app.use(cors());
app.use(express.json());
// Set up WebSocket broadcast helper on app instance
const clients = new Set();
function broadcast(data) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
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
// Serves the client build output in production
const buildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(buildPath));
app.get('*', (req, res) => {
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
        }
        catch (e) {
            console.error('Error handling WebSocket message:', e);
        }
    });
    ws.on('close', () => {
        clients.delete(ws);
        console.log(`🔌 Client disconnected. Remaining clients: ${clients.size}`);
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Retail POS Server running on port ${PORT}`);
    console.log(`📍 Local access: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
});
