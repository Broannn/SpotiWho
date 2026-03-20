const rooms = new Map();

function generateCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "";
  for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)];
  return rooms.has(r) ? generateCode() : r;
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Stable ID based on user info — never changes on reconnect
function stableId(user) {
  return `player_${user.name}_${(user.image || "noimg").slice(-10)}`;
}

function safe(room) {
  return {
    code: room.code,
    host: room.host,
    players: room.players.map((p) => ({
      id: p.pid,
      name: p.name,
      image: p.image,
      score: p.score,
    })),
    state: room.state,
    settings: room.settings,
  };
}

function findPlayerBySocket(room, socketId) {
  return room.players.find((p) => p.socketId === socketId);
}

function setupGameSocket(io) {
  io.on("connection", (socket) => {
    console.log(`🔌 ${socket.id} connected`);

    // ─── Create room ───
    socket.on("create-room", ({ user }) => {
      const c = generateCode();
      const pid = stableId(user);
      const room = {
        code: c,
        host: pid,
        players: [
          {
            socketId: socket.id,
            pid: pid,
            name: user.name,
            image: user.image,
            score: 0,
            tracks: [],
          },
        ],
        state: "lobby",
        settings: { rounds: 10, roundTime: 30 },
        tracks: [],
        currentRound: 0,
        currentTrack: null,
        votes: new Map(),
        roundTimer: null,
      };
      rooms.set(c, room);
      socket.join(c);
      socket.emit("room-created", { code: c, room: safe(room) });
      console.log(`🏠 Room ${c} created by ${user.name} (${pid})`);
    });

    // ─── Join room ───
    socket.on("join-room", ({ code: c, user }) => {
      c = c.toUpperCase();
      const room = rooms.get(c);
      if (!room) return socket.emit("error-msg", { message: "Room not found" });

      const pid = stableId(user);
      const existing = room.players.find((p) => p.pid === pid);

      if (existing) {
        // Reconnection — only update socket id
        existing.socketId = socket.id;
        socket.join(c);
        socket.emit("room-joined", { code: c, room: safe(room) });
        io.to(c).emit("room-updated", safe(room));
        console.log(`🔄 ${user.name} reconnected to ${c}`);

        if (room.state === "playing") {
          socket.emit("game-started", {
            totalRounds: room.tracks.length,
            roundTime: room.settings.roundTime,
            players: room.players.map((p) => ({
              id: p.pid,
              name: p.name,
              image: p.image,
            })),
          });
          if (room.currentTrack) {
            socket.emit("round-start", {
              round: room.currentRound + 1,
              totalRounds: room.tracks.length,
              track: {
                id: room.currentTrack.id,
                name: room.currentTrack.name,
                artist: room.currentTrack.artist,
                album: room.currentTrack.album,
                image: room.currentTrack.image,
                previewUrl: room.currentTrack.previewUrl || null,
                uri: room.currentTrack.uri,
              },
              roundTime: room.settings.roundTime,
            });
          }
        }
        return;
      }

      // New player
      if (room.state !== "lobby")
        return socket.emit("error-msg", { message: "Game in progress" });
      if (room.players.length >= 8)
        return socket.emit("error-msg", { message: "Room full" });

      room.players.push({
        socketId: socket.id,
        pid: pid,
        name: user.name,
        image: user.image,
        score: 0,
        tracks: [],
      });
      socket.join(c);
      io.to(c).emit("room-updated", safe(room));
      socket.emit("room-joined", { code: c, room: safe(room) });
      console.log(`👋 ${user.name} joined ${c} (${pid})`);
    });

    // ─── Update settings ───
    socket.on("update-settings", ({ code: c, settings }) => {
      const room = rooms.get(c);
      if (!room) return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player || player.pid !== room.host) return;
      room.settings = { ...room.settings, ...settings };
      io.to(c).emit("room-updated", safe(room));
    });

    // ─── Submit tracks ───
    socket.on("submit-tracks", ({ code: c, tracks }) => {
      const room = rooms.get(c);
      if (!room) return;
      const player = findPlayerBySocket(room, socket.id);
      if (player) {
        player.tracks = tracks;
        console.log(`🎵 ${player.name} submitted ${tracks.length} tracks`);
        io.to(c).emit("player-tracks-ready", {
          playerId: player.pid,
          playerName: player.name,
          count: tracks.length,
        });
      }
    });

    // ─── Start game ───
    socket.on("start-game", ({ code: c }) => {
      const room = rooms.get(c);
      if (!room) return;
      const player = findPlayerBySocket(room, socket.id);
      if (!player || player.pid !== room.host) return;

      let all = [];
      room.players.forEach((p) =>
        p.tracks.forEach((t) =>
          all.push({
            ...t,
            ownerId: p.pid,         // Stable ID as owner
            ownerName: p.name,
          })
        )
      );

      if (all.length < room.settings.rounds) {
        return socket.emit("error-msg", {
          message: `Need ${room.settings.rounds} tracks, got ${all.length}`,
        });
      }

      room.tracks = shuffle(all).slice(0, room.settings.rounds);
      room.currentRound = 0;
      room.state = "playing";
      room.players.forEach((p) => (p.score = 0));

      io.to(c).emit("game-started", {
        totalRounds: room.tracks.length,
        roundTime: room.settings.roundTime,
        players: room.players.map((p) => ({
          id: p.pid,
          name: p.name,
          image: p.image,
        })),
      });

      setTimeout(() => startRound(io, c), 1500);
    });

    // ─── Vote ───
    socket.on("submit-vote", ({ code: c, votedPlayerId }) => {
      const room = rooms.get(c);
      if (!room || room.state !== "playing") return;

      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;
      if (room.votes.has(player.pid)) return;  // Already voted

      const correct = votedPlayerId === room.currentTrack.ownerId;
      room.votes.set(player.pid, {
        votedPlayerId,
        isCorrect: correct,
        points: correct ? 100 : 0,
      });

      if (correct) player.score += 100;

      socket.emit("vote-result", {
        isCorrect: correct,
        points: correct ? 100 : 0,
        correctOwnerId: room.currentTrack.ownerId,
      });

      if (room.votes.size >= room.players.length) {
        if (room.roundTimer) clearTimeout(room.roundTimer);
        room.roundTimer = setTimeout(() => endRound(io, c), 3000);
      }
    });

    // ─── Disconnect ───
    socket.on("disconnect", () => {
      rooms.forEach((room, c) => {
        const idx = room.players.findIndex((p) => p.socketId === socket.id);
        if (idx !== -1) {
          if (room.state === "playing") {
            console.log(`⏸️  ${room.players[idx].name} disconnected during game (can reconnect)`);
            return;
          }
          const pid = room.players[idx].pid;
          room.players.splice(idx, 1);
          if (!room.players.length) {
            if (room.roundTimer) clearTimeout(room.roundTimer);
            rooms.delete(c);
            console.log(`🗑️  Room ${c} deleted (empty)`);
          } else {
            if (room.host === pid) room.host = room.players[0].pid;
            io.to(c).emit("room-updated", safe(room));
          }
        }
      });
      console.log(`❌ ${socket.id} disconnected`);
    });
  });
}

function startRound(io, c) {
  const room = rooms.get(c);
  if (!room || room.currentRound >= room.tracks.length) return endGame(io, c);

  room.currentTrack = room.tracks[room.currentRound];
  room.votes = new Map();

  io.to(c).emit("round-start", {
    round: room.currentRound + 1,
    totalRounds: room.tracks.length,
    track: {
      id: room.currentTrack.id,
      name: room.currentTrack.name,
      artist: room.currentTrack.artist,
      album: room.currentTrack.album,
      image: room.currentTrack.image,
      previewUrl: room.currentTrack.previewUrl || null,
      uri: room.currentTrack.uri,
    },
    roundTime: room.settings.roundTime,
  });

  room.roundTimer = setTimeout(() => endRound(io, c), room.settings.roundTime * 1000);
}

function endRound(io, c) {
  const room = rooms.get(c);
  if (!room) return;
  if (room.roundTimer) clearTimeout(room.roundTimer);

  io.to(c).emit("round-end", {
    correctOwner: {
      id: room.currentTrack.ownerId,
      name: room.currentTrack.ownerName,
    },
    track: {
      name: room.currentTrack.name,
      artist: room.currentTrack.artist,
      image: room.currentTrack.image,
    },
    scores: room.players
      .map((p) => ({ id: p.pid, name: p.name, image: p.image, score: p.score }))
      .sort((a, b) => b.score - a.score),
  });

  room.currentRound++;
  setTimeout(() => startRound(io, c), 8000);
}

function endGame(io, c) {
  const room = rooms.get(c);
  if (!room) return;
  room.state = "results";

  io.to(c).emit("game-over", {
    scores: room.players
      .map((p) => ({ id: p.pid, name: p.name, image: p.image, score: p.score }))
      .sort((a, b) => b.score - a.score),
  });

  console.log(`🏆 Game over in ${c}`);
}

module.exports = { setupGameSocket };
