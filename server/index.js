require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const TM_KEY = process.env.TICKETMASTER_KEY;
const REPORT_THRESHOLD = 5; // auto-hide after this many reports

app.use(cors({
  origin: [
    "https://visionary-florentine-ca7743.netlify.app",
    "http://localhost:8000",
  ],
}));
app.use(express.json());

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

// ===== SUBMITTED EVENTS =====

// Get all community-submitted events (auto-published, minus hidden/reported ones)
app.get("/api/submitted-events", (req, res) => {
  const events = db.prepare(
    `SELECT * FROM submitted_events WHERE report_count < ? ORDER BY created_at DESC`
  ).all(REPORT_THRESHOLD);
  res.json(events);
});

// Submit a new event (auto-published immediately)
app.post("/api/submitted-events", (req, res) => {
  const { name, category, date, time, city, venue, lat, lng, url } = req.body;

  // Basic validation — required fields
  if (!name || !category || !date || !time || !city || !venue || lat == null || lng == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const stmt = db.prepare(`
    INSERT INTO submitted_events (name, category, date, time, city, venue, lat, lng, url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, category, date, time, city, venue, lat, lng, url || null);

  res.status(201).json({ id: result.lastInsertRowid });
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
