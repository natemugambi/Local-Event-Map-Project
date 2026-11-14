const SERVER_URL = "https://local-event-map-project-production.up.railway.app";

let geocoder;

// Called by Google Maps script once loaded
function initGeocoder() {
  geocoder = new google.maps.Geocoder();
}

// Don't allow picking past dates
document.getElementById("date").min = new Date().toISOString().slice(0, 10);

// Redirect to login with message if not logged in
function checkAuth() {
  const user = localStorage.getItem("tg_user");
  if (!user) window.location.href = "login.html?reason=auth";
}
checkAuth();

// Don't allow picking past dates
document.getElementById("date").min = new Date().toISOString().slice(0, 10);

// ===== FORM SUBMIT =====
document.getElementById("submit-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const submitBtn = document.getElementById("submit-btn");
  const formMessage = document.getElementById("form-message");
  const addressInput = document.getElementById("address");

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";
  formMessage.textContent = "";
  formMessage.className = "";

  try {
    // Geocode the address into lat/lng
    const coords = await geocodeAddress(addressInput.value);

    const formData = new FormData(e.target);
    const stored = JSON.parse(localStorage.getItem("tg_user"));
    const payload = {
      name: formData.get("name"),
      category: formData.get("category"),
      age_restriction: formData.get("age_restriction"),
      date: formatDate(formData.get("date")),
      event_date: formData.get("date"),
      time: formatTime(formData.get("time")),
      city: formData.get("city"),
      venue: formData.get("venue"),
      lat: coords.lat,
      lng: coords.lng,
      url: formData.get("url") || null,
      location_approximate: document.getElementById("location_approximate").checked,
    };

    const headers = { "Content-Type": "application/json" };
    if (stored && stored.token) {
      headers["Authorization"] = `Bearer ${stored.token}`;
    }

    const response = await fetch(`${SERVER_URL}/api/submitted-events`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Submission failed");
    }

    formMessage.textContent = "Event submitted! It's live on the map now.";
    formMessage.className = "success";
    e.target.reset();
    document.getElementById("geocode-status").textContent = "";
  } catch (error) {
    formMessage.textContent = friendlyError(error);
    formMessage.className = "error";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Event";
  }
});

// ===== IMPORT FROM LINK =====
// The server reads the event page and returns what it found; we fill the form and the
// host checks everything (and adds anything missing) before submitting.
document.getElementById("import-btn").addEventListener("click", async () => {
  const btn = document.getElementById("import-btn");
  const status = document.getElementById("import-status");
  const link = document.getElementById("import-url").value.trim();
  if (!link) return;

  btn.disabled = true;
  status.textContent = "Reading the event page...";
  status.className = "field-hint";

  try {
    const stored = JSON.parse(localStorage.getItem("tg_user"));
    const res = await fetch(`${SERVER_URL}/api/import-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${stored.token}` },
      body: JSON.stringify({ url: link }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Only fill what was found; leave anything the host already typed
    const fill = (id, value) => { if (value) document.getElementById(id).value = value; };
    fill("name", data.name);
    fill("date", data.date);
    fill("time", data.time);
    fill("venue", data.venue);
    fill("city", data.city);
    fill("address", data.address);
    fill("url", data.url);
    if (data.age_restriction) document.getElementById("age_restriction").value = data.age_restriction;
    document.getElementById("location_approximate").checked = data.approximate;

    // Tell the host what still needs their attention
    const notes = ["Imported! Check every field before submitting."];
    if (data.date && data.date < new Date().toISOString().slice(0, 10)) notes.push("This event's date has already passed.");
    if (data.online) notes.push("This looks like an online event — the map is for in-person events.");
    if (data.approximate) notes.push("The address is private on that page: add it below. The map will only show an approximate area.");
    else if (!data.address) notes.push("Add the address below.");
    notes.push("Pick a category" + (data.age_restriction ? "." : " and age restriction."));
    status.textContent = notes.join(" ");
    // Green only when nothing beyond the usual checks needs attention
    status.className = notes.length > 2 ? "field-hint" : "field-hint success";
  } catch (err) {
    status.textContent = friendlyError(err, "Couldn't import that link. You can still fill in the form yourself.");
    status.className = "field-hint error";
  }
  btn.disabled = false;
});

// ===== GEOCODE ADDRESS TO LAT/LNG =====
function geocodeAddress(address) {
  const statusEl = document.getElementById("geocode-status");
  statusEl.textContent = "Locating address...";
  statusEl.className = "field-hint";

  return new Promise((resolve, reject) => {
    geocoder.geocode({ address: `${address}, Bay Area, CA` }, (results, status) => {
      if (status === "OK" && results[0]) {
        const location = results[0].geometry.location;
        statusEl.textContent = `Found: ${results[0].formatted_address}`;
        statusEl.className = "field-hint success";
        resolve({ lat: location.lat(), lng: location.lng() });
      } else {
        statusEl.textContent = "Could not locate this address. Please check it and try again.";
        statusEl.className = "field-hint error";
        reject(new Error("Could not locate that address. Please double check it."));
      }
    });
  });
}

// ===== HELPERS =====
// Convert "2026-06-20" -> "Sat, Jun 20"
function formatDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Convert "19:00" -> "7:00 PM"
function formatTime(timeStr) {
  const [hour, minute] = timeStr.split(":");
  const date = new Date();
  date.setHours(hour, minute);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
