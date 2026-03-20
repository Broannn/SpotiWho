const express = require("express");
const axios = require("axios");
const router = express.Router();

function auth(req, res, next) {
  if (!req.session.accessToken) return res.status(401).json({ error: "Not authenticated" });
  next();
}
function headers(token) { return { Authorization: `Bearer ${token}` }; }

router.get("/playlists", auth, async (req, res) => {
  try {
    const { data } = await axios.get("https://api.spotify.com/v1/me/playlists?limit=50", { headers: headers(req.session.accessToken) });
    res.json(data.items.map(p => ({ id: p.id, name: p.name, image: p.images?.[0]?.url, trackCount: p.tracks.total, owner: p.owner.display_name })));
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

router.get("/playlists/:id/tracks", auth, async (req, res) => {
  try {
    let tracks = [], url = `https://api.spotify.com/v1/playlists/${req.params.id}/tracks?limit=100`;
    while (url && tracks.length < 300) {
      const { data } = await axios.get(url, { headers: headers(req.session.accessToken) });
      tracks.push(...data.items.filter(i => i.track).map(i => ({
        id: i.track.id, name: i.track.name, artist: i.track.artists.map(a => a.name).join(", "),
        album: i.track.album.name, image: i.track.album.images?.[0]?.url,
        previewUrl: i.track.preview_url || null, uri: i.track.uri,
      })));
      url = data.next;
    }
    res.json(tracks);
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

// Fetch tracks from any public playlist by ID (used in playlist mode)
router.get("/playlist-tracks/:playlistId", auth, async (req, res) => {
  try {
    let tracks = [];
    let url = `https://api.spotify.com/v1/playlists/${req.params.playlistId}/tracks?limit=100`;
    while (url && tracks.length < 300) {
      const { data } = await axios.get(url, { headers: headers(req.session.accessToken) });
      tracks.push(...data.items.filter(i => i.track).map(i => ({
        id: i.track.id, name: i.track.name, artist: i.track.artists.map(a => a.name).join(", "),
        album: i.track.album.name, image: i.track.album.images?.[0]?.url,
        previewUrl: i.track.preview_url || null, uri: i.track.uri,
      })));
      url = data.next;
    }
    res.json(tracks);
  } catch (e) {
    console.error("Playlist fetch error:", e.response?.status, e.response?.data?.error);
    if (e.response?.status === 404) return res.status(404).json({ error: "Playlist not found — make sure it's public" });
    res.status(500).json({ error: "Failed to fetch playlist" });
  }
});

router.get("/liked-tracks", auth, async (req, res) => {
  try {
    let tracks = [], url = "https://api.spotify.com/v1/me/tracks?limit=50";
    while (url && tracks.length < 200) {
      const { data } = await axios.get(url, { headers: headers(req.session.accessToken) });
      tracks.push(...data.items.filter(i => i.track).map(i => ({
        id: i.track.id, name: i.track.name, artist: i.track.artists.map(a => a.name).join(", "),
        album: i.track.album.name, image: i.track.album.images?.[0]?.url,
        previewUrl: i.track.preview_url || null, uri: i.track.uri,
      })));
      url = data.next;
    }
    res.json(tracks);
  } catch (e) {
    console.error("Liked tracks error:", e.response?.data || e.message);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/top-tracks", auth, async (req, res) => {
  try {
    const { data } = await axios.get("https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term", { headers: headers(req.session.accessToken) });
    res.json(data.items.map(t => ({
      id: t.id, name: t.name, artist: t.artists.map(a => a.name).join(", "),
      album: t.album.name, image: t.album.images?.[0]?.url,
      previewUrl: t.preview_url || null, uri: t.uri,
    })));
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

module.exports = router;
