const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Sert les fichiers statiques (CSS, images, etc.)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Un utilisateur est connecté');

  socket.on('join room', (data) => {
    const username = String(data?.username || '').trim();
    const room = String(data?.room || '').trim();
    if (!username || !room) return;

    if (socket.data?.room) {
      socket.leave(socket.data.room);
    }

    socket.join(room);
    socket.data.username = username;
    socket.data.room = room;

    io.to(room).emit('room message', {
      message: `${username} a rejoint le salon ${room}.`
    });
    console.log(`${username} a rejoint le salon ${room}`);
  });

  socket.on('chat message', (data) => {
    const username = data.username || socket.data.username;
    const room = data.room || socket.data.room;
    const message = data.message?.trim();
    if (!room || !username || !message) return;

    io.to(room).emit('chat message', { username, room, message });
    console.log(`[${room}] ${username}: ${message}`);
  });

  socket.on('disconnect', () => {
    console.log('Un utilisateur est déconnecté');
    if (socket.data?.username && socket.data?.room) {
      socket.to(socket.data.room).emit('room message', {
        message: `${socket.data.username} a quitté le salon ${socket.data.room}.`
      });
      console.log(`${socket.data.username} a quitté le salon ${socket.data.room}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});