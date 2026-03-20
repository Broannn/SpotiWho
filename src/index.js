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
  app.get("/{*splat}", (req, res) => res.sendFile(path.join(dist, "index.html")));
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
