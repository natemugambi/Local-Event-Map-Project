# The Spot — Goals

The single list of where The Spot is headed. Check items off as they ship; add new ones as they come up.
For *how* past decisions were made, see [DEVLOG.md](DEVLOG.md).

**Mission:** the go-to map for Black-centered events in the Bay Area, built for a 20s / college-age crowd —
open it, see what's happening tonight, know if you can get in.

---

## Now

- [ ] **Site changes** (next batch — list them here as they're decided)
- [ ] **Mobile-friendliness pass** — every page comfortable on a phone (map + list layout, popups, forms, tap targets)
- [ ] **App version** — The Spot is already installable as a PWA; decide whether to polish that or wrap it as a store app

## Next (launch polish)
- [ ] Partiful photos on import: find where Partiful hosts event images, then add the host to server/import-event.js + _headers
- [ ] Community & Comedy events: ticket sites have few — they will mostly come from community posts and calendar feeds

- [ ] Loading states and general polish across pages
- [ ] Migrate Google Maps loading to `loading=async` and `AdvancedMarkerElement` (current usage is deprecated but still works)
- [ ] Search box and date filtering on the map page
- [ ] Event detail pages with shareable links
- [ ] Email verification / password reset

## More event sources (collector is live — these switch on more sources)

- [x] **SeatGeek:** connected Nov 14, 2026 — adds ~10 events Ticketmaster doesn't have
- [ ] **Calendar feeds:** collect Luma / Google Calendar / org calendar links (Black Student Unions, cultural centers, promoters) and add them to `CALENDAR_FEEDS`
- [ ] Meetup — confirm whether its API needs a paid Pro plan before building
- [ ] Review queue for broad calendars (e.g. UC Berkeley's) — only trusted sources publish automatically today

## Growth

- [ ] Drive initial traffic — Instagram [@blackbayeventsz](https://www.instagram.com/blackbayeventsz/) linking to findthespot.net
- [ ] Get local organizers and promoters posting their own events (nightlife, cookouts, pop-ups), not just Ticketmaster pulls

## Later

- [ ] Organizer profiles and follower notifications
- [ ] More data sources for small events (partnerships with local promoters)
- [ ] Expansion beyond the Bay Area

## User account security — setup to finish

The code is live; these two steps (done by you in dashboards) switch on the email features.

- [ ] **Resend:** create an account, add + verify the `findthespot.net` domain (Resend shows DNS records to add in Cloudflare → DNS), create an API key, and add it in Railway → Variables as `RESEND_API_KEY`. Turns on password reset and email verification.
- [ ] **privacy@findthespot.net:** Cloudflare → Email → Email Routing → forward `privacy@findthespot.net` to your inbox (it's the contact address on the Privacy Policy)
- [ ] Have someone qualified review the Privacy Policy before the app-store launch

## Security follow-ups (optional — do when needed)

- [ ] Cloudflare Turnstile (invisible CAPTCHA) on signup — only if junk signups show up despite the rate limits
- [ ] Turn on HSTS in Cloudflare (SSL/TLS → Edge Certificates) once HTTPS is confirmed everywhere, including `www`
- [ ] Put the API behind Cloudflare (`api.findthespot.net`) so WAF and rate-limit rules protect the backend too
- [ ] Move rate-limit counters into the database if the backend ever runs on more than one server
- [ ] Delete unused `api.js`

---

## Done

- [x] Import from link on the submit form (Eventbrite via API, Luma, Partiful, Posh, DICE, RA, Meetup) + approximate-location option for house parties; Eventbrite token in Railway (Nov 2026)
- [x] Save events (♡), share links, add to calendar, Near me, link previews, community-event photos from imports, more search keywords (Nov 2026)
- [x] Map & list redesign: event photos, prices, date headings, category pin colors + legend, grouped pins, cleaner map, card/pin linking, tidier names, search + date filters, account menu (Nov 2026)
- [x] Event collector: Ticketmaster, SeatGeek and calendar feeds gathered every 30 min with duplicate removal; map loads in one request (Nov 2026)
- [x] User account security: case-insensitive usernames/emails, event list no longer exposes account IDs, change password, log out everywhere, password reset, email verification, account deletion, Privacy Policy page (Oct 2026)
- [x] Age restrictions on events — All Ages / 18+ / 21+ badges; Ticketmaster events show "Check venue" unless their listing states an age (Oct 2026)
- [x] Security audit fixes, issues #2–#7: XSS escaping, report-abuse protection, security headers/CSP, generic error messages, server-verified login display, per-IP rate limits + signup validation (Sept–Oct 2026)
- [x] Custom domain findthespot.net on Cloudflare Pages (Sept 2026)
- [x] Installable as a PWA, app icons, favicon, Instagram link in navbar (Sept 2026)
- [x] First mobile responsiveness pass (Sept 2026)
- [x] Ticket / event links on map cards and popups
- [x] Signup rate limiting per IP (closes the multi-account spam loophole)
- [x] Core app: Ticketmaster events, community submissions, accounts, My Events edit/delete, report auto-hide, auto-expiry of past events
