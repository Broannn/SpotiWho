import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.DEV ? "http://127.0.0.1:3001" : "";

// Extract playlist ID from various Spotify URL formats
function extractPlaylistId(input) {
  if (!input) return null;
  // Direct ID
  if (/^[a-zA-Z0-9]{22}$/.test(input.trim())) return input.trim();
  // URL formats: open.spotify.com/playlist/ID or spotify:playlist:ID
  const urlMatch = input.match(/playlist[/:]([a-zA-Z0-9]{22})/);
  if (urlMatch) return urlMatch[1];
  return null;
}

export default function Lobby({ user }) {
  const navigate = useNavigate();
  const { code: urlCode } = useParams();
  const socketRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [joinCode, setJoinCode] = useState(urlCode || "");
  const [error, setError] = useState("");

  // Mode selection (before room creation)
  const [selectedMode, setSelectedMode] = useState(null); // null | "likes" | "playlist"

  // Likes mode
  const [tracksReady, setTracksReady] = useState(false);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [playersReady, setPlayersReady] = useState(new Set());

  // Playlist mode
  const [newPseudo, setNewPseudo] = useState("");
  const [newPlaylistUrl, setNewPlaylistUrl] = useState("");
  const [loadingPlaylists, setLoadingPlaylists] = useState(new Set());

  const myPid = user ? `player_${user.name}_${(user.image || "noimg").slice(-10)}` : null;

  useEffect(() => {
    if (!user) { navigate("/"); return; }

    const s = io(SOCKET_URL, { withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.on("room-created", ({ code, room }) => {
      setRoom(room);
      window.history.replaceState(null, "", `/lobby/${code}`);
    });
    s.on("room-joined", ({ code, room }) => {
      setRoom(room);
      setSelectedMode(room.mode);
      window.history.replaceState(null, "", `/lobby/${code}`);
    });
    s.on("room-updated", (r) => setRoom(r));
    s.on("error-msg", ({ message }) => setError(message));
    s.on("player-tracks-ready", ({ playerId }) => {
      setPlayersReady((prev) => new Set([...prev, playerId]));
    });

    if (urlCode) s.emit("join-room", { code: urlCode, user });

    return () => s.disconnect();
  }, [user]);

  useEffect(() => {
    if (!socketRef.current || !room) return;
    const handler = () => navigate(`/game/${room.code}`);
    socketRef.current.on("round-start", handler);
    return () => socketRef.current?.off("round-start", handler);
  }, [room]);

  // ─── Actions ───

  const createRoom = (mode) => {
    setSelectedMode(mode);
    socketRef.current?.emit("create-room", { user, mode });
  };

  const joinRoom = () => {
    if (joinCode.length >= 4) socketRef.current?.emit("join-room", { code: joinCode.toUpperCase(), user });
  };

  // Likes mode: load my liked tracks
  const loadMyLikes = async () => {
    setTracksLoading(true);
    try {
      const res = await fetch("/api/liked-tracks", { credentials: "include" });
      if (!res.ok) throw new Error();
      const tracks = await res.json();
      if (tracks.length === 0) { setError("No liked songs found"); setTracksLoading(false); return; }
      socketRef.current?.emit("submit-tracks", { code: room.code, tracks });
      setTracksReady(true);
    } catch { setError("Failed to load tracks"); }
    setTracksLoading(false);
  };

  // Playlist mode: add a player
  const addPlaylistPlayer = () => {
    const pseudo = newPseudo.trim();
    const url = newPlaylistUrl.trim();
    if (!pseudo) return setError("Enter a pseudo");
    if (!extractPlaylistId(url)) return setError("Invalid Spotify playlist link");

    socketRef.current?.emit("add-playlist-player", {
      code: room.code,
      pseudo,
      playlistUrl: url,
    });
    setNewPseudo("");
    setNewPlaylistUrl("");
  };

  // Playlist mode: remove a player
  const removePlayer = (pid) => {
    socketRef.current?.emit("remove-playlist-player", { code: room.code, pid });
  };

  // Playlist mode: load tracks for all playlist players (host action)
  const loadAllPlaylists = async () => {
    const playlistPlayers = room.players.filter((p) => p.playlistUrl);
    for (const p of playlistPlayers) {
      if (p.tracksLoaded) continue;
      setLoadingPlaylists((prev) => new Set([...prev, p.id]));
      const playlistId = extractPlaylistId(p.playlistUrl);
      if (!playlistId) {
        setError(`Invalid playlist URL for ${p.name}`);
        continue;
      }
      try {
        const res = await fetch(`/api/playlist-tracks/${playlistId}`, { credentials: "include" });
        if (!res.ok) {
          const data = await res.json();
          setError(`${p.name}: ${data.error || "Failed to load"}`);
          continue;
        }
        const tracks = await res.json();
        if (tracks.length === 0) {
          setError(`${p.name}: playlist is empty`);
          continue;
        }
        socketRef.current?.emit("submit-tracks-for-player", {
          code: room.code,
          pid: p.id,
          tracks,
        });
      } catch {
        setError(`Failed to load playlist for ${p.name}`);
      }
      setLoadingPlaylists((prev) => {
        const n = new Set(prev);
        n.delete(p.id);
        return n;
      });
    }

    // Also load host's playlist if they have one
    const host = room.players.find((p) => p.id === myPid);
    if (host?.playlistUrl && !host.tracksLoaded) {
      const playlistId = extractPlaylistId(host.playlistUrl);
      if (playlistId) {
        try {
          const res = await fetch(`/api/playlist-tracks/${playlistId}`, { credentials: "include" });
          const tracks = await res.json();
          socketRef.current?.emit("submit-tracks", { code: room.code, tracks });
          setTracksReady(true);
        } catch { setError("Failed to load your playlist"); }
      }
    }
  };

  // Playlist mode: set host's own playlist
  const [hostPlaylistUrl, setHostPlaylistUrl] = useState("");
  const setHostPlaylist = () => {
    const url = hostPlaylistUrl.trim();
    if (!extractPlaylistId(url)) return setError("Invalid Spotify playlist link");
    // Update host's playlist URL locally — it'll be sent when loading
    const hostPlayer = room.players.find((p) => p.id === myPid);
    if (hostPlayer) hostPlayer.playlistUrl = url;
    setHostPlaylistUrl("");
    // Also emit to server
    socketRef.current?.emit("add-playlist-player", {
      code: room.code,
      pseudo: user.name,
      playlistUrl: url,
    });
  };

  const startGame = () => socketRef.current?.emit("start-game", { code: room.code });

  if (!user) return null;
  const isHost = myPid === room?.host;
  const allTracksLoaded = room?.players.every((p) => p.tracksLoaded);

  return (
    <div style={styles.page}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 520, width: "100%" }}>

        {error && (
          <div style={styles.error}>
            {error}
            <button onClick={() => setError("")} style={styles.errorX}>✕</button>
          </div>
        )}

        {/* ─── NO ROOM: Mode selection + Join ─── */}
        {!room && !selectedMode && (
          <div style={styles.center}>
            <h2 style={styles.heading}>Start Playing</h2>

            <p style={{ color: "var(--text-secondary)", textAlign: "center", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
              Choose a game mode to create a room
            </p>

            <div style={styles.modeGrid}>
              <button onClick={() => createRoom("likes")} style={styles.modeCard}>
                <span style={{ fontSize: "2rem" }}>❤️</span>
                <strong style={{ fontSize: "1rem" }}>Liked Songs</strong>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center" }}>
                  Each player connects Spotify and uses their liked songs
                </span>
                <span style={styles.modeBadge}>Max 5 players</span>
              </button>

              <button onClick={() => createRoom("playlist")} style={styles.modeCard}>
                <span style={{ fontSize: "2rem" }}>🎵</span>
                <strong style={{ fontSize: "1rem" }}>Playlists</strong>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center" }}>
                  Players share a public playlist link — no Spotify login needed
                </span>
                <span style={{ ...styles.modeBadge, background: "rgba(124,58,237,0.12)", color: "var(--purple)" }}>Unlimited players</span>
              </button>
            </div>

            <div style={styles.divider}>
              <div style={styles.dividerLine} />
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>or join a room</span>
              <div style={styles.dividerLine} />
            </div>

            <div style={{ display: "flex", gap: "0.6rem" }}>
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={4}
                onKeyDown={e => e.key === "Enter" && joinRoom()}
                placeholder="CODE" style={styles.codeInput} />
              <button onClick={joinRoom} style={styles.btnOutline}>Join</button>
            </div>
          </div>
        )}

        {/* ─── IN A ROOM ─── */}
        {room && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* Room code */}
            <div style={styles.codeBox}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={styles.codeLabel}>ROOM CODE</span>
                <span style={{
                  ...styles.modeBadgeSmall,
                  ...(room.mode === "playlist" ? { background: "rgba(124,58,237,0.12)", color: "var(--purple)" } : {}),
                }}>
                  {room.mode === "likes" ? "❤️ Likes" : "🎵 Playlists"}
                </span>
              </div>
              <span className="mono" style={styles.codeValue}>{room.code}</span>
              <button onClick={() => navigator.clipboard?.writeText(room.code)} style={styles.copyBtn}>Copy</button>
            </div>

            {/* Players */}
            <div>
              <h3 style={styles.sectionTitle}>Players ({room.players.length}/8)</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {room.players.map(p => (
                  <div key={p.id} style={styles.playerRow}>
                    {p.image ? <img src={p.image} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />
                      : <div style={styles.avatarFallback}>{p.name?.[0]?.toUpperCase()}</div>}
                    <span style={{ flex: 1 }}>{p.name}</span>
                    {p.id === room.host && <span style={styles.hostTag}>HOST</span>}
                    {p.tracksLoaded && <span style={{ color: "var(--green)", fontSize: "0.8rem", fontWeight: 600 }}>✓</span>}
                    {loadingPlaylists.has(p.id) && <span style={{ color: "var(--warning)", fontSize: "0.75rem" }}>loading...</span>}
                    {/* Remove button for playlist virtual players (host only) */}
                    {isHost && room.mode === "playlist" && !p.socketId && p.id !== room.host && (
                      <button onClick={() => removePlayer(p.id)} style={styles.removeBtn}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ─── LIKES MODE: Ready up ─── */}
            {room.mode === "likes" && (
              <div>
                {!tracksReady ? (
                  <button onClick={loadMyLikes} disabled={tracksLoading} style={{ ...styles.btn, opacity: tracksLoading ? 0.5 : 1 }}>
                    {tracksLoading ? "Loading your likes..." : "I'm Ready"}
                  </button>
                ) : (
                  <div style={styles.readyBox}>✅ Your tracks are loaded!</div>
                )}
              </div>
            )}

            {/* ─── PLAYLIST MODE: Add players + load ─── */}
            {room.mode === "playlist" && isHost && (
              <div>
                {/* Host's own playlist */}
                {!room.players.find(p => p.id === myPid)?.playlistUrl && (
                  <div style={{ marginBottom: "1rem" }}>
                    <h3 style={styles.sectionTitle}>Your Playlist</h3>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input
                        value={hostPlaylistUrl}
                        onChange={e => setHostPlaylistUrl(e.target.value)}
                        placeholder="Your Spotify playlist link..."
                        style={styles.textInput}
                      />
                      <button onClick={setHostPlaylist} style={styles.btnOutline}>Set</button>
                    </div>
                  </div>
                )}

                {/* Add other players */}
                <h3 style={styles.sectionTitle}>Add Players</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                  <input
                    value={newPseudo}
                    onChange={e => setNewPseudo(e.target.value)}
                    placeholder="Player name..."
                    style={styles.textInput}
                  />
                  <input
                    value={newPlaylistUrl}
                    onChange={e => setNewPlaylistUrl(e.target.value)}
                    placeholder="Spotify playlist link..."
                    style={styles.textInput}
                    onKeyDown={e => e.key === "Enter" && addPlaylistPlayer()}
                  />
                  <button onClick={addPlaylistPlayer} style={styles.btnOutline}>
                    + Add Player
                  </button>
                </div>

                {/* Load all playlists */}
                {room.players.length >= 2 && (
                  <button
                    onClick={loadAllPlaylists}
                    disabled={loadingPlaylists.size > 0}
                    style={{ ...styles.btn, opacity: loadingPlaylists.size > 0 ? 0.5 : 1 }}
                  >
                    {loadingPlaylists.size > 0 ? "Loading playlists..." : "Load All Playlists"}
                  </button>
                )}
              </div>
            )}

            {/* Playlist mode: non-host just waits */}
            {room.mode === "playlist" && !isHost && (
              <p style={{ color: "var(--text-muted)", textAlign: "center", fontSize: "0.9rem" }}>
                Waiting for host to set up playlists...
              </p>
            )}

            {/* Settings (host only) */}
            {isHost && (
              <div>
                <h3 style={styles.sectionTitle}>Settings</h3>
                <div style={styles.settingsRow}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Rounds</span>
                  <select value={room.settings?.rounds || 10} onChange={e => socketRef.current?.emit("update-settings", { code: room.code, settings: { rounds: +e.target.value } })}
                    style={styles.select}>
                    {[3,5,7,10,15].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div style={styles.settingsRow}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Timer</span>
                  <select value={room.settings?.roundTime || 30} onChange={e => socketRef.current?.emit("update-settings", { code: room.code, settings: { roundTime: +e.target.value } })}
                    style={styles.select}>
                    {[15,30,45,60].map(n => <option key={n} value={n}>{n}s</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Start game */}
            {isHost && (
              (room.mode === "likes" && tracksReady) ||
              (room.mode === "playlist" && allTracksLoaded && room.players.length >= 2)
            ) && (
              <button onClick={startGame} style={styles.btnStart}>
                Start Game
              </button>
            )}

            {!isHost && room.mode === "likes" && tracksReady && (
              <p style={{ color: "var(--text-muted)", textAlign: "center", fontSize: "0.9rem" }}>
                Waiting for host to start...
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "calc(100vh - 70px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem 1rem",
  },
  center: { display: "flex", flexDirection: "column", alignItems: "center", gap: "1.2rem" },
  heading: { fontSize: "1.8rem", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" },
  error: {
    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--danger)",
    padding: "0.7rem 1rem", borderRadius: "var(--radius)", marginBottom: "1.5rem",
    display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem",
  },
  errorX: { background: "none", color: "var(--danger)", fontSize: "1rem" },

  // Mode selection
  modeGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", width: "100%", marginBottom: "1.5rem",
  },
  modeCard: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
    padding: "1.5rem 1rem", background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
    border: "1px solid var(--glass-border)", cursor: "pointer", color: "var(--text-primary)",
    transition: "border-color 0.2s, background 0.2s",
  },
  modeBadge: {
    background: "rgba(29,185,84,0.12)", color: "var(--green)",
    padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700,
    marginTop: "0.3rem",
  },
  modeBadgeSmall: {
    background: "rgba(29,185,84,0.12)", color: "var(--green)",
    padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700,
  },
  divider: { display: "flex", alignItems: "center", gap: "1rem", width: "100%" },
  dividerLine: { flex: 1, height: 1, background: "var(--glass-border)" },

  // Code box
  codeBox: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem",
    padding: "1.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
    border: "1px solid rgba(29,185,84,0.15)",
  },
  codeLabel: { color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600 },
  codeValue: { fontSize: "2.8rem", fontWeight: 700, color: "var(--green)", letterSpacing: "0.3em" },
  copyBtn: {
    background: "var(--bg-card-solid)", color: "var(--text-secondary)",
    padding: "0.3rem 0.9rem", borderRadius: "999px", fontSize: "0.75rem",
    border: "1px solid var(--glass-border)", marginTop: "0.3rem",
  },

  // Players
  sectionTitle: { fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "0.75rem" },
  playerRow: {
    display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.6rem 0.9rem",
    background: "var(--bg-card)", borderRadius: "var(--radius)", border: "1px solid var(--glass-border)",
  },
  avatarFallback: {
    width: 30, height: 30, borderRadius: "50%", background: "var(--bg-card-solid)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)",
  },
  hostTag: {
    background: "rgba(29,185,84,0.12)", color: "var(--green)",
    padding: "0.15rem 0.6rem", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.05em",
  },
  removeBtn: {
    background: "rgba(239,68,68,0.1)", color: "var(--danger)",
    width: 24, height: 24, borderRadius: "50%", fontSize: "0.75rem",
    display: "flex", alignItems: "center", justifyContent: "center",
  },

  // Inputs
  codeInput: {
    width: 120, background: "var(--bg-card-solid)", border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius)", padding: "0.7rem 1rem", color: "white", fontSize: "1.2rem",
    textAlign: "center", letterSpacing: "0.2em", fontFamily: "'Space Mono', monospace",
  },
  textInput: {
    background: "var(--bg-card-solid)", border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius)", padding: "0.65rem 0.9rem", color: "white", fontSize: "0.9rem",
    width: "100%",
  },

  // Buttons
  btn: {
    background: "var(--green)", color: "white", padding: "0.85rem 2.2rem",
    borderRadius: "var(--radius-full)", fontSize: "1rem", fontWeight: 700,
    boxShadow: "0 4px 20px var(--green-glow)", width: "100%",
  },
  btnOutline: {
    background: "var(--bg-card-solid)", color: "var(--text-primary)", padding: "0.65rem 1.2rem",
    borderRadius: "var(--radius)", fontSize: "0.9rem", fontWeight: 600, border: "1px solid var(--glass-border)",
    whiteSpace: "nowrap",
  },
  btnStart: {
    background: "linear-gradient(135deg, var(--green), var(--green-dark))", color: "white",
    padding: "1rem 2.5rem", borderRadius: "var(--radius-full)", fontSize: "1.1rem", fontWeight: 800,
    boxShadow: "0 6px 30px var(--green-glow)", width: "100%", letterSpacing: "0.02em",
  },

  readyBox: {
    textAlign: "center", padding: "0.8rem", background: "rgba(29,185,84,0.08)",
    borderRadius: "var(--radius)", color: "var(--green)", fontWeight: 600,
  },

  settingsRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0",
  },
  select: {
    background: "var(--bg-card-solid)", color: "var(--text-primary)",
    border: "1px solid var(--glass-border)", borderRadius: "var(--radius)",
    padding: "0.4rem 0.8rem", fontSize: "0.9rem", fontFamily: "inherit",
  },
};
