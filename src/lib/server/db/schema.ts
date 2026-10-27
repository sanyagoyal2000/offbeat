/**
 * Database schema (Turso / libSQL, via Drizzle).
 * Conventions: snake_case tables, TEXT uuid ids generated in code, ISO-8601 UTC text timestamps,
 * JSON as TEXT, booleans as INTEGER 0/1. Money is INTEGER in the row's `currency`: whole rupees for INR,
 * pence/cents for GBP/USD (see ./money.ts, the only place that converts).
 */
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const stamps = {
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
};
const id = () => text("id").primaryKey();
const bool = (name: string) => integer(name, { mode: "boolean" });

/* ── People ─────────────────────────────────────────────────────── */

/**
 * Everyone who uses the app. Guests are anonymous (anon_cookie_id = their `ob_uid` cookie). A guest who
 * signs up keeps the same row (so their data comes with them) and gets a username + password hash; their
 * anon_cookie_id is then rotated to an internal "acct:" key that is never sent to a browser.
 */
export const users = sqliteTable(
  "users",
  {
    id: id(),
    anonCookieId: text("anon_cookie_id").notNull().unique(),
    /** Lower-case login name; null for guests. */
    username: text("username"),
    passwordSalt: text("password_salt"),
    passwordHash: text("password_hash"),
    displayName: text("display_name"),
    homeCity: text("home_city"),
    homeLat: real("home_lat"),
    homeLng: real("home_lng"),
    radiusKm: real("radius_km"),
    /** Notification preferences (no external channel is connected). */
    prefsJson: text("prefs_json"),
    audienceOptIn: bool("audience_opt_in").notNull().default(false),
    tasteNotesJson: text("taste_notes_json"),
    tasteSkipped: bool("taste_skipped").notNull().default(false),
    ...stamps,
  },
  (t) => [uniqueIndex("users_username_unique").on(t.username)],
);

/** Signed-in attendee sessions. id = SHA-256 of the cookie token. */
export const userSessions = sqliteTable(
  "user_sessions",
  { id: id(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), expiresAt: text("expires_at").notNull(), ...stamps },
  (t) => [index("user_sessions_user").on(t.userId)],
);

export const userAnchors = sqliteTable(
  "user_anchors",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    qlooEntityId: text("qloo_entity_id").notNull(),
    qlooType: text("qloo_type").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    detail: text("detail"),
    position: integer("position").notNull(),
    ...stamps,
  },
  (t) => [uniqueIndex("user_anchors_user_entity").on(t.userId, t.qlooEntityId)],
);

export const organizers = sqliteTable("organizers", {
  id: id(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  contactEmail: text("contact_email"),
  about: text("about").notNull().default(""),
  isSample: bool("is_sample").notNull().default(false),
  ...stamps,
});

export const organizerAccounts = sqliteTable("organizer_accounts", {
  id: id(),
  organizerId: text("organizer_id").notNull().references(() => organizers.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  isDemo: bool("is_demo").notNull().default(false),
  ...stamps,
});

/** Session id = SHA-256 of the cookie token, so a leaked table can't be replayed. */
export const organizerSessions = sqliteTable("organizer_sessions", {
  id: id(),
  accountId: text("account_id").notNull().references(() => organizerAccounts.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  ...stamps,
});

export const loginAttempts = sqliteTable("login_attempts", { id: id(), email: text("email").notNull(), ...stamps }, (t) => [index("login_attempts_email").on(t.email, t.createdAt)]);

/* ── Catalog ────────────────────────────────────────────────────── */

export const events = sqliteTable(
  "events",
  {
    id: id(),
    organizerId: text("organizer_id").notNull().references(() => organizers.id),
    /** The organizer's original title (Title lab variants never overwrite it). */
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    venueName: text("venue_name").notNull(),
    area: text("area").notNull(),
    address: text("address"),
    city: text("city").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    timezone: text("timezone").notNull(),
    currency: text("currency").notNull(),
    /** First and last session (UTC). Sessions hold the individual dates. */
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    /** Total seats across all sessions and tiers. */
    capacity: integer("capacity").notNull().default(0),
    status: text("status", { enum: ["draft", "published", "sold_out", "cancelled"] }).notNull(),
    isSample: bool("is_sample").notNull().default(false),
    /** Category-specific listing details (summary, show/film/class/trek blocks, facts, image, …). */
    detailsJson: text("details_json").notNull(),
    ...stamps,
  },
  (t) => [index("events_city_starts").on(t.city, t.startsAt), index("events_status").on(t.status), index("events_organizer").on(t.organizerId)],
);

export const eventSessions = sqliteTable(
  "event_sessions",
  {
    id: id(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    isCancelled: bool("is_cancelled").notNull().default(false),
    ...stamps,
  },
  (t) => [index("event_sessions_event").on(t.eventId, t.startsAt)],
);

export const ticketTiers = sqliteTable(
  "ticket_tiers",
  {
    id: id(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull().references(() => eventSessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceAmount: integer("price_amount").notNull(),
    capacity: integer("capacity").notNull(),
    /** Seats taken, including sample pre-sales (`seed_sold`). Only ever changed by the atomic booking UPDATE. */
    sold: integer("sold").notNull().default(0),
    seedSold: integer("seed_sold").notNull().default(0),
    position: integer("position").notNull().default(0),
    ...stamps,
  },
  (t) => [index("ticket_tiers_session").on(t.sessionId), index("ticket_tiers_event").on(t.eventId)],
);

export const eventQlooLinks = sqliteTable(
  "event_qloo_links",
  {
    id: id(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    qlooEntityId: text("qloo_entity_id").notNull(),
    qlooType: text("qloo_type").notNull(),
    name: text("name").notNull(),
    linkKind: text("link_kind", { enum: ["performer", "for_fans_of", "tag", "film"] }).notNull(),
    matchQuality: text("match_quality", { enum: ["exact", "approximate"] }).notNull(),
    note: text("note").notNull().default(""),
    resolvedAt: text("resolved_at").notNull(),
    ...stamps,
  },
  (t) => [index("event_qloo_links_entity").on(t.qlooEntityId), index("event_qloo_links_event").on(t.eventId)],
);

export const films = sqliteTable("films", {
  id: id(),
  title: text("title").notNull(),
  qlooName: text("qloo_name"),
  qlooId: text("qloo_id"),
  year: integer("year").notNull(),
  language: text("language").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  genresJson: text("genres_json").notNull().default("[]"),
  ...stamps,
});

export const restaurants = sqliteTable("restaurants", {
  id: id(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  area: text("area").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  costPerPersonAmount: integer("cost_per_person_amount").notNull(),
  currency: text("currency").notNull(),
  opens: text("opens").notNull(),
  closes: text("closes").notNull(),
  tagsJson: text("tags_json").notNull().default("[]"),
  image: text("image").notNull(),
  ...stamps,
});

/* ── Bookings ───────────────────────────────────────────────────── */

export const bookings = sqliteTable(
  "bookings",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    eventId: text("event_id").notNull().references(() => events.id),
    sessionId: text("session_id").notNull().references(() => eventSessions.id),
    tierId: text("tier_id").notNull().references(() => ticketTiers.id),
    qty: integer("qty").notNull(),
    currency: text("currency").notNull(),
    unitPriceAmount: integer("unit_price_amount").notNull(),
    feePerTicketAmount: integer("fee_per_ticket_amount").notNull(),
    ticketTotalAmount: integer("ticket_total_amount").notNull(),
    feeAmount: integer("fee_amount").notNull(),
    feeLabel: text("fee_label").notNull(),
    status: text("status", { enum: ["held", "confirmed", "cancelled"] }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    promoJson: text("promo_json"),
    cancelledAt: text("cancelled_at"),
    ...stamps,
  },
  (t) => [uniqueIndex("bookings_user_idem").on(t.userId, t.idempotencyKey), index("bookings_event").on(t.eventId), index("bookings_user").on(t.userId)],
);

/** One row per reserved seat; the unique index makes double-booking a seat impossible. */
export const bookedSeats = sqliteTable(
  "booked_seats",
  {
    id: id(),
    sessionId: text("session_id").notNull().references(() => eventSessions.id, { onDelete: "cascade" }),
    seat: text("seat").notNull(),
    bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    ...stamps,
  },
  (t) => [uniqueIndex("booked_seats_session_seat").on(t.sessionId, t.seat), index("booked_seats_booking").on(t.bookingId)],
);

/* ── Wishes ─────────────────────────────────────────────────────── */

export const wishes = sqliteTable(
  "wishes",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    rawText: text("raw_text").notNull().default(""),
    /** Category, or null for "any activity". */
    genre: text("genre"),
    keywordsJson: text("keywords_json").notNull().default("[]"),
    /** ISO-8601 date interval "YYYY-MM-DD/YYYY-MM-DD" (either side may be ".."), or null. */
    dayPref: text("day_pref"),
    budgetAmount: integer("budget_amount"),
    currency: text("currency").notNull(),
    city: text("city").notNull(),
    cityName: text("city_name").notNull(),
    area: text("area"),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    radiusKm: real("radius_km").notNull(),
    optedIn: bool("opted_in").notNull(),
    status: text("status", { enum: ["open", "proposed", "withdrawn"] }).notNull().default("open"),
    isSample: bool("is_sample").notNull().default(false),
    ...stamps,
  },
  (t) => [index("wishes_city").on(t.city, t.optedIn), index("wishes_user").on(t.userId)],
);

export const wishQlooLinks = sqliteTable("wish_qloo_links", { id: id(), wishId: text("wish_id").notNull().references(() => wishes.id, { onDelete: "cascade" }), qlooEntityId: text("qloo_entity_id").notNull(), name: text("name").notNull(), ...stamps }, (t) => [index("wish_qloo_links_wish").on(t.wishId)]);

export const wishProposals = sqliteTable(
  "wish_proposals",
  { id: id(), wishId: text("wish_id").notNull().references(() => wishes.id, { onDelete: "cascade" }), eventId: text("event_id").notNull().references(() => events.id), organizerId: text("organizer_id").notNull(), ...stamps },
  (t) => [uniqueIndex("wish_proposals_wish_event").on(t.wishId, t.eventId)],
);

/* ── Saved items, boards, inbox ─────────────────────────────────── */

export const savedEvents = sqliteTable("saved_events", { id: id(), userId: text("user_id").notNull().references(() => users.id), eventId: text("event_id").notNull().references(() => events.id), ...stamps }, (t) => [uniqueIndex("saved_events_user_event").on(t.userId, t.eventId)]);

export const savedSearches = sqliteTable("saved_searches", { id: id(), userId: text("user_id").notNull().references(() => users.id), label: text("label").notNull(), query: text("query").notNull(), city: text("city").notNull(), cityName: text("city_name").notNull(), ...stamps }, (t) => [index("saved_searches_user").on(t.userId)]);

export const boards = sqliteTable("boards", { id: id(), name: text("name").notNull(), ownerUserId: text("owner_user_id").notNull().references(() => users.id), city: text("city").notNull(), cityName: text("city_name").notNull(), currency: text("currency").notNull(), ...stamps });
export const boardItems = sqliteTable("board_items", { id: id(), boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }), eventId: text("event_id").notNull(), addedByUserId: text("added_by_user_id").notNull(), ...stamps }, (t) => [uniqueIndex("board_items_board_event").on(t.boardId, t.eventId)]);
export const boardVotes = sqliteTable("board_votes", { id: id(), boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }), eventId: text("event_id").notNull(), userId: text("user_id").notNull(), ...stamps }, (t) => [uniqueIndex("board_votes_unique").on(t.boardId, t.eventId, t.userId)]);
export const boardParticipants = sqliteTable(
  "board_participants",
  { id: id(), boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }), userId: text("user_id").notNull(), name: text("name"), budgetMax: integer("budget_max"), dateFrom: text("date_from"), dateTo: text("date_to"), ...stamps },
  (t) => [uniqueIndex("board_participants_unique").on(t.boardId, t.userId), index("board_participants_user").on(t.userId)],
);

export const notifications = sqliteTable("notifications", { id: id(), userId: text("user_id").notNull().references(() => users.id), kind: text("kind", { enum: ["proposal", "info"] }).notNull(), title: text("title").notNull(), body: text("body").notNull(), href: text("href"), isRead: bool("is_read").notNull().default(false), ...stamps }, (t) => [index("notifications_user").on(t.userId, t.createdAt)]);

/* ── Analytics and experiments ──────────────────────────────────── */

/** Views, saves, reservations and promo-card events. Simulated rows are flagged and excluded from real metrics. */
export const interactions = sqliteTable(
  "interactions",
  {
    id: id(),
    eventId: text("event_id").notNull(),
    userId: text("user_id"),
    kind: text("kind", { enum: ["view", "impression", "click", "save", "reservation"] }).notNull(),
    isSimulated: bool("is_simulated").notNull().default(false),
    experimentId: text("experiment_id"),
    variantId: text("variant_id"),
    audienceId: text("audience_id"),
    selectionProbability: real("selection_probability"),
    bookingId: text("booking_id"),
    ...stamps,
  },
  (t) => [index("interactions_event_kind").on(t.eventId, t.kind, t.isSimulated)],
);

/** LOLA-inspired promo-card experiments (Thompson sampling). Counters are kept as JSON per source. */
export const promoExperiments = sqliteTable(
  "promo_experiments",
  {
    id: id(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    organizerId: text("organizer_id").notNull(),
    audienceJson: text("audience_json").notNull(),
    status: text("status", { enum: ["draft", "running", "stopped"] }).notNull(),
    startedAt: text("started_at"),
    copySource: text("copy_source").notNull(),
    variantsJson: text("variants_json").notNull(),
    realCountsJson: text("real_counts_json").notNull(),
    simCountsJson: text("sim_counts_json").notNull(),
    simulationJson: text("simulation_json"),
    ...stamps,
  },
  (t) => [index("promo_experiments_event").on(t.eventId)],
);

export const titleLabs = sqliteTable("title_labs", {
  id: id(),
  eventId: text("event_id").notNull().unique().references(() => events.id, { onDelete: "cascade" }),
  organizerId: text("organizer_id").notNull(),
  status: text("status", { enum: ["running", "paused"] }).notNull(),
  configJson: text("config_json").notNull(),
  clustersJson: text("clusters_json").notNull(),
  /** Summary of the last synthetic run (chart series, equal-split comparison). Its rows are in variant_events with is_simulated = 1. */
  simulationJson: text("simulation_json"),
  ...stamps,
});

export const titleVariants = sqliteTable(
  "title_variants",
  {
    id: id(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    hook: text("hook").notNull(),
    /** The Qloo link this variant is built on; null for the plain control. */
    anchorLinkId: text("anchor_link_id").references(() => eventQlooLinks.id, { onDelete: "set null" }),
    anchorJson: text("anchor_json").notNull(),
    /** Mean predicted click appeal across clusters; per-cluster priors are in priors_json. */
    llmPrior: real("llm_prior").notNull(),
    priorsJson: text("priors_json").notNull(),
    priorSource: text("prior_source").notNull(),
    origin: text("origin").notNull(),
    reviewJson: text("review_json").notNull(),
    isApproved: bool("is_approved").notNull().default(false),
    status: text("status", { enum: ["active", "removed"] }).notNull(),
    position: integer("position").notNull(),
    ...stamps,
  },
  (t) => [index("title_variants_event").on(t.eventId)],
);

export const variantEvents = sqliteTable(
  "variant_events",
  {
    id: id(),
    variantId: text("variant_id").notNull().references(() => titleVariants.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    clusterKey: text("cluster_key").notNull(),
    kind: text("kind", { enum: ["impression", "click", "booking"] }).notNull(),
    isSimulated: bool("is_simulated").notNull().default(false),
    ...stamps,
  },
  (t) => [index("variant_events_variant_cluster_kind").on(t.variantId, t.clusterKey, t.kind), index("variant_events_created").on(t.isSimulated, t.createdAt)],
);

/* ── Qloo ───────────────────────────────────────────────────────── */

export const qlooCache = sqliteTable("qloo_cache", { key: text("key").primaryKey(), responseJson: text("response_json").notNull(), expiresAt: text("expires_at").notNull(), ...stamps }, (t) => [index("qloo_cache_expires").on(t.expiresAt)]);

/** Calls per calendar month (id = "YYYY-MM"), for the monthly budget. */
export const qlooUsage = sqliteTable("qloo_usage", { id: id(), calls: integer("calls").notNull().default(0), ...stamps });

/** Cached audience estimate: the opted-in interests Qloo connects to an event. */
export const eventAudience = sqliteTable("event_audience", { id: id(), connectedIdsJson: text("connected_ids_json").notNull(), ...stamps });

/* ── Taste-page suggestions ─────────────────────────────────────── */

/**
 * Pre-fetched interests for the taste page, so it loads from the database even when Qloo is slow.
 * `source`: popular (Qloo, popular in the city), trending (Qloo, trend-weighted; only stored when it
 * differs from plain popularity), starter (curated list resolved to Qloo IDs; city = "*").
 * `india_match`: Qloo's metadata ties the item to India (release country, Indian-music tags, …).
 */
export const interestSuggestions = sqliteTable(
  "interest_suggestions",
  {
    id: id(),
    city: text("city").notNull(),
    tab: text("tab").notNull(),
    source: text("source", { enum: ["popular", "trending", "starter"] }).notNull(),
    qlooEntityId: text("qloo_entity_id").notNull(),
    name: text("name").notNull(),
    qlooType: text("qloo_type").notNull(),
    imageUrl: text("image_url"),
    rank: integer("rank").notNull(),
    indiaMatch: bool("india_match").notNull().default(false),
    fetchedAt: text("fetched_at").notNull(),
    ...stamps,
  },
  (t) => [uniqueIndex("interest_suggestions_unique").on(t.city, t.tab, t.source, t.qlooEntityId), index("interest_suggestions_city_tab").on(t.city, t.tab, t.source, t.rank)],
);

/* ── Saved individual plans (from the planner) ──────────────────── */

/**
 * A planner option someone saved: one session of an event for a party, plus an optional dinner
 * suggestion. Amounts are recomputed on the server when saving (see money.ts for units).
 */
export const userPlans = sqliteTable(
  "user_plans",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull().references(() => eventSessions.id, { onDelete: "cascade" }),
    tierId: text("tier_id").notNull(),
    party: integer("party").notNull(),
    currency: text("currency").notNull(),
    ticketsTotalAmount: integer("tickets_total_amount").notNull(),
    /** Dinner suggestion: { restaurantId, name, area, start, estimate } (estimate in ordinary units), or null. */
    dinnerJson: text("dinner_json"),
    totalAmount: integer("total_amount").notNull(),
    ...stamps,
  },
  (t) => [uniqueIndex("user_plans_user_session").on(t.userId, t.sessionId), index("user_plans_user").on(t.userId, t.createdAt)],
);
