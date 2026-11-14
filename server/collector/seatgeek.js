// SeatGeek Platform API — searched by keyword within 30 miles of SF.
// Switches on when SEATGEEK_CLIENT_ID is set in Railway.
const { BAY_AREA, fetchJson, parseAgeRestriction, todayLocal, sleep } = require("./shared");
const { SEARCH_KEYWORDS } = require("./sources");

const CLIENT_ID = process.env.SEATGEEK_CLIENT_ID;

function mapCategory(e) {
  const genres = (e.performers || []).flatMap(p => p.genres || []).map(g => g.name.toLowerCase()).join(" ");
  const type = (e.type || "").toLowerCase();
  if (/hip[- ]hop|rap/.test(genres)) return "Hip-Hop & Rap";
  if (/r&b|rnb|soul/.test(genres)) return "R&B & Soul";
  if (/comedy|theater|theatre|broadway/.test(type)) return "Comedy & Arts";
  if (/sports|nba|nfl|mlb|ncaa|soccer/.test(type)) return "Community Gatherings";
  return "Festivals & Entertainment";
}

async function fetchSeatGeek() {
  if (!CLIENT_ID) return [];
  const events = [];

  for (const keyword of SEARCH_KEYWORDS) {
    await sleep(500);
    const data = await fetchJson(
      `https://api.seatgeek.com/2/events?client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&q=${encodeURIComponent(keyword)}&lat=${BAY_AREA.lat}&lon=${BAY_AREA.lng}` +
      `&range=${BAY_AREA.radiusMiles}mi&per_page=50&sort=datetime_local.asc` +
      `&datetime_local.gte=${todayLocal()}`
    );

    for (const e of data.events || []) {
      const loc = e.venue?.location;
      if (!loc?.lat || !e.datetime_local) continue;

      events.push({
        source: "SeatGeek",
        name: e.title,
        category: mapCategory(e),
        ymd: e.datetime_local.slice(0, 10),
        // SeatGeek marks unknown start times with time_tbd and a placeholder time
        hm: e.time_tbd ? null : e.datetime_local.slice(11, 16),
        venue: e.venue.name || "Venue TBA",
        city: e.venue.city || "Bay Area",
        lat: loc.lat,
        lng: loc.lon,
        url: e.url,
        age_restriction: parseAgeRestriction([e.title, e.description]),
      });
    }
  }
  return events;
}

module.exports = { fetchSeatGeek };
