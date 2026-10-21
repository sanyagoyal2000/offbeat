# Offbeat: features and user journeys

Status: 20 Oct 2026. For setup, configuration, the Qloo usage and the LOLA notes, see `README.md`.

**Legend**
- **Real**: working logic with persisted data.
- **Computed**: derived by code from the sample catalog.
- **Qloo**: live Qloo data, with an honest fallback.
- **Demo**: simulated and labelled as such.

## Journeys that work end to end

| # | Journey | Path |
| --- | --- | --- |
| 1 | Browse → details → reserve → ticket | `/` → `/events/[id]` → `/events/[id]/book` → `/tickets/[id]` → `/tickets` |
| 2 | Search in plain language | "pottery this Sunday under 1500" → editable chips → results, or an empty state with Wish and Save search |
| 3 | Save and plan with friends | Save → Add to board → share the link → vote → group budget and dates → suggestions |
| 4 | Optional personalisation | `/taste` → live Qloo search → interests saved → Home ordered by taste with reasons |
| 5 | Planner | `/plan` → up to 3 feasible options → revise (cheaper, closer, earlier, later, different, replace, dinner) → choose tickets |
| 6 | Wish → proposal → reserve | `/wishes/new` → review → save → organizer proposes → status, plus inbox → reserve the proposed event |
| 7 | Organizer | `/organizer` → create or edit event → publish → demand clusters → propose → audience → promotion experiment → report |
| 8 | Movies | `/movies` → film page → showtime → seats on a seat map → review → ticket with seat numbers |
| 9 | Theatre | Event → Choose tickets → seat map (stalls/balcony or studio) → review → ticket |
| 10 | Organizer sign-in | `/organizer` → sign in or sign up → workspace → sign out |
| 11 | Travel | Pick any city worldwide → local time zone and currency, or an honest "no listings" state |

## Feature status

| Area | Feature | Status |
| --- | --- | --- |
| Catalog | 34 fictional events, 361 sessions with fixed IDs and dates (17 Oct – 27 Dec 2026), 3 cities, each with its own time zone and currency | Demo data, labelled "Sample listing" |
| Home | Search parser, categories, Tonight, Tomorrow and weekend shortcuts, calendar, budget including fees, party size, time of day, sort | Real |
| Home | Taste ordering with per-card reasons | Qloo (falls back to date order) |
| Home | Promo card | Real, from running experiments |
| Event page | Category sections, sessions, tiers, availability, fees, policies, organizer, taste data disclosure | Computed |
| Movies | Real films (Qloo facts and posters) at fictional cinemas, showtimes by cinema and date | Qloo data plus demo schedule |
| Seating | Seat maps, best available, one section per booking, server-side seat holds, cancel frees seats | Real (demo reservation) |
| Organizer accounts | Sign up/in/out, hashed passwords, sessions, throttling, demo accounts | Real |
| Booking | Availability recheck, idempotency, no overselling, refresh-safe confirmation, cancellation | Real (demo reservation, no payment) |
| Tickets | List, detail, PNG export, QR containing the reservation ID (not valid for entry) | Real |
| Saved | Saved events, saved searches | Real |
| Boards | Create, share, vote, constraints, shortlist, group suggestions | Real when storage is shared; labelled "preview" in memory mode |
| Taste | Entity search, disambiguation, notes, genre tags, skip | Qloo |
| Planner | Constraint engine, labels only when supported, blockers, revisions, sell-out simulation | Computed (the simulation is labelled Demo) |
| Wishes | Create, review, edit, withdraw, compatible groups, proposals | Real; seeded wishes are counted separately as "sample" |
| Organizer | Event CRUD with reservation-safe edits, publish, Qloo mappings on save | Real |
| Organizer | Demand clusters, "this crowd also loves", audience estimate | Real and Qloo |
| Organizer | Reporting: views, promo impressions, clicks, saves, reservations | Real (paid bookings shown as unavailable) |
| Promotion | 4 grounded variants, previews, adaptive allocation, logged probabilities, learning status | Real (LOLA-inspired) |
| Promotion | 1,000-visitor simulation | Demo, kept in separate counters |
| Profile | Home and explore locations, notification settings, in-app inbox | Real; nothing is sent externally |

## Tests

70 Vitest tests cover:
- date and budget enforcement;
- party-size seats;
- availability and reservation consistency (including concurrency);
- refresh-safe saved data;
- search parsing;
- Qloo fallback and the direct vs approximate mapping record;
- wish grouping and the separation of real and sample counts;
- bandit allocation, the small-sample rule, copy validation and impression logging;
- simulated vs real separation;
- organizer inventory rules and proposals;
- time zones (including DST), 12-hour clock formatting and currencies;
- seat maps, seat validation and seat holds;
- organizer accounts and sessions.
