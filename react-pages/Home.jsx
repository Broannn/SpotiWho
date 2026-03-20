import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function Home({ user }) {
  const navigate = useNavigate();
  const error = new URLSearchParams(window.location.search).get("error");

  return (
    <div style={{ minHeight: "calc(100vh - 70px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", gap: "4rem" }}>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} style={{ textAlign: "center", maxWidth: 500 }}>
        <motion.h1 initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }}
          style={{ fontSize: "clamp(2.5rem, 8vw, 4rem)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: "1.2rem" }}>
          Spoti<span style={{ color: "var(--green)" }}>Who</span>
          <span style={{ color: "var(--green)", opacity: 0.6 }}>?</span>
        </motion.h1>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          style={{ color: "var(--text-secondary)", fontSize: "1.05rem", lineHeight: 1.7, marginBottom: "2rem" }}>
          A song plays. It's liked by one of your friends.<br />
          <strong style={{ color: "var(--text-primary)" }}>Can you guess who?</strong>
        </motion.p>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--danger)", padding: "0.75rem 1.2rem", borderRadius: "var(--radius)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Login failed — please try again
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
          {user ? (
            <button onClick={() => navigate("/lobby")} style={{
              background: "var(--green)", color: "white", padding: "0.9rem 2.5rem",
              borderRadius: "var(--radius-full)", fontSize: "1.05rem", fontWeight: 700,
              boxShadow: "0 4px 24px var(--green-glow)",
            }}>Play Now</button>
          ) : (
            <a href="/auth/login" style={{
              display: "inline-flex", alignItems: "center", gap: "0.7rem",
              background: "var(--green)", color: "white", padding: "0.9rem 2.2rem",
              borderRadius: "var(--radius-full)", fontSize: "1.05rem", fontWeight: 700,
              boxShadow: "0 4px 24px var(--green-glow)",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381C8.64 5.801 15.6 6.001 20.04 8.4c.6.301.78 1.02.48 1.56-.301.421-1.02.599-1.44.3z"/>
              </svg>
              Login with Spotify
            </a>
          )}
        </motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
        style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap", justifyContent: "center", maxWidth: 700 }}>
        {[
          { icon: "🎵", title: "Your Music", desc: "Songs from your actual likes" },
          { icon: "🤔", title: "Guess Who", desc: "Which friend liked this track?" },
          { icon: "⚡", title: "Real-time", desc: "Live multiplayer with friends" },
          { icon: "🏆", title: "Compete", desc: "100 pts per correct guess" },
        ].map((f, i) => (
          <div key={i} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem",
            padding: "1.2rem 1.6rem", background: "var(--bg-card)", borderRadius: "var(--radius)",
            border: "1px solid var(--glass-border)", minWidth: 140, textAlign: "center",
          }}>
            <span style={{ fontSize: "1.6rem" }}>{f.icon}</span>
            <strong style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>{f.title}</strong>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{f.desc}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
