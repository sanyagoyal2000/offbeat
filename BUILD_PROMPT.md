# Build Offbeat: taste-driven evening planner (Qloo Agentic Hackathon)

You are building a working, deployed web app from finished mockups in this folder. Read this whole file before writing code. Ask me before deviating from the design or the scope below.

## 0. Context

- **Hackathon:** Qloo Agentic Hackathon ("Agents, but with taste"). Deadline **Oct 30, 2026, 11:45 pm EDT** (Oct 31, 9:15 am IST).
- **Submission must have:** a live, externally hosted demo anyone can use end to end; a public GitHub repo with all source and run instructions; an open-source LICENSE file (MIT) detected by GitHub; and a text description of what it does and what Qloo decides.
- **Judging:** technical use of Qloo, design completeness, potential impact, originality. If the app would work the same without Qloo, we lose. Qloo must visibly drive decisions.
- **Product:** "Offbeat" helps people in Bengaluru find a night out that fits their taste and constraints. An agent plans a show + dinner from the user's favourite artists, films and places, replans when something sells out, and lets people "wish" for events that don't exist yet so organizers can see real demand.

## 1. Design references (match these closely)

All in this folder. They are 780×1688 PNGs (2× of a 390×844 phone screen).

| Screen | File | Route |
| --- | --- | --- |
| Home, event types | `1_Home-refreshed.png` | `/` |
| Taste setup | `2_Main-refreshed.png` | `/taste` |
| Plan request (chat) | `3_Plan-refreshed.png` | `/plan` |
| Agent plan | `4_Picks-refreshed.png` | `/plan/result` |
| Sold out, replanned | `5_Replan-refreshed.png` | `/plan/result` (replanned state) |
| Ticket | `6_Ticket-current.png` | `/ticket/[id]` |
| Wish this existed | `7_Wish-refreshed.png` | `/wish` |
| Organizer demand board | `8_Organizer-current.png` | `/organizer` |

- `6_Ticket-current.png` and `8_Organizer-current.png` are from an earlier pass, before photos were added. Keep their layout and content, but restyle them to the art direction of the refreshed screens (photo panel on the ticket instead of the cartoon cat; a shallow venue photo under the organizer header).
- `design-source/*.html` holds the HTML source of the earlier pass. Use it for **exact copy, layout order and spacing**, not for colours or fonts. Those come from section 2.
- `Design-notes-and-prompts.md` describes the art direction of the refreshed screens.

## 2. Design system

- **Colours:** background `#10110F`; text ivory `#F6F4EC`; accent citron `#E8F55A`; cards charcoal `#1B1C19`; raised surface `#262724`; borders `rgba(246,244,236,0.10)`; muted text `#A3A29A`. Text on citron is `#10110F`. No other accent colours.
- **Fonts:** headings **Unbounded** 700 (screen titles, event names, big numbers, the "offbeat*" wordmark); everything else **Plus Jakarta Sans** 400–700. Use `next/font/google`. Prices and times use tabular numerals.
  - Note: `Design-notes-and-prompts.md` mentions Space Grotesk/Manrope, but the refreshed PNGs look like Unbounded. Match the PNGs.
- **Shape:** pill buttons and chips (fully rounded), cards 22–26 px radius, 44 px minimum tap targets.
- **Primary button:** citron, full width, 56 px tall, dark text. Secondary: outlined pill.
- **Bottom nav (Home):** floating pill; the active item is a citron pill with icon + label; the others are round charcoal icon buttons.
- **Quirky touches:** small hand-drawn citron stars, orbit doodles and ticket motifs as SVGs. No mascots.
- **Photos:** warm amber editorial photos with a dark gradient overlay under the text.
  - For the demo, crop the photo regions out of the refreshed PNGs into `public/images/` (they are our own generated images).
  - No photo may imply it shows a named real artist.
- **Layout:** mobile-first at 390 px wide. On desktop, centre a phone-width column on the dark background. No horizontal scroll.
- **Accessibility:** real buttons and links, labels on inputs, `aria-label` on icon-only buttons, visible focus rings, 4.5:1 contrast for text.

## 3. Stack

- Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel.
- **Agent:** Anthropic Claude API with tool use (`@anthropic-ai/sdk`), run server-side in a route handler. Stream the agent's steps to the UI so the "How I picked this" trace fills live.
- **Qloo:** called only server-side. Env vars: `QLOO_API_KEY`, `QLOO_API_URL`, `ANTHROPIC_API_KEY`. Never expose keys to the client.
- **Storage for wishes and bookings:** Upstash Redis via Vercel's free tier, behind a small repository interface, with an in-memory fallback when env vars are missing. No auth for the demo; store a random anonymous id in a cookie.
- Zod for validating tool inputs/outputs. Vitest for unit tests of the constraint engine and replanner.

## 4. Qloo integration (what Qloo decides)

Before building on the API, verify the base URL, auth header and parameter names in Qloo's hackathon developer guide and in `github.com/qloo/docs-public`. Write `scripts/qloo-smoke.ts`, which runs these checks and prints results. Run it first and show me the output.

1. **Resolve anchors:** Qloo search for each anchor (artists, films, places). Show unresolved or ambiguous ones honestly; that's the "Couldn't find…" card on `/taste`.
2. **Taste tags:** from the resolved anchors, get descriptive tags for "Your vibe so far".
3. **Rank shows:** call Insights (`/v2/insights`) with `signal.interests.entities` = resolved anchor IDs and `feature.explainability=true`. Score each catalog event via its linked performer/tag entities. Rank by position within one query; never compare raw affinity scores across queries.
4. **"Why you'd like it" bars:** come from explainability, which says how much each anchor contributed to a pick.
5. **Dinner:** Insights with `filter.type=urn:entity:place`, `filter.location.query="Indiranagar, Bengaluru"` (or the user's area), and `filter.hours` for the day, ranked by the same anchors.
6. **Organizer "This crowd also loves":** Insights from the aggregated anchors of people who made matching wishes.

**Cache** Qloo responses (in-memory + Redis, 24 h) keyed by request. Judges will hammer the demo until Nov 16, so stay well inside the rate limit.

**Fallback:** if Qloo fails or returns nothing for an Indian independent act, fall back to tag-based matching and say so in the trace ("No Qloo match for X; matched on tags instead"). Never invent a Qloo result.

## 5. Agent design

The LLM interprets and plans; deterministic code decides feasibility. The agent calls these tools:

| Tool | Does | Implementation |
| --- | --- | --- |
| `parse_request` | Turns free text into `{date, timeWindow, budgetINR, area, radiusKm, partySize}` and asks one clarifying question if one is missing | LLM, structured output |
| `resolve_anchors` | Maps names to Qloo entities | Qloo search |
| `rank_shows` | Taste-ranks catalog events for the date | Qloo Insights + catalog |
| `check_constraints` | Budget, time window, distance, end time, capacity; returns pass/fail with reasons | **Pure TypeScript, unit tested** |
| `find_dinner` | Places open after the show, within walking distance, ranked by taste | Qloo Insights (places) |
| `build_plan` | Show + dinner, timings, walk time, total vs budget | Pure TypeScript |
| `replan` | On sold-out or changed budget: picks the next-best feasible show and recomputes timings and totals | Pure TypeScript using cached ranks |

- **Trace:** every tool call becomes one line in "How I picked this · N steps", for example "Dropped 9: 3 over budget, 4 too far, 2 end late". The trace is real, generated from the tool results, never hard-coded.
- **Bookings:** no real payment. "Hold my spot" creates a booking record and shows the ticket. The UI says it's a demo hold, not a purchase.
- **Distance and walking time:** straight-line distance × 1.3 at 5 km/h is fine. Label it as an estimate in code comments.

## 6. Demo data

- **Catalog:** `data/events.json` holds about 30 **fictional** events in Bengaluru (Indiranagar, Koramangala, HSR, Jayanagar), across the eight Home categories, over the next two weekends. Each event has: id, title, venue, area, lat/lng, start/end, price, capacity, category, performer names, and Qloo entity IDs or tags for matching. Include "Acoustic Sundowner" (Basement Sessions, ₹650, 7:00 pm) and "Folk & Fables Night" (The Attic Room, ₹500, 7:30 pm) exactly as in the mockups.
- **Restaurants:** use Qloo places if they resolve for Indiranagar. Otherwise use a small labelled sample list including "Kaapi & Kosha".
- **Real names:** real artists/films/places appear only as the *user's* taste anchors. Never claim a real artist is performing at a fictional event.
- **Labels:** anything simulated is labelled in the UI: "Demo: sell-out simulated" (a visible toggle on the plan result), "Demo data" under the wish count and the organizer metrics, and sample events tagged "Sample listing" in a small caption.

## 7. Screen behaviour

1. **`/` Home:**
   - Location picker (Bengaluru only for now); search; 8 category tiles that filter the feed: Music Shows, Comedy Shows, Theatre, Performances, Workshops, Meetups, Kids, Sports.
   - Filter pills: My feed, Today, This weekend, Under ₹500.
   - "Picked for your taste" cards; "Edit taste" goes to `/taste`. Bottom nav: Home, Plan, Wishes, Tickets, Profile.
2. **`/taste`:**
   - Add anchors with typeahead (Qloo search, debounced). Chips show a small thumbnail when Qloo returns an image.
   - Unresolved anchor card offers the closest match or "Keep as note".
   - "Your vibe so far" tags update live. Minimum 3 anchors to continue.
3. **`/plan`:**
   - Chat. The user's message is a citron bubble.
   - The agent replies with four editable constraint tiles (When, Budget, Where, Mood), then asks Solo / +1 / Group, which changes the budget per person.
   - "Plan it" runs the agent.
4. **`/plan/result`:**
   - Show card with photo, date badge and price.
   - "Why you'd like it" bars, dinner card, budget bar with "₹X to spare".
   - Collapsible live trace. Swap (next-best pick) and "Hold my spot · ₹X".
   - The **sell-out toggle** marks the show sold out and triggers `replan`. The replanned state matches `5_Replan-refreshed.png`: alert card, struck-through old pick, "New pick" badge, "What changed" diff of times and total, "Show another" / "Looks good · ₹X".
5. **`/ticket/[id]`:**
   - Photo panel, then a citron perforated ticket with event, venue, date, doors, admit, paid; a barcode drawn in SVG (visual only).
   - Note about the two-question feedback; "Save image" exports the ticket as PNG with `html-to-image`; "QR code" shows a QR of the booking id.
6. **`/wish`:**
   - Free-text wish, parsed by the LLM into chips (genre, day, budget, area).
   - Count of similar wishes, aggregated from real stored wishes plus seeded ones, labelled "Demo data".
   - Opt-in checkbox with the privacy line: only people who opt in are counted, and organizers see totals, never names.
   - "Drop my wish" saves it.
7. **`/organizer`:**
   - Header for "The Attic Room" (no login for the demo). Metrics: Shown to, Booked, First-timers.
   - Wish cluster card: matching wishes within 5 km in the last 30 days, broken down by taste cluster.
   - "This crowd also loves" from Qloo, plus a one-paragraph pitch suggestion from the LLM.
   - "Full brief" and "Propose this event". Proposing creates an event that matching wishers would be notified about (show a toast; no real notifications).

## 8. Build order and checkpoints

Stop after each step, show me what works and wait for my OK:

1. Scaffold, design tokens, fonts, layout shell and bottom nav. Run `qloo-smoke.ts` and show results.
2. Static versions of all 8 screens matching the PNGs. Send me screenshots at 390×844 side by side with the mockups.
3. Qloo service layer with caching, anchor resolution, and the `/taste` screen working live.
4. Constraint engine, planner, replanner with unit tests, then the agent route with streaming trace. `/plan` → `/plan/result` working end to end, including the sell-out replan.
5. Bookings and ticket, wishes and organizer board with storage.
6. Error and empty states:
   - Qloo down or unmatched: say so honestly.
   - No feasible plan: say why and suggest relaxing one constraint.
   - Loading skeletons.
7. README (what it does, what Qloo decides at each step, architecture diagram, local setup, env vars), MIT LICENSE, deploy to Vercel. Give me the live URL and a 150-word Devpost description.

## 9. Done means

- A judge on a phone can go Home → Taste → Plan → Result → sell-out replan → Ticket → Wish → Organizer with no dead ends and no console errors.
- Every number shown is either computed by code, returned by Qloo, or labelled "Demo data".
- Removing Qloo visibly breaks ranking, explanations and the organizer insights. That's the point.
- Lighthouse mobile accessibility score ≥ 90. Repo public with LICENSE detected; app live on Vercel.

4. MORE REALISTIC EVENT PRICES
Prices in the sample catalog are too low. Update data/events.json and every hard-coded price in the UI, keeping everything labelled "Sample listing".

Price ranges by category (INR per ticket, sample assumptions):
- Music Shows: small gigs ₹799–1,999; mid-size concerts ₹1,999–4,999; big concerts ₹3,999–14,999
- Comedy Shows: ₹699–2,499
- Theatre: ₹799–2,999
- Performances (dance, spoken word, magic): ₹599–1,999
- Workshops: ₹1,499–4,500 (materials included)
- Meetups: free–₹799
- Kids: ₹599–1,499
- Sports: ₹999–6,000

Ticket tiers:
- Add tiers where it makes sense (Early bird, Regular, VIP/Front row) with their own prices and capacities.
- Show "from ₹X" on cards.
- The planner uses the cheapest tier that's still available.
- Replanning considers a higher tier if the cheaper one sells out.

Fees:
- Show a small booking fee line (e.g. 5% + GST, labelled "Demo fee") on the plan and ticket.
- Include it in the budget check.

Update the demo story so the numbers stay consistent:
- Acoustic Sundowner: ₹1,199.
- Dinner: about ₹1,500 for one.
- Default budget: ₹4,000.
- Folk & Fables Night (replacement): ₹899.
- Recompute every "to spare", "What changed" and ticket "Paid" figure from code. Don't type them in by hand.

Filters and wishes:
- Change the Home filter pill "Under ₹500" to "Under ₹1,000".
- Change the wish example to "under ₹1,500".

Add a unit test that every event price falls inside its category's range, and that plan totals equal tickets + fees + dinner.