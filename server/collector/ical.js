// Calendar feeds (iCal / .ics) listed in sources.js — Luma, Google Calendar, campus groups.
const { fetchText, toLocalParts, todayLocal, parseAgeRestriction, isRelevant } = require("./shared");
const { CALENDAR_FEEDS } = require("./sources");
const { geocode } = require("./geocode");

const MAX_EVENTS_PER_FEED = 100;

// "\," -> ",", "\n" -> newline, etc.
const unescape = value => value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

// Splits a feed into events, each a map of PROPERTY -> { value, params }
function parseICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/); // join folded lines
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT") { if (current) events.push(current); current = null; }
    else if (current) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const [name, ...params] = line.slice(0, colon).split(";");
      current[name.toUpperCase()] = { value: line.slice(colon + 1), params: params.join(";") };
    }
  }
  return events;
}

// DTSTART -> { ymd, hm } in Bay Area time. Handles UTC ("...Z"), local times
// (with or without TZID — treated as Bay Area time), and all-day dates.
function parseStart(prop) {
  const v = prop?.value || "";
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{0,2}(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, utc] = m;
  if (!h) return { ymd: `${y}-${mo}-${d}`, hm: null };
  if (utc) return toLocalParts(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)));
  return { ymd: `${y}-${mo}-${d}`, hm: `${h}:${mi}` };
}

async function fetchFeed(feed) {
  const events = [];
  const today = todayLocal();

  for (const e of parseICS(await fetchText(feed.url))) {
    if (events.length >= MAX_EVENTS_PER_FEED) break;
    if (/CANCEL/i.test(e.STATUS?.value || "")) continue;

    const start = parseStart(e.DTSTART);
    if (!start || start.ymd < today) continue; // past (repeating events only count their first date)

    const name = unescape(e.SUMMARY?.value || "");
    const description = unescape(e.DESCRIPTION?.value || "");
    if (!name) continue;
    // Titles only: descriptions mention keywords too loosely (tested on UC Berkeley's calendar)
    if (feed.filter === "keywords" && !isRelevant(name)) continue;

    // Location: exact coordinates if the feed has them, otherwise look up the address
    const location = unescape(e.LOCATION?.value || "");
    let coords = null;
    const geo = (e.GEO?.value || "").split(/[;,]/).map(Number);
    if (geo.length === 2 && geo.every(Number.isFinite)) coords = { lat: geo[0], lng: geo[1] };
    if (!coords) coords = await geocode(location);
    if (!coords) continue; // can't place it on the map

    const [venue, ...rest] = location.split(",").map(s => s.trim());
    const city = rest.map(s => s.replace(/\b(CA|California)\b.*$/i, "").trim()).filter(Boolean).pop();

    events.push({
      source: feed.name,
      name,
      category: feed.category || "Community Gatherings",
      ymd: start.ymd,
      hm: start.hm,
      venue: venue || "Venue TBA",
      city: city || "Bay Area",
      lat: coords.lat,
      lng: coords.lng,
      url: unescape(e.URL?.value || "") || feed.link || null,
      age_restriction: parseAgeRestriction([name, description]),
    });
  }
  return events;
}

// Each feed is fetched separately so one broken calendar doesn't hide the others
async function fetchCalendars() {
  const events = [];
  for (const feed of CALENDAR_FEEDS) {
    try {
      events.push(...await fetchFeed(feed));
    } catch (err) {
      console.error(`[collector] calendar "${feed.name}" failed:`, err.message);
    }
  }
  return events;
}

module.exports = { fetchCalendars, parseICS, parseStart };
