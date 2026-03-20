import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.DEV ? "http://127.0.0.1:3001" : "";

export default function Lobby({ user }) {
  const navigate = useNavigate();
  const { code: urlCode } = useParams();
  const socketRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [joinCode, setJoinCode] = useState(urlCode || "");
  const [error, setError] = useState("");
  const [tracksReady, setTracksReady] = useState(false);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [playersReady, setPlayersReady] = useState(new Set());

  // Build the same stable ID as the server
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

  const createRoom = () => socketRef.current?.emit("create-room", { user });

  const joinRoom = () => {
    if (joinCode.length >= 4) socketRef.current?.emit("join-room", { code: joinCode.toUpperCase(), user });
  };

  const loadTracks = async () => {
    setTracksLoading(true);
    try {
      const res = await fetch("/api/liked-tracks", { credentials: "include" });
      if (!res.ok) throw new Error();
      const tracks = await res.json();
      if (tracks.length === 0) { setError("No liked songs with previews found"); setTracksLoading(false); return; }
      socketRef.current?.emit("submit-tracks", { code: room.code, tracks });
      setTracksReady(true);
    } catch { setError("Failed to load tracks"); }
    setTracksLoading(false);
  };

  const startGame = () => socketRef.current?.emit("start-game", { code: room.code });

  if (!user) return null;

  // Compare stable pid instead of socket.id
  const isHost = myPid === room?.host;

  return (
    <div style={{ minHeight: "calc(100vh - 70px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 480, width: "100%" }}>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--danger)", padding: "0.7rem 1rem", borderRadius: "var(--radius)", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
            {error}
            <button onClick={() => setError("")} style={{ background: "none", color: "var(--danger)", fontSize: "1rem" }}>✕</button>
          </div>
        )}

        {!room ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.2rem" }}>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 800, textAlign: "center", marginBottom: "1rem" }}>Start Playing</h2>
            <button onClick={createRoom} style={btn}>Create Room</button>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", width: "100%", maxWidth: 280 }}>
              <div style={{ flex: 1, height: 1, background: "var(--glass-border)" }} />
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>or join</span>
              <div style={{ flex: 1, height: 1, background: "var(--glass-border)" }} />
            </div>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={4}
                onKeyDown={e => e.key === "Enter" && joinRoom()}
                placeholder="CODE" style={{
                  width: 120, background: "var(--bg-card-solid)", border: "1px solid var(--glass-border)",
                  borderRadius: "var(--radius)", padding: "0.7rem 1rem", color: "white", fontSize: "1.2rem",
                  textAlign: "center", letterSpacing: "0.2em", fontFamily: "'Space Mono', monospace",
                }} />
              <button onClick={joinRoom} style={{
                background: "var(--bg-card-solid)", color: "var(--text-primary)", padding: "0.7rem 1.4rem",
                borderRadius: "var(--radius)", fontSize: "1rem", fontWeight: 600, border: "1px solid var(--glass-border)",
              }}>Join</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Code */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem", padding: "1.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid rgba(29,185,84,0.15)" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600 }}>ROOM CODE</span>
              <span className="mono" style={{ fontSize: "2.8rem", fontWeight: 700, color: "var(--green)", letterSpacing: "0.3em" }}>{room.code}</span>
              <button onClick={() => navigator.clipboard?.writeText(room.code)} style={{ background: "var(--bg-card-solid)", color: "var(--text-secondary)", padding: "0.3rem 0.9rem", borderRadius: "999px", fontSize: "0.75rem", border: "1px solid var(--glass-border)", marginTop: "0.3rem" }}>Copy</button>
            </div>

            {/* Players */}
            <div>
              <h3 style={sectionTitle}>Players ({room.players.length}/8)</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {room.players.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.6rem 0.9rem", background: "var(--bg-card)", borderRadius: "var(--radius)", border: "1px solid var(--glass-border)" }}>
                    {p.image ? <img src={p.image} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />
                      : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--bg-card-solid)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)" }}>{p.name?.[0]?.toUpperCase()}</div>}
                    <span style={{ flex: 1 }}>{p.name}</span>
                    {p.id === room.host && <span style={{ background: "rgba(29,185,84,0.12)", color: "var(--green)", padding: "0.15rem 0.6rem", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.05em" }}>HOST</span>}
                    {playersReady.has(p.id) && <span style={{ color: "var(--green)", fontSize: "0.8rem", fontWeight: 600 }}>✓</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Settings (host) */}
            {isHost && (
              <div>
                <h3 style={sectionTitle}>Settings</h3>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Rounds</span>
                  <select value={room.settings?.rounds || 10} onChange={e => socketRef.current?.emit("update-settings", { code: room.code, settings: { rounds: +e.target.value } })}
                    style={selectStyle}>
                    {[3,5,7,10,15].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Timer</span>
                  <select value={room.settings?.roundTime || 30} onChange={e => socketRef.current?.emit("update-settings", { code: room.code, settings: { roundTime: +e.target.value } })}
                    style={selectStyle}>
                    {[15,30,45,60].map(n => <option key={n} value={n}>{n}s</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Ready / Start */}
            <div>
              {!tracksReady ? (
                <button onClick={loadTracks} disabled={tracksLoading} style={{ ...btn, opacity: tracksLoading ? 0.5 : 1 }}>
                  {tracksLoading ? "Loading your likes..." : "I'm Ready"}
                </button>
              ) : (
                <div style={{ textAlign: "center", padding: "0.8rem", background: "rgba(29,185,84,0.08)", borderRadius: "var(--radius)", color: "var(--green)", fontWeight: 600 }}>
                  ✅ Your tracks are loaded!
                </div>
              )}
              {isHost && tracksReady && (
                <button onClick={startGame} style={{ ...btn, marginTop: "1rem", background: "linear-gradient(135deg, var(--green), var(--green-dark))", fontSize: "1.1rem", fontWeight: 800 }}>
                  Start Game
                </button>
              )}
              {!isHost && tracksReady && (
                <p style={{ color: "var(--text-muted)", textAlign: "center", marginTop: "1rem", fontSize: "0.9rem" }}>
                  Waiting for host to start...
                </p>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

const btn = {
  background: "var(--green)", color: "white", padding: "0.85rem 2.2rem",
  borderRadius: "var(--radius-full)", fontSize: "1rem", fontWeight: 700,
  boxShadow: "0 4px 20px var(--green-glow)", width: "100%",
};
const sectionTitle = { fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "0.75rem" };
const selectStyle = { background: "var(--bg-card-solid)", color: "var(--text-primary)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: "0.4rem 0.8rem", fontSize: "0.9rem", fontFamily: "inherit" };
