const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const upload = multer({ dest: 'uploads/' });
const rooms = {};

app.post('/upload', upload.single('avatar'), (req, res) => {
    res.json({ url: `/uploads/${req.file.filename}` });
});

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const { action, payload } = data;

        switch (action) {
            case 'join':
                handleJoin(ws, payload);
                break;
            case 'move':
                handleMove(ws, payload);
                break;
            case 'chat':
                handleChat(ws, payload);
                break;
            default:
                break;
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

function handleJoin(ws, { room, name, avatar, color }) {
    if (!rooms[room]) {
        rooms[room] = { clients: new Map(), messages: [] };
    }

    rooms[room].clients.set(ws, { name, avatar, color, x: 0, y: 0 });

    ws.room = room;
    ws.name = name;
    ws.avatar = avatar;

    const players = Array.from(rooms[room].clients.values()).map(({ name, avatar, color }) => ({ name, avatar, color }));

    rooms[room].clients.forEach((client, clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ action: 'updatePlayers', payload: players }));
            if (clientWs !== ws) {
                const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                clientWs.send(JSON.stringify({ action: 'chat', payload: { date: timeString, name: 'System', message: `<b>${name} has joined the lobby</b>` } }));
            }
        }
    });

    rooms[room].messages.forEach((message) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'chat', payload: message }));
        }
    });
}

function handleMove(ws, { x, y }) {
    const room = rooms[ws.room].clients;
    if (room) {
        const player = room.get(ws);
        player.x = x;
        player.y = y;

        const payload = JSON.stringify({
            action: 'move',
            payload: { name: ws.name, x, y, avatar: player.avatar, color: player.color } 
        });

        room.forEach((client, clientWs) => {
            if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(payload);
            }
        });
    }
}

function handleChat(ws, { room, name, message }) {
    const color = rooms[room].clients.get(ws).color;
    const date = new Date().toLocaleString();
    const chatMessage = { date, name, message, color };

    if (rooms[room]) {
        rooms[room].messages.push(chatMessage);

        const payload = JSON.stringify({
            action: 'chat',
            payload: chatMessage
        });

        rooms[room].clients.forEach((client, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(payload);
            }
        });
    }
}

function handleDisconnect(ws) {
    const room = rooms[ws.room].clients;
    if (room) {
        room.delete(ws);

        if (ws.avatar) {
            const avatarPath = path.join(__dirname, 'uploads', path.basename(ws.avatar));
            fs.unlink(avatarPath, (err) => {
                if (err) {
                    console.error('Failed to delete avatar:', err);
                }
            });
        }

        const players = Array.from(room.values()).map(({ name, avatar, color }) => ({ name, avatar, color }));
        room.forEach((client, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ action: 'updatePlayers', payload: players }));
                clientWs.send(JSON.stringify({ action: 'removeCursor', payload: { name: ws.name } }));
            }
        });

        if (room.size === 0) {
            delete rooms[ws.room];
        }
    }
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

server.listen(3000, () => {
    console.log('Server is listening on port 3000');
});
