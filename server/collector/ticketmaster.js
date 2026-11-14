// Ticketmaster Discovery API — searched by keyword within 30 miles of SF.
const { BAY_AREA, fetchJson, parseAgeRestriction, sleep } = require("./shared");
const { SEARCH_KEYWORDS } = require("./sources");

const TM_KEY = process.env.TICKETMASTER_KEY;

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

async function fetchTicketmaster() {
  if (!TM_KEY) return [];
  const events = [];

  for (const keyword of SEARCH_KEYWORDS) {
    await sleep(500); // Ticketmaster allows ~5 requests/second — stay well under
    const data = await fetchJson(
      `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TM_KEY}` +
      `&keyword=${encodeURIComponent(keyword)}&latlong=${BAY_AREA.lat},${BAY_AREA.lng}` +
      `&radius=${BAY_AREA.radiusMiles}&unit=miles&sort=date,asc&size=50`
    );

    for (const e of data._embedded?.events || []) {
      const venue = e._embedded?.venues?.[0];
      const date = e.dates?.start?.localDate;
      if (!venue?.location?.latitude || !date) continue;

      events.push({
        source: "Ticketmaster",
        name: e.name,
        category: mapCategory(e.classifications?.[0]?.segment?.name, e.classifications?.[0]?.genre?.name),
        ymd: date,
        hm: e.dates?.start?.localTime?.slice(0, 5) || null,
        venue: venue.name || "Venue TBA",
        city: venue.city?.name || "Bay Area",
        lat: parseFloat(venue.location.latitude),
        lng: parseFloat(venue.location.longitude),
        url: e.url,
        age_restriction: parseAgeRestriction([e.name, e.ageRestrictions?.ageRuleDescription, e.info, e.pleaseNote]),
      });
    }
  }
  return events;
}

module.exports = { fetchTicketmaster };
