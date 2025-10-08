# Chat Multi-Salons

> Expérimenter la discussion temps réel avec des salons dynamiques, un historique léger et une interface moderne animée.

| Section | Contenu |
| --- | --- |
| **Stack** | Node.js 18+, Express, Socket.IO |
| **Interface** | Glassmorphism, toasts, navigation fluide entre salons |
| **Serveur** | Création/fermeture automatique des salons, historique limité à 50 messages |

## Fonctionnalités clés

- Création et sélection d’un salon en temps réel (avec compteur d’utilisateurs).
- Pseudo configurable côté client et conservé pendant la session socket.
- Historique court partagé dès l’arrivée dans un salon.
- Notifications d’entrée/sortie pour garder tout le monde informé.

## Installation

```bash
npm install
```

## Démarrage rapide

```bash
node index.js
```

Ensuite, rendez-vous sur `http://localhost:3000`.

## Scénario de test recommandé

1. Ouvrir deux onglets/navigateurs sur `http://localhost:3000`.
2. Choisir un pseudo dans chaque onglet.
3. Créer un salon depuis le premier onglet puis le rejoindre depuis le second.
4. Échanger des messages et vérifier la synchronisation (messages + toasts).
5. Quitter le salon pour constater la notification et la fermeture automatique si nécessaire.

## Structure des fichiers

- `index.js` : logique serveur (Express + Socket.IO, gestion des salons et de l’historique).
- `index.html` : interface utilisateur et scripts Socket.IO côté client.
- `style.css` : thème modernisé (glassmorphism, transitions douces, responsive).

---

GRZESZCZAK Jory - M2 AL - ESGI Grenoble
