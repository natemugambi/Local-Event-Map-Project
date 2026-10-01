require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { pool, initDB } = require("./db");

const app = express();
app.disable("x-powered-by"); // don't advertise that we run Express
const PORT = process.env.PORT || 3000;
const TM_KEY = process.env.TICKETMASTER_KEY;
const JWT_SECRET = process.env.SESSION_SECRET;
const REPORT_THRESHOLD = 5;
const DAILY_SUBMISSION_LIMIT = 5; // per user, rolling 24 hours
const HOURLY_REPORT_LIMIT = 5; // per user and per IP, rolling hour
const AGE_OPTIONS = ["All Ages", "18+", "21+"];

// Railway sits one proxy hop in front of us — trust it so req.ip is the visitor's real IP
app.set("trust proxy", 1);

// Per-IP rate limiter factory — counts requests from one IP over a time window
function ipLimiter(windowMs, limit, message, options = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: message },
    ...options,
  });
}

// Signup: stops one person mass-creating accounts to dodge per-user limits
const signupLimiter = ipLimiter(60 * 60 * 1000, 5, "Too many accounts created from this network. Try again later.");
// Login: slows down password guessing
// (only failed attempts count, so people sharing wifi don't lock each other out)
const loginLimiter = ipLimiter(15 * 60 * 1000, 10, "Too many login attempts. Try again in a few minutes.", { skipSuccessfulRequests: true });
// Submissions: backstop on top of the per-user daily limit
const submitLimiter = ipLimiter(24 * 60 * 60 * 1000, 10, "Too many events submitted from this network today. Try again tomorrow.");

app.use(cors({
  origin: [
    "https://findthespot.net",
    "https://www.findthespot.net",
    "https://local-event-map-project.mnate576-1f2.workers.dev",
    "https://visionary-florentine-ca7743.netlify.app",
    "http://localhost:8000",
  ],
  credentials: true,
}));
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
          age_restriction: ticketmasterAgeRestriction(e),
        };
      });

    res.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ===== AUTH =====

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;

app.post("/api/signup", signupLimiter, async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: "All fields are required" });
  if (typeof username !== "string" || !USERNAME_PATTERN.test(username))
    return res.status(400).json({ error: "Username must be 3–30 characters: letters, numbers, _ . or -" });
  if (typeof email !== "string" || email.length > 254 || !email.includes("@"))
    return res.status(400).json({ error: "Please enter a valid email" });
  if (typeof password !== "string" || password.length < 8 || password.length > 72)
    return res.status(400).json({ error: "Password must be 8–72 characters" });

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

app.post("/api/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password)
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
  // Past events drop off the map automatically; NULL dates (old rows) still show
  const result = await pool.query(
    `SELECT * FROM submitted_events
     WHERE report_count < $1
       AND (event_date IS NULL OR event_date >= CURRENT_DATE)
     ORDER BY event_date ASC NULLS LAST`,
    [REPORT_THRESHOLD]
  );
  res.json(result.rows);
});

app.post("/api/submitted-events", requireAuth, submitLimiter, async (req, res) => {
  const { name, category, date, time, city, venue, lat, lng, url, event_date, age_restriction } = req.body;

  if (!name || !category || !date || !time || !city || !venue || lat == null || lng == null || !age_restriction) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!AGE_OPTIONS.includes(age_restriction)) {
    return res.status(400).json({ error: "Age restriction must be All Ages, 18+ or 21+" });
  }

  if (url && !isSafeUrl(url)) {
    return res.status(400).json({ error: "Event link must start with http:// or https://" });
  }

  if (event_date && event_date < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: "Event date can't be in the past" });
  }

  // Rate limit: cap submissions per user over a rolling 24-hour window
  const recent = await pool.query(
    `SELECT COUNT(*) FROM submitted_events
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [req.user.userId]
  );
  if (parseInt(recent.rows[0].count) >= DAILY_SUBMISSION_LIMIT) {
    return res.status(429).json({
      error: `You've reached the limit of ${DAILY_SUBMISSION_LIMIT} events per day. Try again tomorrow.`,
    });
  }

  const result = await pool.query(
    `INSERT INTO submitted_events (name, category, date, time, city, venue, lat, lng, url, user_id, event_date, age_restriction)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [name, category, date, time, city, venue, lat, lng, url || null, req.user.userId, event_date || null, age_restriction]
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

  const { name, category, date, time, city, venue, lat, lng, url, event_date, age_restriction } = req.body;

  if (url && !isSafeUrl(url)) {
    return res.status(400).json({ error: "Event link must start with http:// or https://" });
  }

  if (age_restriction !== undefined && !AGE_OPTIONS.includes(age_restriction)) {
    return res.status(400).json({ error: "Age restriction must be All Ages, 18+ or 21+" });
  }

  await pool.query(
    `UPDATE submitted_events SET name=$1, category=$2, date=$3, time=$4, city=$5, venue=$6, lat=$7, lng=$8, url=$9, event_date=$10, age_restriction=$11 WHERE id=$12`,
    [name || event.name, category || event.category, date || event.date, time || event.time,
     city || event.city, venue || event.venue, lat || event.lat, lng || event.lng,
     url !== undefined ? url : event.url, event_date || event.event_date,
     age_restriction || event.age_restriction, req.params.id]
  );

  res.json({ success: true });
});

// Per-IP cap on reports, so one person can't hide events by rotating through accounts
const reportLimiter = ipLimiter(60 * 60 * 1000, HOURLY_REPORT_LIMIT, "Too many reports. Try again later.");

app.post("/api/submitted-events/:id/report", requireAuth, reportLimiter, async (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  if (!Number.isInteger(eventId)) return res.status(400).json({ error: "Invalid event id" });

  const result = await pool.query(`SELECT user_id FROM submitted_events WHERE id = $1`, [eventId]);
  const event = result.rows[0];
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.user_id === req.user.userId)
    return res.status(400).json({ error: "You can't report your own event" });

  // Per-user cap, in case one account switches networks to dodge the IP limit
  const recent = await pool.query(
    `SELECT COUNT(*) FROM event_reports
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [req.user.userId]
  );
  if (parseInt(recent.rows[0].count) >= HOURLY_REPORT_LIMIT)
    return res.status(429).json({ error: "Too many reports. Try again later." });

  // Record the report and bump the count in one statement; a repeat report inserts nothing
  const inserted = await pool.query(
    `WITH new_report AS (
       INSERT INTO event_reports (user_id, event_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING event_id
     )
     UPDATE submitted_events SET report_count = report_count + 1
     WHERE id IN (SELECT event_id FROM new_report)`,
    [req.user.userId, eventId]
  );
  if (inserted.rowCount === 0)
    return res.status(409).json({ error: "You've already reported this event" });

  res.json({ success: true });
});

// ===== HELPERS =====
// Ticketmaster's structured ageRestrictions field is almost always empty, but the
// event's own text often says "21+" or "This event is 21 and over". Venues also
// paste generic legal text ("For any event that is 18 or 21 and over...") onto
// every event, so those sentences are dropped before looking for an age.
const AGE_BOILERPLATE = /\b(any (event|show|ticket)|listed as|from time to time)\b/i;
const AGE_21 = /\b21\s*(\+|(and|&)\s*(over|up|older)|or older)/i;
const AGE_18 = /\b18\s*(\+|(and|&)\s*(over|up|older)|or older)/i;

function ticketmasterAgeRestriction(e) {
  const text = [e.name, e.ageRestrictions?.ageRuleDescription, e.info, e.pleaseNote].filter(Boolean).join(". ");
  const specific = text
    .split(/[.!?\n]+/)
    .filter(sentence => !AGE_BOILERPLATE.test(sentence))
    .join(". ");

  if (AGE_21.test(specific)) return "21+";
  if (AGE_18.test(specific)) return "18+";
  return "All Ages";
}

// Event links are rendered as <a href>, so only http(s) is allowed —
// blocks "javascript:" / "data:" URLs that would run code when clicked.
function isSafeUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (e) {
    return false;
  }
}

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

// ===== ERROR HANDLING =====
// Unknown routes get a plain JSON 404 instead of Express's default HTML page
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Catch-all for any error a route throws. The real details go to the Railway
// logs only; visitors get a generic message so nothing about the server leaks.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid request" });
  }
  console.error(`Error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

// ===== START SERVER =====
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`The Spot server running on http://localhost:${PORT}`);
  });
}

start();
