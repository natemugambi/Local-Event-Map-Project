# Backend — The Gathering API

Node.js + Express server. Proxies Ticketmaster (keeping the API key off the browser), manages accounts with JWT auth, and stores community-submitted events in PostgreSQL.

## Setup

```bash
npm install
node index.js    # → http://localhost:3000
```

Requires a `.env` file in this folder (never committed — see `.gitignore`):

| Variable | Purpose |
|---|---|
| `TICKETMASTER_KEY` | Ticketmaster Discovery API consumer key |
| `SESSION_SECRET` | Secret used to sign JWT tokens |
| `DATABASE_URL` | PostgreSQL connection string (Railway provides this in production) |
| `PORT` | Optional, defaults to 3000 |

In production these are set as Railway service variables, not a `.env` file.

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/events?keyword=` | — | Bay Area events from Ticketmaster, genre-mapped to app categories |
| POST | `/api/signup` | — | Create account → returns `{ username, token }` |
| POST | `/api/login` | — | Log in → returns `{ username, token }` |
| GET | `/api/me` | token | Current user from the token |
| GET | `/api/submitted-events` | — | Community events: not expired, under the report threshold |
| POST | `/api/submitted-events` | token | Create event (rate-limited: 5 per rolling 24h; past dates rejected) |
| GET | `/api/my-events` | token | All of the caller's own events, including expired |
| PUT | `/api/submitted-events/:id` | token | Edit own event |
| DELETE | `/api/submitted-events/:id` | token | Delete own event |
| POST | `/api/submitted-events/:id/report` | — | Report an event; auto-hidden at 5 reports |

"token" = send `Authorization: Bearer <jwt>` header. Tokens are issued on login/signup and expire after 7 days.

## Database Schema

**users** — `id`, `username` (unique), `email` (unique), `password` (bcrypt hash), `created_at`

**submitted_events** — `id`, `name`, `category`, `date` (display text), `event_date` (real DATE, used for expiry), `time`, `city`, `venue`, `lat`, `lng`, `url`, `report_count`, `user_id` → users, `created_at`

Tables are created (and the `event_date` column added) automatically at startup by `db.js` — no manual migration step.

## Key Design Decisions

- **JWT over cookie sessions** — frontend (Netlify) and backend (Railway) are on different domains; browsers block cross-site cookies, so identity travels in the `Authorization` header instead
- **PostgreSQL over SQLite** — Railway's filesystem is wiped on each deploy; SQLite lost all data. Postgres runs as a separate persistent service
- **Auto-publish + reports over a moderation queue** — no human bottleneck; structural validation (required fields, geocodable address, future date) plus community reporting
- **Two date columns** — `date` is human display text; `event_date` is a real DATE the database can compare for expiry. Machine format in storage, human format at display time
