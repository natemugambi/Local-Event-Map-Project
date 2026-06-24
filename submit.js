const SERVER_URL = "https://local-event-map-project-production.up.railway.app";

let geocoder;

// Called by Google Maps script once loaded
function initGeocoder() {
  geocoder = new google.maps.Geocoder();
}

// Redirect to login with message if not logged in
function checkAuth() {
  const user = localStorage.getItem("tg_user");
  if (!user) window.location.href = "login.html?reason=auth";
}
checkAuth();

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
      date: formatDate(formData.get("date")),
      time: formatTime(formData.get("time")),
      city: formData.get("city"),
      venue: formData.get("venue"),
      lat: coords.lat,
      lng: coords.lng,
      url: formData.get("url") || null,
      user_id: stored ? stored.userId : null,
    };

    const response = await fetch(`${SERVER_URL}/api/submitted-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    formMessage.textContent = error.message || "Something went wrong. Please try again.";
    formMessage.className = "error";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Event";
  }
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
