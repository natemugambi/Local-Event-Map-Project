// Turns an address into map coordinates using OpenStreetMap's free Nominatim service.
// Their usage policy: at most 1 request per second, identify ourselves, and cache
// results — so every lookup (including "not found") is saved in the database.
const { pool } = require("../db");
const { USER_AGENT } = require("./shared");

// Only accept matches inside the Bay Area, so "Main St" doesn't land in another state
const BAY_AREA_BOX = "-123.2,38.6,-121.4,36.9"; // west,north,east,south
const RETRY_NOT_FOUND_DAYS = 7;
const MAX_NEW_LOOKUPS_PER_REFRESH = 60;

let lastRequestAt = 0;
let newLookups = 0;

// Called at the start of each refresh so the per-refresh cap starts over
function resetLookupBudget() {
  newLookups = 0;
}

async function nominatim(query) {
  // Wait so requests are at least 1.1 seconds apart
  const wait = lastRequestAt + 1100 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestAt = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&bounded=1&viewbox=${BAY_AREA_BOX}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = await res.json();
  return hit ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) } : null;
}

// Returns { lat, lng } or null. Tries the full text, then without the venue name
// (e.g. "Yoshi's, 510 Embarcadero W, Oakland, CA" -> "510 Embarcadero W, Oakland, CA").
async function geocode(address) {
  const query = address.replace(/\s+/g, " ").trim();
  if (!query || /\b(zoom|online|virtual|livestream|tba|tbd)\b/i.test(query)) return null;

  const cached = await pool.query(
    `SELECT lat, lng, created_at FROM geocode_cache WHERE query = $1`, [query.toLowerCase()]
  );
  const row = cached.rows[0];
  const staleMiss = row && row.lat === null && Date.now() - row.created_at.getTime() > RETRY_NOT_FOUND_DAYS * 864e5;
  if (row && !staleMiss) return row.lat === null ? null : { lat: row.lat, lng: row.lng };

  if (newLookups >= MAX_NEW_LOOKUPS_PER_REFRESH) return null; // finish next refresh
  newLookups++;

  let result = await nominatim(query);
  const withoutVenue = query.split(",").slice(1).join(",").trim();
  if (!result && withoutVenue.includes(" ")) result = await nominatim(withoutVenue);

  await pool.query(
    `INSERT INTO geocode_cache (query, lat, lng) VALUES ($1, $2, $3)
     ON CONFLICT (query) DO UPDATE SET lat = $2, lng = $3, created_at = NOW()`,
    [query.toLowerCase(), result?.lat ?? null, result?.lng ?? null]
  );
  return result;
}

module.exports = { geocode, resetLookupBudget };
