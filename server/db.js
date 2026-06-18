const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "events.db"));

// Create the table if it doesn't exist
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
