require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { pool, initDB } = require("./db");
const { startCollector, getEvents } = require("./collector");

const app = express();
app.disable("x-powered-by"); // don't advertise that we run Express
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.SESSION_SECRET;
const REPORT_THRESHOLD = 5;
const DAILY_SUBMISSION_LIMIT = 5; // per user, rolling 24 hours
const HOURLY_REPORT_LIMIT = 5; // per user and per IP, rolling hour
const AGE_OPTIONS = ["All Ages", "18+", "21+"];

// Email (Resend). Until RESEND_API_KEY is set in Railway, emails are skipped and
// email verification isn't enforced, so nobody gets locked out before it's set up.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_ENABLED = Boolean(RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || "The Spot <no-reply@findthespot.net>";
const SITE_URL = process.env.SITE_URL || "https://findthespot.net";

// Railway sits one proxy hop in front of us — trust it so req.ip is the visitor's real IP
app.set("trust proxy", 1);

// Per-IP rate limiter factory — counts requests from one IP over a time window
function ipLimiter(windowMs, limit, message, options = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: message },
    ...options,
  });
}

// Signup: stops one person mass-creating accounts to dodge per-user limits
const signupLimiter = ipLimiter(60 * 60 * 1000, 5, "Too many accounts created from this network. Try again later.");
// Login: slows down password guessing
// (only failed attempts count, so people sharing wifi don't lock each other out)
const loginLimiter = ipLimiter(15 * 60 * 1000, 10, "Too many login attempts. Try again in a few minutes.", { skipSuccessfulRequests: true });
// Submissions: backstop on top of the per-user daily limit
const submitLimiter = ipLimiter(24 * 60 * 60 * 1000, 10, "Too many events submitted from this network today. Try again tomorrow.");
// Emails: stops anyone using the site to spam someone's inbox
const emailLimiter = ipLimiter(60 * 60 * 1000, 5, "Too many email requests. Try again later.");

app.use(cors({
  origin: [
    "https://findthespot.net",
    "https://www.findthespot.net",
    "https://local-event-map-project.mnate576-1f2.workers.dev",
    "https://visionary-florentine-ca7743.netlify.app",
    "http://localhost:8000",
  ],
  credentials: true,
}));
app.use(express.json());

// ===== AUTH MIDDLEWARE =====
// Login tokens carry the user's token_version ("tv"). Bumping it in the database
// signs out every device at once. Tokens issued before this existed count as 0.
function signToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, tv: user.token_version || 0 },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Extracts user from the JWT token in the Authorization header, and checks the
// account still exists and the token hasn't been revoked
async function authenticateToken(req, res, next) {
  req.user = null;
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return next();

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return next();
  }

  const result = await pool.query(
    `SELECT username, token_version, email_verified FROM users WHERE id = $1`,
    [decoded.userId]
  );
  const account = result.rows[0];
  if (account && (decoded.tv || 0) === account.token_version) {
    req.user = { userId: decoded.userId, username: account.username, emailVerified: account.email_verified };
  }
  next();
}

// Use on all routes
app.use(authenticateToken);

// Require login — use on protected routes
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "You must be logged in" });
  next();
}

// ===== EVENTS ENDPOINT =====
// Events from Ticketmaster, SeatGeek, Eventbrite and calendar feeds, collected in the
// background every 30 minutes (see collector/). Any ?keyword= from older pages is ignored.
app.get("/api/events", async (req, res) => {
  res.json(await getEvents());
});

// ===== AUTH =====

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;

function passwordProblem(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 72)
    return "Password must be 8–72 characters";
  return null;
}

app.post("/api/signup", signupLimiter, async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: "All fields are required" });
  if (typeof username !== "string" || !USERNAME_PATTERN.test(username))
    return res.status(400).json({ error: "Username must be 3–30 characters: letters, numbers, _ . or -" });
  if (typeof email !== "string" || email.length > 254 || !email.includes("@"))
    return res.status(400).json({ error: "Please enter a valid email" });
  const passwordError = passwordProblem(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  // Emails are stored lowercase; usernames keep their capitalization for display
  // but must be unique ignoring case, so nobody can register "Nate" next to "nate"
  const normalizedEmail = email.trim().toLowerCase();
  const taken = await pool.query(
    `SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = $2`,
    [username, normalizedEmail]
  );
  if (taken.rows.length) return res.status(409).json({ error: "Username or email already taken" });

  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, token_version`,
      [username, normalizedEmail, hashed]
    );
    const token = signToken(result.rows[0]);
    // A failed email shouldn't fail the signup — they can resend from the Account page
    sendVerificationEmail(result.rows[0].id, normalizedEmail).catch(err => console.error("Verification email failed:", err));
    res.status(201).json({ username, token });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "Username or email already taken" });
    console.error("Signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password)
    return res.status(400).json({ error: "Username and password are required" });

  const result = await pool.query(`SELECT * FROM users WHERE LOWER(username) = LOWER($1)`, [username]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid username or password" });

  res.json({ username: user.username, token: signToken(user) });
});

app.get("/api/me", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in" });
  const result = await pool.query(`SELECT username, email, email_verified FROM users WHERE id = $1`, [req.user.userId]);
  const me = result.rows[0];
  res.json({
    username: me.username,
    email: me.email,
    userId: req.user.userId,
    email_verified: me.email_verified,
    verification_required: EMAIL_ENABLED && !me.email_verified,
  });
});

// ===== ACCOUNT =====

// Sign out every device: old tokens stop matching the new token_version
app.post("/api/logout-all", requireAuth, async (req, res) => {
  await pool.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [req.user.userId]);
  res.json({ success: true });
});

// Changing the password also signs out every other device; this one gets a fresh token
app.post("/api/change-password", requireAuth, loginLimiter, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (typeof current_password !== "string" || !current_password)
    return res.status(400).json({ error: "Enter your current password" });
  const passwordError = passwordProblem(new_password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.userId]);
  const user = result.rows[0];
  if (!(await bcrypt.compare(current_password, user.password)))
    return res.status(401).json({ error: "Current password is incorrect" });

  const hashed = await bcrypt.hash(new_password, 10);
  const updated = await pool.query(
    `UPDATE users SET password = $1, token_version = token_version + 1 WHERE id = $2
     RETURNING id, username, token_version`,
    [hashed, user.id]
  );
  res.json({ success: true, token: signToken(updated.rows[0]) });
});

// Permanently delete the account, its events, and its reports (password required)
app.delete("/api/account", requireAuth, loginLimiter, async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || !password)
    return res.status(400).json({ error: "Enter your password to confirm" });

  const result = await pool.query(`SELECT password FROM users WHERE id = $1`, [req.user.userId]);
  if (!(await bcrypt.compare(password, result.rows[0].password)))
    return res.status(401).json({ error: "Password is incorrect" });

  // One transaction: either everything is deleted or nothing is
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM submitted_events WHERE user_id = $1`, [req.user.userId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [req.user.userId]); // reports + links cascade
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ success: true });
});

// Always gives the same answer, so this can't be used to find out who has an account
app.post("/api/forgot-password", emailLimiter, async (req, res) => {
  if (!EMAIL_ENABLED)
    return res.status(503).json({ error: "Password reset isn't available yet. Please try again later." });
  const { email } = req.body || {};
  if (typeof email !== "string" || !email.includes("@"))
    return res.status(400).json({ error: "Please enter a valid email" });

  const result = await pool.query(`SELECT id, email FROM users WHERE LOWER(email) = $1`, [email.trim().toLowerCase()]);
  const user = result.rows[0];
  if (user) {
    const token = await createAuthToken(user.id, "reset", "1 hour");
    const link = `${SITE_URL}/reset-password.html?token=${token}`;
    // Errors are logged, not returned — a different response would reveal the account exists
    await sendEmail(user.email, "Reset your password for The Spot", `
      <p>Someone asked to reset the password for your account on The Spot.</p>
      <p><a href="${link}">Choose a new password</a></p>
      <p>This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email.</p>`)
      .catch(err => console.error("Reset email failed:", err));
  }
  res.json({ success: true });
});

app.post("/api/reset-password", loginLimiter, async (req, res) => {
  const { token, password } = req.body || {};
  const passwordError = passwordProblem(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const userId = await consumeAuthToken(token, "reset");
  if (!userId) return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });

  // Clicking the emailed link also proves they own the email; signs out all devices
  const hashed = await bcrypt.hash(password, 10);
  await pool.query(
    `UPDATE users SET password = $1, token_version = token_version + 1, email_verified = true WHERE id = $2`,
    [hashed, userId]
  );
  res.json({ success: true });
});

app.post("/api/verify-email", async (req, res) => {
  const userId = await consumeAuthToken(req.body?.token, "verify");
  if (!userId) return res.status(400).json({ error: "This verification link is invalid or has expired. You can send a new one from your Account page." });
  await pool.query(`UPDATE users SET email_verified = true WHERE id = $1`, [userId]);
  res.json({ success: true });
});

app.post("/api/resend-verification", requireAuth, emailLimiter, async (req, res) => {
  if (!EMAIL_ENABLED) return res.status(503).json({ error: "Email isn't available yet. Please try again later." });
  if (req.user.emailVerified) return res.status(400).json({ error: "Your email is already verified" });
  const result = await pool.query(`SELECT email FROM users WHERE id = $1`, [req.user.userId]);
  await sendVerificationEmail(req.user.userId, result.rows[0].email);
  res.json({ success: true });
});

// ===== SUBMITTED EVENTS =====

app.get("/api/submitted-events", async (req, res) => {
  // Past events drop off the map automatically; NULL dates (old rows) still show
  const result = await pool.query(
    // Only the fields the map displays — never user_id or report counts
    `SELECT id, name, category, date, time, city, venue, lat, lng, url, event_date, age_restriction
     FROM submitted_events
     WHERE report_count < $1
       AND (event_date IS NULL OR event_date >= CURRENT_DATE)
     ORDER BY event_date ASC NULLS LAST`,
    [REPORT_THRESHOLD]
  );
  res.json(result.rows);
});

app.post("/api/submitted-events", requireAuth, submitLimiter, async (req, res) => {
  if (EMAIL_ENABLED && !req.user.emailVerified) {
    return res.status(403).json({ error: "Please verify your email before posting events. Check your inbox, or resend the link from your Account page." });
  }

  const { name, category, date, time, city, venue, lat, lng, url, event_date, age_restriction } = req.body;

  if (!name || !category || !date || !time || !city || !venue || lat == null || lng == null || !age_restriction) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!AGE_OPTIONS.includes(age_restriction)) {
    return res.status(400).json({ error: "Age restriction must be All Ages, 18+ or 21+" });
  }

  if (url && !isSafeUrl(url)) {
    return res.status(400).json({ error: "Event link must start with http:// or https://" });
  }

  if (event_date && event_date < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: "Event date can't be in the past" });
  }

  // Rate limit: cap submissions per user over a rolling 24-hour window
  const recent = await pool.query(
    `SELECT COUNT(*) FROM submitted_events
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [req.user.userId]
  );
  if (parseInt(recent.rows[0].count) >= DAILY_SUBMISSION_LIMIT) {
    return res.status(429).json({
      error: `You've reached the limit of ${DAILY_SUBMISSION_LIMIT} events per day. Try again tomorrow.`,
    });
  }

  const result = await pool.query(
    `INSERT INTO submitted_events (name, category, date, time, city, venue, lat, lng, url, user_id, event_date, age_restriction)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [name, category, date, time, city, venue, lat, lng, url || null, req.user.userId, event_date || null, age_restriction]
  );

  res.status(201).json({ id: result.rows[0].id });
});

app.get("/api/my-events", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM submitted_events WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.userId]
  );
  res.json(result.rows);
});

app.delete("/api/submitted-events/:id", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT * FROM submitted_events WHERE id = $1`, [req.params.id]);
  const event = result.rows[0];
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.user_id !== req.user.userId)
    return res.status(403).json({ error: "You can only delete your own events" });

  await pool.query(`DELETE FROM submitted_events WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

app.put("/api/submitted-events/:id", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT * FROM submitted_events WHERE id = $1`, [req.params.id]);
  const event = result.rows[0];
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.user_id !== req.user.userId)
    return res.status(403).json({ error: "You can only edit your own events" });

  const { name, category, date, time, city, venue, lat, lng, url, event_date, age_restriction } = req.body;

  if (url && !isSafeUrl(url)) {
    return res.status(400).json({ error: "Event link must start with http:// or https://" });
  }

  if (age_restriction !== undefined && !AGE_OPTIONS.includes(age_restriction)) {
    return res.status(400).json({ error: "Age restriction must be All Ages, 18+ or 21+" });
  }

  await pool.query(
    `UPDATE submitted_events SET name=$1, category=$2, date=$3, time=$4, city=$5, venue=$6, lat=$7, lng=$8, url=$9, event_date=$10, age_restriction=$11 WHERE id=$12`,
    [name || event.name, category || event.category, date || event.date, time || event.time,
     city || event.city, venue || event.venue, lat || event.lat, lng || event.lng,
     url !== undefined ? url : event.url, event_date || event.event_date,
     age_restriction || event.age_restriction, req.params.id]
  );

  res.json({ success: true });
});

// Per-IP cap on reports, so one person can't hide events by rotating through accounts
const reportLimiter = ipLimiter(60 * 60 * 1000, HOURLY_REPORT_LIMIT, "Too many reports. Try again later.");

app.post("/api/submitted-events/:id/report", requireAuth, reportLimiter, async (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  if (!Number.isInteger(eventId)) return res.status(400).json({ error: "Invalid event id" });

  const result = await pool.query(`SELECT user_id FROM submitted_events WHERE id = $1`, [eventId]);
  const event = result.rows[0];
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.user_id === req.user.userId)
    return res.status(400).json({ error: "You can't report your own event" });

  // Per-user cap, in case one account switches networks to dodge the IP limit
  const recent = await pool.query(
    `SELECT COUNT(*) FROM event_reports
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [req.user.userId]
  );
  if (parseInt(recent.rows[0].count) >= HOURLY_REPORT_LIMIT)
    return res.status(429).json({ error: "Too many reports. Try again later." });

  // Record the report and bump the count in one statement; a repeat report inserts nothing
  const inserted = await pool.query(
    `WITH new_report AS (
       INSERT INTO event_reports (user_id, event_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING event_id
     )
     UPDATE submitted_events SET report_count = report_count + 1
     WHERE id IN (SELECT event_id FROM new_report)`,
    [req.user.userId, eventId]
  );
  if (inserted.rowCount === 0)
    return res.status(409).json({ error: "You've already reported this event" });

  res.json({ success: true });
});

// ===== HELPERS =====
const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");

// Creates a single-use link token; any older link of the same kind stops working
async function createAuthToken(userId, purpose, lifetime) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(`DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = $2`, [userId, purpose]);
  await pool.query(
    `INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, NOW() + $4::interval)`,
    [hashToken(token), userId, purpose, lifetime]
  );
  return token;
}

// Uses up a link token (deleting it so it can't be reused); returns the user id or null
async function consumeAuthToken(token, purpose) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
  const result = await pool.query(
    `DELETE FROM auth_tokens WHERE token_hash = $1 AND purpose = $2 AND expires_at > NOW() RETURNING user_id`,
    [hashToken(token), purpose]
  );
  return result.rows[0]?.user_id || null;
}

async function sendEmail(to, subject, html) {
  if (!EMAIL_ENABLED) {
    if (process.env.NODE_ENV !== "production") console.log(`[email skipped — no RESEND_API_KEY] To: ${to} | ${subject}\n${html}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  if (!response.ok) throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
}

async function sendVerificationEmail(userId, email) {
  if (!EMAIL_ENABLED) return;
  const token = await createAuthToken(userId, "verify", "24 hours");
  const link = `${SITE_URL}/verify-email.html?token=${token}`;
  await sendEmail(email, "Confirm your email for The Spot", `
    <p>Welcome to The Spot! Confirm this is your email so you can post events:</p>
    <p><a href="${link}">Confirm my email</a></p>
    <p>This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>`);
}

function isSafeUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (e) {
    return false;
  }
}

// ===== ERROR HANDLING =====
// Unknown routes get a plain JSON 404 instead of Express's default HTML page
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Catch-all for any error a route throws. The real details go to the Railway
// logs only; visitors get a generic message so nothing about the server leaks.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid request" });
  }
  console.error(`Error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

// ===== START SERVER =====
async function start() {
  await initDB();
  startCollector();
  app.listen(PORT, () => {
    console.log(`The Spot server running on http://localhost:${PORT}`);
  });
}

start();
