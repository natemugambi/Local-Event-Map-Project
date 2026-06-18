# The Gathering — Development Log

---

## Day 1 — June 3, 2026

### What We Did
- Reviewed the existing codebase (index.html, script.js, style.css)
- Identified key issues with the project
- Secured the Google Maps API key
- Set up a local development server using Python
- Rebuilt the entire UI from scratch with a nightlife theme
- Started planning the backend architecture

### Technical Issues
| Issue | How We Handled It |
|---|---|
| Google Maps API key was hardcoded and publicly exposed in the repo | Restricted the key in Google Cloud Console to localhost only, rotated to a new key |
| Opening index.html directly via file:// breaks Google Maps API restrictions | Switched to running a local Python server (python3 -m http.server 8000) so the domain is localhost |
| No separation between frontend and backend code | Created a /server folder to house all backend logic separately |
| node-fetch v3 incompatible with require() in CommonJS Node.js | Removed node-fetch entirely — Node v20 has fetch built in natively |

### Business Issues
| Issue | How We Handled It |
|---|---|
| App had no identity or branding | Adopted "The Gathering" as a working name, built UI around it |
| App was not targeting its audience visually | Redesigned with a nightlife color scheme (dark backgrounds, gold accents) to match the Black Bay Area 20s crowd |

### Decisions Made
- Map-first layout (no homepage) — users land directly on the map like Google Maps
- Event panel on the left, map on the right
- Sidebar layout on desktop, stacked layout on mobile
- "The Gathering" as working app name

---

## Day 2 — June 4, 2026

### What We Did
- Connected the frontend to a Node.js/Express backend
- Attempted to integrate Eventbrite API for real event data
- Discovered Eventbrite deprecated their public search API
- Decided on a hybrid approach for event data
- Obtained Eventbrite and beginning Ticketmaster API setup

### Technical Issues
| Issue | How We Handled It |
|---|---|
| Eventbrite /v3/events/search/ endpoint returning 404 NOT_FOUND | Discovered Eventbrite shut down their public search API in 2023 — pivoting to Ticketmaster |
| Frontend could not call event APIs directly due to CORS | Built a Node/Express backend to act as a middleman — API keys stay on the server, never in the browser |
| .env file needed to keep API tokens out of the codebase | Created server/.env and added it to .gitignore |

### Business Issues
| Issue | How We Handled It |
|---|---|
| No single API covers the type of small, local, Black-centered events the app targets | Decided on a hybrid approach: Ticketmaster for larger events + a manual submission form for small/local events |
| Ticketmaster skews toward large venues, missing the community/nightlife events core to the app's identity | Submission form will allow local organizers (DJs, promoters, community hosts) to add their own events directly |
| Platforms where the target audience actually organizes (Partiful, Facebook Events, Instagram) have no public API | Manual curation + submission form is the workaround — also doubles as a community feature |

### Decisions Made
- Hybrid data approach: Ticketmaster API + manual event submissions
- Submissions will live on a separate page to avoid confusion with the map page
- A database (SQLite) will be added to store submitted events
- Submitted events will require approval before appearing on the map (moderation layer)
- Eventbrite dropped as a data source

### Still In Progress (carried to Day 3)
- [x] Ticketmaster API integration
- [ ] Event submission form (separate page)
- [ ] SQLite database setup
- [ ] Moderation system for submitted events

---

## Day 3 — June 12, 2026

### What We Did
- Refined event categorization — mapped Ticketmaster genres (Hip-Hop/Rap, Trap, R&B, Soul, etc.) to app-specific categories: Hip-Hop & Rap, R&B & Soul, Festivals & Entertainment, Comedy & Arts, Community Gatherings
- Updated filter bar to reflect new categories
- Discussed moderation strategy for community-submitted events
- Set up SQLite database (better-sqlite3) for storing submitted events
- Built the event submission page (submit.html, submit.css, submit.js) — separate from the map page
- Added geocoding so organizers can enter a street address and it's converted to map coordinates
- Added backend endpoints: GET/POST /api/submitted-events and POST /api/submitted-events/:id/report
- Merged community-submitted events with Ticketmaster events on the map
- Added a "Community" badge and Report button on submitted events

### Business Issues
| Issue | How We Handled It |
|---|---|
| Manual moderation isn't sustainable — owner doesn't want to be a full-time moderator | Chose auto-publish model: submissions go live immediately, with a community Report button as the safety net |
| Worried about subjective "is this on-brand" criteria | Kept submission requirements structural (valid date, required fields, valid Bay Area address) rather than judgment-based |
| Risk of spam/inappropriate listings under auto-publish | Added a report_count field — events auto-hide after crossing a report threshold (currently 5) |

### Technical Issues
| Issue | How We Handled It |
|---|---|
| Needed persistent storage for submitted events without a separate DB server | Used better-sqlite3 — single file (events.db) inside /server |
| Submission form needs map coordinates from a human-entered address | Used Google Maps Geocoding API on the submission page to convert address → lat/lng before sending to backend |

### Decisions Made
- No manual moderation queue — auto-publish + community reporting instead
- Report threshold set to 5 reports before an event is auto-hidden (adjustable later)
- Submission page lives at submit.html, linked from the navbar ("+ Submit an Event")

---

## Upcoming Priorities
1. Test the submission flow end-to-end (form → database → map)
2. Consider rate-limiting submissions to prevent spam floods
3. Finalize app name and branding
4. Deploy backend (Railway or Render)
5. Deploy frontend and lock down API keys to live domain
