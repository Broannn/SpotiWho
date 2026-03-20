const rooms = new Map();

function code() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "";
  for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)];
  return rooms.has(r) ? code() : r;
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function safe(room) {
  return {
    code: room.code,
    host: room.host,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image,
      score: p.score,
    })),
    state: room.state,
    settings: room.settings,
  };
}

function setupGameSocket(io) {
  io.on("connection", (socket) => {
    console.log(`🔌 ${socket.id} connected`);

    // ─── Create room ───
    socket.on("create-room", ({ user }) => {
      const c = code();
      const room = {
        code: c,
        host: socket.id,
        players: [
          {
            id: socket.id,
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
      console.log(`🏠 Room ${c} created by ${user.name}`);
    });

    // ─── Join room (also handles reconnection during game) ───
    socket.on("join-room", ({ code: c, user }) => {
      c = c.toUpperCase();
      const room = rooms.get(c);
      if (!room) return socket.emit("error-msg", { message: "Room not found" });

      // Check if this player is already in the room (reconnecting with new socket)
      const existingPlayer = room.players.find(
        (p) => p.name === user.name && p.image === user.image
      );

      if (existingPlayer) {
        // Reconnection: update the socket id
        const oldId = existingPlayer.id;
        existingPlayer.id = socket.id;
        if (room.host === oldId) room.host = socket.id;

        // Update ownerId in all game tracks so votes match the new socket id
        room.tracks.forEach((t) => {
          if (t.ownerId === oldId) t.ownerId = socket.id;
        });
        if (room.currentTrack && room.currentTrack.ownerId === oldId) {
          room.currentTrack.ownerId = socket.id;
        }

        socket.join(c);
        socket.emit("room-joined", { code: c, room: safe(room) });
        io.to(c).emit("room-updated", safe(room));
        console.log(`🔄 ${user.name} reconnected to ${c}`);

        // If game is in progress, resend game state
        if (room.state === "playing") {
          socket.emit("game-started", {
            totalRounds: room.tracks.length,
            roundTime: room.settings.roundTime,
            players: room.players.map((p) => ({
              id: p.id,
              name: p.name,
              image: p.image,
            })),
          });
          // Resend current round if there is one
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

      // New player joining
      if (room.state !== "lobby")
        return socket.emit("error-msg", { message: "Game in progress" });
      if (room.players.length >= 8)
        return socket.emit("error-msg", { message: "Room full" });

      room.players.push({
        id: socket.id,
        name: user.name,
        image: user.image,
        score: 0,
        tracks: [],
      });
      socket.join(c);
      io.to(c).emit("room-updated", safe(room));
      socket.emit("room-joined", { code: c, room: safe(room) });
      console.log(`👋 ${user.name} joined ${c}`);
    });

    // ─── Update settings ───
    socket.on("update-settings", ({ code: c, settings }) => {
      const room = rooms.get(c);
      if (!room || room.host !== socket.id) return;
      room.settings = { ...room.settings, ...settings };
      io.to(c).emit("room-updated", safe(room));
    });

    // ─── Submit player tracks ───
    socket.on("submit-tracks", ({ code: c, tracks }) => {
      const room = rooms.get(c);
      if (!room) return;
      const p = room.players.find((p) => p.id === socket.id);
      if (p) {
        p.tracks = tracks;
        console.log(`🎵 ${p.name} submitted ${tracks.length} tracks`);
        io.to(c).emit("player-tracks-ready", {
          playerId: socket.id,
          playerName: p.name,
          count: tracks.length,
        });
      }
    });

    // ─── Start game ───
    socket.on("start-game", ({ code: c }) => {
      const room = rooms.get(c);
      if (!room || room.host !== socket.id) return;

      let all = [];
      room.players.forEach((p) =>
        p.tracks.forEach((t) =>
          all.push({ ...t, ownerId: p.id, ownerName: p.name })
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
          id: p.id,
          name: p.name,
          image: p.image,
        })),
      });

      setTimeout(() => startRound(io, c), 1500);
    });

    // ─── Vote ───
    socket.on("submit-vote", ({ code: c, votedPlayerId }) => {
      const room = rooms.get(c);
      if (!room || room.state !== "playing" || room.votes.has(socket.id))
        return;

      const correct = votedPlayerId === room.currentTrack.ownerId;
      room.votes.set(socket.id, {
        votedPlayerId,
        isCorrect: correct,
        points: correct ? 100 : 0,
      });

      const p = room.players.find((p) => p.id === socket.id);
      if (p && correct) p.score += 100;

      socket.emit("vote-result", {
        isCorrect: correct,
        points: correct ? 100 : 0,
        correctOwnerId: room.currentTrack.ownerId,
      });

      // When all players voted, wait 3s so they can see their result before round ends
      if (room.votes.size >= room.players.length) {
        if (room.roundTimer) clearTimeout(room.roundTimer);
        room.roundTimer = setTimeout(() => endRound(io, c), 3000);
      }
    });

    // ─── Disconnect ───
    socket.on("disconnect", () => {
      rooms.forEach((room, c) => {
        const idx = room.players.findIndex((p) => p.id === socket.id);
        if (idx !== -1) {
          // If game is in progress, don't remove — allow reconnection
          if (room.state === "playing") {
            console.log(
              `⏸️  ${room.players[idx].name} disconnected during game (can reconnect)`
            );
            return;
          }

          room.players.splice(idx, 1);
          if (!room.players.length) {
            if (room.roundTimer) clearTimeout(room.roundTimer);
            rooms.delete(c);
            console.log(`🗑️  Room ${c} deleted (empty)`);
          } else {
            if (room.host === socket.id) room.host = room.players[0].id;
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

  room.roundTimer = setTimeout(
    () => endRound(io, c),
    room.settings.roundTime * 1000
  );
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
      .map((p) => ({ id: p.id, name: p.name, image: p.image, score: p.score }))
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
      .map((p) => ({ id: p.id, name: p.name, image: p.image, score: p.score }))
      .sort((a, b) => b.score - a.score),
  });

  console.log(`🏆 Game over in ${c}`);
}

module.exports = { setupGameSocket };
