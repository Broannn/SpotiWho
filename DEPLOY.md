# 🚀 SpotiWho — Guide de déploiement Railway

## Prérequis
- Le projet tourne en local ✅
- Un compte GitHub avec le repo `SpotiWho` ✅
- Un compte Railway (créé avec GitHub) → https://railway.app

---

## Étape 1 — Prépare le repo

```bash
cd ~/Documents/SpotiWho

# Vérifie que tout est commité
git add -A
git commit -m "SpotiWho monorepo — ready for deploy"
git push origin main
```

---

## Étape 2 — Crée le projet Railway

1. Va sur https://railway.app → **New Project**
2. Choisis **Deploy from GitHub repo**
3. Sélectionne **SpotiWho**
4. Railway détecte automatiquement Node.js ✅

---

## Étape 3 — Variables d'environnement

Dans Railway, va dans l'onglet **Variables** de ton service et ajoute :

| Variable | Valeur |
|---|---|
| `SPOTIFY_CLIENT_ID` | `0d3e1bbff18f4bbb959c7280f0267c56` |
| `SPOTIFY_CLIENT_SECRET` | *(ton secret)* |
| `SPOTIFY_REDIRECT_URI` | `https://TON-APP.up.railway.app/auth/callback` |
| `FRONTEND_URL` | *(laisser vide — en prod tout est sur le même domaine)* |
| `SESSION_SECRET` | *(un mot de passe aléatoire, ex: `sW_prod_2024_xK9m`)* |
| `NODE_ENV` | `production` |
| `PORT` | `3001` |

> ⚠️ **Important** : Railway te donne une URL du type `https://spotiwho-production-xxxx.up.railway.app`. 
> Copie-la et mets-la dans `SPOTIFY_REDIRECT_URI` avec `/auth/callback` à la fin.

---

## Étape 4 — Configure Spotify Dashboard

1. Va sur https://developer.spotify.com/dashboard
2. Ouvre ton app
3. Dans **Redirect URIs**, ajoute :
   ```
   https://TON-APP.up.railway.app/auth/callback
   ```
4. **Save**

---

## Étape 5 — Vérifie les settings Railway

Dans **Settings** du service :
- **Build Command** : `npm run build` (Railway le détecte auto)
- **Start Command** : `npm start` (Railway le détecte auto)
- **Root Directory** : `/` (par défaut)

Railway fait automatiquement :
1. `npm install` (installe les deps backend)
2. `postinstall` → `cd client && npm install` (installe les deps frontend)
3. `npm run build` → build le React
4. `npm start` → lance Express qui sert tout

---

## Étape 6 — Déploie !

Railway déploie automatiquement à chaque push sur `main`.

Le premier déploiement prend ~2 minutes. Après ça :
- Chaque `git push` = redéploiement automatique
- Logs visibles dans l'onglet **Deployments**

---

## Étape 7 — Domaine custom (optionnel)

Railway te donne un domaine `.up.railway.app` gratuit.

Si tu veux un domaine custom :
1. **Settings** → **Networking** → **Custom Domain**
2. Ajoute ton domaine
3. Configure le DNS (CNAME vers Railway)
4. N'oublie pas de mettre à jour `SPOTIFY_REDIRECT_URI`

---

## Résumé des coûts

| Service | Coût |
|---|---|
| Railway Hobby | ~5 $/mois (~4.50 CHF) |
| Spotify API | Gratuit |
| **Total** | **~5 $/mois** |

---

## Commandes utiles

```bash
# Dev local
npm run dev          # Lance backend + frontend en parallèle

# Build prod en local (pour tester)
npm run build        # Build le React
npm start            # Lance le serveur prod

# Déployer
git add -A && git commit -m "update" && git push
# → Railway déploie automatiquement
```

---

## Troubleshooting

**"Cannot GET /lobby"** → Vérifie que le build React est bien fait (`client/dist` existe)

**"Auth failed"** → Vérifie que `SPOTIFY_REDIRECT_URI` dans Railway ET dans Spotify Dashboard correspondent exactement

**WebSockets ne marchent pas** → Railway supporte nativement les WebSockets, pas besoin de config spéciale

**"Not authenticated"** → En prod, vérifie que `NODE_ENV=production` et que les cookies sont bien configurés (sameSite: none, secure: true)
