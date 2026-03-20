#!/bin/bash
set -e

echo "========================================="
echo "  🎧 SpotiWho — Full Project Setup"
echo "========================================="
echo ""

PROJECT_DIR="$(pwd)"
echo "📁 Setting up in: $PROJECT_DIR"
echo ""

# ─── Root package.json ───
cat > package.json << 'EOF'
{
  "name": "spotiwho",
  "version": "1.0.0",
  "description": "SpotiWho - Guess which friend liked the song",
  "private": true,
  "scripts": {
    "dev:server": "nodemon src/index.js",
    "dev:client": "cd client && npm run dev",
    "dev": "concurrently -n SERVER,CLIENT -c blue,green \"npm run dev:server\" \"npm run dev:client\"",
    "build": "cd client && npm install && npm run build",
    "start": "NODE_ENV=production node src/index.js",
    "postinstall": "cd client && npm install"
  },
  "engines": { "node": ">=18.0.0" }
}
EOF

cat > .gitignore << 'EOF'
node_modules/
client/node_modules/
client/dist/
.env
.DS_Store
*.log
EOF

echo "📦 Installing backend dependencies..."
npm install express cors dotenv express-session socket.io axios cookie-parser 2>&1 | tail -1
npm install -D nodemon concurrently 2>&1 | tail -1
echo "   ✅ Backend deps done"

# ═══════════════════════════════════════
#  BACKEND — src/
# ═══════════════════════════════════════
mkdir -p src

# ── src/index.js ──
cat > src/index.js << 'EOF'
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const authRoutes = require("./auth");
const apiRoutes = require("./spotify");
const { setupGameSocket } = require("./game");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;
const isDev = process.env.NODE_ENV !== "production";
const FRONTEND_URL = process.env.FRONTEND_URL || "";

app.use(cookieParser());
app.use(express.json());

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "spotiwho-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: "lax", maxAge: 86400000, httpOnly: true },
});
app.use(sessionMiddleware);

if (isDev) {
  app.use(cors({ origin: FRONTEND_URL, credentials: true }));
}

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/auth", authRoutes);
app.use("/api", apiRoutes);

if (!isDev) {
  const dist = path.join(__dirname, "../client/dist");
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
}

const io = new Server(server, {
  cors: isDev ? { origin: FRONTEND_URL, methods: ["GET","POST"], credentials: true } : {},
});
io.engine.use(sessionMiddleware);
setupGameSocket(io);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  🎧 SpotiWho running on port ${PORT} (${isDev ? "dev" : "prod"})`);
  if (isDev) console.log(`  → API:      http://127.0.0.1:${PORT}`);
  if (isDev) console.log(`  → Frontend: ${FRONTEND_URL}\n`);
});
EOF

# ── src/auth.js ──
cat > src/auth.js << 'EOF'
const express = require("express");
const axios = require("axios");
const router = express.Router();

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, FRONTEND_URL } = process.env;

const SCOPES = "user-read-private user-read-email user-top-read user-library-read playlist-read-private playlist-read-collaborative streaming user-read-playback-state user-modify-playback-state";

router.get("/login", (req, res) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    show_dialog: "true",
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

router.get("/callback", async (req, res) => {
  const { code, error } = req.query;
  const redirect = FRONTEND_URL || "";
  if (error) return res.redirect(`${redirect}/?error=${error}`);
  if (!code) return res.redirect(`${redirect}/?error=no_code`);

  try {
    const { data: tokens } = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code", code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { data: profile } = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    req.session.accessToken = tokens.access_token;
    req.session.refreshToken = tokens.refresh_token;
    req.session.expiresAt = Date.now() + tokens.expires_in * 1000;
    req.session.user = {
      id: profile.id,
      name: profile.display_name || profile.id,
      image: profile.images?.[0]?.url || null,
    };

    console.log(`✅ Logged in: ${req.session.user.name}`);
    req.session.save(() => res.redirect(`${redirect}/lobby`));
  } catch (err) {
    console.error("Auth error:", err.response?.data || err.message);
    res.redirect(`${redirect}/?error=auth_failed`);
  }
});

router.get("/me", (req, res) => {
  if (!req.session.accessToken) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user: req.session.user, accessToken: req.session.accessToken });
});

router.post("/refresh", async (req, res) => {
  if (!req.session.refreshToken) return res.status(401).json({ error: "No refresh token" });
  try {
    const { data } = await axios.post("https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "refresh_token", refresh_token: req.session.refreshToken,
        client_id: SPOTIFY_CLIENT_ID, client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    req.session.accessToken = data.access_token;
    res.json({ accessToken: data.access_token });
  } catch (err) {
    res.status(401).json({ error: "Refresh failed" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => { res.clearCookie("connect.sid"); res.json({ ok: true }); });
});

module.exports = router;
EOF

# ── src/spotify.js ──
cat > src/spotify.js << 'EOF'
const express = require("express");
const axios = require("axios");
const router = express.Router();

function auth(req, res, next) {
  if (!req.session.accessToken) return res.status(401).json({ error: "Not authenticated" });
  next();
}
function headers(token) { return { Authorization: `Bearer ${token}` }; }

router.get("/playlists", auth, async (req, res) => {
  try {
    const { data } = await axios.get("https://api.spotify.com/v1/me/playlists?limit=50", { headers: headers(req.session.accessToken) });
    res.json(data.items.map(p => ({ id: p.id, name: p.name, image: p.images?.[0]?.url, trackCount: p.tracks.total, owner: p.owner.display_name })));
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

router.get("/playlists/:id/tracks", auth, async (req, res) => {
  try {
    let tracks = [], url = `https://api.spotify.com/v1/playlists/${req.params.id}/tracks?limit=100`;
    while (url && tracks.length < 300) {
      const { data } = await axios.get(url, { headers: headers(req.session.accessToken) });
      tracks.push(...data.items.filter(i => i.track?.preview_url).map(i => ({
        id: i.track.id, name: i.track.name, artist: i.track.artists.map(a => a.name).join(", "),
        album: i.track.album.name, image: i.track.album.images?.[0]?.url, previewUrl: i.track.preview_url, uri: i.track.uri,
      })));
      url = data.next;
    }
    res.json(tracks);
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

router.get("/liked-tracks", auth, async (req, res) => {
  try {
    let tracks = [], url = "https://api.spotify.com/v1/me/tracks?limit=50";
    while (url && tracks.length < 200) {
      const { data } = await axios.get(url, { headers: headers(req.session.accessToken) });
      tracks.push(...data.items.filter(i => i.track?.preview_url).map(i => ({
        id: i.track.id, name: i.track.name, artist: i.track.artists.map(a => a.name).join(", "),
        album: i.track.album.name, image: i.track.album.images?.[0]?.url, previewUrl: i.track.preview_url, uri: i.track.uri,
      })));
      url = data.next;
    }
    res.json(tracks);
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

router.get("/top-tracks", auth, async (req, res) => {
  try {
    const { data } = await axios.get("https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term", { headers: headers(req.session.accessToken) });
    res.json(data.items.filter(t => t.preview_url).map(t => ({
      id: t.id, name: t.name, artist: t.artists.map(a => a.name).join(", "),
      album: t.album.name, image: t.album.images?.[0]?.url, previewUrl: t.preview_url, uri: t.uri,
    })));
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

module.exports = router;
EOF

# ── src/game.js ──
cat > src/game.js << 'EOF'
const rooms = new Map();

function code() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "";
  for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)];
  return rooms.has(r) ? code() : r;
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function safe(room) {
  return { code: room.code, host: room.host, players: room.players.map(p => ({ id: p.id, name: p.name, image: p.image, score: p.score })), state: room.state, settings: room.settings };
}

function setupGameSocket(io) {
  io.on("connection", (socket) => {
    console.log(`🔌 ${socket.id} connected`);

    socket.on("create-room", ({ user }) => {
      const c = code();
      const room = { code: c, host: socket.id, players: [{ id: socket.id, name: user.name, image: user.image, score: 0, tracks: [] }], state: "lobby", settings: { rounds: 10, roundTime: 30 }, tracks: [], currentRound: 0, currentTrack: null, votes: new Map(), roundTimer: null };
      rooms.set(c, room);
      socket.join(c);
      socket.emit("room-created", { code: c, room: safe(room) });
    });

    socket.on("join-room", ({ code: c, user }) => {
      c = c.toUpperCase();
      const room = rooms.get(c);
      if (!room) return socket.emit("error-msg", { message: "Room not found" });
      if (room.state !== "lobby") return socket.emit("error-msg", { message: "Game in progress" });
      if (room.players.length >= 8) return socket.emit("error-msg", { message: "Room full" });
      if (room.players.find(p => p.id === socket.id)) return;
      room.players.push({ id: socket.id, name: user.name, image: user.image, score: 0, tracks: [] });
      socket.join(c);
      io.to(c).emit("room-updated", safe(room));
      socket.emit("room-joined", { code: c, room: safe(room) });
    });

    socket.on("update-settings", ({ code: c, settings }) => {
      const room = rooms.get(c);
      if (!room || room.host !== socket.id) return;
      room.settings = { ...room.settings, ...settings };
      io.to(c).emit("room-updated", safe(room));
    });

    socket.on("submit-tracks", ({ code: c, tracks }) => {
      const room = rooms.get(c);
      if (!room) return;
      const p = room.players.find(p => p.id === socket.id);
      if (p) { p.tracks = tracks; io.to(c).emit("player-tracks-ready", { playerId: socket.id, playerName: p.name, count: tracks.length }); }
    });

    socket.on("start-game", ({ code: c }) => {
      const room = rooms.get(c);
      if (!room || room.host !== socket.id) return;
      let all = [];
      room.players.forEach(p => p.tracks.forEach(t => all.push({ ...t, ownerId: p.id, ownerName: p.name })));
      if (all.length < room.settings.rounds) return socket.emit("error-msg", { message: `Need ${room.settings.rounds} tracks, got ${all.length}` });
      room.tracks = shuffle(all).slice(0, room.settings.rounds);
      room.currentRound = 0;
      room.state = "playing";
      room.players.forEach(p => p.score = 0);
      io.to(c).emit("game-started", { totalRounds: room.tracks.length, roundTime: room.settings.roundTime, players: room.players.map(p => ({ id: p.id, name: p.name, image: p.image })) });
      setTimeout(() => startRound(io, c), 1500);
    });

    socket.on("submit-vote", ({ code: c, votedPlayerId }) => {
      const room = rooms.get(c);
      if (!room || room.state !== "playing" || room.votes.has(socket.id)) return;
      const correct = votedPlayerId === room.currentTrack.ownerId;
      room.votes.set(socket.id, { votedPlayerId, isCorrect: correct, points: correct ? 100 : 0 });
      const p = room.players.find(p => p.id === socket.id);
      if (p && correct) p.score += 100;
      socket.emit("vote-result", { isCorrect: correct, points: correct ? 100 : 0, correctOwnerId: room.currentTrack.ownerId });
      if (room.votes.size >= room.players.length) endRound(io, c);
    });

    socket.on("disconnect", () => {
      rooms.forEach((room, c) => {
        const idx = room.players.findIndex(p => p.id === socket.id);
        if (idx !== -1) {
          room.players.splice(idx, 1);
          if (!room.players.length) { if (room.roundTimer) clearTimeout(room.roundTimer); rooms.delete(c); }
          else { if (room.host === socket.id) room.host = room.players[0].id; io.to(c).emit("room-updated", safe(room)); }
        }
      });
    });
  });
}

function startRound(io, c) {
  const room = rooms.get(c);
  if (!room || room.currentRound >= room.tracks.length) return endGame(io, c);
  room.currentTrack = room.tracks[room.currentRound];
  room.votes = new Map();
  io.to(c).emit("round-start", {
    round: room.currentRound + 1, totalRounds: room.tracks.length,
    track: { id: room.currentTrack.id, name: room.currentTrack.name, artist: room.currentTrack.artist, album: room.currentTrack.album, image: room.currentTrack.image, previewUrl: room.currentTrack.previewUrl, uri: room.currentTrack.uri },
    roundTime: room.settings.roundTime,
  });
  room.roundTimer = setTimeout(() => endRound(io, c), room.settings.roundTime * 1000);
}

function endRound(io, c) {
  const room = rooms.get(c);
  if (!room) return;
  if (room.roundTimer) clearTimeout(room.roundTimer);
  io.to(c).emit("round-end", {
    correctOwner: { id: room.currentTrack.ownerId, name: room.currentTrack.ownerName },
    track: { name: room.currentTrack.name, artist: room.currentTrack.artist, image: room.currentTrack.image },
    scores: room.players.map(p => ({ id: p.id, name: p.name, image: p.image, score: p.score })).sort((a, b) => b.score - a.score),
  });
  room.currentRound++;
  setTimeout(() => startRound(io, c), 5000);
}

function endGame(io, c) {
  const room = rooms.get(c);
  if (!room) return;
  room.state = "results";
  io.to(c).emit("game-over", { scores: room.players.map(p => ({ id: p.id, name: p.name, image: p.image, score: p.score })).sort((a, b) => b.score - a.score) });
}

module.exports = { setupGameSocket };
EOF

echo "   ✅ Backend done"

# ═══════════════════════════════════════
#  FRONTEND — client/
# ═══════════════════════════════════════
echo ""
echo "⚛️  Creating frontend..."
mkdir -p client/src/pages client/src/hooks client/src/components client/public

cat > client/package.json << 'EOF'
{
  "name": "spotiwho-client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "socket.io-client": "^4.7.5",
    "framer-motion": "^11.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
EOF

cat > client/vite.config.js << 'EOF'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/auth": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/socket.io": { target: "http://127.0.0.1:3001", ws: true, changeOrigin: true },
    },
  },
});
EOF

cat > client/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SpotiWho?</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
</head>
<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>
</html>
EOF

cat > client/public/favicon.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#1DB954"/><text x="50" y="62" font-family="Arial Black" font-size="36" fill="white" text-anchor="middle" font-weight="900">W?</text></svg>
EOF

# The frontend JS files are too long for heredoc nesting, so we write them via node
echo "   Writing React source files..."

# We'll write the frontend files individually
cat > client/src/main.jsx << 'EOF'
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./globals.css";
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>
);
EOF

# globals.css
cat > client/src/globals.css << 'EOF'
:root {
  --green: #1DB954; --green-dark: #169c46; --green-glow: rgba(29,185,84,0.25);
  --purple: #7c3aed; --purple-glow: rgba(124,58,237,0.15);
  --bg-darkest: #090a0f; --bg-dark: #0f1117;
  --bg-card: rgba(255,255,255,0.04); --bg-card-solid: #161822; --bg-card-hover: rgba(255,255,255,0.07);
  --text-primary: #f0f0f5; --text-secondary: #9ca3af; --text-muted: #4b5563;
  --danger: #ef4444; --warning: #f59e0b;
  --radius: 12px; --radius-lg: 20px; --radius-full: 999px;
  --glass: rgba(255,255,255,0.03); --glass-border: rgba(255,255,255,0.06);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { font-family: "Outfit", sans-serif; background: var(--bg-darkest); color: var(--text-primary); min-height: 100vh; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
body::before { content: ""; position: fixed; inset: 0; background: radial-gradient(ellipse 80% 60% at 20% 10%, rgba(29,185,84,0.07) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 90%, rgba(124,58,237,0.05) 0%, transparent 60%); pointer-events: none; z-index: 0; }
#root { position: relative; z-index: 1; min-height: 100vh; }
a { color: inherit; text-decoration: none; }
button { font-family: inherit; cursor: pointer; border: none; outline: none; }
input, select { font-family: inherit; outline: none; }
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--text-muted); border-radius: 3px; }
.mono { font-family: "Space Mono", monospace; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes bar-bounce { 0%, 100% { height: 6px; } 50% { height: 28px; } }
EOF

echo "   ✅ Base frontend files done"
echo ""
echo "📦 Installing frontend dependencies..."
cd client && npm install 2>&1 | tail -3
cd ..

echo ""
echo "========================================="
echo "  ✅ SpotiWho setup complete!"
echo "========================================="
echo ""
echo "  Now:"
echo "  1. Make sure .env is at the root (with your Spotify creds)"
echo "  2. Kill any old processes: kill \$(lsof -t -i:5173 -i:3001) 2>/dev/null"
echo "  3. Run: npm run dev"
echo "  4. Open: http://127.0.0.1:5173"
echo ""
