// ===== IMPORT FROM LINK =====
// A host pastes a link to their event (Eventbrite, Luma, Partiful, ...) and we read
// the details to pre-fill the submit form. They review everything before posting.
const { USER_AGENT, toLocalParts, parseAgeRestriction } = require("./collector/shared");

const EVENTBRITE_TOKEN = process.env.EVENTBRITE_TOKEN;

// Only these sites are fetched. Fetching any URL a user pastes would let someone make
// our server request internal addresses on Railway's network (SSRF).
const ALLOWED_HOSTS = ["eventbrite.com", "partiful.com", "lu.ma", "luma.com", "posh.vip", "dice.fm", "ra.co", "meetup.com"];
const MAX_BYTES = 3 * 1024 * 1024;

// Community-event photos are only accepted from these image servers (Eventbrite, Luma).
// Keep in sync with img-src in /_headers. Partiful's photo host isn't confirmed yet.
const COMMUNITY_IMAGE_HOSTS = ["img.evbuc.com", "cdn.evbuc.com", "images.lumacdn.com"];

function safeCommunityImage(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" && COMMUNITY_IMAGE_HOSTS.includes(u.hostname) && u.href.length <= 1000 ? u.href : null;
  } catch {
    return null;
  }
}

function isAllowedHost(hostname) {
  return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
}

// Follows redirects ourselves so every hop has to stay on an allowed site
async function fetchPage(startUrl) {
  let url = new URL(startUrl);
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" || !isAllowedHost(url.hostname)) throw new ImportError("That site isn't supported for import yet.");
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, "Accept": "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location"), url);
      continue;
    }
    if (!res.ok) throw new ImportError("Couldn't open that link. Is the event public?");
    if (Number(res.headers.get("content-length")) > MAX_BYTES) throw new ImportError("That page is too large to import.");
    return (await res.text()).slice(0, MAX_BYTES);
  }
  throw new ImportError("That link redirects too many times.");
}

// Errors whose message is safe and useful to show the host
class ImportError extends Error {}

const decodeEntities = s => String(s || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .trim();

// ISO date string ("2026-12-04T21:00:00-08:00" or "...Z") -> Bay Area { date, time }
function localDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return {};
  const { ymd, hm } = toLocalParts(d);
  return { date: ymd, time: hm };
}

// "1100 Franklin Street, Oakland, CA 94607" -> "Oakland"
function cityFrom(address) {
  const parts = String(address || "").split(",").map(s => s.trim()).filter(Boolean);
  const stateIdx = parts.findIndex(p => /^(CA|California)\b/i.test(p));
  if (stateIdx > 0) return parts[stateIdx - 1];
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

// ===== EVENTBRITE (official API, needs EVENTBRITE_TOKEN) =====
async function fromEventbriteApi(url) {
  const id = (url.pathname.match(/(\d{9,})\/?$/) || [])[1];
  if (!id || !EVENTBRITE_TOKEN) return null;
  const res = await fetch(`https://www.eventbriteapi.com/v3/events/${id}/?expand=venue`, {
    headers: { Authorization: `Bearer ${EVENTBRITE_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null; // fall back to reading the page
  const e = await res.json();
  const venue = e.venue || {};
  const address = venue.address || {};
  return {
    name: e.name?.text,
    date: e.start?.local?.slice(0, 10),
    time: e.start?.local?.slice(11, 16),
    venue: venue.name,
    address: [address.address_1, address.city].filter(Boolean).join(", "),
    city: address.city,
    online: Boolean(e.online_event),
    description: e.description?.text,
    image: e.logo?.original?.url || e.logo?.url,
  };
}

// ===== STRUCTURED DATA (schema.org Event — Luma, Eventbrite, Posh, DICE, ...) =====
function fromJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
    .flat().filter(Boolean).flatMap(x => x["@graph"] || [x]);
  const e = blocks.find(x => /Event/.test([].concat(x["@type"]).join(" ")));
  if (!e) return null;

  const loc = [].concat(e.location || [])[0] || {};
  const addr = loc.address;
  const street = addr?.streetAddress || "";
  const address = typeof addr === "string"
    ? addr
    : (addr?.addressLocality && !street.includes(addr.addressLocality) ? [street, addr.addressLocality] : [street]).filter(Boolean).join(", ");
  return {
    name: decodeEntities(e.name),
    ...localDateTime(e.startDate),
    venue: decodeEntities(loc.name),
    address: decodeEntities(address),
    city: decodeEntities(addr?.addressLocality || cityFrom(address)),
    online: /Online/i.test(e.eventAttendanceMode || "") || /Virtual/i.test(loc["@type"] || ""),
    description: decodeEntities(e.description),
    image: [].concat(e.image || [])[0]?.url || [].concat(e.image || [])[0],
  };
}

// ===== PARTIFUL (page data; the address stays hidden until guests RSVP) =====
function fromPartiful(html) {
  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!raw) return null;
  let event;
  try { event = JSON.parse(raw[1]).props?.pageProps?.event; } catch { return null; }
  if (!event?.title) return null;

  const maps = event.locationInfo?.mapsInfo || {};
  const address = (maps.addressLines || []).join(", ");
  return {
    name: event.title,
    ...localDateTime(event.startDate),
    venue: maps.name || "",
    address,
    city: cityFrom(address) || cityFrom(maps.approximateLocation) || (maps.approximateLocation || "").split(",")[0],
    approximate: !address, // no public address -> suggest showing only an approximate area
    description: event.description,
  };
}

// ===== FALLBACK: link-preview tags (title and description only) =====
function fromOpenGraph(html) {
  const meta = name => decodeEntities((html.match(new RegExp(`<meta[^>]+(?:property|name)="${name}"[^>]+content="([^"]*)"`, "i")) || [])[1]);
  const title = meta("og:title").replace(/\s*[|·]\s*(Partiful|Luma|Eventbrite|Posh|DICE|Meetup)\s*$/i, "");
  return title ? { name: title, description: meta("og:description"), image: meta("og:image") } : null;
}

async function importEvent(link) {
  let url;
  try { url = new URL(String(link).trim()); } catch { throw new ImportError("That doesn't look like a link."); }
  if (url.protocol !== "https:" || !isAllowedHost(url.hostname))
    throw new ImportError("Import works with Eventbrite, Luma, Partiful, Posh, DICE, Resident Advisor and Meetup links.");

  let found = null;
  if (url.hostname.endsWith("eventbrite.com")) found = await fromEventbriteApi(url);
  if (!found) {
    const html = await fetchPage(url);
    found = fromJsonLd(html) || fromPartiful(html) || fromOpenGraph(html);
    // Structured data sometimes has no photo while the link-preview tags do
    if (found && !found.image) found.image = fromOpenGraph(html)?.image;
  }
  if (!found?.name) throw new ImportError("Couldn't find event details on that page. You can still fill in the form yourself.");

  // Only plain text, trimmed to the form's limits
  const clean = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  return {
    name: clean(found.name, 200),
    date: /^\d{4}-\d{2}-\d{2}$/.test(found.date || "") ? found.date : "",
    time: /^\d{2}:\d{2}$/.test(found.time || "") ? found.time : "",
    venue: clean(found.venue, 120),
    address: clean(found.address, 200),
    city: clean(found.city, 60),
    url: url.href,
    age_restriction: parseAgeRestriction([found.name, found.description]),
    approximate: Boolean(found.approximate),
    online: Boolean(found.online),
    image: safeCommunityImage(found.image),
  };
}

module.exports = { importEvent, ImportError, isAllowedHost, safeCommunityImage };
