# Offbeat

Find experiences that fit your taste, wherever you are, and help organizers discover demand for their next event.

Offbeat is a discovery and booking app for shows, films, classes, treks, meetups and more. Qloo adds cultural relevance for attendees and audience insight for organizers, and a LOLA-inspired experiment layer picks which promotional wording to show.

> **Photos:** event photos are illustrative, freely licensed images from Wikimedia Commons (credited on each event page and at `/credits`); they weren't taken at these fictional events. Film posters and details come from Qloo.
>
> **Demo status:** all listings are fictional sample data in three cities (Bengaluru, London, New York). Reservations are demo holds: no payment is taken and no real inventory is held. No email, SMS or push messages are ever sent.

## Run it locally

```bash
npm install
cp .env.example .env.local   # add TURSO_* (required) and your Qloo key (recommended)
npm run db:migrate           # create the tables in your Turso database
npm run db:seed              # load the sample data (safe to re-run)
npm run dev                  # http://localhost:3000
npm test                     # 93 unit tests, on a local file database (never Turso)
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
| `npm run qloo:starters` | Resolves `data/starter-interests.json` names to Qloo IDs (exact matches only; misses are logged in the file) |
| `npm run qloo:suggestions` | Fills `interest_suggestions` for the 8 main cities from Qloo (popular per type, plus trending where Qloo's trend weighting changes the list) |
| `npm run db:generate` | Generates a new SQL migration in `drizzle/` after you change `src/lib/server/db/schema.ts` |
| `npm run db:migrate` | Applies pending migrations to the database in `TURSO_DATABASE_URL` |
| `npm run db:seed` | Loads the sample data (idempotent; see below) |
| `npm run db:studio` | Opens Drizzle Studio to browse the data |
| `npm run titles:seed` | Drafts Title lab variants for published events and approves them, so Home shows them straight away (`--city=<id>`, `--force` to regenerate, or event ids) |

## Database

Offbeat stores everything in a **Turso** (libSQL / SQLite) database through **Drizzle ORM**. The JSON files in `data/` are seed input only; the app never reads them at runtime (the one exception is `data/photo-credits.json`, which is attribution for the bundled images).

### 1. Create the database

```bash
brew install tursodatabase/tap/turso      # or: curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create offbeat
turso db show offbeat --url               # → TURSO_DATABASE_URL (libsql://offbeat-<org>.turso.io)
turso db tokens create offbeat            # → TURSO_AUTH_TOKEN
```

### 2. Environment variables

| Where | Variables |
| --- | --- |
| Local (`.env.local`) | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Local dev uses the Turso database directly. |
| Vercel | Add the same two variables under *Project → Settings → Environment Variables* (Production, and Preview if previews should share or use a separate database). Then redeploy. |
| Tests | Nothing to set. Vitest always uses `file:./test.db`, whatever the env says, so tests can't touch real data. |

### 3. Migrate and seed

```bash
npm run db:migrate   # applies drizzle/*.sql (tracked in the __drizzle_migrations table)
npm run db:seed
```

The seed loads `data/catalog.json` (53 sample events, 13 organizers), `data/qloo-mappings.json` (Qloo links), `data/local-acts.json` (10 new local-act events described only through "for fans of" links), films, restaurants and 47 sample wishes, all with `is_sample = 1` (shown as "Sample listing"). It's **idempotent**: ids are stable, a re-run updates listing text but never touches `ticket_tiers.sold`, and it prints what it inserted versus what was already there.

To change the schema: edit `src/lib/server/db/schema.ts`, run `npm run db:generate`, review the new SQL in `drizzle/`, then `npm run db:migrate`.

### Conventions and rules

- Ids are TEXT UUIDs generated in code (sample rows keep their stable seed ids, such as `acoustic-sundowner`). Timestamps are ISO-8601 UTC text; session times are converted to the venue's time zone for display.
- JSON is stored as TEXT, booleans as INTEGER 0/1. Money is INTEGER in the row's `currency`: whole rupees for INR, pence/cents for GBP and USD (`src/lib/server/db/money.ts` is the only place that converts).
- **No overselling.** A booking is one transaction: `UPDATE ticket_tiers SET sold = sold + :qty WHERE id = :tier AND sold + :qty <= capacity`, and the booking row is inserted only if that UPDATE changed a row. Otherwise the user sees "sold out"; when the booking started from the planner, they're offered a re-plan with live availability. Reserved seats have a unique `(session_id, seat)` index.
- **Simulated data never mixes with real data.** `variant_events.is_simulated` and `interactions.is_simulated` are filtered explicitly in every metric query.
- **Wishes count only where `opted_in = 1`.** Organizer views get aggregates only: no names, visitor ids or free text.
- All SQL lives in repositories under `src/lib/server/db/`; pages and routes never query the database directly.
- Qloo responses are cached in `qloo_cache` (24 h), which survives cold starts. Expired rows are deleted when read and by an occasional sweep (`cleanupQlooCache()`).

## Configuration

| Variable | Needed? | Notes |
| --- | --- | --- |
| `QLOO_API_KEY`, `QLOO_API_URL` | Recommended | Server-side only. Without them, taste search and ranking show an "unavailable" state and browsing still works. |
| `QLOO_RPS`, `QLOO_MONTHLY_BUDGET` | Optional | Throttle (default 4 req/s) and monthly cap (default 8,000). The hackathon key allows 5/s and 10,000/month. |
| `ANTHROPIC_API_KEY` / `LLM_PROVIDER` | Optional | With a key, promo copy uses the Anthropic API. Without one, local machines fall back to the Claude Code CLI (`claude`), and hosted builds use deterministic templates. The CLI is also the local fallback if an API call fails. `LLM_PROVIDER=none` forces templates. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Required | The Turso database (see [Database](#database)). |

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
4. **Accounts, saved items and boards.** Browsing, booking, saving and wishes work as a guest. Attendees can create an account (username + password, scrypt-hashed; sessions are HTTP-only cookies stored server-side only as a hash, and login attempts are throttled). Signing up keeps everything the guest already had. Group boards need an account: you share the link, friends log in and **join**, and only members can vote, add options or share a budget and dates. Group size, the lowest budget and the shared date window come from members only, and suggestions need enough seats in one ticket type for every member. The Friends tab shows your group plans first. There's no separate Saved tab: saved events and saved searches live under **Plan → Saved for later** (`/saved` redirects there).
5. **Optional taste.** Tap popular interests by category (For you, Music, Films, TV shows, Books, Podcasts, Places & food): "Popular in <city> · via Qloo" is read from the `interest_suggestions` table (refreshed in the background when older than 24 h). Curated "Starter picks" are mixed in only for Indian cities when Qloo's list is thin or mostly not tied to India. "Trending" appears only where Qloo's `bias.trends` actually changes the list (places, at the time of writing). After each pick, "More like this" shows 4 related Qloo entities with "Because you picked X". Live Qloo entity search with disambiguating details is still at the top. Interests are saved per browser; unmatched names can be kept as notes. The page has Skip, plus loading, retry, unavailable and no-match states.
6. **Planner and your plans.** Save any planner option as one of **your plans** (`user_plans`; prices are recomputed on the server, and saving the same date again updates it). The Plan page lists your plans first with live status (upcoming, already happened, not enough seats, cancelled) and a **Create a new plan** button that opens the planner. An editable request covering dates, time window, area and distance, budget (each person or whole group), party size, activities and an optional dinner stop. It returns up to three feasible options with constraint checks and trade-offs. You can revise for cheaper, closer, earlier or later, a different activity, replacing an event, or removing or replacing only the dinner. A labelled sell-out simulation replans with the real selection logic. When nothing fits, it explains which constraint is blocking instead of relaxing anything.
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

## Title lab (LOLA + our extensions)

Event cards on Home can show one of five **title + hook variants**, chosen per visitor by a bandit. Full write-up: [`docs/TITLE_LAB.md`](docs/TITLE_LAB.md).

Based on **LOLA**: Ye, Yoganarasimhan & Zheng, *"LOLA: LLM-Assisted Online Learning Algorithm for Content Experiments"*, [arXiv:2406.02611](https://arxiv.org/abs/2406.02611). LOLA uses LLM performance predictions as priors for a UCB bandit, which helps most when traffic is limited.

- **Follows LOLA:** Claude scores each variant's click appeal (0–1), and that score becomes a prior worth `priorWeight` pseudo-impressions (default 20, configurable) in a UCB bandit that learns from real outcomes.
- **Our extensions:**
  - **LLM-generated variants.** LOLA tests human-written headlines. Here Claude writes them, one per Qloo link on the event: each "for fans of" entity, a vibe tag, and a plain control.
  - **Per-taste-cluster bandits.** A visitor's cluster is their top-matching Qloo reference for that event.
  - **Bookings as the reward,** with clicks as the fallback until a cluster has enough bookings.
  - **A variance-scaled UCB bonus** suited to single-digit click rates.
- **Guardrails, enforced before saving:** titles are at most 60 characters; copy may not imply that a referenced artist is performing or involved ("for fans of" / "if you liked" only); no false urgency; no claims beyond the event data. Each variant passes deterministic rules *and* a second Claude review, and organizers can edit, approve or remove variants.
- **Organizer view** (`/organizer`): impressions, clicks, CTR, bookings, traffic share, the leader per cluster, and a one-line insight computed from those numbers only.
- **Simulated audience:** 2,000 synthetic visitors whose click chance follows Qloo affinity between their cluster and each variant's anchor, plus noise. The page charts the bandit's convergence against an equal-split A/B test on the same visitors. Simulated numbers are stored separately and never mixed into real metrics.

## Architecture

```text
Next.js App Router (server components + route handlers)
├── src/lib/            pure logic: discovery, search parsing, planner, pricing, time zones, wishes, bandit
├── src/lib/server/     catalog, reservations, Qloo client, taste, organizer, audience, experiments,
│                       Title lab, LLM provider, notifications
├── src/lib/server/db/  Drizzle schema, client, repositories (all SQL), seed
├── drizzle/            SQL migrations
├── src/app/            pages and /api route handlers
└── data/               seed input: catalog.json, qloo-mappings.json, local-acts.json, films.json, restaurants.json
```

Guests are anonymous: the `ob_uid` cookie maps to a `users` row created on first use. Signing up turns that same row into an account (username + password hash) and rotates its key, so the old guest cookie no longer reaches it; signed-in requests are identified by the `ob_session` cookie instead. Organizer accounts are separate (email + password). The explore location is a cookie; home is a cookie and is also saved on the user.

## Known limitations

- No payments, real inventory or external notifications. Organizer accounts have no email verification or password reset yet.
- Film runtimes and certifications aren't shown because Qloo doesn't supply Indian certifications or runtimes; screenings are planned as 3-hour slots. Posters are Qloo-provided images, credited on the page.
- The sample catalog covers 17 Oct – 27 Dec 2026, so later dates show empty states.
- Travel distances are straight-line estimates (walking: × 1.3 at 5 km/h). Dinner costs are sample estimates and nothing is booked.
- Search parsing is deterministic (English phrasing). An LLM is used only for promotional copy and Title lab variants and priors.

MIT licensed (see `LICENSE`).
