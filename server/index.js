require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
const db = require("./db");

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
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// ===== EVENTS ENDPOINT =====
// Frontend calls: GET /api/events?keyword=afrobeats
app.get("/api/events", async (req, res) => {
  const keyword = req.query.keyword || "black music";

  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TM_KEY}&keyword=${encodeURIComponent(keyword)}&latlong=37.7749,-122.4194&radius=30&unit=miles&sort=date,asc&size=20`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    console.log("Ticketmaster response:", JSON.stringify(data).slice(0, 500));

    // No events found
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

        console.log(e.name, "→", e.classifications?.[0]?.segment?.name, "|", e.classifications?.[0]?.genre?.name, "|", e.classifications?.[0]?.subGenre?.name);
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
    const result = db.prepare(
      `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`
    ).run(username, email, hashed);
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    res.status(201).json({ username });
  } catch (err) {
    if (err.message.includes("UNIQUE"))
      return res.status(409).json({ error: "Username or email already taken" });
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password are required" });

  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
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

// ===== TEMP: list usernames (remove after use) =====
app.get("/api/users", (req, res) => {
  const users = db.prepare(`SELECT id, username, email, created_at FROM users`).all();
  res.json(users);
});

// ===== SUBMITTED EVENTS =====

// Get all community-submitted events (auto-published, minus hidden/reported ones)
app.get("/api/submitted-events", (req, res) => {
  const events = db.prepare(
    `SELECT * FROM submitted_events WHERE report_count < ? ORDER BY created_at DESC`
  ).all(REPORT_THRESHOLD);
  res.json(events);
});

// Submit a new event — must be logged in
app.post("/api/submitted-events", (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "You must be logged in to submit an event" });

  const { name, category, date, time, city, venue, lat, lng, url } = req.body;

  if (!name || !category || !date || !time || !city || !venue || lat == null || lng == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const stmt = db.prepare(`
    INSERT INTO submitted_events (name, category, date, time, city, venue, lat, lng, url, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, category, date, time, city, venue, lat, lng, url || null, req.session.userId);

  res.status(201).json({ id: result.lastInsertRowid });
});

// Delete own event
app.delete("/api/submitted-events/:id", (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  const event = db.prepare(`SELECT * FROM submitted_events WHERE id = ?`).get(req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.user_id !== req.session.userId)
    return res.status(403).json({ error: "You can only delete your own events" });

  db.prepare(`DELETE FROM submitted_events WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// Report an event — once it crosses the threshold it's auto-hidden
app.post("/api/submitted-events/:id/report", (req, res) => {
  const { id } = req.params;
  db.prepare(`UPDATE submitted_events SET report_count = report_count + 1 WHERE id = ?`).run(id);
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
app.listen(PORT, () => {
  console.log(`The Gathering server running on http://localhost:${PORT}`);
});
