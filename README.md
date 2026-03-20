# 🎧 SpotiWho?

> **A song plays. It's liked by one of your friends. Can you guess who?**

SpotiWho? is a real-time multiplayer music guessing game built on top of Spotify. Each player connects their Spotify account, and during the game, liked songs from all players are shuffled and played one by one. Your job? Figure out which friend liked each track. The faster you answer, the more points you earn.

---

## 🎮 How It Works

1. **Connect** — The host logs in with Spotify. Other players are added to the Spotify Developer allowlist.
2. **Create or Join** — The host creates a room with a 4-letter code. Friends join by entering the code.
3. **Ready Up** — Each player hits "I'm Ready" to load their liked songs into the game pool.
4. **Listen & Guess** — A track plays via the Spotify embedded player. Everyone votes on who they think liked it.
5. **Score** — Correct guesses earn points based on speed (up to 500 pts for instant answers, minimum 50 pts). Wrong guesses earn nothing.
6. **Podium** — After all rounds, the final leaderboard crowns the winner. 🏆

---

## ⚠️ Spotify Developer Limitations

SpotiWho? runs on the Spotify Web API in **Development Mode**, which comes with restrictions:

- **Maximum 5 users** can be registered on the app at any time. This includes the host.
- Users must be **manually added** by the developer in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) under **User Management** (name + Spotify email required).
- The developer account **must have Spotify Premium**.
- There is **no way** to increase this limit without applying for Extended Quota Mode, which requires a registered business and 250,000+ monthly active users — effectively impossible for personal projects.

### 💡 Workaround for More Players

If you want to play with more than 5 people, there's a workaround using **public playlists**:

1. Only **1 person** (the host) needs to be connected to Spotify.
2. Other players create a **public playlist** on Spotify containing their favorite songs.
3. They share the playlist link in the lobby.
4. The host's token fetches all tracks from each playlist.

This way, there's **no user limit** — anyone can play as long as they provide a playlist link. This feature is planned for a future update.

---

## 🛠 Tech Stack

**Monorepo architecture** — frontend and backend served from a single Express server.

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router, Framer Motion, Vite |
| Backend | Node.js, Express, Socket.IO |
| Auth | Spotify OAuth 2.0 (Authorization Code Flow) |
| Player | Spotify Embed (iframe) |
| Hosting | Railway (~5 CHF/month) |

---

## 📁 Project Structure

```
SpotiWho/
├── src/                    # Backend
│   ├── index.js            # Express server + Socket.IO setup
│   ├── auth.js             # Spotify OAuth routes
│   ├── spotify.js          # Spotify API endpoints (playlists, liked tracks)
│   └── game.js             # Game logic (rooms, rounds, voting, scoring)
├── client/                 # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.jsx         # Router + Header + Auth state
│   │   ├── pages/
│   │   │   ├── Home.jsx    # Landing page + Spotify login
│   │   │   ├── Rules.jsx   # How to play
│   │   │   ├── Lobby.jsx   # Room creation/join + settings + ready up
│   │   │   └── Game.jsx    # Gameplay (rounds, voting, scores, podium)
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   └── useSocket.js
│   │   └── globals.css     # Design system
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── package.json            # Root — orchestrates everything
├── .env                    # Spotify credentials (not committed)
└── .gitignore
```

---

## ✅ What's Done (v1)

### Gameplay
- [x] Private rooms with 4-letter codes (up to 8 players)
- [x] Real-time multiplayer via WebSockets
- [x] Liked songs fetched from each player's Spotify library
- [x] Spotify Embed player for track playback
- [x] Vote system — guess which player liked the current track
- [x] Time-based scoring (50–500 pts depending on speed)
- [x] Configurable rounds (3–15) and timer (15s–60s)
- [x] Round-end reveal showing who actually liked the track
- [x] Animated podium (🥇🥈🥉) at game over
- [x] Player reconnection support during active games

### Auth & Backend
- [x] Spotify OAuth 2.0 (login, callback, refresh, logout)
- [x] Session management with production cookie support
- [x] Stable player identification (survives socket reconnections)
- [x] Host transfer on disconnect

### Design & UX
- [x] Dark theme with green/purple Spotify-inspired palette
- [x] Glassmorphism cards and subtle gradients
- [x] Outfit + Space Mono typography
- [x] Framer Motion animations (page transitions, podium reveals)
- [x] Responsive design
- [x] Persistent header with user avatar and logout

### Deployment
- [x] Monorepo (frontend + backend in one service)
- [x] One-command deploy via Railway
- [x] Auto-deploy on `git push`

---

## 🔮 Planned (v2+)

### Gameplay
- [ ] **Playlist mode** — players paste public playlist links instead of connecting Spotify (bypasses 5-user limit)
- [ ] Bonus points for answer streaks
- [ ] "Blind mode" — hide album art and track name, audio only
- [ ] Option to exclude voting for yourself
- [ ] End-of-game recap playlist with all tracks played
- [ ] Play again without recreating the room

### Design & UX
- [ ] Confetti animation on correct answers, shake on wrong
- [ ] Real-time indicator showing who has/hasn't voted
- [ ] Custom branding and favicon
- [ ] Animated transitions between game phases
- [ ] Mobile-optimized touch interactions

### Technical
- [ ] Redis session store (replace in-memory)
- [ ] Socket reconnection resilience
- [ ] Rate limiting on API routes
- [ ] Error monitoring (Sentry)
- [ ] CI/CD pipeline

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A [Spotify Developer](https://developer.spotify.com/dashboard) app with Web API enabled
- Spotify Premium account

### Local Development

```bash
git clone https://github.com/Broannn/SpotiWho.git
cd SpotiWho
npm install

# Create .env at the root
cp .env.example .env
# Fill in your Spotify credentials

# Run both backend + frontend
npm run dev

# Open http://127.0.0.1:5173
```

### Deploy to Railway

1. Push to GitHub
2. Create a new project on [Railway](https://railway.app) → Deploy from GitHub
3. Add environment variables (see `.env.example`)
4. Add your Railway URL to Spotify Dashboard → Redirect URIs
5. Done. Auto-deploys on every push.

---

## 📄 License

Personal project — no license defined yet.
