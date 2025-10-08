const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MAX_HISTORY = 50;
const rooms = new Map();

const sanitizeValue = (value) => String(value ?? '').trim();

const createRoom = () => ({
  users: new Map(),
  messages: []
});

const serializeRooms = () =>
  Array.from(rooms.entries()).map(([name, data]) => ({
    name,
    users: data.users.size
  }));

const trimHistory = (roomData) => {
  while (roomData.messages.length > MAX_HISTORY) {
    roomData.messages.shift();
  }
};

const pushHistory = (roomData, entry) => {
  roomData.messages.push(entry);
  trimHistory(roomData);
};

const makeInfoMessage = (room, message) => ({
  type: 'info',
  room,
  message,
  timestamp: Date.now()
});

const makeChatMessage = (room, username, message) => ({
  type: 'chat',
  room,
  username,
  message,
  timestamp: Date.now()
});

const broadcastRoomList = () => {
  io.emit('room list', serializeRooms());
};

const leaveCurrentRoom = (socket, { notify = true } = {}) => {
  const roomName = socket.data?.room;
  if (!roomName) return;

  const username = socket.data?.username;
  const roomData = rooms.get(roomName);

  socket.leave(roomName);
  socket.data.room = null;

  if (!roomData) {
    socket.emit('room left', { room: roomName });
    broadcastRoomList();
    return;
  }

  roomData.users.delete(socket.id);

  if (notify && username) {
    const info = makeInfoMessage(roomName, `${username} a quitté le salon.`);
    pushHistory(roomData, info);
    socket.to(roomName).emit('room message', info);
  }

  if (roomData.users.size === 0) {
    rooms.delete(roomName);
  }

  socket.emit('room left', { room: roomName });
  broadcastRoomList();
};

// Sert les fichiers statiques (CSS, images, etc.)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Un utilisateur est connecté');

  socket.emit('room list', serializeRooms());

  socket.on('join room', (data) => {
    const username = sanitizeValue(data?.username || socket.data?.username);
    const room = sanitizeValue(data?.room);

    if (!username) {
      socket.emit('room error', { message: 'Veuillez renseigner un pseudo.' });
      return;
    }

    if (!room) {
      socket.emit('room error', { message: 'Veuillez sélectionner un salon.' });
      return;
    }

    socket.data.username = username;

    if (socket.data.room === room) {
      socket.emit('room joined', { room, username });
      const roomData = rooms.get(room);
      socket.emit('room history', {
        room,
        messages: roomData ? roomData.messages : []
      });
      return;
    }

    leaveCurrentRoom(socket);

    const roomData = rooms.get(room) || createRoom();
    rooms.set(room, roomData);

    roomData.users.set(socket.id, username);

    socket.join(room);
    socket.data.room = room;

    socket.emit('room joined', { room, username });
    socket.emit('room history', {
      room,
      messages: roomData.messages
    });

    const info = makeInfoMessage(room, `${username} a rejoint le salon.`);
    pushHistory(roomData, info);
    io.to(room).emit('room message', info);

    broadcastRoomList();
    console.log(`${username} a rejoint le salon ${room}`);
  });

  socket.on('create room', (data) => {
    const room = sanitizeValue(data?.room);
    if (!room) {
      socket.emit('room error', { message: 'Le nom du salon est obligatoire.' });
      return;
    }

    if (rooms.has(room)) {
      socket.emit('room error', { message: 'Ce salon existe déjà.' });
      return;
    }

    rooms.set(room, createRoom());
    broadcastRoomList();
    console.log(`Salon créé: ${room}`);
  });

  socket.on('chat message', (data) => {
    const username = data.username || socket.data.username;
    const room = data.room || socket.data.room;
    const message = data.message?.trim();
    if (!room || !username || !message) return;

    const roomData = rooms.get(room);
    if (!roomData) {
      socket.emit('room error', { message: "Ce salon n'existe plus." });
      return;
    }

    const payload = makeChatMessage(room, username, message);
    pushHistory(roomData, payload);
    io.to(room).emit('chat message', payload);
    console.log(`[${room}] ${username}: ${message}`);
  });

  socket.on('leave room', () => {
    leaveCurrentRoom(socket);
  });

  socket.on('disconnect', () => {
    console.log('Un utilisateur est déconnecté');
    const username = socket.data?.username;
    const room = socket.data?.room;
    if (room) {
      leaveCurrentRoom(socket, { notify: true });
      if (username) {
        console.log(`${username} a quitté le salon ${room}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});
