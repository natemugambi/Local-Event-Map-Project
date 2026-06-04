// ===== EVENT DATA =====
const events = [
  {
    name: "Black Art Showcase",
    category: "Festivals & Entertainment",
    date: "Sat, Jun 14",
    time: "7:00 PM",
    city: "San Francisco",
    venue: "SOMArts Cultural Center",
    lat: 37.7749,
    lng: -122.4194,
  },
  {
    name: "Oakland Community Cookout",
    category: "Community Gatherings",
    date: "Sun, Jun 15",
    time: "2:00 PM",
    city: "Oakland",
    venue: "Defremery Park",
    lat: 37.8044,
    lng: -122.2712,
  },
  {
    name: "Afrobeats Night",
    category: "Festivals & Entertainment",
    date: "Fri, Jun 20",
    time: "10:00 PM",
    city: "San Francisco",
    venue: "August Hall",
    lat: 37.7849,
    lng: -122.4094,
  },
  {
    name: "Black Entrepreneurs Summit",
    category: "Conferences & Seminars",
    date: "Sat, Jun 21",
    time: "10:00 AM",
    city: "Oakland",
    venue: "Oakland Convention Center",
    lat: 37.8010,
    lng: -122.2650,
  },
];

let map;
let markers = [];
let activeCard = null;
let activeInfoWindow = null;
let currentFilter = "All";

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

  renderEvents(events);
  setupFilters();
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
          <div style="font-size:11px; color:#c9a84c; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:4px;">${event.category}</div>
          <div style="font-size:15px; font-weight:700; margin-bottom:8px;">${event.name}</div>
          <div style="font-size:12px; color:#aaa;">📅 ${event.date} · ${event.time}</div>
          <div style="font-size:12px; color:#aaa; margin-top:3px;">📍 ${event.venue}, ${event.city}</div>
        </div>
      `,
    });

    marker.addListener("click", function () {
      closeActiveInfoWindow();
      infoWindow.open(map, marker);
      activeInfoWindow = infoWindow;
      setActiveCard(index);
    });

    markers.push(marker);

    // --- EVENT CARD ---
    const card = document.createElement("div");
    card.className = "event-card";
    card.dataset.index = index;

    card.innerHTML = `
      <div class="event-card-category">${event.category}</div>
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
        ? events
        : events.filter(e => e.category === currentFilter);
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
