# Chat Multi-Salons (Socket.IO)

Application Node.js simple qui illustre la gestion de salons multiples avec Socket.IO et Express. Chaque salon conserve un historique court des derniers échanges et se supprime automatiquement lorsqu’il n’a plus de participants.

## Fonctionnalités

- Création et sélection de salons en temps réel.
- Pseudo configurable côté client (persistant pendant la session).
- Notifications d’arrivée/départ et historique remis lors de la connexion.
- Interface responsive avec liste des salons et compteur de participants.



## Installation

```bash
npm install
```

## Lancement

```bash
node index.js
```

Le serveur écoute par défaut sur `http://localhost:3000/`.


## Structure des fichiers

- `index.js` : serveur Express + Socket.IO, gestion des salons et de l’historique.
- `index.html` : interface client (formulaires pseudo/salon, flux de messages).
- `style.css` : thème sombre, grille responsive et toast de notifications.

-
-
-
-
-

## Jory GRZESZCZAK - M2 AL - ESGI Grenoble