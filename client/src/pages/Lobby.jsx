import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.DEV ? "http://127.0.0.1:3001" : "";

function extractPlaylistId(input) {
  if (!input) return null;
  if (/^[a-zA-Z0-9]{22}$/.test(input.trim())) return input.trim();
  const m = input.match(/playlist[/:]([a-zA-Z0-9]{22})/);
  return m ? m[1] : null;
}

export default function Lobby({ user }) {
  const navigate = useNavigate();
  const { code: urlCode } = useParams();
  const socketRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [joinCode, setJoinCode] = useState(urlCode || "");
  const [error, setError] = useState("");

  // Likes mode
  const [tracksReady, setTracksReady] = useState(false);
  const [tracksLoading, setTracksLoading] = useState(false);

  // Playlist mode — join form for non-auth users
  const [pseudo, setPseudo] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [joinedAsPlaylist, setJoinedAsPlaylist] = useState(false);

  // Host playlist
  const [hostPlaylistUrl, setHostPlaylistUrl] = useState("");
  const [hostPlaylistSet, setHostPlaylistSet] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  const myPid = user
    ? `player_${user.name}_${(user.image || "noimg").slice(-10)}`
    : joinedAsPlaylist ? `playlist_${pseudo.toLowerCase().trim()}` : null;

  useEffect(() => {
    const s = io(SOCKET_URL, { withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.on("room-created", ({ code, room }) => {
      setRoom(room);
      window.history.replaceState(null, "", `/lobby/${code}`);
    });
    s.on("room-joined", ({ code, room }) => {
      setRoom(room);
      window.history.replaceState(null, "", `/lobby/${code}`);
    });
    s.on("room-updated", (r) => {
      setRoom(r);
    });
    s.on("error-msg", ({ message }) => setError(message));

    if (urlCode && user) {
      s.emit("join-room", { code: urlCode, user });
    }

    return () => s.disconnect();
  }, [user]);

  useEffect(() => {
    if (!socketRef.current || !room) return;
    const handler = () => navigate(`/game/${room.code}`);
    socketRef.current.on("round-start", handler);
    return () => socketRef.current?.off("round-start", handler);
  }, [room]);

  // Check if host already has playlist set (from room state)
  useEffect(() => {
    if (room && myPid) {
      const me = room.players.find(p => p.id === myPid);
      if (me?.playlistUrl) setHostPlaylistSet(true);
    }
  }, [room, myPid]);

  // ─── Actions ───
  const createRoom = (mode) => {
    if (mode === "likes" && !user) return setError("Connect Spotify first to use Likes mode");
    if (!user) return setError("Connect Spotify to create a room, or join an existing one");
    socketRef.current?.emit("create-room", { user, mode });
  };

  const joinRoomByCode = () => {
    if (joinCode.length < 4) return;
    if (user) {
      socketRef.current?.emit("join-room", { code: joinCode.toUpperCase(), user });
    } else {
      // Show playlist join form for non-auth users
      setRoom({ code: joinCode.toUpperCase(), mode: "playlist", players: [], state: "lobby", host: null, settings: {} });
      window.history.replaceState(null, "", `/lobby/${joinCode.toUpperCase()}`);
    }
  };

  const joinAsPlaylistPlayer = () => {
    const p = pseudo.trim();
    const url = playlistUrl.trim();
    if (!p) return setError("Enter your name");
    if (!extractPlaylistId(url)) return setError("Invalid Spotify playlist link");
    const code = room?.code || joinCode || urlCode;
    socketRef.current?.emit("join-room-playlist", { code: code.toUpperCase(), pseudo: p, playlistUrl: url });
    // Save to sessionStorage so Game.jsx can reconnect without auth
    sessionStorage.setItem("spotiwho_pseudo", p);
    sessionStorage.setItem("spotiwho_playlist", url);
    setJoinedAsPlaylist(true);
  };

  const setMyPlaylist = () => {
    const url = hostPlaylistUrl.trim();
    if (!extractPlaylistId(url)) return setError("Invalid Spotify playlist link");
    socketRef.current?.emit("set-my-playlist", { code: room.code, playlistUrl: url });
    setHostPlaylistSet(true);
    setHostPlaylistUrl("");
  };

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

  const loadAllPlaylists = async () => {
    setLoadingAll(true);
    // Load playlists for ALL players that have a playlistUrl but no tracks yet
    const toLoad = room.players.filter((p) => p.playlistUrl && !p.tracksLoaded);

    for (const p of toLoad) {
      const pid = extractPlaylistId(p.playlistUrl);
      if (!pid) { setError(`Invalid playlist for ${p.name}`); continue; }
      try {
        const res = await fetch(`/api/playlist-tracks/${pid}`, { credentials: "include" });
        if (!res.ok) { const d = await res.json(); setError(`${p.name}: ${d.error}`); continue; }
        const tracks = await res.json();
        if (!tracks.length) { setError(`${p.name}: empty playlist`); continue; }
        socketRef.current?.emit("submit-tracks-for-player", { code: room.code, pid: p.id, tracks });
      } catch { setError(`Failed to load ${p.name}'s playlist`); }
    }
    setLoadingAll(false);
  };

  const startGame = () => socketRef.current?.emit("start-game", { code: room.code });

  const isHost = myPid && myPid === room?.host;
  const isInRoom = room?.players?.some((p) => p.id === myPid);
  const roomMode = room?.mode;
  const allLoaded = room?.players.length >= 2 && room?.players.every((p) => p.tracksLoaded);

  return (
    <div style={S.page}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 520, width: "100%" }}>

        {error && (
          <div style={S.error}>{error}<button onClick={() => setError("")} style={S.errorX}>✕</button></div>
        )}

        {/* ═══ NO ROOM ═══ */}
        {!room && (
          <div style={S.center}>
            <h2 style={S.heading}>Start Playing</h2>
            <p style={{ color: "var(--text-secondary)", textAlign: "center", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
              Choose a game mode to create a room
            </p>
            <div style={S.modeGrid}>
              <button onClick={() => createRoom("likes")} style={S.modeCard}>
                <span style={{ fontSize: "2rem" }}>❤️</span>
                <strong>Liked Songs</strong>
                <span style={S.modeDesc}>Each player connects Spotify</span>
                <span style={S.badgeGreen}>Max 5 players</span>
              </button>
              <button onClick={() => createRoom("playlist")} style={S.modeCard}>
                <span style={{ fontSize: "2rem" }}>🎵</span>
                <strong>Playlists</strong>
                <span style={S.modeDesc}>Share a playlist link — no login needed for guests</span>
                <span style={S.badgePurple}>Unlimited players</span>
              </button>
            </div>
            <div style={S.divider}>
              <div style={S.line} /><span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>or join a room</span><div style={S.line} />
            </div>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={4}
                onKeyDown={e => e.key === "Enter" && joinRoomByCode()} placeholder="CODE" style={S.codeInput} />
              <button onClick={joinRoomByCode} style={S.btnOutline}>Join</button>
            </div>
          </div>
        )}

        {/* ═══ IN A ROOM ═══ */}
        {room && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* Code + mode */}
            <div style={S.codeBox}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={S.codeLabel}>ROOM CODE</span>
                <span style={roomMode === "playlist" ? S.badgePurpleSm : S.badgeGreenSm}>
                  {roomMode === "likes" ? "❤️ Likes" : "🎵 Playlists"}
                </span>
              </div>
              <span className="mono" style={S.codeValue}>{room.code}</span>
              <button onClick={() => navigator.clipboard?.writeText(room.code)} style={S.copyBtn}>Copy</button>
            </div>

            {/* ─── Playlist join form (non-auth user, not yet in room) ─── */}
            {roomMode === "playlist" && !isInRoom && !joinedAsPlaylist && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <h3 style={S.sectionTitle}>Join this room</h3>
                <input value={pseudo} onChange={e => setPseudo(e.target.value)} placeholder="Your name..." style={S.textInput} />
                <input value={playlistUrl} onChange={e => setPlaylistUrl(e.target.value)}
                  placeholder="Your Spotify playlist link..." style={S.textInput}
                  onKeyDown={e => e.key === "Enter" && joinAsPlaylistPlayer()} />
                <button onClick={joinAsPlaylistPlayer} style={S.btn}>Join with Playlist</button>
                <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center" }}>
                  Create a public playlist on Spotify with your favorite songs, then paste the link here.
                </p>
              </div>
            )}

            {/* ─── Host: set your own playlist ─── */}
            {roomMode === "playlist" && isHost && !hostPlaylistSet && (
              <div>
                <h3 style={S.sectionTitle}>Your Playlist</h3>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input value={hostPlaylistUrl} onChange={e => setHostPlaylistUrl(e.target.value)}
                    placeholder="Your Spotify playlist link..." style={S.textInput} />
                  <button onClick={setMyPlaylist} style={S.btnOutline}>Set</button>
                </div>
              </div>
            )}
            {roomMode === "playlist" && isHost && hostPlaylistSet && !room.players.find(p => p.id === myPid)?.tracksLoaded && (
              <div style={S.readyBox}>✅ Your playlist is set</div>
            )}

            {/* Players list */}
            {room.players.length > 0 && (
              <div>
                <h3 style={S.sectionTitle}>Players ({room.players.length}/8)</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {room.players.map(p => (
                    <div key={p.id} style={S.playerRow}>
                      {p.image ? <img src={p.image} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />
                        : <div style={S.avatarFallback}>{p.name?.[0]?.toUpperCase()}</div>}
                      <span style={{ flex: 1 }}>{p.name}</span>
                      {p.id === room.host && <span style={S.hostTag}>HOST</span>}
                      {p.tracksLoaded && <span style={{ color: "var(--green)", fontSize: "0.8rem", fontWeight: 600 }}>✓ Ready</span>}
                      {p.playlistUrl && !p.tracksLoaded && (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>playlist linked</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── LIKES MODE ─── */}
            {roomMode === "likes" && isInRoom && (
              <div>
                {!tracksReady ? (
                  <button onClick={loadMyLikes} disabled={tracksLoading}
                    style={{ ...S.btn, opacity: tracksLoading ? 0.5 : 1 }}>
                    {tracksLoading ? "Loading your likes..." : "I'm Ready"}
                  </button>
                ) : (
                  <div style={S.readyBox}>✅ Your tracks are loaded!</div>
                )}
              </div>
            )}

            {/* ─── PLAYLIST MODE: host loads all ─── */}
            {roomMode === "playlist" && isHost && room.players.length >= 2 && !allLoaded && (
              <button onClick={loadAllPlaylists} disabled={loadingAll}
                style={{ ...S.btn, opacity: loadingAll ? 0.5 : 1 }}>
                {loadingAll ? "Loading playlists..." : "Load All Playlists"}
              </button>
            )}
            {roomMode === "playlist" && allLoaded && (
              <div style={S.readyBox}>✅ All playlists loaded!</div>
            )}

            {/* Non-host playlist player waiting */}
            {roomMode === "playlist" && !isHost && joinedAsPlaylist && !allLoaded && (
              <p style={{ color: "var(--text-muted)", textAlign: "center", fontSize: "0.9rem" }}>
                Waiting for host to load playlists and start...
              </p>
            )}

            {/* Settings */}
            {isHost && (
              <div>
                <h3 style={S.sectionTitle}>Settings</h3>
                <div style={S.settingsRow}>
                  <span style={S.settingLabel}>Rounds</span>
                  <select value={room.settings?.rounds || 10}
                    onChange={e => socketRef.current?.emit("update-settings", { code: room.code, settings: { rounds: +e.target.value } })}
                    style={S.select}>
                    {[3,5,7,10,15].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div style={S.settingsRow}>
                  <span style={S.settingLabel}>Timer</span>
                  <select value={room.settings?.roundTime || 30}
                    onChange={e => socketRef.current?.emit("update-settings", { code: room.code, settings: { roundTime: +e.target.value } })}
                    style={S.select}>
                    {[15,30,45,60].map(n => <option key={n} value={n}>{n}s</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Start */}
            {isHost && ((roomMode === "likes" && tracksReady) || (roomMode === "playlist" && allLoaded)) && (
              <button onClick={startGame} style={S.btnStart}>Start Game</button>
            )}

            {!isHost && roomMode === "likes" && tracksReady && (
              <p style={{ color: "var(--text-muted)", textAlign: "center", fontSize: "0.9rem" }}>Waiting for host to start...</p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

const S = {
  page: { minHeight: "calc(100vh - 70px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" },
  center: { display: "flex", flexDirection: "column", alignItems: "center", gap: "1.2rem" },
  heading: { fontSize: "1.8rem", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" },
  error: { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--danger)", padding: "0.7rem 1rem", borderRadius: "var(--radius)", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" },
  errorX: { background: "none", color: "var(--danger)", fontSize: "1rem" },
  modeGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", width: "100%", marginBottom: "1.5rem" },
  modeCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", padding: "1.5rem 1rem", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--glass-border)", cursor: "pointer", color: "var(--text-primary)", transition: "border-color 0.2s" },
  modeDesc: { color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center" },
  badgeGreen: { background: "rgba(29,185,84,0.12)", color: "var(--green)", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700, marginTop: "0.3rem" },
  badgePurple: { background: "rgba(124,58,237,0.12)", color: "var(--purple)", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700, marginTop: "0.3rem" },
  badgeGreenSm: { background: "rgba(29,185,84,0.12)", color: "var(--green)", padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700 },
  badgePurpleSm: { background: "rgba(124,58,237,0.12)", color: "var(--purple)", padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700 },
  divider: { display: "flex", alignItems: "center", gap: "1rem", width: "100%" },
  line: { flex: 1, height: 1, background: "var(--glass-border)" },
  codeBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem", padding: "1.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid rgba(29,185,84,0.15)" },
  codeLabel: { color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600 },
  codeValue: { fontSize: "2.8rem", fontWeight: 700, color: "var(--green)", letterSpacing: "0.3em" },
  copyBtn: { background: "var(--bg-card-solid)", color: "var(--text-secondary)", padding: "0.3rem 0.9rem", borderRadius: "999px", fontSize: "0.75rem", border: "1px solid var(--glass-border)", marginTop: "0.3rem" },
  sectionTitle: { fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "0.75rem" },
  playerRow: { display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.6rem 0.9rem", background: "var(--bg-card)", borderRadius: "var(--radius)", border: "1px solid var(--glass-border)" },
  avatarFallback: { width: 30, height: 30, borderRadius: "50%", background: "var(--bg-card-solid)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)" },
  hostTag: { background: "rgba(29,185,84,0.12)", color: "var(--green)", padding: "0.15rem 0.6rem", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.05em" },
  codeInput: { width: 120, background: "var(--bg-card-solid)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: "0.7rem 1rem", color: "white", fontSize: "1.2rem", textAlign: "center", letterSpacing: "0.2em", fontFamily: "'Space Mono', monospace" },
  textInput: { background: "var(--bg-card-solid)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: "0.65rem 0.9rem", color: "white", fontSize: "0.9rem", width: "100%" },
  btn: { background: "var(--green)", color: "white", padding: "0.85rem 2.2rem", borderRadius: "var(--radius-full)", fontSize: "1rem", fontWeight: 700, boxShadow: "0 4px 20px var(--green-glow)", width: "100%" },
  btnOutline: { background: "var(--bg-card-solid)", color: "var(--text-primary)", padding: "0.65rem 1.2rem", borderRadius: "var(--radius)", fontSize: "0.9rem", fontWeight: 600, border: "1px solid var(--glass-border)", whiteSpace: "nowrap" },
  btnStart: { background: "linear-gradient(135deg, var(--green), var(--green-dark))", color: "white", padding: "1rem 2.5rem", borderRadius: "var(--radius-full)", fontSize: "1.1rem", fontWeight: 800, boxShadow: "0 6px 30px var(--green-glow)", width: "100%", letterSpacing: "0.02em" },
  readyBox: { textAlign: "center", padding: "0.8rem", background: "rgba(29,185,84,0.08)", borderRadius: "var(--radius)", color: "var(--green)", fontWeight: 600 },
  settingsRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0" },
  settingLabel: { color: "var(--text-secondary)", fontSize: "0.9rem" },
  select: { background: "var(--bg-card-solid)", color: "var(--text-primary)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: "0.4rem 0.8rem", fontSize: "0.9rem", fontFamily: "inherit" },
};
