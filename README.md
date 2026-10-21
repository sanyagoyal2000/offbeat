# Offbeat

Find experiences that fit your taste, wherever you are, and help organizers discover demand for their next event.

Offbeat is a discovery and booking app for shows, films, classes, treks, meetups and more. Qloo adds cultural relevance for attendees and audience insight for organizers, and a LOLA-inspired experiment layer picks which promotional wording to show.

> **Photos:** event photos are illustrative, freely licensed images from Wikimedia Commons (credited on each event page and at `/credits`); they weren't taken at these fictional events. Film posters and details come from Qloo.
>
> **Demo status:** all listings are fictional sample data in three cities (Bengaluru, London, New York). Reservations are demo holds: no payment is taken and no real inventory is held. No email, SMS or push messages are ever sent.

## Run it locally

```bash
npm install
cp .env.example .env.local   # add your Qloo key (optional but recommended)
npm run dev                  # http://localhost:3000
npm test                     # 62 unit tests
npm run lint && npm run build
```

Useful scripts:

| Script | What it does |
| --- | --- |
| `npm run qloo:smoke` | Checks the Qloo base URL, auth and the parameters the app relies on |
| `npm run catalog:generate` | Regenerates `data/catalog.json` (fixed session dates, 17 Oct – 27 Dec 2026) |
| `npm run photos:fetch` | Downloads freely licensed event photos from Wikimedia Commons into `public/images/events/` with credits in `data/photo-credits.json` (review picks before committing) |
| `npm run qloo:films` | Fetches real film facts and images from Qloo into `data/films.json` (run before `catalog:generate`) |
| `npm run qloo:map` | Resolves catalog references to Qloo IDs, writing `data/qloo-mappings.json` |

## Configuration

| Variable | Needed? | Notes |
| --- | --- | --- |
| `QLOO_API_KEY`, `QLOO_API_URL` | Recommended | Server-side only. Without them, taste search and ranking show an "unavailable" state and browsing still works. |
| `QLOO_RPS`, `QLOO_MONTHLY_BUDGET` | Optional | Throttle (default 4 req/s) and monthly cap (default 8,000). The hackathon key allows 5/s and 10,000/month. |
| `ANTHROPIC_API_KEY` / `LLM_PROVIDER` | Optional | With a key, promo copy uses the Anthropic API. Without one, local machines fall back to the Claude Code CLI (`claude`), and hosted builds use deterministic templates. The CLI is also the local fallback if an API call fails. `LLM_PROVIDER=none` forces templates. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | For hosted sharing | Without these, local dev stores data in `data/runtime/store.json`. A hosted build falls back to memory, which is per instance and lost on restart, and shared boards are then labelled "preview". |

## What works end to end

1. **Browse and search.** Home works without sign-up. You can:
   - pick a category or a quick filter (Tonight, Tomorrow, This weekend, Next weekend);
   - choose dates on the calendar, set a budget (including fees), a party size and a time of day;
   - sort by best match, soonest or lowest price;
   - search in plain language. "pottery this Sunday under 1500" becomes editable chips, and words the parser doesn't recognise stay as keywords.

   Empty results explain what ruled events out and offer **Wish for this** and **Save this search**.
2. **Event details.** Category-specific sections (film, show, class, trek), dates with live availability, ticket types, a fee breakdown, inclusions and policies, the organizer, a grounded "why it might suit you", and Save, Share and Add to board.
3. **Movies and theatre with seats.** `/movies` lists real films (12 Bollywood and other titles, with facts and posters from Qloo) at fictional sample cinemas. Each film page shows showtimes by cinema and date. Seated booking goes showtime → number of seats → seat map (sections with prices, "Best available", keyboard grid) → review → confirm. Seats are rechecked on the server, a seat can't be double-booked, and cancelling frees it. Theatre events use hall or studio seat maps the same way.
4. **Reservation.** Date → ticket type → quantity → review (subtotal, fees, total) → confirm. Availability is rechecked inside a lock, an idempotency key blocks duplicate submits, and overselling isn't possible. The confirmation page survives a refresh, and reservations appear in Tickets, where you can save an image, show a QR code or cancel (which releases the seats).
4. **Saved and boards.** Save events, save searches, create a board, share the link, vote, and add optional budget and dates. The shortlist is sorted by votes, and suggestions fit everyone's stated constraints.
5. **Optional taste.** Live Qloo entity search with disambiguating details. Interests are saved per browser; unmatched names can be kept as notes. The page has Skip, plus loading, retry, unavailable and no-match states.
6. **Planner.** An editable request covering dates, time window, area and distance, budget (each person or whole group), party size, activities and an optional dinner stop. It returns up to three feasible options with constraint checks and trade-offs. You can revise for cheaper, closer, earlier or later, a different activity, replacing an event, or removing or replacing only the dinner. A labelled sell-out simulation replans with the real selection logic. When nothing fits, it explains which constraint is blocking instead of relaxing anything.
7. **Wishes.** Describe → review and correct the parsed fields → save → status → compatible wishes (real and sample counts kept separate) → organizer proposals, which appear in the wish and in your in-app inbox. You can edit or withdraw a wish.
8. **Organizer workspace.** Requires an organizer account: sign up with email and password (scrypt-hashed), HTTP-only server sessions, sign-in throttling and sign-out. Attendees never sign in. Demo accounts for the sample organizers are listed on the sign-in page. Create and edit events, with sessions, ticket types, capacities and draft or published status. Edits that would conflict with existing reservations are blocked. The workspace also has demand clusters from wishes, Qloo "this crowd also loves", Propose an event, audience suggestions, reporting, and promotional experiments.
9. **Promotion experiments (LOLA-inspired).** Four factual variants are drafted, previewed and run on Home's promo card. Every impression is logged with its selection probability, and clicks, reservations and sample sizes are tracked. A simulation mode is clearly separated from real data.
10. **Anywhere.** A worldwide city search covers both the place you're exploring and your home location. Times show in the venue's time zone and prices in the booking currency. Cities without listings say so honestly.

## What Qloo decides

| Where | How |
| --- | --- |
| Interest search | `/search` across artists, films, TV, books and places, with disambiguation |
| Ordering results | `/v2/insights` restricted to our own catalog's mapped IDs (`filter.results.entities` / `filter.results.tags`), with `feature.explainability=true`. Positions are compared within one query only, never raw affinity across queries. Taste only reorders events that already passed the hard filters (dates, area, price including fees, availability, category, party size). |
| "Why it might suit you" | Built from explainability: which of your interests drove the connection |
| Your taste tags | Genre tags (`filter.tag.types`) Qloo associates with your interests |
| Organizer "this crowd also loves" | Insights seeded by the taste references people gave in their wishes |
| Audience suggestions | Opted-in Offbeat visitors whose interests Qloo ranks in the top half of connections to the event's references. Qloo provides cultural associations, not contacts. |

Mappings are recorded as **direct** (the event screens that film, or the tag names the activity) or **approximate** (a "for fans of" artist used as an audience proxy, or a near-match tag). See `data/qloo-mappings.json`. Unmapped events stay fully browsable.

Responses are cached for 24 hours (in memory and in the store), identical in-flight requests are deduplicated, calls are throttled, and a monthly budget cap applies. When Qloo is unavailable, ordering falls back to date order and the UI says so.

## LOLA-inspired experimentation

- **Qloo** informs who is culturally relevant (the audience definition).
- **An LLM** (or deterministic templates) drafts four variants grounded in the listing's facts. Copy is rejected if it adds scarcity, discounts or names that aren't in the listing. The official event name never changes.
- **The bandit** (`src/lib/bandit.ts`) runs Thompson sampling on Beta posteriors. Each variant's predicted click rate is a prior worth 20 pseudo-impressions, and observed clicks dominate as data arrives. Each impression logs the event, audience, experiment, variant and estimated selection probability. A variant is only called "likely best" after every variant has 200+ impressions and observed clicks alone give it a probability of at least 95%. Reservations are tracked separately from clicks.

**Differences from the paper:** there is no UCB-style confidence bonus, no calibration of LLM predictions against past experiments, and the prior weight is fixed. Simulated visitors are stored in separate counters from real ones.

## Architecture

```text
Next.js App Router (server components + route handlers)
├── src/lib/            pure logic: discovery, search parsing, planner, pricing, time zones, wishes, bandit
├── src/lib/server/     store (Redis | file | memory), catalog, reservations, Qloo client, taste,
│                       organizer, audience, experiments, LLM provider, notifications
├── src/app/            pages and /api route handlers
└── data/               catalog.json (fixed sessions), restaurants.json, qloo-mappings.json
```

Identity is an anonymous cookie (`ob_uid`). The explore and home locations are cookies. There are no accounts.

## Known limitations

- No payments, real inventory or external notifications. Organizer accounts have no email verification or password reset yet.
- Film runtimes and certifications aren't shown because Qloo doesn't supply Indian certifications or runtimes; screenings are planned as 3-hour slots. Posters are Qloo-provided images, credited on the page.
- On serverless hosting without Upstash, data lives in memory per instance. Boards, wishes and reservations are then not durable, and the UI labels boards as a preview.
- The sample catalog covers 17 Oct – 27 Dec 2026, so later dates show empty states.
- Travel distances are straight-line estimates (walking: × 1.3 at 5 km/h). Dinner costs are sample estimates and nothing is booked.
- Search parsing is deterministic (English phrasing). An LLM is used only for promotional copy.

MIT licensed (see `LICENSE`).
