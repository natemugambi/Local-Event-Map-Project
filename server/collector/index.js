// ===== EVENT COLLECTOR =====
// Pulls events from every source every 30 minutes, removes duplicates, and keeps
// the result in memory so the map loads with one fast request.
const { BAY_AREA, displayDate, displayTime, todayLocal } = require("./shared");
const { resetLookupBudget } = require("./geocode");
const { fetchTicketmaster } = require("./ticketmaster");
const { fetchSeatGeek } = require("./seatgeek");
const { fetchCalendars } = require("./ical");
const { CALENDAR_FEEDS } = require("./sources");

const REFRESH_MINUTES = 30;
const RETRY_MINUTES = 1; // when a source fails and has nothing to fall back on

// Earlier sources win when the same event shows up in more than one place.
// "configured" = its Railway variable (or feed list) is set, so the status page can
// tell "no key" apart from "key works but nothing matched".
const SOURCES = [
  { name: "Ticketmaster", fetch: fetchTicketmaster, configured: Boolean(process.env.TICKETMASTER_KEY) },
  { name: "SeatGeek", fetch: fetchSeatGeek, configured: Boolean(process.env.SEATGEEK_CLIENT_ID) },
  { name: "Calendars", fetch: fetchCalendars, configured: CALENDAR_FEEDS.length > 0 },
];

const lastGood = new Map(); // source name -> its last successful list of events
const status = new Map();   // source name -> { count, error, checkedAt } for /api/collector-status
let events = [];
let updatedAt = null;
let refreshing = null;

// ===== DUPLICATES =====
const STOP_WORDS = new Set(["the", "and", "with", "tour", "live", "presents", "feat", "featuring", "night", "special", "guest", "guests", "show", "concert", "tickets"]);

function nameTokens(name) {
  return new Set(
    name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

// Distance in km between two points
function distanceKm(a, b) {
  const rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Same day, same place (within ~250 m), and mostly the same words in the name
function isDuplicate(a, b) {
  if (a.ymd !== b.ymd || distanceKm(a, b) > 0.25) return false;
  const ta = a.tokens, tb = b.tokens;
  if (!ta.size || !tb.size) return a.name.toLowerCase() === b.name.toLowerCase();
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.6;
}

function removeDuplicates(list) {
  const kept = [];
  for (const event of list) {
    event.tokens = nameTokens(event.name);
    const original = kept.find(k => isDuplicate(k, event));
    if (!original) kept.push(event);
    else if (!original.age_restriction && event.age_restriction) original.age_restriction = event.age_restriction;
  }
  return kept;
}

// Shape sent to the browser
function toPublic(e) {
  return {
    name: String(e.name).slice(0, 200),
    category: e.category,
    date: displayDate(e.ymd),
    time: e.hm ? displayTime(e.hm) : "Time TBA",
    start: e.ymd + (e.hm ? `T${e.hm}` : ""),
    venue: String(e.venue).slice(0, 120),
    city: String(e.city).slice(0, 60),
    lat: e.lat,
    lng: e.lng,
    url: e.url || null,
    age_restriction: e.age_restriction,
    source: e.source,
  };
}

// ===== REFRESH =====
async function refresh() {
  resetLookupBudget();
  const started = Date.now();
  const counts = [];

  for (const source of SOURCES) {
    try {
      const found = await source.fetch();
      lastGood.set(source.name, found);
      status.set(source.name, { count: found.length, error: null, checkedAt: new Date() });
      counts.push(`${source.name} ${found.length}`);
    } catch (err) {
      // Keep showing this source's previous events rather than dropping them
      console.error(`[collector] ${source.name} failed, keeping last results:`, err.message);
      status.set(source.name, { count: lastGood.get(source.name)?.length || 0, error: err.message, checkedAt: new Date() });
      counts.push(`${source.name} failed`);
    }
  }

  const today = todayLocal();
  const all = SOURCES.flatMap(s => lastGood.get(s.name) || [])
    .filter(e => e.ymd >= today && Number.isFinite(e.lat) && Number.isFinite(e.lng))
    .filter(e => distanceKm(e, BAY_AREA) <= BAY_AREA.maxKm); // drop out-of-town events

  events = removeDuplicates(all)
    .sort((a, b) => (a.ymd + (a.hm || "99")).localeCompare(b.ymd + (b.hm || "99")))
    .map(toPublic);
  updatedAt = new Date();

  // A source that failed with no earlier results to show (e.g. right after a deploy):
  // try again soon rather than leaving it empty for 30 minutes
  if (SOURCES.some(s => status.get(s.name)?.error && !lastGood.has(s.name))) {
    setTimeout(() => refreshOnce().catch(err => console.error("[collector] retry failed:", err)), RETRY_MINUTES * 60 * 1000);
  }

  console.log(`[collector] ${events.length} events (${counts.join(", ")}; ${all.length - events.length} duplicates removed) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

// One refresh at a time; callers share the one in progress
function refreshOnce() {
  if (!refreshing) refreshing = refresh().finally(() => { refreshing = null; });
  return refreshing;
}

function startCollector() {
  refreshOnce().catch(err => console.error("[collector] refresh failed:", err));
  setInterval(() => refreshOnce().catch(err => console.error("[collector] refresh failed:", err)), REFRESH_MINUTES * 60 * 1000);
}

// Right after a deploy the first refresh may still be running — wait for it
async function getEvents() {
  if (!events.length && refreshing) await refreshing.catch(() => {});
  return events;
}

// Per-source counts and errors (no secrets) so problems are visible without server logs
function getStatus() {
  return {
    updatedAt,
    total: events.length,
    sources: SOURCES.map(s => ({ name: s.name, configured: s.configured, ...(status.get(s.name) || { count: 0, error: null, checkedAt: null }) })),
  };
}

module.exports = { startCollector, getEvents, getStatus, refreshOnce, removeDuplicates };
