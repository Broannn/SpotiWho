import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.DEV ? "http://127.0.0.1:3001" : "";

export default function Game({ user }) {
  const navigate = useNavigate();
  const { code } = useParams();
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const timerRef = useRef(null);

  const [phase, setPhase] = useState("waiting");
  const [round, setRound] = useState({ current: 0, total: 0 });
  const [track, setTrack] = useState(null);
  const [players, setPlayers] = useState([]);
  const [result, setResult] = useState(null);
  const [scores, setScores] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundTime, setRoundTime] = useState(30);
  const [correctOwner, setCorrectOwner] = useState(null);

  useEffect(() => {
    if (!user) { navigate("/"); return; }

    const s = io(SOCKET_URL, { withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.on("game-started", ({ totalRounds, roundTime: rt, players: p }) => {
      setPlayers(p);
      setRoundTime(rt);
      setRound({ current: 0, total: totalRounds });
    });

    s.on("round-start", ({ round: r, totalRounds, track: t, roundTime: rt }) => {
      setPhase("playing");
      setRound({ current: r, total: totalRounds });
      setTrack(t);
      setResult(null);
      setCorrectOwner(null);
      setTimeLeft(rt);
      setRoundTime(rt);

      if (audioRef.current) {
        audioRef.current.src = t.previewUrl;
        audioRef.current.volume = 0.7;
        audioRef.current.play().catch(() => {});
      }

      clearInterval(timerRef.current);
      let time = rt;
      timerRef.current = setInterval(() => {
        time--;
        setTimeLeft(time);
        if (time <= 0) clearInterval(timerRef.current);
      }, 1000);
    });

    s.on("vote-result", ({ isCorrect, points, correctOwnerId }) => {
      setResult({ isCorrect, points, correctOwnerId });
    });

    s.on("round-end", ({ correctOwner: co, track: t, scores: sc }) => {
      setPhase("roundEnd");
      setScores(sc);
      setCorrectOwner(co);
      if (audioRef.current) audioRef.current.pause();
      clearInterval(timerRef.current);
    });

    s.on("game-over", ({ scores: fs }) => {
      setPhase("gameOver");
      setScores(fs);
      if (audioRef.current) audioRef.current.pause();
      clearInterval(timerRef.current);
    });

    s.emit("join-room", { code, user });

    return () => { s.disconnect(); clearInterval(timerRef.current); };
  }, [user, code]);

  const vote = (pid) => {
    if (result) return;
    socketRef.current?.emit("submit-vote", { code, votedPlayerId: pid });
  };

  const pct = roundTime > 0 ? (timeLeft / roundTime) * 100 : 0;
  const tColor = timeLeft <= 5 ? "var(--danger)" : timeLeft <= 10 ? "var(--warning)" : "var(--green)";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <audio ref={audioRef} />

      {/* Top bar */}
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.5rem" }}>
        <span style={{ fontSize: "1.2rem", fontWeight: 800 }}>Spoti<span style={{ color: "var(--green)" }}>Who?</span></span>
        <span className="mono" style={{ background: "var(--bg-card-solid)", padding: "0.25rem 0.7rem", borderRadius: "var(--radius)", fontSize: "0.8rem", color: "var(--text-muted)" }}>{code}</span>
      </div>

      {phase === "playing" && (
        <div style={{ width: "100%", height: 3, background: "var(--bg-card-solid)" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, transition: "width 1s linear, background 0.3s", background: tColor }} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {phase === "playing" && (
          <motion.div key="playing" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            style={{ maxWidth: 460, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem" }}>

            <div style={{ background: "var(--bg-card)", border: "1px solid var(--glass-border)", padding: "0.35rem 1rem", borderRadius: "999px", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Round {round.current}/{round.total}
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", marginBottom: "1.2rem" }}>
              {track?.image && <img src={track.image} alt="" style={{ width: 160, height: 160, borderRadius: "var(--radius-lg)", objectFit: "cover", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }} />}
              <div style={{ display: "flex", gap: 4, alignItems: "center", height: 28 }}>
                {[...Array(5)].map((_, i) => <div key={i} style={{ width: 4, background: "var(--green)", borderRadius: 2, animation: "bar-bounce 1s ease-in-out infinite", animationDelay: `${i*0.15}s` }} />)}
              </div>
            </div>

            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{track?.name}</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{track?.artist}</div>
            </div>

            {!result ? (
              <>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.8rem" }}>Who liked this song?</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", width: "100%", marginBottom: "1rem" }}>
                  {players.map(p => (
                    <button key={p.id} onClick={() => vote(p.id)} style={{
                      display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.7rem 1rem",
                      background: "var(--bg-card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)",
                      color: "var(--text-primary)", cursor: "pointer", transition: "border-color 0.2s",
                    }}>
                      {p.image ? <img src={p.image} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                        : <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-card-solid)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700 }}>{p.name?.[0]}</div>}
                      <span style={{ fontSize: "0.85rem" }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ padding: "0.9rem 2rem", borderRadius: "var(--radius)", background: "var(--bg-card)", border: `2px solid ${result.isCorrect ? "var(--green)" : "var(--danger)"}`, fontSize: "1.05rem", fontWeight: 700, marginBottom: "1rem" }}>
                {result.isCorrect ? "✅ Correct! +100 pts" : "❌ Wrong!"}
              </div>
            )}

            <div className="mono" style={{ fontSize: "2rem", fontWeight: 700, color: tColor }}>{timeLeft}s</div>
          </motion.div>
        )}

        {phase === "roundEnd" && (
          <motion.div key="roundEnd" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ maxWidth: 460, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem" }}>
            {correctOwner && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem", marginBottom: "2rem", padding: "1.2rem 2rem", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid rgba(29,185,84,0.2)" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>It was liked by</span>
                <span style={{ color: "var(--green)", fontSize: "1.3rem", fontWeight: 800 }}>{correctOwner.name}</span>
              </div>
            )}
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {scores.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 0.9rem", background: "var(--bg-card)", borderRadius: "var(--radius)", border: `1px solid ${i === 0 ? "rgba(29,185,84,0.3)" : "var(--glass-border)"}`, fontSize: "0.9rem" }}>
                  <span style={{ color: "var(--text-muted)", fontWeight: 700, width: "2rem", textAlign: "center" }}>#{i+1}</span>
                  {s.image && <img src={s.image} alt="" style={{ width: 24, height: 24, borderRadius: "50%" }} />}
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span className="mono" style={{ color: "var(--green)", fontWeight: 700 }}>{s.score}</span>
                </div>
              ))}
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "1.5rem" }}>Next round starting...</p>
          </motion.div>
        )}

        {phase === "gameOver" && (
          <motion.div key="gameOver" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            style={{ maxWidth: 460, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🏆</div>
            <h2 style={{ color: "var(--green)", fontSize: "1.8rem", fontWeight: 900, marginBottom: "2rem" }}>Game Over!</h2>

            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap", width: "100%" }}>
              {scores.slice(0, 3).map((s, i) => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 * i }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
                    padding: "1.2rem 1.5rem", borderRadius: "var(--radius-lg)", minWidth: 120,
                    background: i === 0 ? "linear-gradient(135deg, rgba(29,185,84,0.15), rgba(29,185,84,0.05))" : "var(--bg-card)",
                    border: `1px solid ${i === 0 ? "rgba(29,185,84,0.3)" : "var(--glass-border)"}`,
                    transform: i === 0 ? "scale(1.05)" : "none",
                  }}>
                  <span style={{ fontSize: "1.5rem" }}>{["🥇","🥈","🥉"][i]}</span>
                  {s.image && <img src={s.image} alt="" style={{ width: 48, height: 48, borderRadius: "50%" }} />}
                  <strong>{s.name}</strong>
                  <span className="mono" style={{ color: "var(--green)", fontSize: "1.2rem", fontWeight: 700 }}>{s.score} pts</span>
                </motion.div>
              ))}
            </div>

            {scores.length > 3 && (
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "1.5rem" }}>
                {scores.slice(3).map((s, i) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 0.9rem", background: "var(--bg-card)", borderRadius: "var(--radius)", border: "1px solid var(--glass-border)", fontSize: "0.9rem" }}>
                    <span style={{ color: "var(--text-muted)", fontWeight: 700, width: "2rem", textAlign: "center" }}>#{i+4}</span>
                    {s.image && <img src={s.image} alt="" style={{ width: 24, height: 24, borderRadius: "50%" }} />}
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <span className="mono" style={{ color: "var(--text-secondary)" }}>{s.score}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => navigate("/lobby")} style={{
              background: "var(--green)", color: "white", padding: "0.85rem 2.5rem",
              borderRadius: "999px", fontSize: "1rem", fontWeight: 700,
              boxShadow: "0 4px 24px var(--green-glow)", marginTop: "2rem",
            }}>Play Again</button>
          </motion.div>
        )}

        {phase === "waiting" && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "4rem" }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center", height: 28 }}>
              {[...Array(5)].map((_, i) => <div key={i} style={{ width: 4, background: "var(--green)", borderRadius: 2, animation: "bar-bounce 1s ease-in-out infinite", animationDelay: `${i*0.15}s` }} />)}
            </div>
            <p style={{ color: "var(--text-secondary)", marginTop: "1.5rem" }}>Waiting for the game to start...</p>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes bar-bounce { 0%, 100% { height: 6px; } 50% { height: 28px; } }`}</style>
    </div>
  );
}
