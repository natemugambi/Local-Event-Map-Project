const SERVER_URL = "https://local-event-map-project-production.up.railway.app";

const messageEl = document.getElementById("auth-message");

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `auth-message ${type}`;
}

// Show redirect message if coming from a protected page
const redirectMsg = document.getElementById("redirect-msg");
if (redirectMsg && new URLSearchParams(window.location.search).get("reason") === "auth") {
  redirectMsg.textContent = "Please log in to continue.";
  redirectMsg.classList.add("visible");
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
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem("tg_user", JSON.stringify({ username: data.username, token: data.token }));
      showMessage("Account created! Redirecting...", "success");
      setTimeout(() => window.location.href = "index.html", 1200);
    } catch (err) {
      showMessage(friendlyError(err), "error");
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

    const { username, password } = Object.fromEntries(new FormData(e.target));

    try {
      const res = await fetch(`${SERVER_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem("tg_user", JSON.stringify({ username: data.username, token: data.token }));
      showMessage("Logged in! Redirecting...", "success");
      setTimeout(() => window.location.href = "index.html", 1200);
    } catch (err) {
      showMessage(friendlyError(err), "error");
      btn.disabled = false;
      btn.textContent = "Log In";
    }
  });
}


// ===== FORGOT / RESET PASSWORD =====
// reset-password.html shows the email form normally, and the new-password form
// when opened from the emailed link (?token=...)
const resetToken = new URLSearchParams(window.location.search).get("token");
if (resetToken) {
  // Remove the one-time code from the address bar and browser history
  history.replaceState(null, "", window.location.pathname);
}

const forgotForm = document.getElementById("forgot-form");
if (forgotForm && resetToken) {
  document.getElementById("forgot-card").hidden = true;
  document.getElementById("reset-card").hidden = false;
}

if (forgotForm) {
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("forgot-btn");
    btn.disabled = true;
    try {
      const res = await fetch(`${SERVER_URL}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: document.getElementById("email").value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Same message whether or not the email has an account
      showMessage("If an account uses that email, a reset link is on its way. Check your inbox and spam folder.", "success");
    } catch (err) {
      showMessage(friendlyError(err), "error");
      btn.disabled = false;
    }
  });
}

const resetForm = document.getElementById("reset-form");
if (resetForm) {
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("reset-btn");
    const message = document.getElementById("reset-message");
    btn.disabled = true;
    try {
      const res = await fetch(`${SERVER_URL}/api/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: document.getElementById("password").value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.removeItem("tg_user");
      message.textContent = "Password updated! Taking you to log in...";
      message.className = "auth-message success";
      setTimeout(() => window.location.href = "login.html", 1500);
    } catch (err) {
      message.textContent = friendlyError(err);
      message.className = "auth-message error";
      btn.disabled = false;
    }
  });
}

// ===== VERIFY EMAIL =====
const verifyResult = document.getElementById("verify-result");
if (verifyResult) {
  (async () => {
    const heading = document.querySelector("#verify-card h2");
    try {
      const res = await fetch(`${SERVER_URL}/api/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      heading.textContent = "Email confirmed ✓";
      verifyResult.textContent = "You're all set — you can now post events.";
      verifyResult.className = "auth-message success";
    } catch (err) {
      heading.textContent = "Couldn't confirm your email";
      verifyResult.textContent = friendlyError(err);
      verifyResult.className = "auth-message error";
    }
  })();
}
