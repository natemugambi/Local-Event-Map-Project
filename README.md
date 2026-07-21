# The Spot 🗺️✦

A map-first web app for discovering **Black-centered events in the San Francisco Bay Area**, aimed at people in their 20s. Larger events (concerts, shows, festivals) are pulled automatically from the Ticketmaster API; smaller community events — nightlife, cookouts, popups — are submitted directly by local organizers.

> Formerly "The Gathering" during early development.

## Live Site

| Piece | URL | Hosted on |
|---|---|---|
| Frontend | https://findthespot.net | Cloudflare Pages (custom domain) |
| Backend API | https://local-event-map-project-production.up.railway.app | Railway |

> Also reachable at local-event-map-project.mnate576-1f2.workers.dev (Cloudflare Pages default URL). Previously hosted on Netlify (visionary-florentine-ca7743.netlify.app); moved after free-tier credits ran out.

Both auto-deploy from this repo's `main` branch.

## Features

- **Map-first UI** — dark nightlife theme, event panel on the left, full-height Google Map on the right
- **Live event data** — Ticketmaster Discovery API, searched by keyword (afrobeats, R&B, hip hop, etc.) and mapped to app categories by genre
- **Category filters** — Hip-Hop & Rap, R&B & Soul, Festivals, Comedy & Arts, Community
- **Community submissions** — organizers create an account and post their own events; street addresses are geocoded to map pins automatically
- **Auto-publish with reporting** — no moderation queue; events go live instantly and auto-hide if they accumulate 5 reports
- **Accounts & My Events** — JWT-based auth; users edit and delete their own submissions
- **Auto-expiry** — community events drop off the map once their date passes
- **Rate limiting** — max 5 submissions per user per rolling 24 hours

## Architecture

```
Browser (Netlify: static HTML/CSS/JS)
   │
   ├── Google Maps JavaScript API  (map render + address geocoding)
   │
   └── Backend API (Railway: Node.js + Express)
          ├── Ticketmaster Discovery API  (large events, fetched live)
          └── PostgreSQL (Railway)        (users + community events)
```

The Ticketmaster key lives only on the backend. Auth uses JWT tokens in the
`Authorization` header (no cookies — frontend and backend are on different domains).

## Project Structure

```
├── index.html / style.css / script.js    Main map page
├── submit.html / submit.css / submit.js  Event submission form (login required)
├── login.html / signup.html              Auth pages
├── auth.css / auth.js                    Shared auth styling + logic
├── my-events.html / .css / .js           Manage your own events (edit/delete)
├── api.js                                Small shared API helpers
├── server/                               Backend — see server/README.md
└── DEVLOG.md                             Day-by-day build log: decisions, issues, fixes
```

## Running Locally

Two terminals:

```bash
# Terminal 1 — backend (see server/README.md for required .env)
cd server && npm install && node index.js     # → http://localhost:3000

# Terminal 2 — frontend
python3 -m http.server 8000                    # → http://localhost:8000
```

Note: the frontend `SERVER_URL` constants point at the production Railway API; for a fully local loop, change them to `http://localhost:3000`.

## Roadmap

**Near term (launch readiness)**
- [ ] Finalize the app name and buy a matching custom domain (also sidesteps the Safe Browsing false-positive on the Netlify subdomain)
- [ ] Favicon + general polish (loading states, mobile pass)
- [ ] Migrate Google Maps loading to `loading=async` and `AdvancedMarkerElement` (current usage is deprecated but functional)

**Medium term**
- [ ] Signup rate limiting per IP (closes the multi-account spam loophole)
- [ ] Search box and date filtering on the map page
- [ ] Event detail pages with shareable links
- [ ] Email verification / password reset

**Longer term**
- [ ] Organizer profiles and follower notifications
- [ ] More data sources for small events (partnerships with local promoters)
- [ ] Expansion beyond the Bay Area

See [DEVLOG.md](DEVLOG.md) for the full history of technical and product decisions.
