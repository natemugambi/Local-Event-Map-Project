// ===== CONFIG =====
const SERVER_URL = "https://local-event-map-project-production.up.railway.app";

let map;
let markers = [];
let areaCircles = []; // shaded areas for approximate-location events
let activeCard = null;
let infoWindow = null;     // one shared popup, moved to whichever event is open
let clusterer = null;      // groups nearby pins into numbered circles
let hoverRing = null;      // ring shown on the map while hovering a card
let topZ = 100;            // raises the open event's pin above others at the same venue
let currentFilter = "All";  // category button
let currentWhen = "any";     // date button: any / today / weekend / week
let searchText = "";         // search box
let updatedAt = null;        // when the server last refreshed its events
let allEvents = [];

// One color per category — used for pins, the legend, card labels and photo placeholders
const CATEGORY_COLORS = {
  "Hip-Hop & Rap": "#c9a84c",
  "R&B & Soul": "#e0708f",
  "Festivals & Entertainment": "#3fb6a8",
  "Comedy & Arts": "#9b7be0",
  "Community Gatherings": "#5b9bd5",
};
const categoryColor = category => CATEGORY_COLORS[category] || "#c9a84c";

// ===== INIT MAP =====
function initMap() {
  const bayArea = { lat: 37.789, lng: -122.35 };

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center: bayArea,
    clickableIcons: false, // disable Google's own POI popups — only our event pins are interactive
    // Keep the map clean: zoom buttons only (no Map/Satellite toggle, Street View or fullscreen)
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,

    styles: [
      { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#888888" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c2c" }] },
      { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212121" }] },
      { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3a3a" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
      { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#444444" }] },
      { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1f1f1f" }] },
      { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1a2a1a" }] },
      { featureType: "transit", elementType: "geometry", stylers: [{ color: "#222222" }] },
      { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#333333" }] },
      { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
      { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
      // Hide Google's own icons (stores, parks, attractions, transit, highway shields)
      // so event pins are the only colorful things on the map
      { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
      { featureType: "poi.business", stylers: [{ visibility: "off" }] },
      { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
      { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    ],
  });

  infoWindow = new google.maps.InfoWindow({ pixelOffset: new google.maps.Size(0, -12) });
  hoverRing = new google.maps.Marker({
    clickable: false,
    zIndex: 9999,
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 18, fillOpacity: 0, strokeColor: "#ffffff", strokeWeight: 3 },
  });
  clusterer = new markerClusterer.MarkerClusterer({
    map,
    // Stop grouping once zoomed in to street level
    algorithm: new markerClusterer.SuperClusterAlgorithm({ radius: 60, maxZoom: 14 }),
    renderer: { render: renderCluster },
  });
  addLegend();

  // Clicking anywhere on the map (not on a pin) clears the current selection
  map.addListener("click", clearSelection);

  setupFilters();
  loadEvents();
  setupNav();
}

// ===== NAV AUTH STATE =====
// localStorage is only a hint (anyone can edit it in devtools), so we show it
// immediately to avoid flicker, then ask the server who the token really belongs to.
async function setupNav() {
  const stored = localStorage.getItem("tg_user");
  let user = null;
  try {
    user = stored ? JSON.parse(stored) : null;
  } catch {
    localStorage.removeItem("tg_user");
  }

  if (!user || !user.token) {
    renderNav(null);
    return;
  }
  renderNav(user.username);

  try {
    const res = await fetch(`${SERVER_URL}/api/me`, {
      headers: { "Authorization": `Bearer ${user.token}` },
    });
    if (res.status === 401) {
      // Expired or tampered token — log them out locally
      localStorage.removeItem("tg_user");
      renderNav(null);
    } else if (res.ok) {
      // Trust the server's (signed) username over whatever is in localStorage
      const me = await res.json();
      renderNav(me.username);
    }
    // Other failures (server down): keep the optimistic display; API calls still verify the token
  } catch (error) {
    console.error("Could not verify login:", error);
  }
}

function renderNav(username) {
  const navAuth = document.getElementById("nav-auth");

  if (username) {
    // Account links live in one dropdown so the bar stays uncluttered
    navAuth.innerHTML = `
      <a href="submit.html" class="submit-link">+ Host an Event</a>
      <div class="user-menu">
        <button class="user-menu-btn" id="user-menu-btn" aria-haspopup="true" aria-expanded="false">
          <span class="user-avatar"></span><span class="nav-username"></span><span class="caret">▾</span>
        </button>
        <div class="user-menu-list" id="user-menu-list" hidden>
          <a href="my-events.html">My Events</a>
          <a href="account.html">Account</a>
          <button id="logout-btn">Log Out</button>
        </div>
      </div>
    `;
    // textContent never interprets HTML, so the username can't inject markup
    navAuth.querySelector(".nav-username").textContent = username;
    navAuth.querySelector(".user-avatar").textContent = username.charAt(0).toUpperCase();

    const btn = document.getElementById("user-menu-btn");
    const list = document.getElementById("user-menu-list");
    const setOpen = open => { list.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", e => { e.stopPropagation(); setOpen(list.hidden); });
    document.addEventListener("click", e => { if (!list.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });

    document.getElementById("logout-btn").addEventListener("click", () => {
      localStorage.removeItem("tg_user");
      window.location.reload();
    });
  } else {
    navAuth.innerHTML = `
      <a href="submit.html" class="nav-host-link">+ Host an Event</a>
      <a href="login.html" class="nav-login-link">Log In</a>
      <a href="signup.html" class="submit-link">Sign Up</a>
    `;
  }
}

// ===== FETCH EVENTS FROM BACKEND =====
async function loadEvents() {
  const eventList = document.getElementById("event-list");
  eventList.innerHTML = `<p style="color:#666; text-align:center; padding: 40px 20px; font-size:14px;">Loading events...</p>`;

  try {
    // Events the server collects from Ticketmaster, SeatGeek, Eventbrite and calendars
    // (search keywords live in server/collector/sources.js), plus community-submitted events
    const [collectedEvents, submittedEvents, status] = await Promise.all([
      fetch(`${SERVER_URL}/api/events`).then(r => r.json()),
      fetch(`${SERVER_URL}/api/submitted-events`).then(r => r.json()).catch(() => []),
      fetch(`${SERVER_URL}/api/collector-status`).then(r => r.json()).catch(() => ({})),
    ]);
    updatedAt = status.updatedAt ? new Date(status.updatedAt) : null;

    // Mark submitted events so we can show a "Community" badge + report button
    const taggedSubmitted = submittedEvents.map(e => ({ ...e, submitted: true }));

    // The server already removes duplicates between its sources; this only catches a
    // community post that repeats a collected event. Name + date, so multi-night runs stay.
    const seen = new Set();
    allEvents = [...taggedSubmitted, ...collectedEvents].filter(e => {
      const key = `${e.name.toLowerCase()}|${e.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    applyFilters();
  } catch (error) {
    console.error("Failed to load events:", error);
    eventList.innerHTML = `<p style="color:#888; text-align:center; padding: 40px 20px; font-size:14px;">Events are temporarily unavailable. Please try again shortly.</p>`;
  }
}

// ===== DATES =====
// "YYYY-MM-DD" for today in the Bay Area, whatever the visitor's own time zone
function todayYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

// Collected events carry "start" ("2026-11-20T20:00"); community events carry event_date
function eventYmd(event) {
  const raw = event.start || event.event_date || "";
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

// "8:00 PM" -> "20:00", so community events sort among collected ones
function eventHm(event) {
  if (event.start && event.start.length > 10) return event.start.slice(11, 16);
  const m = String(event.time || "").match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i);
  if (!m) return "99:99"; // unknown times go last in their day
  const h = (Number(m[1]) % 12) + (m[3].toLowerCase() === "p" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${m[2] || "00"}`;
}

const sortKey = event => `${eventYmd(event) || "9999-99-99"}T${eventHm(event)}`;

const dayNumber = ymd => Math.round(Date.parse(`${ymd}T12:00:00Z`) / 86400000);
const weekday = ymd => new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = Sunday

// Which heading an event goes under in the list
function dateGroup(ymd, today) {
  if (!ymd) return "Date TBA";
  const daysAway = dayNumber(ymd) - dayNumber(today);
  const toNextMonday = ((8 - weekday(today)) % 7) || 7;
  if (daysAway <= 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  if (daysAway < toNextMonday) return [5, 6, 0].includes(weekday(ymd)) ? "This Weekend" : "This Week";
  if (daysAway < toNextMonday + 7) return "Next Week";
  if (ymd.slice(0, 7) === today.slice(0, 7)) {
    return `Later in ${new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}`;
  }
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ===== MAP PIECES =====
function pinIcon(color, approximate) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 9,
    fillColor: color,
    fillOpacity: approximate ? 0.35 : 1, // faded pin = approximate area
    strokeColor: "#0d0d0d",
    strokeWeight: 2,
  };
}

// A group of nearby pins: drawn like a regular pin (slightly bigger) with the count
// inside, in the color of the most common category in the group
function renderCluster({ count, position, markers: grouped }) {
  const tally = {};
  for (const m of grouped) {
    const color = m.getIcon()?.fillColor;
    tally[color] = (tally[color] || 0) + 1;
  }
  const color = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || "#c9a84c";

  return new google.maps.Marker({
    position,
    zIndex: 1000 + count,
    label: { text: String(count), color: "#0d0d0d", fontSize: "11px", fontWeight: "700" },
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 11 + Math.min(count, 20) / 5, // 11–15, a little bigger than a single pin (9)
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#0d0d0d",
      strokeWeight: 2,
    },
  });
}

// Color key in the corner of the map. Built with textContent — no HTML strings.
function addLegend() {
  const legend = document.createElement("div");
  legend.className = "map-legend";
  for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
    const row = document.createElement("div");
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = color;
    row.append(dot, document.createTextNode(category));
    legend.appendChild(row);
  }
  map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(legend);
}

// Placeholder shown when an event has no photo (or the photo fails to load)
function photoPlaceholder(color) {
  return `<div class="photo-placeholder" style="--cat:${color}"><span>✦</span></div>`;
}

// ===== RENDER EVENTS =====
function renderEvents(eventsToRender) {
  const eventList = document.getElementById("event-list");
  eventList.innerHTML = "";

  // Clear old markers and areas
  clusterer.clearMarkers();
  markers = [];
  areaCircles.forEach(c => c.setMap(null));
  areaCircles = [];
  closeActiveInfoWindow();
  hoverRing.setMap(null);
  activeCard = null;

  if (eventsToRender.length === 0) {
    eventList.innerHTML = `<p style="color:#666; text-align:center; padding: 40px 20px; font-size:14px;">No events match your filters.</p>`;
    return;
  }

  const today = todayYmd();
  let lastGroup = null;
  let section = null; // each date group gets its own section, so its heading sticks only while it's on screen

  eventsToRender.forEach(function (event, index) {
    // Escape every field once up front — event data comes from users/APIs and must never be treated as HTML
    const safe = {
      category: escapeHtml(event.category),
      name: escapeHtml(event.name),
      date: escapeHtml(event.date),
      time: escapeHtml(event.time),
      venue: escapeHtml(event.venue),
      city: escapeHtml(event.city),
      url: safeUrl(event.url),
      image: safeUrl(event.image),
      id: escapeHtml(event.id),
    };
    const color = categoryColor(event.category); // fixed value from CATEGORY_COLORS
    const price = Number.isFinite(event.price_min) ? `From $${Math.round(event.price_min)}` : "";
    const position = { lat: event.lat, lng: event.lng };

    // --- DATE HEADING ---
    const group = dateGroup(eventYmd(event), today);
    if (group !== lastGroup) {
      section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.className = "date-group";
      heading.textContent = group;
      section.appendChild(heading);
      eventList.appendChild(section);
      lastGroup = group;
    }

    // Host chose to hide the exact address: the server only sends a rounded point,
    // so we shade the general area and say so instead of implying an exact spot
    const approximate = Boolean(event.location_approximate);
    const where = approximate
      ? `Approximate area · ${safe.city}`
      : `${safe.venue}, ${safe.city}`;
    if (approximate) {
      areaCircles.push(new google.maps.Circle({
        map,
        center: position,
        radius: 800,
        fillColor: color,
        fillOpacity: 0.12,
        strokeColor: color,
        strokeOpacity: 0.5,
        strokeWeight: 1,
        clickable: false,
      }));
    }

    // --- MARKER (added to the clusterer, which decides when it's shown) ---
    const marker = new google.maps.Marker({
      position,
      title: event.name,
      icon: pinIcon(color, approximate),
    });

    // --- POPUP ---
    const popup = `
      <div class="popup">
        ${safe.image ? `<img class="popup-photo" src="${safe.image}" alt="" />` : ""}
        <div class="popup-body">
          <div class="popup-top">
            <div class="popup-category" style="color:${color}">${safe.category}${event.submitted ? " · Community" : ""}</div>
            ${ageBadge(event.age_restriction)}
          </div>
          <div class="popup-name">${safe.name}</div>
          <div class="popup-meta">📅 ${safe.date} · ${safe.time}</div>
          <div class="popup-meta">📍 ${where}</div>
          ${approximate ? `<div class="popup-note">Exact address shared by the host</div>` : ""}
          ${price ? `<div class="popup-meta">🎟️ ${price}</div>` : ""}
          <div class="popup-actions">
            ${safe.url ? `<a href="${safe.url}" target="_blank" rel="noopener noreferrer" class="popup-link">${event.submitted ? "Event Link ↗" : "View Tickets ↗"}</a>` : ""}
            ${event.submitted ? `<button class="report-btn" data-id="${safe.id}">Report</button>` : ""}
          </div>
        </div>
      </div>
    `;

    function openPopup() {
      closeActiveInfoWindow();
      marker.setZIndex(++topZ); // several shows at one venue share a spot — put this one on top
      infoWindow.setContent(popup);
      infoWindow.setPosition(position);
      infoWindow.open({ map });
      google.maps.event.addListenerOnce(infoWindow, "domready", () => {
        const btn = document.querySelector(`.report-btn[data-id="${CSS.escape(String(event.id))}"]`);
        if (btn) btn.addEventListener("click", () => reportEvent(event.id, btn));
        const photo = document.querySelector(".popup-photo");
        if (photo) photo.addEventListener("error", () => photo.remove());
      });
      setActiveCard(index);
    }

    marker.addListener("click", openPopup);
    // Pin <-> card: hovering a pin lights up its card
    marker.addListener("mouseover", () => card.classList.add("linked"));
    marker.addListener("mouseout", () => card.classList.remove("linked"));

    markers.push(marker);

    // --- EVENT CARD ---
    const card = document.createElement("div");
    card.className = "event-card";
    card.dataset.index = index;
    card.style.setProperty("--cat", color);

    // Cards only show an age when the event states one; "Check venue" lives in the popup
    const cardAge = ["All Ages", "18+", "21+"].includes(event.age_restriction) ? ageBadge(event.age_restriction) : "";

    card.innerHTML = `
      <div class="event-card-photo">
        ${safe.image ? `<img src="${safe.image}" alt="" loading="lazy" />` : photoPlaceholder(color)}
        ${cardAge ? `<div class="photo-age">${cardAge}</div>` : ""}
      </div>
      <div class="event-card-body">
        <div class="event-card-category">${safe.category}${event.submitted ? " · Community" : ""}</div>
        <h3>${safe.name}</h3>
        <div class="event-card-meta">
          <span><span class="icon">📅</span>${safe.date} · ${safe.time}</span>
          <span><span class="icon">📍</span>${where}</span>
        </div>
        <div class="event-card-footer">
          ${safe.url ? `<a href="${safe.url}" target="_blank" rel="noopener noreferrer" class="event-card-link">${event.submitted ? "Event Link ↗" : "View Tickets ↗"}</a>` : "<span></span>"}
          ${price ? `<span class="event-card-price">${price}</span>` : ""}
        </div>
      </div>
    `;

    const img = card.querySelector(".event-card-photo img");
    if (img) img.addEventListener("error", () => { img.outerHTML = photoPlaceholder(color); });

    card.addEventListener("click", function () {
      map.panTo(position);
      if (map.getZoom() < 15) map.setZoom(15);
      openPopup();
    });

    // Card -> pin: a ring marks the spot on the map, even when the pin is inside a group
    card.addEventListener("mouseenter", () => {
      hoverRing.setPosition(position);
      hoverRing.setIcon({ ...hoverRing.getIcon(), strokeColor: color });
      hoverRing.setMap(map);
    });
    card.addEventListener("mouseleave", () => hoverRing.setMap(null));

    const cardLink = card.querySelector(".event-card-link");
    if (cardLink) {
      cardLink.addEventListener("click", (e) => e.stopPropagation());
    }

    section.appendChild(card);
  });

  clusterer.addMarkers(markers);
}

// ===== FILTERS (category + date + search, all combined) =====
function setupFilters() {
  const filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach(btn => {
    // Color dot matching the pins, so the buttons double as a key
    if (btn.dataset.filter !== "All") {
      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.background = categoryColor(btn.dataset.filter);
      btn.prepend(dot);
    }
    btn.addEventListener("click", function () {
      filterBtns.forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      currentFilter = this.dataset.filter;
      applyFilters();
    });
  });

  const whenBtns = document.querySelectorAll(".when-btn");
  whenBtns.forEach(btn => btn.addEventListener("click", function () {
    whenBtns.forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    currentWhen = this.dataset.when;
    applyFilters();
  }));

  // Wait until typing pauses briefly before re-drawing the list and map
  let typingTimer;
  document.getElementById("event-search").addEventListener("input", e => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      searchText = e.target.value.trim().toLowerCase();
      applyFilters();
    }, 150);
  });

  // Keep "updated X min ago" current while the page stays open
  setInterval(updateSummary, 60 * 1000);
}

// Is this event inside the chosen date range?
function matchesWhen(event, today) {
  if (currentWhen === "any") return true;
  const ymd = eventYmd(event);
  if (!ymd) return false;
  const daysAway = dayNumber(ymd) - dayNumber(today);
  if (currentWhen === "today") return daysAway === 0;
  if (currentWhen === "week") return daysAway >= 0 && daysAway < 7;
  // This weekend: the coming (or current) Friday–Sunday
  const toSunday = (7 - weekday(today)) % 7;
  return daysAway >= 0 && daysAway <= toSunday && [5, 6, 0].includes(weekday(ymd));
}

let shownCount = 0;

function applyFilters() {
  const today = todayYmd();
  const words = searchText.split(/\s+/).filter(Boolean);
  const filtered = allEvents.filter(e => {
    if (currentFilter !== "All" && e.category !== currentFilter) return false;
    if (!matchesWhen(e, today)) return false;
    // Every typed word must appear somewhere in the name, venue, city or category
    const haystack = `${e.name} ${e.venue} ${e.city} ${e.category}`.toLowerCase();
    return words.every(w => haystack.includes(w));
  });
  shownCount = filtered.length;
  renderEvents(filtered);
  updateSummary();
}

// "82 events · updated 5 min ago" (or "12 of 82 events" while filtering)
function updateSummary() {
  const el = document.getElementById("list-summary");
  if (!el || !allEvents.length) return;
  const total = allEvents.length;
  const count = shownCount === total ? `${total} events` : `${shownCount} of ${total} events`;
  let ago = "";
  if (updatedAt) {
    const mins = Math.max(0, Math.round((Date.now() - updatedAt) / 60000));
    ago = mins < 1 ? " · updated just now" : mins < 60 ? ` · updated ${mins} min ago` : ` · updated ${Math.round(mins / 60)} hr ago`;
  }
  el.textContent = count + ago;
}

// ===== HELPERS =====
function setActiveCard(index) {
  if (activeCard !== null) {
    const prev = document.querySelector(`.event-card[data-index="${activeCard}"]`);
    if (prev) prev.classList.remove("active");
  }
  activeCard = index;
  const current = document.querySelector(`.event-card[data-index="${index}"]`);
  if (current) {
    current.classList.add("active");
    current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function clearSelection() {
  closeActiveInfoWindow();
  hoverRing.setMap(null);
  if (activeCard !== null) {
    const card = document.querySelector(`.event-card[data-index="${activeCard}"]`);
    if (card) card.classList.remove("active");
    activeCard = null;
  }
}

function closeActiveInfoWindow() {
  if (infoWindow) infoWindow.close();
}

// ===== REPORT EVENT =====
async function reportEvent(id, btn) {
  const stored = localStorage.getItem("tg_user");
  const user = stored ? JSON.parse(stored) : null;
  if (!user) {
    // Reporting requires an account — send them to log in and come back
    window.location.href = "login.html?reason=auth";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Reporting...";
  try {
    const res = await fetch(`${SERVER_URL}/api/submitted-events/${encodeURIComponent(id)}/report`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${user.token}` },
    });

    if (res.ok || res.status === 409) {
      btn.textContent = "Reported";
    } else if (res.status === 401) {
      // Token expired — clear it and ask them to log in again
      localStorage.removeItem("tg_user");
      window.location.href = "login.html?reason=auth";
    } else {
      const data = await res.json().catch(() => ({}));
      btn.textContent = data.error || "Couldn't report";
      if (res.status !== 429 && res.status !== 400) btn.disabled = false;
    }
  } catch (error) {
    console.error("Failed to report event:", error);
    btn.textContent = "Couldn't report";
    btn.disabled = false;
  }
}
