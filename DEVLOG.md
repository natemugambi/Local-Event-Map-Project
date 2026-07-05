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

## Day 4 — June 17–18, 2026 (Deployment)

### What We Did
- Fixed Geocoding API (needed enabling in Google Cloud + adding to key restrictions)
- Tested submission flow end-to-end locally
- Pushed all code to GitHub
- Deployed backend to Railway, frontend to Netlify — site went live
- Restricted CORS to the Netlify domain + localhost

### Technical Issues
| Issue | How We Handled It |
|---|---|
| Geocoder rejecting valid addresses | Geocoding API is separate from Maps JavaScript API — enabled it and added to key's allowed APIs |
| Railway crashed: "secret option required for sessions" | SESSION_SECRET env var wasn't set on Railway — added it |
| Chrome flagged the new Netlify domain as "Dangerous site" | False positive on new domains — submitted a Safe Browsing review request to Google |

### Business Issues
| Issue | How We Handled It |
|---|---|
| Chrome warning scares away any potential user | Waiting on Google review; considered a custom domain as a longer-term fix |

---

## Day 5 — June 18–19, 2026 (User Accounts)

### What We Did
- Added user accounts: signup, login, logout (bcrypt password hashing + sessions)
- New pages: signup.html, login.html with shared auth.css/auth.js
- Navbar shows username + Log Out when signed in; Log In / Sign Up when not
- Login switched from email to username per owner preference
- Unauthenticated visitors to the submit page get redirected to login with a message

### Technical Issues
| Issue | How We Handled It |
|---|---|
| Session cookies blocked between Netlify and Railway (different domains) | Interim workaround: stored login state in localStorage (later replaced by JWT) |
| SQLite database wiped on every Railway redeploy — accounts kept disappearing | Root cause: Railway's filesystem is ephemeral. Led to PostgreSQL migration |

---

## Day 6 — June 25, 2026 (PostgreSQL + My Events)

### What We Did
- Migrated the database from SQLite to Railway-hosted PostgreSQL — data now persists across deploys
- Removed the temporary /api/users debug endpoint (was publicly exposing usernames/emails)
- Built the My Events page: users can view, edit (modal), and delete their own submissions
- Added "My Events" link to the navbar when logged in

### Technical Issues
| Issue | How We Handled It |
|---|---|
| Railway deploy crashed with ECONNREFUSED to Postgres | Env vars weren't linking — used Railway's "connect a database" flow to properly link DATABASE_URL |
| Backend couldn't verify who was logged in (cookie issue persisted) | Temporarily passed user_id in request bodies — insecure, flagged for proper fix |

### Business Issues
| Issue | How We Handled It |
|---|---|
| Users couldn't manage their own events after submitting | My Events page with edit/delete — decided accounts (not anonymous edit-links) were the cleaner model |

---

## Day 7 — July 4–5, 2026 (Proper Auth + Billing Fix)

### What We Did
- Replaced the localStorage/user_id workaround with JWT token-based authentication
  - Backend signs a token on login/signup; frontend sends it in the Authorization header
  - Protected routes verify the token server-side — user identity can no longer be faked
  - Removed express-session entirely; no cookies needed across domains
- Tested end-to-end on the live site: submit, edit, delete all working
- Fixed map outage: BillingNotEnabledMapError — Google Cloud free trial had expired, suspending the account. Reactivated billing (free tier still covers all usage at this scale) and set up the account properly

### Technical Issues
| Issue | How We Handled It |
|---|---|
| Cross-domain cookies fundamentally unreliable (third-party cookie blocking) | JWT in Authorization header — the standard pattern for split frontend/backend hosting |
| Google Maps stopped loading on the live site | Free trial expiry closed the billing account — restored services, added a card |

---

## Current Status: LIVE
- Frontend: visionary-florentine-ca7743.netlify.app (Netlify, auto-deploys from GitHub)
- Backend: local-event-map-project-production.up.railway.app (Railway + PostgreSQL)

## Upcoming Priorities
1. Auto-expire community events whose date has passed (map goes stale otherwise)
2. Rate-limit submissions (e.g. max per user per day) to prevent spam floods
3. Custom domain — looks legit, may sidestep the Chrome warning entirely
4. Finalize app name and branding ("The Gathering" is a placeholder)
5. Polish: favicon, loading states, mobile testing, async Maps loading, AdvancedMarkerElement migration
6. Waiting on Google: Safe Browsing review to clear the "dangerous site" flag
