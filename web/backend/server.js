const { spawn } = require('child_process');
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Health check endpoint for deployment services (Railway/Render)
app.get('/health', (req, res) => {
    res.status(200).send('RESIGN Backend is healthy');
});

// The path to the compiled RESIGN engine
const ENGINE_PATH = path.resolve(__dirname, '../../resign');

// Keep track of connected clients to broadcast engine output
const clients = new Set();

wss.on('connection', (ws) => {
    console.log('Frontend connected.');
    clients.add(ws);
    
    // Spawn a fresh engine instance for this connection
    // For a simple implementation, we spawn one engine globally, but let's do it per connection or globally.
    // Actually, one global engine instance is better for a single user.
    
    ws.on('message', (message) => {
        const cmd = message.toString();
        console.log(`[Frontend -> Engine] ${cmd}`);
        if (engine && !engine.killed) {
            engine.stdin.write(cmd + '\n');
        }
    });

    ws.on('close', () => {
        console.log('Frontend disconnected.');
        clients.delete(ws);
    });
});

// Global Engine Instance
let engine = null;

function startEngine() {
    console.log(`Starting RESIGN engine at: ${ENGINE_PATH}`);
    engine = spawn(ENGINE_PATH);

    engine.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[Engine -> Frontend] ${output.trim()}`);
        
        // Broadcast to all connected WebSockets
        for (const client of clients) {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(output);
            }
        }
    });

    engine.stderr.on('data', (data) => {
        console.error(`[Engine Error] ${data.toString()}`);
    });

    engine.on('close', (code) => {
        console.log(`Engine exited with code ${code}. Restarting...`);
        startEngine();
    });
}

startEngine();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`RESIGN Backend running on port ${PORT}`);
});
