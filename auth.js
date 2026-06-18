const SERVER_URL = "https://local-event-map-project-production.up.railway.app";

const messageEl = document.getElementById("auth-message");

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `auth-message ${type}`;
}

// ===== SIGNUP =====
const signupForm = document.getElementById("signup-form");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("signup-btn");
    btn.disabled = true;
    btn.textContent = "Creating account...";

    const { username, email, password } = Object.fromEntries(new FormData(e.target));

    try {
      const res = await fetch(`${SERVER_URL}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showMessage("Account created! Redirecting...", "success");
      setTimeout(() => window.location.href = "index.html", 1200);
    } catch (err) {
      showMessage(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Create Account";
    }
  });
}

// ===== LOGIN =====
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("login-btn");
    btn.disabled = true;
    btn.textContent = "Logging in...";

    const { email, password } = Object.fromEntries(new FormData(e.target));

    try {
      const res = await fetch(`${SERVER_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showMessage("Logged in! Redirecting...", "success");
      setTimeout(() => window.location.href = "index.html", 1200);
    } catch (err) {
      showMessage(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Log In";
    }
  });
}
