import { Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import Home from "./pages/Home.jsx";
import Rules from "./pages/Rules.jsx";
import Lobby from "./pages/Lobby.jsx";
import Game from "./pages/Game.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    window.location.href = "/";
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{ width: "4px", background: "var(--green)", borderRadius: "2px", animation: "bar-bounce 1s ease-in-out infinite", animationDelay: `${i*0.12}s`, height: "20px" }} />
          ))}
        </div>
        <span className="mono" style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading...</span>
      </div>
    );
  }

  return (
    <>
      {/* Header - hidden during game */}
      <Header user={user} onLogout={logout} />
      <div style={{ paddingTop: "70px" }}>
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/lobby" element={<Lobby user={user} />} />
          <Route path="/lobby/:code" element={<Lobby user={user} />} />
          <Route path="/game/:code" element={<Game user={user} />} />
        </Routes>
      </div>
    </>
  );
}

function Header({ user, onLogout }) {
  const path = window.location.pathname;
  if (path.startsWith("/game")) return null;

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "1rem 2rem", position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      background: "rgba(9,10,15,0.85)", backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--glass-border)",
    }}>
      <a href="/" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
        Spoti<span style={{ color: "var(--green)" }}>Who</span>
        <span style={{ color: "var(--green)", opacity: 0.6 }}>?</span>
      </a>
      <nav style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <a href="/rules" style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Rules</a>
        {user && (
          <>
            <a href="/lobby" style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Play</a>
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              background: "var(--bg-card-solid)", padding: "0.35rem 0.75rem 0.35rem 0.35rem",
              borderRadius: "999px", border: "1px solid var(--glass-border)",
            }}>
              {user.image && <img src={user.image} alt="" style={{ width: 26, height: 26, borderRadius: "50%" }} />}
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{user.name}</span>
              <button onClick={onLogout} style={{ background: "none", color: "var(--text-muted)", fontSize: "0.8rem" }}>✕</button>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
