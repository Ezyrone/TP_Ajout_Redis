# Chat Multi-Salons

> Expérimenter la discussion temps réel avec des salons dynamiques, un historique léger et une interface moderne animée.

| Section | Contenu |
| --- | --- |
| **Stack** | Node.js 18+, Express, Socket.IO, Redis (Pub/Sub via ioredis) |
| **Interface** | Glassmorphism, toasts, navigation fluide entre salons |
| **Serveur** | Création/fermeture automatique des salons, historique limité à 50 messages |

## Fonctionnalités clés

- Création et sélection d’un salon en temps réel (avec compteur d’utilisateurs).
- Pseudo configurable côté client et conservé pendant la session socket.
- Historique court partagé dès l’arrivée dans un salon.
- Notifications d’entrée/sortie pour garder tout le monde informé.
- Synchronisation inter-serveurs grâce à Redis Pub/Sub (messages, compteurs et historique partagés).



## Installation

```bash
npm install
```

## Démarrage rapide (instance unique)

```bash
node index.js
```

Ensuite, rendez-vous sur `http://localhost:3000`.

## Démarrer plusieurs instances

1. Lancer Redis si ce n’est pas déjà fait.
2. Dans plusieurs terminaux :

```bash
PORT=3000 node index.js        # première instance
PORT=3001 node index.js        # deuxième instance
# ajouter d'autres ports si besoin
```

> La variable d’environnement `REDIS_URL` permet de pointer vers une autre instance Redis (`redis://user:pass@host:port/db`).



## Comment Redis synchronise les serveurs ?

- Chaque serveur publie les messages (chat et notifications système) sur un canal Redis (`chat:events`).
- Tous les serveurs sont abonnés à ce canal : ils reçoivent les messages, les enregistrent dans Redis (liste limitée à 50 entrées) puis les diffusent à leurs clients connectés.
- Les créations et compteurs de salons sont centralisés dans Redis (`chat:rooms` + `chat:room-user-counts`), ce qui garantit une vision partagée des salons sur toutes les instances.

## Structure des fichiers

- `index.js` : logique serveur (Express + Socket.IO + Redis, gestion des salons et de l’historique).
- `index.html` : interface utilisateur et scripts Socket.IO côté client.
- `style.css` : thème modernisé (glassmorphism, transitions douces, responsive).

---

GRZESZCZAK Jory - M2 AL - ESGI Grenoble
