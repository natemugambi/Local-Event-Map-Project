// ===== WHERE THE MAP'S EVENTS COME FROM =====
// Edit this file to add or remove sources. Everything here is "trusted": its events
// go on the map automatically. Changes go live on the next deploy.

module.exports = {
  // Ticketmaster + SeatGeek: searched within 30 miles of SF for each keyword.
  // "category" is used when the ticket site's own genre doesn't place the event
  // (e.g. a Kwanzaa celebration has no music genre, so it goes under Community).
  // Each keyword is one request per source every 30 minutes — Ticketmaster allows
  // 5,000 a day, so there's room for ~100 keywords.
  SEARCH_KEYWORDS: [
    "afrobeats",
    "R&B",
    "hip hop",
    "neo soul",
    // Not "amapiano" or "reggae": tested Nov 2026 — Ticketmaster answered "amapiano" with
    // unrelated EDM tours and "reggae" with surf/jam bands. "dancehall" covers the reggae artists.
    "dancehall",
    "soca",
    "gospel",
    { q: "juneteenth", category: "Community Gatherings" },
    { q: "kwanzaa", category: "Community Gatherings" },
    { q: "black history", category: "Community Gatherings" },
    { q: "black business", category: "Community Gatherings" },
    { q: "black comedy", category: "Comedy & Arts" },
    { q: "comedy jam", category: "Comedy & Arts" },
    { q: "spoken word", category: "Comedy & Arts" },
    { q: "poetry", category: "Comedy & Arts" },
    { q: "caribbean", category: "Festivals & Entertainment" },
    { q: "african festival", category: "Festivals & Entertainment" },
  ],

  // (Eventbrite: its API only lists events for your own account, so other promoters'
  // events come in through "Import from link" on the submit form instead.)

  // Calendar feeds (iCal / .ics links) — Luma calendars, Google Calendars,
  // campus groups, venues. filter: "all" keeps every event (for calendars run
  // by the community itself); "keywords" keeps only events whose title is on-topic
  // (for broad calendars — expect a few misses either way, so prefer focused ones).
  // category: shown on the map for this calendar's events.
  CALENDAR_FEEDS: [
    // { name: "Example Collective", url: "https://api.lu.ma/ics/get?entity=calendar&id=cal-XXXX", category: "Community Gatherings", filter: "all" },
  ],
};
