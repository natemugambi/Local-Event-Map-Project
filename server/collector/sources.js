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

  // Eventbrite has no location search, so we follow specific organizers.
  // The id is the number at the end of an organizer's Eventbrite page URL,
  // e.g. eventbrite.com/o/some-promoter-12345678901 -> "12345678901".
  // Needs EVENTBRITE_TOKEN in Railway.
  // category: shown on the map for that organizer's events.
  EVENTBRITE_ORGANIZERS: [
    { id: "78526362493", name: "Sundaze Day Party", category: "Festivals & Entertainment" },
    { id: "35720383553", name: "TouchFriday", category: "R&B & Soul" },
    { id: "2208700429", name: "Skyconcepts Entertainment", category: "Festivals & Entertainment" },
    { id: "15557819704", name: "United Tribes of Africa", category: "Festivals & Entertainment" },
  ],

  // Calendar feeds (iCal / .ics links) — Luma calendars, Google Calendars,
  // campus groups, venues. filter: "all" keeps every event (for calendars run
  // by the community itself); "keywords" keeps only events whose title is on-topic
  // (for broad calendars — expect a few misses either way, so prefer focused ones).
  // category: shown on the map for this calendar's events.
  CALENDAR_FEEDS: [
    // { name: "Example Collective", url: "https://api.lu.ma/ics/get?entity=calendar&id=cal-XXXX", category: "Community Gatherings", filter: "all" },
  ],
};
