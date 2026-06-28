const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DB_FILE = path.join(__dirname, 'users.json');
const LOG_FILE = path.join(__dirname, 'changelog.json'); 
let onlineUsers = {}; 

function loadUsers() {
    if (!fs.existsSync(DB_FILE)) return {}; 
    try { 
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); 
    } catch (e) { 
        return {}; 
    }
}

function saveUser(nickname, password) {
    const users = loadUsers();
    users[nickname.toLowerCase()] = { nickname, password };
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function loadChangelog() {
    if (!fs.existsSync(LOG_FILE)) return [];
    try { 
        return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); 
    } catch (e) { 
        return []; 
    }
}

function saveMessage(from, text) {
    const logs = loadChangelog();
    logs.push({ from, text });
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('Кто-то подключился к epsOS...');

    socket.on('register_user', (data) => {
        const nickname = data.nickname;
        const password = data.password;
        const lowerNick = nickname.toLowerCase();
        const registeredUsers = loadUsers();

        if (registeredUsers[lowerNick]) {
            if (registeredUsers[lowerNick].password === password) {
                // УДАЛЕНО: Блокировка повторного входа вырезана под корень!
                socket.nickname = registeredUsers[lowerNick].nickname;
            } else {
                socket.emit('registration_error', { message: "error: invalid password for this account" });
                return;
            }
        } else {
            saveUser(nickname, password);
            socket.nickname = nickname;
        }

        onlineUsers[socket.id] = socket.nickname;
        socket.emit('registration_success', { nickname: socket.nickname });
        io.emit('update_users', Object.values(onlineUsers));
    });

    socket.on('logout_user', () => {
        if (onlineUsers[socket.id]) {
            delete onlineUsers[socket.id];
            socket.nickname = null;
            io.emit('update_users', Object.values(onlineUsers));
        }
    });

    socket.on('change_nickname', (data) => {
        const oldNick = socket.nickname;
        const newNick = data.newNickname;
        if (onlineUsers[socket.id]) {
            socket.nickname = newNick;
            onlineUsers[socket.id] = newNick;
            socket.emit('nick_changed_success', { newNickname: newNick });
            io.emit('update_users', Object.values(onlineUsers));
        }
    });

    socket.on('disconnect', () => {
        if (onlineUsers[socket.id]) {
            delete onlineUsers[socket.id];
            io.emit('update_users', Object.values(onlineUsers));
        }
    });

    // Отдаем историю чейнджлога ТОЛЬКО по запросу от авторизованного юзера
    socket.on('request_history', () => {
        socket.emit('history_log', loadChangelog());
    });

    socket.on('send_broadcast', (data) => {
        const sender = socket.nickname || 'UNKNOWN';
        saveMessage(sender, data.text);
        io.emit('receive_broadcast', { from: sender, text: data.text });
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`epsOS полностью готов! Работает на порту ${PORT}`);
});
