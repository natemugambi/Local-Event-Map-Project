// Eventbrite — events from the organizers listed in sources.js.
// (Eventbrite shut down its public location search in 2020, so we follow organizers.)
// Switches on when EVENTBRITE_TOKEN is set in Railway.
const { fetchJson, parseAgeRestriction } = require("./shared");
const { EVENTBRITE_ORGANIZERS } = require("./sources");
const { geocode } = require("./geocode");

const TOKEN = process.env.EVENTBRITE_TOKEN;

async function fetchEventbrite() {
  if (!TOKEN || !EVENTBRITE_ORGANIZERS.length) return [];
  const events = [];

  const failures = [];

  for (const organizer of EVENTBRITE_ORGANIZERS) {
    // One bad organizer id shouldn't hide everyone else's events
    let data;
    try {
      data = await fetchJson(
        `https://www.eventbriteapi.com/v3/organizers/${encodeURIComponent(organizer.id)}/events/` +
        `?status=live&order_by=start_asc&expand=venue`,
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      );
    } catch (err) {
      console.error(`[collector] Eventbrite organizer "${organizer.name}" failed:`, err.message);
      failures.push(err.message);
      continue;
    }

    for (const e of data.events || []) {
      if (e.online_event || !e.start?.local) continue;
      const venue = e.venue || {};
      const address = venue.address || {};

      let lat = parseFloat(venue.latitude ?? address.latitude);
      let lng = parseFloat(venue.longitude ?? address.longitude);
      if (!lat || !lng) {
        const found = await geocode([venue.name, address.localized_address_display].filter(Boolean).join(", "));
        if (!found) continue;
        ({ lat, lng } = found);
      }

      events.push({
        source: "Eventbrite",
        name: e.name?.text || "Untitled event",
        category: organizer.category || "Community Gatherings",
        ymd: e.start.local.slice(0, 10),
        hm: e.start.local.slice(11, 16),
        venue: venue.name || "Venue TBA",
        city: address.city || "Bay Area",
        lat,
        lng,
        url: e.url,
        age_restriction: parseAgeRestriction([e.name?.text, e.description?.text]),
      });
    }
  }

  // Every organizer failing usually means the token itself is wrong — report it
  if (failures.length === EVENTBRITE_ORGANIZERS.length) throw new Error(`all organizers failed (${failures[0]})`);
  return events;
}

module.exports = { fetchEventbrite };
