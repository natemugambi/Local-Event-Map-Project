const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create tables if they don't exist
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submitted_events (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      city TEXT NOT NULL,
      venue TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      url TEXT,
      report_count INTEGER DEFAULT 0,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Real calendar date for expiry checks — the "date" column is display text only
  await pool.query(`
    ALTER TABLE submitted_events ADD COLUMN IF NOT EXISTS event_date DATE
  `);

  // "All Ages", "18+" or "21+" — existing rows default to All Ages
  await pool.query(`
    ALTER TABLE submitted_events ADD COLUMN IF NOT EXISTS age_restriction TEXT NOT NULL DEFAULT 'All Ages'
  `);

  // Bumped to sign out every device at once (log out everywhere, password change)
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
  `);

  // Usernames and emails are unique regardless of capitalization ("Nate" = "nate").
  // If old accounts already collide, the index can't be built — log it and rely on
  // the signup check in index.js instead of crashing the server.
  for (const [name, column] of [["users_username_lower_idx", "username"], ["users_email_lower_idx", "email"]]) {
    try {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON users (LOWER(${column}))`);
    } catch (err) {
      console.warn(`Could not create ${name} (existing accounts differ only by capitalization):`, err.message);
    }
  }

  // Set once the user clicks the link in their verification (or password reset) email
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false
  `);

  // Single-use links for password reset and email verification. Only a SHA-256
  // hash of each link's token is stored, so a database leak can't be used to reset passwords.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // One row per (user, event) report — the primary key stops duplicate reports
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_reports (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL REFERENCES submitted_events(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, event_id)
    )
  `);

  console.log("Database tables ready");
}

module.exports = { pool, initDB };
