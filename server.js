const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    maxHttpBufferSize: 1e8
});

app.use(express.static(path.join(__dirname, 'public')));

let users = [];
let messages = [];
const userRateLimit = new Map();

async function getLinkPreview(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = text.match(urlRegex);
    
    if (match && match[0]) {
        try {
            const url = match[0];
            const response = await fetch(url);
            const html = await response.text();
            
            const titleMatch = html.match(/<title>(.*?)<\/title>/);
            const imgMatch = html.match(/<meta property="og:image" content="(.*?)"/);
            
            if (titleMatch) {
                return {
                    url: url,
                    title: titleMatch[1],
                    image: imgMatch ? imgMatch[1] : null
                };
            }
        } catch (e) {
            console.log(e);
        }
    }
    return null;
}

io.on('connection', (socket) => {
    
    socket.emit('history', messages);
    io.emit('onlineCount', users.length);

    socket.on('join', (data) => {
        const user = { id: socket.id, nickname: data.nickname, color: data.color, avatar: data.avatar || 'ph-user' };
        users.push(user);
        const sysMsg = createMessage('system', `${data.nickname} se ha unido.`);
        messages.push(sysMsg);
        io.emit('message', sysMsg);
        io.emit('onlineCount', users.length);
    });

    socket.on('chatMessage', async (data) => {
        const lastTime = userRateLimit.get(socket.id) || 0;
        const now = Date.now();
        if (now - lastTime < 1000) {
            socket.emit('spamWarning', 'Estás enviando mensajes muy rápido.');
            return;
        }
        userRateLimit.set(socket.id, now);

        const user = users.find(u => u.id === socket.id);
        if (user) {
            user.color = data.color;
            let linkData = null;
            if (data.text) {
                linkData = await getLinkPreview(data.text);
            }

            const msg = createMessage(
                'user', 
                data.text, 
                user.nickname, 
                socket.id, 
                user.color, 
                data.image,
                data.audio,
                linkData,
                user.avatar
            );
            messages.push(msg);
            io.emit('message', msg);
        }
    });

    socket.on('typing', (isTyping) => {
        const user = users.find(u => u.id === socket.id);
        if(user) socket.broadcast.emit('displayTyping', { isTyping, nick: user.nickname });
    });

    socket.on('react', ({ messageId, emoji }) => {
        const msg = messages.find(m => m.id === messageId);
        if (msg) {
            if (!msg.reactions) msg.reactions = {};
            if (!msg.reactions[emoji]) msg.reactions[emoji] = 0;
            msg.reactions[emoji]++;
            io.emit('updateMessage', msg);
        }
    });

    socket.on('disconnect', () => {
        userRateLimit.delete(socket.id);
        const userIndex = users.findIndex(u => u.id === socket.id);
        if (userIndex !== -1) {
            const user = users[userIndex];
            const sysMsg = createMessage('system', `${user.nickname} ha salido.`);
            messages.push(sysMsg);
            io.emit('message', sysMsg);
            users.splice(userIndex, 1);
            io.emit('onlineCount', users.length);
        }
    });
});

function createMessage(type, text, senderName = null, senderId = null, color = null, image = null, audio = null, linkData = null, avatar = null) {
    return {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type, text, image, audio, linkData, avatar,
        senderName, senderId, senderColor: color,
        reactions: {},
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running`));