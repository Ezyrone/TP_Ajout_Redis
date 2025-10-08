const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Redis = require('ioredis');
const { randomUUID } = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MAX_HISTORY = 50;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const REDIS_CHANNEL = process.env.REDIS_CHANNEL || 'chat:events';
const ROOMS_KEY = 'chat:rooms';
const ROOM_COUNT_KEY = 'chat:room-user-counts';
const HISTORY_PREFIX = 'chat:history:';
const instanceId = randomUUID();

const redis = new Redis(REDIS_URL);
const subscriber = redis.duplicate();

redis.on('error', (err) => {
  console.error('Erreur de connexion Redis (client principal)', err);
});

subscriber.on('error', (err) => {
  console.error('Erreur de connexion Redis (abonné)', err);
});

subscriber
  .subscribe(REDIS_CHANNEL)
  .then(() => {
    console.log(`Instance ${instanceId} abonnée au canal Redis "${REDIS_CHANNEL}"`);
  })
  .catch((err) => {
    console.error('Impossible de souscrire au canal Redis', err);
  });

const sanitizeValue = (value) => String(value ?? '').trim();

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

const historyKey = (room) => `${HISTORY_PREFIX}${room}`;

const saveMessageToHistory = async (room, payload) => {
  try {
    const key = historyKey(room);
    await redis
      .multi()
      .rpush(key, JSON.stringify(payload))
      .ltrim(key, -MAX_HISTORY, -1)
      .exec();
  } catch (err) {
    console.error(`Impossible d'enregistrer l'historique pour ${room}`, err);
  }
};

const fetchRoomHistory = async (room) => {
  try {
    const rawEntries = await redis.lrange(historyKey(room), -MAX_HISTORY, -1);
    return rawEntries
      .map((entry) => {
        try {
          return JSON.parse(entry);
        } catch (err) {
          console.error('Entrée d’historique invalide, ignorée', err);
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    console.error(`Impossible de récupérer l'historique pour ${room}`, err);
    return [];
  }
};

const fetchRooms = async () => {
  try {
    const roomNames = await redis.smembers(ROOMS_KEY);
    if (!roomNames.length) {
      return [];
    }

    const counts = await redis.hmget(ROOM_COUNT_KEY, ...roomNames);

    return roomNames
      .map((name, idx) => ({
        name,
        users: Number(counts[idx] || 0)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  } catch (err) {
    console.error('Impossible de lister les salons', err);
    return [];
  }
};

const broadcastRoomList = async () => {
  const rooms = await fetchRooms();
  io.emit('room list', rooms);
};

const publishEvent = async (type, payload = {}) => {
  const event = {
    type,
    payload,
    origin: instanceId,
    timestamp: Date.now()
  };

  try {
    await redis.publish(REDIS_CHANNEL, JSON.stringify(event));
  } catch (err) {
    console.error(`Impossible de publier l'événement ${type}`, err);
  }
};

const publishChatMessage = async (payload) => publishEvent('chat:message', payload);
const notifyRoomsUpdate = async () => publishEvent('rooms:update');

const sendRoomListToSocket = async (socket) => {
  const rooms = await fetchRooms();
  socket.emit('room list', rooms);
};

const leaveCurrentRoom = async (socket, { notify = true } = {}) => {
  const roomName = socket.data?.room;
  if (!roomName) return;

  const username = socket.data?.username;

  socket.leave(roomName);
  socket.data.room = null;

  try {
    const remaining = await redis.hincrby(ROOM_COUNT_KEY, roomName, -1);
    if (remaining <= 0) {
      await redis.hdel(ROOM_COUNT_KEY, roomName);
      await redis.srem(ROOMS_KEY, roomName);
    }
    await broadcastRoomList();
    await notifyRoomsUpdate();
  } catch (err) {
    console.error(`Impossible de mettre à jour le compteur pour ${roomName}`, err);
  }

  socket.emit('room left', { room: roomName });

  if (notify && username) {
    const info = makeInfoMessage(roomName, `${username} a quitté le salon.`);
    await publishChatMessage(info);
  }
};

subscriber.on('message', (channel, raw) => {
  if (channel !== REDIS_CHANNEL) return;
  let event;

  try {
    event = JSON.parse(raw);
  } catch (err) {
    console.error('Message Redis invalide', err);
    return;
  }

  if (!event || !event.type) return;

  switch (event.type) {
    case 'chat:message':
      (async () => {
        const payload = event.payload;
        if (!payload || !payload.room || !payload.type) return;

        if (event.origin === instanceId) {
          await saveMessageToHistory(payload.room, payload);
        }

        const targetEvent = payload.type === 'chat' ? 'chat message' : 'room message';
        io.to(payload.room).emit(targetEvent, payload);
      })().catch((err) => console.error('Erreur lors de la diffusion du message', err));
      break;
    case 'rooms:update':
      if (event.origin === instanceId) return;
      broadcastRoomList().catch((err) => console.error('Erreur lors de la mise à jour des salons', err));
      break;
    default:
      break;
  }
});

// Sert les fichiers statiques (CSS, images, etc.)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Un utilisateur est connecté');

  sendRoomListToSocket(socket).catch((err) => console.error('Erreur d’envoi de la liste des salons', err));

  socket.on('join room', async (data) => {
    try {
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
        const history = await fetchRoomHistory(room);
        socket.emit('room history', { room, messages: history });
        return;
      }

      await leaveCurrentRoom(socket);

      await redis.sadd(ROOMS_KEY, room);
      await redis.hincrby(ROOM_COUNT_KEY, room, 1);

      socket.join(room);
      socket.data.room = room;

      socket.emit('room joined', { room, username });

      const history = await fetchRoomHistory(room);
      socket.emit('room history', { room, messages: history });

      await broadcastRoomList();
      await notifyRoomsUpdate();

      const info = makeInfoMessage(room, `${username} a rejoint le salon.`);
      await publishChatMessage(info);

      console.log(`${username} a rejoint le salon ${room}`);
    } catch (err) {
      console.error('Erreur lors de la jonction du salon', err);
      socket.emit('room error', { message: 'Impossible de rejoindre le salon pour le moment.' });
    }
  });

  socket.on('create room', async (data) => {
    try {
      const room = sanitizeValue(data?.room);
      if (!room) {
        socket.emit('room error', { message: 'Le nom du salon est obligatoire.' });
        return;
      }

      const alreadyExists = await redis.sismember(ROOMS_KEY, room);
      if (alreadyExists) {
        socket.emit('room error', { message: 'Ce salon existe déjà.' });
        return;
      }

      await redis.sadd(ROOMS_KEY, room);
      await broadcastRoomList();
      await notifyRoomsUpdate();

      console.log(`Salon créé: ${room}`);
    } catch (err) {
      console.error('Erreur lors de la création du salon', err);
      socket.emit('room error', { message: 'Impossible de créer ce salon pour le moment.' });
    }
  });

  socket.on('chat message', async (data) => {
    try {
      const username = sanitizeValue(data?.username || socket.data?.username);
      const room = sanitizeValue(data?.room || socket.data?.room);
      const message = sanitizeValue(data?.message);

      if (!room || !username || !message) return;

      const isMember = socket.rooms.has(room);
      if (!isMember) {
        socket.emit('room error', { message: "Vous n'êtes pas dans ce salon." });
        return;
      }

      const payload = makeChatMessage(room, username, message);
      await publishChatMessage(payload);
      console.log(`[${room}] ${username}: ${message}`);
    } catch (err) {
      console.error('Erreur lors de la diffusion du message', err);
      socket.emit('room error', { message: 'Impossible d\'envoyer ce message.' });
    }
  });

  socket.on('leave room', () => {
    leaveCurrentRoom(socket).catch((err) => console.error('Erreur lors de la sortie du salon', err));
  });

  socket.on('disconnect', () => {
    console.log('Un utilisateur est déconnecté');
    const username = socket.data?.username;
    const room = socket.data?.room;
    if (room) {
      leaveCurrentRoom(socket, { notify: true }).catch((err) => console.error('Erreur lors du départ du salon', err));
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
