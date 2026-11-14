// ===== WHERE THE MAP'S EVENTS COME FROM =====
// Edit this file to add or remove sources. Everything here is "trusted": its events
// go on the map automatically. Changes go live on the next deploy.

module.exports = {
  // Ticketmaster + SeatGeek: searched within 30 miles of SF for each keyword
  SEARCH_KEYWORDS: [
    "afrobeats",
    "R&B",
    "hip hop",
    "juneteenth",
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
