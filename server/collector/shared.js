// Helpers shared by every event source.

const TIME_ZONE = "America/Los_Angeles";

// Center of the map and how far out we look, used by sources that search by location.
// maxKm: events farther than this from SF are dropped (e.g. a promoter's Las Vegas show).
const BAY_AREA = { lat: 37.7749, lng: -122.4194, radiusMiles: 30, maxKm: 80 };

// Identifies us to the sites we read from (some block requests without one)
const USER_AGENT = "TheSpot/1.0 (+https://findthespot.net; privacy@findthespot.net)";

// "2026-11-14" -> "Sat, Nov 14"
function displayDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

// "19:30" -> "7:30 PM"
function displayTime(hm) {
  const [h, m] = hm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// A JS Date -> Bay Area local date and time parts { ymd: "2026-11-14", hm: "19:30" }
function toLocalParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map(p => [p.type, p.value])
  );
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}` };
}

// Today's date in the Bay Area, "YYYY-MM-DD"
function todayLocal() {
  return toLocalParts(new Date()).ymd;
}

// ===== AGE RESTRICTION =====
// Listings rarely have a structured age field, but their text often says "21+" or
// "This event is 21 and over". Venues also paste generic legal text ("For any event
// that is 18 or 21 and over...") onto every event, so those sentences are dropped first.
// Returns null when no age is stated — we never assume "All Ages".
const AGE_BOILERPLATE = /\b(any (event|show|ticket)|listed as|from time to time)\b/i;
const AGE_21 = /\b21\s*(\+|(and|&)\s*(over|up|older)|or older)/i;
const AGE_18 = /\b18\s*(\+|(and|&)\s*(over|up|older)|or older)/i;
const AGE_ALL = /\ball[- ]ages\b/i;

function parseAgeRestriction(texts) {
  const specific = texts.filter(Boolean).join(". ")
    .split(/[.!?\n]+/)
    .filter(sentence => !AGE_BOILERPLATE.test(sentence))
    .join(". ");

  if (AGE_21.test(specific)) return "21+";
  if (AGE_18.test(specific)) return "18+";
  if (AGE_ALL.test(specific)) return "All Ages";
  return null;
}

// ===== RELEVANCE =====
// For calendars set to filter: "keywords" — only keep events about these topics
const RELEVANT = /\b(black|african[- ]american|afro\w*|afrikan|african|bsu|hip[- ]hop|rap|r&b|rnb|soul|neo[- ]soul|jazz|gospel|reggae|dancehall|amapiano|juneteenth|kwanzaa|diaspora|caribbean|haitian|nigerian|ghanaian|ethiopian|eritrean|somali|jamaican|hbcu|nsbe|nubian|melanin)\b/i;
// Phrases that contain a keyword but aren't about the topic
const FALSE_RELEVANT = /\b(black (hole|friday|box|belt|mold|ice|widow)s?|blackboard)\b/gi;

function isRelevant(...texts) {
  return RELEVANT.test(texts.filter(Boolean).join(" ").replace(FALSE_RELEVANT, ""));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fetch JSON with a timeout so one slow site can't hold up the whole refresh.
// 429 means "too many requests" — wait and try again (up to 3 tries).
// Ticket sites tack notes onto event names: "Rhye (6 and Over)", "YG (18+) (Rescheduled
// from 10/31/2026)". The age is already pulled out into its own badge, so drop the clutter.
const NAME_NOISE = /\s*[([](?:\d+\s*(?:and|&|\+)?\s*(?:over|up|older)|\d+\+|all ages|ages? \d+\+?|rescheduled[^)\]]*|postponed[^)\]]*|new date[^)\]]*|moved to[^)\]]*)[)\]]/gi;

function cleanName(name) {
  const cleaned = String(name || "").replace(NAME_NOISE, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || String(name || "").trim();
}

// Only https image links make it to the site
function safeImage(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

async function fetchJson(url, options = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
    if (res.status === 429 && attempt < 3) {
      await sleep(2000 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
    return res.json();
  }
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.text();
}

module.exports = {
  BAY_AREA, USER_AGENT, displayDate, displayTime, toLocalParts, todayLocal,
  parseAgeRestriction, isRelevant, fetchJson, fetchText, sleep, cleanName, safeImage,
};
