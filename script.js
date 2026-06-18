// ===== CONFIG =====
const SERVER_URL = "http://localhost:3000";

// Keywords to search — these pull Black-centered Bay Area events
const SEARCH_KEYWORDS = [
  "afrobeats",
  "R&B",
  "hip hop",
  "juneteenth",
];

let map;
let markers = [];
let activeCard = null;
let activeInfoWindow = null;
let currentFilter = "All";
let allEvents = [];

// ===== INIT MAP =====
function initMap() {
  const bayArea = { lat: 37.789, lng: -122.35 };

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center: bayArea,
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
    ],
  });

  setupFilters();
  loadEvents();
}

// ===== FETCH EVENTS FROM BACKEND =====
async function loadEvents() {
  const eventList = document.getElementById("event-list");
  eventList.innerHTML = `<p style="color:#666; text-align:center; padding: 40px 20px; font-size:14px;">Loading events...</p>`;

  try {
    // Fetch all keyword searches in parallel, plus community-submitted events
    const [keywordResults, submittedEvents] = await Promise.all([
      Promise.all(
        SEARCH_KEYWORDS.map(k => fetch(`${SERVER_URL}/api/events?keyword=${encodeURIComponent(k)}`).then(r => r.json()))
      ),
      fetch(`${SERVER_URL}/api/submitted-events`).then(r => r.json()).catch(() => []),
    ]);

    // Mark submitted events so we can show a "Community" badge + report button
    const taggedSubmitted = submittedEvents.map(e => ({ ...e, submitted: true }));

    // Merge and deduplicate by event name
    const seen = new Set();
    allEvents = [...taggedSubmitted, ...keywordResults.flat()].filter(e => {
      if (seen.has(e.name)) return false;
      seen.add(e.name);
      return true;
    });

    renderEvents(allEvents);
  } catch (error) {
    console.error("Failed to load events:", error);
    eventList.innerHTML = `<p style="color:#888; text-align:center; padding: 40px 20px; font-size:14px;">Could not load events. Is the server running?</p>`;
  }
}

// ===== RENDER EVENTS =====
function renderEvents(eventsToRender) {
  const eventList = document.getElementById("event-list");
  eventList.innerHTML = "";

  // Clear old markers
  markers.forEach(m => m.setMap(null));
  markers = [];

  if (eventsToRender.length === 0) {
    eventList.innerHTML = `<p style="color:#666; text-align:center; padding: 40px 20px; font-size:14px;">No events found for this category.</p>`;
    return;
  }

  eventsToRender.forEach(function (event, index) {
    // --- MARKER ---
    const marker = new google.maps.Marker({
      position: { lat: event.lat, lng: event.lng },
      map: map,
      title: event.name,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#c9a84c",
        fillOpacity: 1,
        strokeColor: "#0d0d0d",
        strokeWeight: 2,
      },
    });

    // --- INFO WINDOW ---
    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div style="background:#1a1a1a; color:#f0ece4; padding:12px 14px; border-radius:8px; min-width:180px; font-family:'Segoe UI',Arial,sans-serif;">
          <div style="font-size:11px; color:#c9a84c; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:4px;">${event.category}${event.submitted ? " · Community" : ""}</div>
          <div style="font-size:15px; font-weight:700; margin-bottom:8px;">${event.name}</div>
          <div style="font-size:12px; color:#aaa;">📅 ${event.date} · ${event.time}</div>
          <div style="font-size:12px; color:#aaa; margin-top:3px;">📍 ${event.venue}, ${event.city}</div>
          ${event.submitted ? `<button class="report-btn" data-id="${event.id}" style="margin-top:8px; background:none; border:1px solid #444; color:#888; font-size:11px; padding:4px 8px; border-radius:6px; cursor:pointer;">Report</button>` : ""}
        </div>
      `,
    });

    marker.addListener("click", function () {
      closeActiveInfoWindow();
      infoWindow.open(map, marker);
      activeInfoWindow = infoWindow;
      setActiveCard(index);
    });

    infoWindow.addListener("domready", () => {
      const btn = document.querySelector(`.report-btn[data-id="${event.id}"]`);
      if (btn) btn.addEventListener("click", () => reportEvent(event.id, btn));
    });

    markers.push(marker);

    // --- EVENT CARD ---
    const card = document.createElement("div");
    card.className = "event-card";
    card.dataset.index = index;

    card.innerHTML = `
      <div class="event-card-category">${event.category}${event.submitted ? " · Community" : ""}</div>
      <h3>${event.name}</h3>
      <div class="event-card-meta">
        <span><span class="icon">📅</span>${event.date} · ${event.time}</span>
        <span><span class="icon">📍</span>${event.venue}, ${event.city}</span>
      </div>
    `;

    card.addEventListener("click", function () {
      closeActiveInfoWindow();
      map.setCenter(marker.getPosition());
      map.setZoom(15);
      infoWindow.open(map, marker);
      activeInfoWindow = infoWindow;
      setActiveCard(index);
    });

    eventList.appendChild(card);
  });
}

// ===== FILTERS =====
function setupFilters() {
  const filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", function () {
      filterBtns.forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      currentFilter = this.dataset.filter;
      const filtered = currentFilter === "All"
        ? allEvents
        : allEvents.filter(e => e.category === currentFilter);
      renderEvents(filtered);
    });
  });
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

function closeActiveInfoWindow() {
  if (activeInfoWindow) {
    activeInfoWindow.close();
    activeInfoWindow = null;
  }
}

// ===== REPORT EVENT =====
async function reportEvent(id, btn) {
  btn.disabled = true;
  btn.textContent = "Reported";
  try {
    await fetch(`${SERVER_URL}/api/submitted-events/${id}/report`, { method: "POST" });
  } catch (error) {
    console.error("Failed to report event:", error);
  }
}
