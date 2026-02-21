# NexSon – Premium Music Streaming

Une plateforme de streaming musical premium — gratuite, titres complets, sans limites.

## Fonctionnalités

- **Titres complets** via Jamendo API (Creative Commons — pas de limite 30 secondes)
- **Authentification** MongoDB sécurisée (+ fallback localStorage)
- **Recherche automatique** avec résultats en temps réel
- **Paroles** en temps réel via Lyrics.ovh
- **Playlists** : création, édition, lecture aléatoire
- **File d'attente** et mode aléatoire/répétition
- **Responsive** : mobile, tablette, desktop
- **Raccourcis clavier** : Espace (play/pause), Alt+→/← (suivant/précédent), M (mute)

---

## Démarrage rapide (frontend seul)

1. Ouvre `index.html` avec **Live Server** (VS Code) ou tout serveur local
2. Crée un compte ou utilise **Accès démo rapide**
3. Les titres sont complets et gratuits via Jamendo

> Sans backend, l'auth utilise le localStorage du navigateur.

---

## Configuration du backend MongoDB

### Étape 1 — Créer un cluster MongoDB Atlas (gratuit)

1. Va sur [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Crée un compte → **Create a cluster** → choisis **M0 Free Tier**
3. **Database Access** → Ajoute un utilisateur (username + password)
4. **Network Access** → `0.0.0.0/0` (toutes les IPs autorisées)
5. **Clusters** → **Connect** → **Connect your application**
6. Copie la connection string : `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/`

### Étape 2 — Configurer l'environnement

```bash
cd server
cp .env.example .env
# Édite .env avec tes valeurs :
```

```env
MONGODB_URI=mongodb+srv://TON_USER:TON_PASS@cluster0.xxxxx.mongodb.net/nexson
JWT_SECRET=une_longue_chaine_aleatoire_impossible_a_deviner
PORT=3001
ALLOWED_ORIGIN=http://localhost:5500
```

### Étape 3 — Installer et démarrer le backend

```bash
cd server
npm install
npm start
# → Serveur sur http://localhost:3001
# → Test : http://localhost:3001/api/health
```

### Étape 4 — Activer le backend dans le frontend

Dans `assets/js/config.js` :
```javascript
USE_BACKEND: true,   // ← mettre true
API_BASE: 'http://localhost:3001',  // ← ton URL backend
```

### Endpoints API disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | Vérification serveur |
| POST | `/api/auth/register` | Créer un compte |
| POST | `/api/auth/login` | Se connecter |
| GET | `/api/auth/me` | Profil (auth requis) |
| PATCH | `/api/auth/profile` | Modifier profil |
| POST | `/api/auth/change-password` | Changer mot de passe |

---

## Structure

```
NexSon/
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/
│       ├── config.js       Configuration & données
│       ├── api.js          Jamendo API (musique complète)
│       ├── auth.js         Auth (MongoDB + fallback local)
│       ├── player.js       Lecteur audio HTML5
│       ├── search.js       Recherche automatique
│       ├── views.js        Pages & vues
│       ├── ui.js           UI helpers
│       ├── router.js       Navigation SPA
│       ├── store.js        Persistence localStorage
│       ├── playlists.js    Gestion playlists
│       └── app.js          Point d'entrée
└── server/                 Backend optionnel
    ├── index.js            Express + JWT
    ├── models/User.js      Modèle MongoDB
    ├── .env.example        Template config
    └── package.json
```

## Tech Stack

| | Technologie |
|--|--|
| Frontend | HTML5, CSS3, JavaScript vanilla |
| Musique | Jamendo API (titres CC complets) |
| Paroles | Lyrics.ovh |
| Backend | Node.js, Express |
| Base de données | MongoDB Atlas + Mongoose |
| Authentification | JWT + bcryptjs |
