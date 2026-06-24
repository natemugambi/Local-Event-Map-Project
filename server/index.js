require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool, initDB } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const TM_KEY = process.env.TICKETMASTER_KEY;
const JWT_SECRET = process.env.SESSION_SECRET;
const REPORT_THRESHOLD = 5;

app.use(cors());
app.use(express.json());

// ===== AUTH MIDDLEWARE =====
// Extracts user from the JWT token in the Authorization header
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch {
    req.user = null;
  }
  next();
}

// Use on all routes
app.use(authenticateToken);

// Require login — use on protected routes
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "You must be logged in" });
  next();
}

// ===== EVENTS ENDPOINT =====
app.get("/api/events", async (req, res) => {
  const keyword = req.query.keyword || "black music";
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TM_KEY}&keyword=${encodeURIComponent(keyword)}&latlong=37.7749,-122.4194&radius=30&unit=miles&sort=date,asc&size=20`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data._embedded || !data._embedded.events) {
      return res.json([]);
    }

    const events = data._embedded.events
      .filter(e => {
        const venue = e._embedded?.venues?.[0];
        return venue?.location?.latitude && venue?.location?.longitude;
      })
      .map(e => {
        const venue = e._embedded.venues[0];
        const date = e.dates?.start?.localDate;
        const time = e.dates?.start?.localTime;
        return {
          name: e.name,
          category: mapCategory(e.classifications?.[0]?.segment?.name, e.classifications?.[0]?.genre?.name),
          date: date ? formatDate(date) : "Date TBA",
          time: time ? formatTime(time) : "Time TBA",
          city: venue.city?.name || "Bay Area",
          venue: venue.name || "Venue TBA",
          lat: parseFloat(venue.location.latitude),
          lng: parseFloat(venue.location.longitude),
          url: e.url,
        };
      });

    res.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ===== AUTH =====

app.post("/api/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: "All fields are required" });

  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id`,
      [username, email, hashed]
    );
    const token = jwt.sign({ userId: result.rows[0].id, username }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ username, token });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "Username or email already taken" });
    console.error("Signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password are required" });

  const result = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid username or password" });

  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ username: user.username, token });
});

app.get("/api/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in" });
  res.json({ username: req.user.username, userId: req.user.userId });
});

// ===== SUBMITTED EVENTS =====

app.get("/api/submitted-events", async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM submitted_events WHERE report_count < $1 ORDER BY created_at DESC`,
    [REPORT_THRESHOLD]
  );
  res.json(result.rows);
});

app.post("/api/submitted-events", requireAuth, async (req, res) => {
  const { name, category, date, time, city, venue, lat, lng, url } = req.body;

  if (!name || !category || !date || !time || !city || !venue || lat == null || lng == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const result = await pool.query(
    `INSERT INTO submitted_events (name, category, date, time, city, venue, lat, lng, url, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [name, category, date, time, city, venue, lat, lng, url || null, req.user.userId]
  );

  res.status(201).json({ id: result.rows[0].id });
});

app.get("/api/my-events", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM submitted_events WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.userId]
  );
  res.json(result.rows);
});

app.delete("/api/submitted-events/:id", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT * FROM submitted_events WHERE id = $1`, [req.params.id]);
  const event = result.rows[0];
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.user_id !== req.user.userId)
    return res.status(403).json({ error: "You can only delete your own events" });

  await pool.query(`DELETE FROM submitted_events WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

app.put("/api/submitted-events/:id", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT * FROM submitted_events WHERE id = $1`, [req.params.id]);
  const event = result.rows[0];
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.user_id !== req.user.userId)
    return res.status(403).json({ error: "You can only edit your own events" });

  const { name, category, date, time, city, venue, lat, lng, url } = req.body;

  await pool.query(
    `UPDATE submitted_events SET name=$1, category=$2, date=$3, time=$4, city=$5, venue=$6, lat=$7, lng=$8, url=$9 WHERE id=$10`,
    [name || event.name, category || event.category, date || event.date, time || event.time,
     city || event.city, venue || event.venue, lat || event.lat, lng || event.lng,
     url !== undefined ? url : event.url, req.params.id]
  );

  res.json({ success: true });
});

app.post("/api/submitted-events/:id/report", async (req, res) => {
  await pool.query(
    `UPDATE submitted_events SET report_count = report_count + 1 WHERE id = $1`,
    [req.params.id]
  );
  res.json({ success: true });
});

// ===== HELPERS =====
function formatDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(timeStr) {
  const [hour, minute] = timeStr.split(":");
  const date = new Date();
  date.setHours(hour, minute);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function mapCategory(segment, genre) {
  const hipHopGenres = ["Hip-Hop/Rap", "Trap", "Urban"];
  const rbGenres = ["R&B", "Soul", "Pop-Soul", "Motown"];
  const comedySegments = ["Comedy", "Arts & Theatre"];

  if (hipHopGenres.includes(genre)) return "Hip-Hop & Rap";
  if (rbGenres.includes(genre)) return "R&B & Soul";
  if (comedySegments.includes(genre) || segment === "Arts & Theatre") return "Comedy & Arts";
  if (segment === "Sports") return "Community Gatherings";

  return "Festivals & Entertainment";
}

// ===== START SERVER =====
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`The Gathering server running on http://localhost:${PORT}`);
  });
}

start();
