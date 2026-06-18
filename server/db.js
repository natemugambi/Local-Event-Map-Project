const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "events.db"));

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS submitted_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    city TEXT NOT NULL,
    venue TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    url TEXT,
    report_count INTEGER DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
