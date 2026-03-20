const express = require("express");
const axios = require("axios");
const router = express.Router();

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, FRONTEND_URL } = process.env;

const SCOPES = "user-read-private user-read-email user-top-read user-library-read playlist-read-private playlist-read-collaborative streaming user-read-playback-state user-modify-playback-state";

router.get("/login", (req, res) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    show_dialog: "true",
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

router.get("/callback", async (req, res) => {
  const { code, error } = req.query;
  const redirect = FRONTEND_URL || "";
  if (error) return res.redirect(`${redirect}/?error=${error}`);
  if (!code) return res.redirect(`${redirect}/?error=no_code`);

  try {
    const { data: tokens } = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code", code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { data: profile } = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    req.session.accessToken = tokens.access_token;
    req.session.refreshToken = tokens.refresh_token;
    req.session.expiresAt = Date.now() + tokens.expires_in * 1000;
    req.session.user = {
      id: profile.id,
      name: profile.display_name || profile.id,
      image: profile.images?.[0]?.url || null,
    };

    console.log(`✅ Logged in: ${req.session.user.name}`);
    req.session.save(() => res.redirect(`${redirect}/lobby`));
  } catch (err) {
    console.error("Auth error:", err.response?.data || err.message);
    res.redirect(`${redirect}/?error=auth_failed`);
  }
});

router.get("/me", (req, res) => {
  if (!req.session.accessToken) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user: req.session.user, accessToken: req.session.accessToken });
});

router.post("/refresh", async (req, res) => {
  if (!req.session.refreshToken) return res.status(401).json({ error: "No refresh token" });
  try {
    const { data } = await axios.post("https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "refresh_token", refresh_token: req.session.refreshToken,
        client_id: SPOTIFY_CLIENT_ID, client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    req.session.accessToken = data.access_token;
    res.json({ accessToken: data.access_token });
  } catch (err) {
    res.status(401).json({ error: "Refresh failed" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => { res.clearCookie("connect.sid"); res.json({ ok: true }); });
});

module.exports = router;
