const SERVER_URL = "https://local-event-map-project-production.up.railway.app";

// Must be logged in to see this page
const stored = localStorage.getItem("tg_user");
if (!stored) window.location.href = "login.html?reason=auth";
const user = stored ? JSON.parse(stored) : null;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${user.token}`,
  };
}

function showMessage(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `auth-message ${type}`;
}

// Login no longer valid (expired, logged out everywhere, or account deleted)
function sendToLogin() {
  localStorage.removeItem("tg_user");
  window.location.href = "login.html?reason=auth";
}

// Send a request and turn any non-OK response into an Error with the server's message
async function api(path, options) {
  const res = await fetch(`${SERVER_URL}${path}`, { headers: authHeaders(), ...options });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/change-password" && path !== "/api/account") sendToLogin();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// ===== PROFILE =====
async function loadAccount() {
  try {
    const me = await api("/api/me");
    document.getElementById("account-username").textContent = me.username;
    document.getElementById("account-email").textContent = me.email;
    document.getElementById("verify-banner").hidden = !me.verification_required;
  } catch (err) {
    document.getElementById("account-username").textContent = "Couldn't load your account";
    console.error("Failed to load account:", err);
  }
}

if (user) loadAccount();

document.getElementById("resend-btn").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try {
    await api("/api/resend-verification", { method: "POST" });
    showMessage("verify-message", "Sent! Check your inbox (and spam folder).", "success");
  } catch (err) {
    showMessage("verify-message", friendlyError(err), "error");
    e.target.disabled = false;
  }
});

// ===== CHANGE PASSWORD =====
document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("password-btn");
  btn.disabled = true;
  try {
    const data = await api("/api/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: document.getElementById("current-password").value,
        new_password: document.getElementById("new-password").value,
      }),
    });
    // Other devices are now logged out; keep this one logged in with the new token
    localStorage.setItem("tg_user", JSON.stringify({ ...user, token: data.token }));
    user.token = data.token;
    e.target.reset();
    showMessage("password-message", "Password updated. Other devices have been logged out.", "success");
  } catch (err) {
    showMessage("password-message", friendlyError(err), "error");
  }
  btn.disabled = false;
});

// ===== LOG OUT EVERYWHERE =====
document.getElementById("logout-all-btn").addEventListener("click", async (e) => {
  if (!confirm("Log out on every device, including this one?")) return;
  e.target.disabled = true;
  try {
    await api("/api/logout-all", { method: "POST" });
    localStorage.removeItem("tg_user");
    window.location.href = "login.html";
  } catch (err) {
    showMessage("logout-all-message", friendlyError(err), "error");
    e.target.disabled = false;
  }
});

// ===== DELETE ACCOUNT =====
document.getElementById("delete-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!confirm("Delete your account and all your events forever? This can't be undone.")) return;
  const btn = document.getElementById("delete-btn");
  btn.disabled = true;
  try {
    await api("/api/account", {
      method: "DELETE",
      body: JSON.stringify({ password: document.getElementById("delete-password").value }),
    });
    localStorage.removeItem("tg_user");
    alert("Your account has been deleted.");
    window.location.href = "index.html";
  } catch (err) {
    showMessage("delete-message", friendlyError(err), "error");
    btn.disabled = false;
  }
});
