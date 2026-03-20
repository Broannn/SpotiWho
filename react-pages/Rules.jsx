import { motion } from "framer-motion";

const steps = [
  { num: "1", title: "Connect Spotify", desc: "Login with your Spotify account so we can see your liked songs." },
  { num: "2", title: "Create or Join", desc: "Create a room and share the code, or join a friend's room." },
  { num: "3", title: "Listen", desc: "A liked song from one of the players starts playing. Who does it belong to?" },
  { num: "4", title: "Vote", desc: "Pick the player you think liked this track. You have limited time!" },
  { num: "5", title: "Score", desc: "+100 points for each correct guess. Most points at the end wins!" },
];

export default function Rules() {
  return (
    <div style={{ maxWidth: 550, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "2rem", textAlign: "center" }}>
        How to Play
      </motion.h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {steps.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 * i }}
            style={{ display: "flex", gap: "1rem", alignItems: "flex-start", padding: "1.2rem", background: "var(--bg-card)", borderRadius: "var(--radius)", border: "1px solid var(--glass-border)" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--green)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>{s.num}</div>
            <div>
              <strong style={{ display: "block", marginBottom: "0.25rem" }}>{s.title}</strong>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{s.desc}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
