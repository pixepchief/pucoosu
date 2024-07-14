const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = {};

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

function handleJoin(ws, { room, name }) {
    if (!rooms[room]) {
        rooms[room] = { clients: new Map(), messages: [] };
    }
    rooms[room].clients.set(ws, { name, x: 0, y: 0 });

    ws.room = room;
    ws.name = name;

    const players = Array.from(rooms[room].clients.values()).map(({ name }) => name);

    rooms[room].clients.forEach((client, clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ action: 'updatePlayers', payload: players }));
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
            payload: { name: ws.name, x, y }
        });

        room.forEach((client, clientWs) => {
            if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(payload);
            }
        });
    }
}

function handleChat(ws, { room, name, message }) {
    const date = new Date().toLocaleString();
    const chatMessage = { date, name, message };

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

        const players = Array.from(room.values()).map(({ name }) => name);
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

app.use(express.static(path.join(__dirname, 'public')));

server.listen(3000, () => {
    console.log('Server is listening on port 3000');
});
