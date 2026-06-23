require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
const { pool, initDB } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const TM_KEY = process.env.TICKETMASTER_KEY;
const REPORT_THRESHOLD = 5;

app.use(cors({
  origin: [
    "https://visionary-florentine-ca7743.netlify.app",
    "http://localhost:8000",
  ],
  credentials: true,
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

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
    req.session.userId = result.rows[0].id;
    req.session.username = username;
    res.status(201).json({ username });
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

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/me", (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });
  res.json({ username: req.session.username, id: req.session.userId });
});

// ===== SUBMITTED EVENTS =====

app.get("/api/submitted-events", async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM submitted_events WHERE report_count < $1 ORDER BY created_at DESC`,
    [REPORT_THRESHOLD]
  );
  res.json(result.rows);
});

app.post("/api/submitted-events", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "You must be logged in to submit an event" });

  const { name, category, date, time, city, venue, lat, lng, url } = req.body;

  if (!name || !category || !date || !time || !city || !venue || lat == null || lng == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const result = await pool.query(
    `INSERT INTO submitted_events (name, category, date, time, city, venue, lat, lng, url, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [name, category, date, time, city, venue, lat, lng, url || null, req.session.userId]
  );

  res.status(201).json({ id: result.rows[0].id });
});

app.delete("/api/submitted-events/:id", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  const result = await pool.query(`SELECT * FROM submitted_events WHERE id = $1`, [req.params.id]);
  const event = result.rows[0];
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.user_id !== req.session.userId)
    return res.status(403).json({ error: "You can only delete your own events" });

  await pool.query(`DELETE FROM submitted_events WHERE id = $1`, [req.params.id]);
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
