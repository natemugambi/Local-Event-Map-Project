const SERVER_URL = "https://local-event-map-project-production.up.railway.app";

// Get stored auth data
function getAuth() {
  const stored = localStorage.getItem("tg_user");
  return stored ? JSON.parse(stored) : null;
}

// Get auth headers for API calls
function authHeaders() {
  const auth = getAuth();
  const headers = { "Content-Type": "application/json" };
  if (auth && auth.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
  }
  return headers;
}

function isLoggedIn() {
  return !!getAuth();
}

function logout() {
  localStorage.removeItem("tg_user");
  window.location.href = "index.html";
}
