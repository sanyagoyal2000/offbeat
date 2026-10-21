# How Offbeat uses Qloo

Qloo is Offbeat's cultural-intelligence layer. It decides **which experiences feel culturally relevant to a person**, **why**, and **which audiences an organizer's event connects to**. It never decides whether something is feasible: dates, location, price, seats and party size are always enforced first by Offbeat's own code.

> **In one line:** hard constraints choose *what's possible*; Qloo chooses *what's relevant* and explains it.

---

## 1. At a glance

| Where in the app | What Qloo decides | Qloo endpoint | Code |
| --- | --- | --- | --- |
| **Taste setup** (`/taste`) | Which real artist, film, book, show or place you mean (with disambiguation) | `GET /search` | `src/app/api/qloo/search/route.ts` |
| **Your taste so far** (`/taste`) | Genre tags associated with your interests | `GET /v2/insights` with `filter.type=urn:tag` | `vibeTags()` in `src/lib/server/taste.ts` |
| **Home ordering** (`/`, "Best match") | The order of events that already passed your filters | `GET /v2/insights` with `filter.results.entities` / `filter.results.tags` | `rankByTaste()` in `src/lib/server/taste.ts` |
| **"Why it might suit you"** (cards, event page, planner) | Which of *your* interests drove each connection | `feature.explainability=true` | `rankByTaste()` |
| **Planner** (`/plan`) | The order of feasible options | Same ranking call | `src/app/api/plan/route.ts` |
| **Shared boards** (`/boards/[id]`) | The order of group suggestions, using the combined interests of participants who added some | Same ranking call | `src/app/boards/[id]/page.tsx` |
| **Organizer: audience suggestion** | Which opted-in Offbeat visitors' interests connect to an event | `GET /v2/insights` with `filter.results.entities` | `audienceFor()` in `src/lib/server/audience.ts` |
| **Organizer: "This crowd also loves"** (demand) | Artists associated with the taste references in grouped wishes | `GET /v2/insights` with `filter.type=urn:entity:artist` | `src/app/organizer/demand/page.tsx` |
| **Organizer: event mapping on save** | Which Qloo artist, film or tag an organizer's event corresponds to | `GET /search`, `GET /v2/tags` | `resolveMappings()` in `src/lib/server/organizer.ts` |
| **Promotion experiments** | Who the "taste-connected" audience is for a promotion | Audience results above | `src/lib/server/experiments.ts` |
| **Movies** (`/movies`) | Film identity, year, genres, description and poster image | `GET /search` (build time) | `scripts/qloo-films.ts` → `data/films.json` |
| **Catalog mapping** (build time) | Qloo IDs for films screened, "for fans of" artists and event tags | `GET /search`, `GET /v2/tags` | `scripts/qloo-map.ts` → `data/qloo-mappings.json` |

---

## 2. The attendee journey

### 2.1 Optional taste setup: entity resolution

People type names they love, and Offbeat calls Qloo search across artists, films, TV, books and places:

```text
GET /search?query=Norah Jones&types=urn:entity:artist,urn:entity:movie,urn:entity:book,urn:entity:tv_show,urn:entity:place&take=8
```

- Each result is shown with a **disambiguating line** built from Qloo's data: type, release year, Qloo's short description or address, and image. For example: "Norah Jones · Artist · American singer, songwriter and pianist…" or "Norah Jones & the Handsome Band: Live in 2004 · TV show, 2004".
- People pick the right entity. Nothing is auto-matched, so the app never forces a wrong match.
- If nothing fits, the text can be kept as a **note**. Notes are never sent to Qloo and never used for ranking.
- The page has states for loading, retry, unavailable (Qloo down or over budget) and no match.

### 2.2 "Your taste so far": genre tags

```text
GET /v2/insights?filter.type=urn:tag&signal.interests.entities=<your entity IDs>&filter.tag.types=urn:tag:genre:music&take=5
GET /v2/insights?filter.type=urn:tag&signal.interests.entities=<your entity IDs>&filter.tag.types=urn:tag:genre:media&take=5   (only if you added a film, show or book)
```

The results are restricted to genre tag types. Without that restriction, Qloo returns restaurant and review tags ("Mini Burger", "Two Star"), which we found during testing.

### 2.3 Ranking events: Qloo orders only our own catalog

Offbeat never asks Qloo "what's good?" in the abstract. It asks Qloo to **rank our own catalog's mapped IDs** against the person's interests, using `filter.results.*`. That is at most three calls per set of interests, each cached:

```text
# Films the catalog actually screens (direct mappings)
GET /v2/insights?filter.type=urn:entity:movie
    &signal.interests.entities=<your IDs>
    &filter.results.entities=<catalog film IDs>
    &feature.explainability=true

# "For fans of" artists listed by organizers (approximate audience proxies)
GET /v2/insights?filter.type=urn:entity:artist
    &signal.interests.entities=<your IDs>
    &filter.results.entities=<catalog artist IDs>
    &feature.explainability=true

# Validated event tags (genres, activities)
GET /v2/insights?filter.type=urn:tag
    &signal.interests.entities=<your IDs>
    &filter.results.tags=<catalog tag IDs>
```

How the results are combined:

- **By position, never by raw score across queries.** Each result's position within its own query becomes a percentile, and an event takes its best percentile across its mappings. Raw affinity numbers from different queries are never compared.
- **Direct beats approximate.** Approximate mappings get a small penalty, so a screening of a film you love outranks a "for fans of" reference.
- **Events with no Qloo data aren't hidden.** They follow the ranked events in date order and stay fully browsable and searchable.
- **No invented percentages.** Qloo affinity is never shown as a "93% match" or treated as a probability that someone will enjoy or attend.

### 2.4 "Why it might suit you": explainability

With `feature.explainability=true`, Qloo reports which input interests contributed to each result and how much. Offbeat turns that into plain language, naming the interests with a contribution of at least 0.2:

- *"Screens The Lunchbox, which Qloo links to your interest in Norah Jones"*
- *"For fans of Prateek Kuhad, whom Qloo links to Norah Jones (approximate: the artist isn't performing)"*
- *"Tagged 'Acoustic', a style Qloo associates with your interests"*

Event pages add: *"Based on Qloo's cultural associations with the interests you added. It's a pointer, not a prediction that you'll enjoy it."*

### 2.5 Hard constraints always come first

`src/lib/discovery.ts` and `src/lib/planner.ts` filter by date and time window (in the destination's time zone), city and area or distance, price **including fees**, availability, seats together for the party, category and keywords. **Only then** does Qloo reorder what's left. Tests check that taste ordering can never bring back a filtered-out event (`src/lib/discovery.test.ts`).

The planner and shared boards use the same ranking:
- The **planner** orders its up-to-three feasible options by taste and shows each option's reason.
- **Boards** combine the interests of participants who chose to add some. The page says: *"Shared taste doesn't guarantee everyone will agree."*

---

## 3. The organizer journey

### 3.1 Audience suggestions: cultural connections, not contacts

For a published event, Offbeat asks Qloo which interests of **opted-in Offbeat visitors** connect to the event's mapped references:

```text
GET /v2/insights?filter.type=urn:entity:<type>
    &signal.interests.entities=<event's mapped entity IDs>   (or signal.interests.tags=<event tag IDs>)
    &filter.results.entities=<opted-in visitors' interest IDs of that type>
```

- Interests in the **top half** of that ranking count as "connected". That's a positional cut-off within one query, not a probability.
- Organizers see **anonymous totals** and the connected interest names, for example: *"3 of 7 opted-in Offbeat visitors have interests Qloo ranks in the top half of connections to this event's references (Dangal, Live Music)…"*
- Only visitors who switched on **"Count my interests in organizer audience estimates"** under Profile are included.
- The page states: *"Qloo provides cultural associations, not a contact list."* Reach is limited to Offbeat's own in-app promo cards.

### 3.2 Demand from wishes: "This crowd also loves"

Wishes can carry taste references (the wisher's own Qloo interests). For each cluster of compatible wishes:

```text
GET /v2/insights?filter.type=urn:entity:artist&signal.interests.entities=<cluster's taste reference IDs>&take=6
```

This gives programming ideas, for example artists to book or reference. The page labels it *"Cultural associations… not a guarantee of attendance."* Clusters without taste references say so instead of guessing.

### 3.3 Mapping organizer events when they're saved

When an organizer saves an event, `resolveMappings()` turns their attributes into Qloo IDs:
- **performers** → `/search` artist, recorded as **direct** only on an exact name match;
- **film title** → `/search` movie, **direct** on an exact match;
- **category** → closest `/v2/tags` genre, category or activity tag, recorded as **approximate**.

The mapping is stored on the event, so new events take part in ranking and audience suggestions straight away.

### 3.4 Promotion experiments: Qloo defines the audience

The LOLA-inspired experiments keep responsibilities separate:
- **Qloo** defines the "taste-connected visitors" audience (section 3.1);
- **an LLM** drafts factual copy;
- **a bandit** learns from clicks.

A visitor is shown a taste-connected promotion only if one of their interests is in the event's connected set.

---

## 4. Mapping the catalog: direct vs approximate

Our sample events are fictional, so Offbeat **never assumes a local event is a Qloo entity**. `scripts/qloo-map.ts` resolves only supported, organizer-style attributes and records the confidence of each one in `data/qloo-mappings.json`:

| Attribute | Example | Match type | Why |
| --- | --- | --- | --- |
| Film being screened | *Dangal* at Jayanagar Talkies → Qloo `Dangal (2016)` | **direct** | The event is that film |
| Event tag | "Acoustic" → `urn:tag:genre:music:acoustic` | **direct** (exact tag name) or **approximate** (closest tag) | Describes the activity |
| "For fans of" artist | Acoustic Sundowner, for fans of *Prateek Kuhad* | **approximate** | An audience proxy only. The UI says the artist isn't performing. |
| Unmatched | (none in the current catalog) | **unmatched** | Recorded honestly; the event stays browsable |

The current catalog has 12 films and 3 "for fans of" artists, and every event tag resolved. The "Taste data" panel on each event page shows its mappings and their match types.

Real artists appear only as **the user's interests** or as clearly labelled "for fans of" references, never as performers at fictional events.

---

## 5. Movies: Qloo as the source of film facts

`scripts/qloo-films.ts` resolves each screened film with `/search`, matched by title **and release year**, and stores:
- Qloo's ID and canonical name (e.g. "Lagaan: Once Upon a Time in India", "Like Stars on Earth" for *Taare Zameen Par*);
- release year, genres and description;
- **the poster image URL Qloo provides**, credited "Poster via Qloo".

**What's deliberately left out:** Qloo returns no runtimes, and its content rating is a US one, not an Indian certification, so neither is shown. Screenings are planned as clearly labelled 3-hour slots. *Queen (2014)* didn't resolve, so it was dropped rather than guessed.

---

## 6. Staying inside the account limits

The hackathon key allows **5 requests/second and 10,000/month**. Everything goes through one server-side client, `src/lib/server/qloo.ts`:

| Safeguard | Detail |
| --- | --- |
| Server-side only | `QLOO_API_KEY` never reaches the browser; all calls run in route handlers or server components |
| 24-hour cache | In memory plus the persistent store, keyed by path and sorted parameters |
| Request de-duplication | Identical in-flight requests share one network call |
| Throttle | `QLOO_RPS`, default **4/s**, spaced across the process |
| Monthly budget | `QLOO_MONTHLY_BUDGET`, default **8,000**, counted per month. Beyond it, Qloo is treated as unavailable rather than failing. |
| Narrow queries | Ranking uses `filter.results.*` over our own IDs, so it costs at most 3 calls per interest set, then the cache takes over |
| Build-time work | Film facts and catalog mappings are fetched once by scripts, not on every page view |

The organizer workspace shows usage, for example *"Qloo usage this month: 41 of 8,000 calls (throttled to 4/s)"*.

---

## 7. Honest fallbacks

| Situation | What people see |
| --- | --- |
| No interests added | "Showing soonest first. Add interests to order by taste (optional)." Browsing and booking work fully. |
| Qloo down, rate-limited or over budget | "Taste ranking is unavailable right now, so events are shown by date." Interest search shows an unavailable state, and notes can still be saved. |
| Events have no mappings | "None of these events have taste data yet, so they're shown by date." |
| Qloo returns no genre tags | "Qloo didn't return genre tags for these interests." |
| Audience can't be computed | The event has no mappings, or there are no opted-ins, or Qloo is unavailable. Each case is explained, and organizers can still promote to everyone exploring the city. |
| A wish cluster has no taste references | "These wishes don't include taste references, so there's nothing to look up." |

A Qloo result is never invented, and a non-Qloo explanation is never attributed to Qloo.

---

## 8. What changes if you remove Qloo

| With Qloo | Without Qloo |
| --- | --- |
| Interest search with disambiguation | Notes only |
| "Best match" ordering across Home, planner and boards | Date order everywhere |
| Plain-language reasons on cards, event pages and plan options | No reasons |
| Genre tags under "Your taste so far" | Nothing shown |
| Organizer audience estimates and taste-connected promotion audiences | City-wide audience only |
| "This crowd also loves" for wish demand | Not available |
| Film identities, genres, descriptions and posters | Plain listings with typographic placeholders |

Browsing, search, booking, wishes and organizer tools keep working. Only the cultural layer disappears, which is the point.

---

## 9. Verification

- `npm run qloo:smoke` checks the base URL, the `X-Api-Key` auth, `/search`, tag insights, `/v2/tags`, artist insights with explainability, and places filtered by location and opening hours.
- **Unit tests** (`npm test`):
  - `src/lib/server/taste.test.ts` covers direct vs approximate mappings, no-interests, Qloo-unavailable and no-coverage fallbacks.
  - `src/lib/discovery.test.ts` checks that taste ordering never re-admits filtered events.
  - `src/lib/server/experiments.test.ts` covers audience-labelled impression logging.
- **Live browser check:** after adding *Norah Jones*, the top Home card read *"Screens The Lunchbox, which Qloo links to your interest in Norah Jones"*.

## 10. Files

```text
src/lib/server/qloo.ts          client: cache, de-dup, throttle, budget, typed helpers
src/lib/server/taste.ts         interests, rankByTaste(), explainability reasons, vibeTags()
src/lib/server/audience.ts      opted-in audience estimates
src/lib/server/organizer.ts     resolveMappings() for organizer events
src/app/api/qloo/search/route.ts  interest search API
src/app/organizer/demand/page.tsx "This crowd also loves"
scripts/qloo-smoke.ts           API checks
scripts/qloo-map.ts             catalog → Qloo mappings (data/qloo-mappings.json)
scripts/qloo-films.ts           film facts and posters (data/films.json)
```
