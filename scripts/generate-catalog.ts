/**
 * Generates data/catalog.json: the fictional sample catalog for three cities.
 * Sessions get stable IDs and absolute venue-local dates between SEASON_START and SEASON_END,
 * so shared links and reservations stay valid. Run with: npx tsx scripts/generate-catalog.ts
 *
 * Every event, venue, organizer and price here is made up and shown as "Sample listing".
 * Real films and artists appear only as screening titles or "for fans of" references, never as performers.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LAYOUTS, sectionCapacity } from "../src/lib/seating";

const SEASON_START = "2026-10-17";
const SEASON_END = "2026-12-27";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type TierSpec = { name: string; price: number; capacity: number; soldOut?: boolean };
type Spec = Record<string, unknown> & {
  id: string;
  cityId: string;
  days: Day[];
  time: string;
  /** Extra daily showtimes (cinemas). */
  times?: string[];
  durationMin: number;
  every?: 1 | 2; // weekly or fortnightly
  window?: { from: string; to: string };
  tiers: TierSpec[];
  /** Reserved seating: layout id from src/lib/seating.ts; tier names must match its sections. */
  seatLayout?: string;
};

const DAY_INDEX: Record<Day, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const CITIES = {
  "bengaluru-in": { timezone: "Asia/Kolkata", currency: "INR", fee: { rate: 0.05, taxRate: 0.18, taxName: "GST" } },
  "london-gb": { timezone: "Europe/London", currency: "GBP", fee: { rate: 0.05, taxRate: 0, taxName: null } },
  "new-york-us": { timezone: "America/New_York", currency: "USD", fee: { rate: 0.05, taxRate: 0, taxName: null } },
} as const;

const ORGANIZERS = [
  { id: "org-attic-room", name: "The Attic Room", cityId: "bengaluru-in", about: "A 40-seat listening room above a bookshop in Indiranagar. Sample organizer." },
  { id: "org-basement-sessions", name: "Basement Sessions", cityId: "bengaluru-in", about: "Small-format live music nights and songwriting labs. Sample organizer." },
  { id: "org-rangoli", name: "Rangoli Hall Collective", cityId: "bengaluru-in", about: "Community hall running theatre, film club and family shows. Sample organizer." },
  { id: "org-mud-kiln", name: "Mud & Kiln Studio", cityId: "bengaluru-in", about: "Pottery and craft studio in HSR Layout. Sample organizer." },
  { id: "org-trailfolk", name: "Trailfolk Outdoors", cityId: "bengaluru-in", about: "Small-group day treks around Bengaluru. Sample organizer." },
  { id: "org-laugh-loft", name: "The Laugh Loft", cityId: "bengaluru-in", about: "Stand-up and sketch comedy club. Sample organizer." },
  { id: "org-eastside", name: "Eastside Arena", cityId: "bengaluru-in", about: "Large-capacity venue for concerts and sports screenings. Sample organizer." },
  { id: "org-community", name: "Offbeat Community Hosts", cityId: "bengaluru-in", about: "Volunteer-run meetups. Sample organizer." },
  { id: "org-lakeside", name: "Lakeside Cinemas Group", cityId: "bengaluru-in", about: "Runs two neighbourhood cinemas showing Indian classics. Sample organizer." },
  { id: "org-canal-house", name: "Canal House Arts", cityId: "london-gb", about: "Arts space by Regent's Canal. Sample organizer." },
  { id: "org-southbank-walks", name: "Ridge & River Walks", cityId: "london-gb", about: "Guided day hikes from London. Sample organizer." },
  { id: "org-greenpoint", name: "Greenpoint Room", cityId: "new-york-us", about: "Brooklyn live room and cinema club. Sample organizer." },
  { id: "org-hudson-trails", name: "Hudson Trail Co.", cityId: "new-york-us", about: "Day hikes from New York City. Sample organizer." },
];

const V = {
  basement: { name: "Basement Sessions", area: "Indiranagar", lat: 12.9827, lng: 77.6412 },
  attic: { name: "The Attic Room", area: "Indiranagar", lat: 12.9775, lng: 77.646 },
  laughLoft: { name: "The Laugh Loft", area: "Indiranagar", lat: 12.97, lng: 77.638 },
  littleStage: { name: "Little Stage", area: "Indiranagar", lat: 12.976, lng: 77.6395 },
  velvet: { name: "The Velvet Room", area: "Indiranagar", lat: 12.9735, lng: 77.643 },
  loadingBay: { name: "The Loading Bay", area: "Koramangala", lat: 12.9352, lng: 77.6245 },
  thirdFloor: { name: "Third Floor Tap", area: "Koramangala", lat: 12.934, lng: 77.626 },
  studio33: { name: "Studio 33", area: "Koramangala", lat: 12.9365, lng: 77.62 },
  paperLantern: { name: "Paper Lantern Café", area: "Koramangala", lat: 12.933, lng: 77.623 },
  eastside: { name: "Eastside Arena", area: "HSR Layout", lat: 12.9116, lng: 77.6474 },
  groundfloor: { name: "Groundfloor Café", area: "HSR Layout", lat: 12.9135, lng: 77.641 },
  blackbox: { name: "Blackbox HSR", area: "HSR Layout", lat: 12.91, lng: 77.639 },
  mudKiln: { name: "Mud & Kiln Studio", area: "HSR Layout", lat: 12.915, lng: 77.644 },
  turf: { name: "Turf Park HSR", area: "HSR Layout", lat: 12.909, lng: 77.65 },
  courtyard: { name: "Courtyard Commons", area: "Jayanagar", lat: 12.925, lng: 77.5838 },
  rangoli: { name: "Rangoli Hall", area: "Jayanagar", lat: 12.929, lng: 77.582 },
  trailhead: { name: "Trailfolk pickup point, Hebbal", area: "Hebbal", lat: 13.0358, lng: 77.597 },
  canal: { name: "Canal House Arts", area: "King's Cross", lat: 51.5362, lng: -0.1235 },
  canalCinema: { name: "Canal House Screening Room", area: "King's Cross", lat: 51.5362, lng: -0.1235 },
  hackneyCellar: { name: "The Cellar, Hackney", area: "Hackney", lat: 51.5450, lng: -0.0553 },
  clayLondon: { name: "Wheelhouse Ceramics", area: "Peckham", lat: 51.4693, lng: -0.0692 },
  marylebone: { name: "Marylebone Station concourse", area: "Marylebone", lat: 51.5225, lng: -0.1631 },
  greenpoint: { name: "Greenpoint Room", area: "Greenpoint, Brooklyn", lat: 40.7304, lng: -73.9542 },
  greenpointCinema: { name: "Greenpoint Room Cinema Club", area: "Greenpoint, Brooklyn", lat: 40.7304, lng: -73.9542 },
  lesComedy: { name: "Rivington Basement", area: "Lower East Side", lat: 40.7205, lng: -73.9876 },
  clayNY: { name: "Kiln & Co. Studio", area: "Williamsburg, Brooklyn", lat: 40.7142, lng: -73.9614 },
  grandCentral: { name: "Grand Central Terminal, main concourse clock", area: "Midtown", lat: 40.7527, lng: -73.9772 },
  bookshopNY: { name: "Second Story Books", area: "West Village", lat: 40.7347, lng: -74.0027 },
};

const IMG = { music: "/images/rooftop-gig.jpg", loft: "/images/loft-folk.jpg", cafe: "/images/vibe-cafe.jpg", street: "/images/plan-street.jpg", food: "/images/dinner-coffee.jpg" };

const T = (name: string, price: number, capacity: number, soldOut = false): TierSpec => ({ name, price, capacity, soldOut });
const BLR = "bengaluru-in", LDN = "london-gb", NYC = "new-york-us";

const SPECS: Spec[] = [
  // ── Bengaluru: music ─────────────────────────────────────────────
  {
    id: "acoustic-sundowner", cityId: BLR, category: "Music", title: "Acoustic Sundowner", venue: V.basement, organizerId: "org-basement-sessions",
    days: ["sat"], time: "19:00", durationMin: 105, image: IMG.music,
    summary: "Two-hour acoustic set, seated, 80 seats",
    description: "An unplugged evening of original singer-songwriter sets as the sun goes down. Two short sets with a break in between.",
    whatYoullDo: ["Listen to two acoustic sets from local songwriters", "Grab a drink at the bar during the interval"],
    audience: "Anyone who likes quiet, lyric-led live music. Works well solo.",
    facts: { soloFriendly: true }, show: { performers: ["Meera & the Monsoon Strings (fictional)"], doorsBeforeMin: 15, seating: "Seated, unreserved" },
    inclusions: ["Entry to both sets"], exclusions: ["Food and drinks"], restrictions: ["18+ (bar venue)"],
    cancellation: "Organizer policy (sample): full refund up to 48 hours before the show.",
    tags: ["acoustic", "singer-songwriter", "indie folk"],
    qlooRefs: [{ name: "Prateek Kuhad", type: "artist", relation: "for-fans-of" }, { name: "Acoustic", type: "tag" }, { name: "Singer-Songwriter", type: "tag" }],
    tiers: [T("Early bird", 899, 20, true), T("Regular", 1199, 50), T("Front row", 1799, 10)],
  },
  {
    id: "folk-fables-night", cityId: BLR, category: "Music", title: "Folk & Fables Night", venue: V.attic, organizerId: "org-attic-room",
    days: ["sat"], time: "19:30", durationMin: 90, image: IMG.loft,
    summary: "Folk songs and spoken stories in a 48-seat loft",
    description: "Indie folk songs stitched together with short spoken stories. Floor cushions up front, chairs at the back.",
    whatYoullDo: ["Hear an hour of folk songs and stories", "Stay for a short Q&A with the collective"],
    audience: "Fans of folk, storytelling and small rooms.",
    facts: { soloFriendly: true }, show: { performers: ["The Kathaa Collective (fictional)"], doorsBeforeMin: 15, seating: "Floor cushions and chairs, unreserved" },
    inclusions: ["Entry", "One filter coffee"], cancellation: "Organizer policy (sample): refunds until 24 hours before.",
    tags: ["indie folk", "storytelling", "acoustic"],
    qlooRefs: [{ name: "The Local Train", type: "artist", relation: "for-fans-of" }, { name: "Indie Folk", type: "tag" }, { name: "Folk", type: "tag" }],
    tiers: [T("Regular", 899, 40), T("Front row", 1299, 8)],
  },
  {
    id: "neon-district-live", cityId: BLR, category: "Music", title: "Neon District Live", venue: V.loadingBay, organizerId: "org-eastside",
    days: ["sat"], every: 2, time: "21:00", durationMin: 150, image: IMG.street,
    summary: "Synth-pop and electronic double bill, standing",
    description: "Two electronic acts on a full light rig in a converted warehouse.",
    whatYoullDo: ["Dance through two live electronic sets"], audience: "Late-night crowd who like synth-pop and electronic music.",
    facts: {}, show: { performers: ["Pixel Monsoon (fictional)", "Static Bloom (fictional)"], doorsBeforeMin: 30, seating: "Standing" },
    restrictions: ["18+, ID checked at the door"], tags: ["electronic", "synth-pop"],
    qlooRefs: [{ name: "Synth-Pop", type: "tag" }, { name: "Electronic", type: "tag" }],
    tiers: [T("Early bird", 1999, 80, true), T("Regular", 2499, 200), T("VIP", 4499, 30)],
  },
  {
    id: "carnatic-under-the-stars", cityId: BLR, category: "Music", title: "Carnatic Under the Stars", venue: V.courtyard, organizerId: "org-community",
    days: ["sun"], time: "18:00", durationMin: 120, image: IMG.loft,
    summary: "Open-air Carnatic concert in a courtyard",
    description: "A vocal and violin Carnatic recital in an open courtyard. Bring a shawl; it gets cool after dark.",
    whatYoullDo: ["Listen to a two-hour Carnatic recital"], audience: "Classical music listeners and the curious.",
    facts: { familyFriendly: true, soloFriendly: true }, show: { performers: ["Ensemble Swarasthana (fictional)"], seating: "Mats and chairs" },
    bring: ["A shawl or light jacket"], tags: ["carnatic", "classical"],
    qlooRefs: [{ name: "Carnatic", type: "tag" }, { name: "Indian Classical", type: "tag" }],
    tiers: [T("Regular", 799, 120), T("Front row", 1299, 20)],
  },
  {
    id: "jazz-at-the-attic", cityId: BLR, category: "Music", title: "Jazz at the Attic", venue: V.attic, organizerId: "org-attic-room",
    days: ["fri"], time: "20:00", durationMin: 120, image: IMG.loft,
    summary: "Piano trio jazz, two sets", description: "A piano trio playing standards and originals across two sets.",
    whatYoullDo: ["Listen to two jazz sets"], audience: "Jazz fans and date nights.", facts: { soloFriendly: true },
    show: { performers: ["The Blue Hour Trio (fictional)"], doorsBeforeMin: 15, seating: "Seated, unreserved" },
    tags: ["jazz"], qlooRefs: [{ name: "Jazz", type: "tag" }], tiers: [T("Regular", 1499, 40)],
  },
  {
    id: "skyline-parade-live", cityId: BLR, category: "Music", title: "Skyline Parade Live", venue: V.eastside, organizerId: "org-eastside",
    days: ["sun"], every: 2, time: "18:30", durationMin: 240, image: IMG.street,
    summary: "Arena pop concert with three support acts", description: "A big-stage pop show with three support acts.",
    whatYoullDo: ["Watch four acts on the main stage"], audience: "Pop fans; expect a big crowd.", facts: {},
    show: { performers: ["Skyline Parade (fictional)"], doorsBeforeMin: 90, seating: "Standing floor and seated stands" },
    restrictions: ["Bags larger than A4 not allowed (organizer rule, sample)"], tags: ["pop"], qlooRefs: [{ name: "Pop", type: "tag" }],
    tiers: [T("Early bird", 3999, 500, true), T("Regular", 5999, 3000), T("VIP", 12999, 200)],
  },
  // ── Bengaluru: movies ────────────────────────────────────────────
  // ── Bengaluru: comedy, theatre, performances ─────────────────────
  {
    id: "late-night-open-mic", cityId: BLR, category: "Comedy", title: "Late-Night Open Mic", venue: V.thirdFloor, organizerId: "org-laugh-loft",
    days: ["wed", "sat"], time: "21:00", durationMin: 90, image: IMG.street,
    summary: "New stand-up material, 8–10 comics", description: "A rotating line-up trying new stand-up material. Expect rough edges.",
    whatYoullDo: ["Watch 8–10 short stand-up sets"], audience: "Comedy fans who enjoy work-in-progress sets.", facts: { soloFriendly: true },
    show: { performers: ["Rotating line-up"], seating: "Seated, unreserved" }, restrictions: ["18+"], tags: ["stand-up"],
    qlooRefs: [{ name: "Stand-Up Comedy", type: "tag" }], tiers: [T("Regular", 699, 80)],
  },
  {
    id: "crowd-work-chronicles", cityId: BLR, category: "Comedy", title: "Crowd Work Chronicles", venue: V.laughLoft, organizerId: "org-laugh-loft",
    days: ["sat"], time: "19:30", durationMin: 90, image: IMG.street,
    summary: "Improvised crowd-work stand-up", description: "A headline set built almost entirely from talking to the audience.",
    whatYoullDo: ["Watch a 75-minute headline set"], audience: "Anyone who doesn't mind being part of the show.", facts: {},
    show: { performers: ["Ravi Nambiar (fictional)"], seating: "Seated, reserved rows" }, restrictions: ["16+"],
    tags: ["stand-up", "crowd work"], qlooRefs: [{ name: "Stand-Up Comedy", type: "tag" }],
    tiers: [T("Early bird", 999, 40, true), T("Regular", 1299, 120), T("Front row", 1999, 20)],
  },
  {
    id: "the-last-train-home", cityId: BLR, category: "Theatre", title: "The Last Train Home", venue: V.rangoli, organizerId: "org-rangoli",
    days: ["fri", "sat"], time: "19:30", durationMin: 135, image: IMG.cafe,
    summary: "Two-act drama in English, one interval", description: "A two-act drama about strangers sharing the last train out of the city.",
    whatYoullDo: ["Watch a two-act play with one interval"], audience: "Theatre-goers; contains mild language.", facts: { soloFriendly: true },
    show: { performers: ["Rangoli Repertory (fictional)"], doorsBeforeMin: 20, seating: "Seated, reserved" }, restrictions: ["12+"],
    tags: ["drama"], qlooRefs: [{ name: "Drama", type: "tag" }], seatLayout: "theatre-hall", tiers: [T("Stalls", 999, 0), T("Balcony", 799, 0)],
  },
  {
    id: "monsoon-letters", cityId: BLR, category: "Theatre", title: "Monsoon Letters", venue: V.littleStage, organizerId: "org-rangoli",
    days: ["sat", "sun"], time: "18:00", durationMin: 90, image: IMG.loft,
    summary: "Two-hander in English and Kannada, no interval", description: "Two strangers swap letters through one long monsoon. A quiet, funny two-hander performed without an interval.",
    whatYoullDo: ["Watch a 90-minute play with no interval"], audience: "Theatre-goers who like small, intimate productions.", facts: { soloFriendly: true },
    show: { performers: ["Little Stage Company (fictional)"], doorsBeforeMin: 20, seating: "Reserved seats, studio" }, restrictions: ["Latecomers admitted at a suitable break only"],
    tags: ["drama", "storytelling"], qlooRefs: [{ name: "Drama", type: "tag" }, { name: "Storytelling", type: "tag" }], seatLayout: "blackbox-small", tiers: [T("Front", 1299, 0), T("Standard", 799, 0)],
  },
  {
    id: "two-chairs-one-table", cityId: BLR, category: "Theatre", title: "Two Chairs, One Table", venue: V.blackbox, organizerId: "org-rangoli",
    days: ["fri"], time: "20:00", durationMin: 75, image: IMG.cafe,
    summary: "Short new plays, three 25-minute pieces", description: "Three short new plays, each using only two chairs and one table.",
    whatYoullDo: ["Watch three short plays"], audience: "Anyone curious about new writing.", facts: { soloFriendly: true },
    show: { performers: ["Blackbox Collective (fictional)"], seating: "Reserved seats, studio" }, tags: ["drama", "new writing"], qlooRefs: [{ name: "Drama", type: "tag" }],
    seatLayout: "blackbox-small", tiers: [T("Front", 1199, 0), T("Standard", 899, 0)],
  },
  {
    id: "storytellers-circle", cityId: BLR, category: "Performances", title: "Storytellers' Circle", venue: V.courtyard, organizerId: "org-community",
    days: ["sun"], time: "18:30", durationMin: 90, image: IMG.cafe,
    summary: "Spoken stories, open sign-up for 5-minute slots", description: "True stories told live. Sign up on the night for a 5-minute slot or just listen.",
    whatYoullDo: ["Listen to 10–12 short true stories", "Optionally tell one yourself"], audience: "Listeners and first-time storytellers.",
    facts: { beginnerFriendly: true, soloFriendly: true }, show: { performers: ["Open sign-up"], seating: "Chairs in a circle" },
    tags: ["storytelling", "spoken word"], qlooRefs: [{ name: "Storytelling", type: "tag" }], tiers: [T("Regular", 599, 80)],
  },
  {
    id: "close-up-magic-hour", cityId: BLR, category: "Performances", title: "Close-up Magic Hour", venue: V.velvet, organizerId: "org-attic-room",
    days: ["sat"], time: "21:30", durationMin: 60, image: IMG.street,
    summary: "Sleight of hand at arm's length, 30 seats", description: "Card and coin magic performed at your table.",
    whatYoullDo: ["Watch an hour of close-up magic"], audience: "Groups and date nights.", facts: {},
    show: { performers: ["The Card Sharp of Domlur (fictional)"], seating: "Tables of 4" }, tags: ["magic"],
    qlooRefs: [{ name: "Magic", type: "tag" }], tiers: [T("Regular", 1499, 30), T("Front row", 1999, 8)],
  },
  // ── Bengaluru: workshops & classes ───────────────────────────────
  {
    id: "pottery-wheel-basics", cityId: BLR, category: "Workshops & classes", title: "Pottery Wheel Basics", venue: V.mudKiln, organizerId: "org-mud-kiln",
    days: ["sun"], time: "11:00", durationMin: 180, image: IMG.cafe,
    summary: "Beginner wheel-throwing class, clay and firing included",
    description: "Learn to centre clay and throw two small bowls on the wheel. Pieces are glazed and fired by the studio.",
    whatYoullDo: ["Centre clay on the wheel", "Throw and trim two small pieces", "Choose a glaze colour"],
    audience: "Complete beginners, 14 and over.", facts: { beginnerFriendly: true, materialsIncluded: true, soloFriendly: true, ageMin: 14 },
    class: { level: "Beginner", materials: "Clay, tools, glaze and one firing included", durationMin: 180 },
    inclusions: ["Clay and tools", "Glazing and one firing", "Collection of fired pieces after 2 weeks"], exclusions: ["Shipping of pieces"],
    bring: ["Clothes you don't mind getting muddy", "Short nails help"], restrictions: ["Minimum age 14"],
    cancellation: "Organizer policy (sample): reschedule free up to 72 hours before; no refunds after.",
    tags: ["pottery", "hands-on"], qlooRefs: [{ name: "Pottery", type: "tag" }], tiers: [T("Regular", 2499, 12)],
  },
  {
    id: "pottery-handbuilding-evening", cityId: BLR, category: "Workshops & classes", title: "Hand-building Pottery Evening", venue: V.mudKiln, organizerId: "org-mud-kiln",
    days: ["sun"], time: "17:00", durationMin: 150, image: IMG.cafe,
    summary: "Pinch and coil pots, no wheel needed", description: "Make a planter and a cup by hand using pinch and coil methods.",
    whatYoullDo: ["Make two hand-built pieces"], audience: "Beginners and friends looking for a relaxed evening.",
    facts: { beginnerFriendly: true, materialsIncluded: true, soloFriendly: true }, class: { level: "Beginner", materials: "Clay and tools included", durationMin: 150 },
    inclusions: ["Clay, tools and one firing"], tags: ["pottery"], qlooRefs: [{ name: "Pottery", type: "tag" }], tiers: [T("Regular", 1499, 14)],
  },
  {
    id: "songwriting-lab", cityId: BLR, category: "Workshops & classes", title: "Songwriting Lab", venue: V.basement, organizerId: "org-basement-sessions",
    days: ["sat"], every: 2, time: "15:00", durationMin: 150, image: IMG.music,
    summary: "Write a verse and chorus in a small group", description: "Guided exercises to write and workshop a short song.",
    whatYoullDo: ["Do three writing exercises", "Share a draft for feedback"], audience: "People who play an instrument or sing, any level.",
    facts: { beginnerFriendly: true, soloFriendly: true }, class: { level: "All levels", durationMin: 150 }, bring: ["Your instrument, if you play one", "Notebook"],
    tags: ["songwriting"], qlooRefs: [{ name: "Singer-Songwriter", type: "tag" }], tiers: [T("Early bird", 1499, 6, true), T("Regular", 1999, 14)],
  },
  {
    id: "block-printing-afternoon", cityId: BLR, category: "Workshops & classes", title: "Block Printing Afternoon", venue: V.courtyard, organizerId: "org-community",
    days: ["sat"], time: "14:00", durationMin: 180, image: IMG.cafe,
    summary: "Print a tote bag with hand-carved blocks", description: "Learn block-printing basics and print your own tote bag and napkin set.",
    whatYoullDo: ["Practise on paper", "Print a tote bag and two napkins"], audience: "Beginners; good for pairs.",
    facts: { beginnerFriendly: true, materialsIncluded: true }, class: { level: "Beginner", materials: "Blocks, fabric paint, tote bag and napkins", durationMin: 180 },
    inclusions: ["All materials", "Your printed tote and napkins"], tags: ["craft", "textiles"], qlooRefs: [{ name: "Crafts", type: "tag" }], tiers: [T("Regular", 1899, 16)],
  },
  // ── Bengaluru: treks, meetups, kids, sports ──────────────────────
  {
    id: "sunrise-ridge-trek", cityId: BLR, category: "Treks & outdoors", title: "Sunrise Ridge Trek", venue: V.trailhead, organizerId: "org-trailfolk",
    days: ["sun"], time: "03:30", durationMin: 480, image: IMG.street,
    summary: "Night drive, 2-hour climb to a sunrise viewpoint",
    description: "Leave the city before dawn, climb a rocky ridge to watch sunrise, and be back by late morning. Ridge name withheld in this fictional sample.",
    whatYoullDo: ["Shared bus from Hebbal", "Guided 2-hour ascent in the dark", "Sunrise and breakfast at the top", "Descend and return by 11:30"],
    audience: "Reasonably fit adults comfortable on uneven rock.", facts: { soloFriendly: true, ageMin: 16 },
    trek: {
      difficulty: "Moderate (organizer's rating)", distanceKm: 8, elevationM: 450, meetingPoint: "Trailfolk pickup point, Hebbal flyover bus stop",
      transport: "Shared non-AC bus from Hebbal and back", equipment: ["Trekking shoes with grip", "Head torch", "2 litres of water", "Light rain jacket"],
      itinerary: [{ time: "03:30", step: "Meet at Hebbal" }, { time: "05:00", step: "Start climb" }, { time: "06:30", step: "Sunrise at the top, breakfast" }, { time: "08:30", step: "Descend" }, { time: "11:30", step: "Back at Hebbal" }],
    },
    inclusions: ["Return bus", "Trek leader", "Simple breakfast"], exclusions: ["Personal gear", "Insurance"], restrictions: ["Minimum age 16"],
    cancellation: "Organizer policy (sample): full refund if cancelled for weather; otherwise 50% up to 48 hours before.",
    tags: ["trekking", "outdoors", "sunrise"], qlooRefs: [{ name: "Hiking", type: "tag" }], tiers: [T("Regular", 1799, 25)],
  },
  {
    id: "indie-listeners-club", cityId: BLR, category: "Meetups", title: "Indie Listeners' Club", venue: V.attic, organizerId: "org-attic-room",
    days: ["sun"], time: "17:00", durationMin: 120, image: IMG.loft,
    summary: "Bring a record, play one track, talk about it", description: "A free listening meetup: everyone brings one track to play and talk about.",
    whatYoullDo: ["Play one track and say why you love it", "Discover new music"], audience: "Music fans of any taste. Great for meeting people.",
    facts: { soloFriendly: true, beginnerFriendly: true }, tags: ["indie folk", "listening party"], qlooRefs: [{ name: "Indie", type: "tag" }],
    tiers: [T("Free", 0, 40)],
  },
  {
    id: "board-game-night", cityId: BLR, category: "Meetups", title: "Board Game Night", venue: V.paperLantern, organizerId: "org-community",
    days: ["fri"], time: "19:00", durationMin: 180, image: IMG.cafe,
    summary: "200+ games, hosts teach the rules", description: "Drop in, get matched to a table, and learn a new game.",
    whatYoullDo: ["Play 2–3 games with new people"], audience: "Solo visitors welcome; hosts seat you at a table.",
    facts: { soloFriendly: true, beginnerFriendly: true }, tags: ["games"], qlooRefs: [{ name: "Board Games", type: "tag" }], tiers: [T("Regular", 299, 40)],
  },
  {
    id: "puppet-theatre-for-kids", cityId: BLR, category: "Kids", title: "Puppet Theatre for Kids", venue: V.rangoli, organizerId: "org-rangoli",
    days: ["sat"], time: "11:00", durationMin: 60, image: IMG.cafe,
    summary: "Hour-long string-puppet show, ages 4–10", description: "A string-puppet retelling of a folk tale, with a short puppet-making demo after.",
    whatYoullDo: ["Watch a 45-minute puppet show", "See how the puppets work"], audience: "Children aged 4–10 with an adult.",
    facts: { familyFriendly: true }, show: { performers: ["Kathputli Kids (fictional)"], seating: "Floor mats for kids, chairs for adults" },
    restrictions: ["Children must be accompanied by an adult"], tags: ["puppetry", "family"], qlooRefs: [{ name: "Puppetry", type: "tag" }],
    tiers: [T("Regular", 599, 100), T("Front row", 899, 20)],
  },
  {
    id: "sunday-five-a-side", cityId: BLR, category: "Sports", title: "Sunday Five-a-side League", venue: V.turf, organizerId: "org-community",
    days: ["sun"], time: "07:00", durationMin: 120, image: IMG.street,
    summary: "Join a mixed team for three matches", description: "Turn up solo and get placed on a mixed five-a-side team.",
    whatYoullDo: ["Play three 20-minute matches"], audience: "Casual players of any level.", facts: { soloFriendly: true, beginnerFriendly: true },
    bring: ["Football boots or turf shoes", "Water"], tags: ["football"], qlooRefs: [{ name: "Soccer", type: "tag" }], tiers: [T("Regular", 999, 40)],
  },
  // ── London ───────────────────────────────────────────────────────
  {
    id: "canal-house-jazz", cityId: LDN, category: "Music", title: "Canalside Jazz Sessions", venue: V.canal, organizerId: "org-canal-house",
    days: ["fri"], time: "19:30", durationMin: 120, image: IMG.loft,
    summary: "Quartet jazz by the canal, seated", description: "A jazz quartet playing two sets in a converted warehouse by Regent's Canal.",
    whatYoullDo: ["Listen to two jazz sets"], audience: "Jazz fans and date nights.", facts: { soloFriendly: true },
    show: { performers: ["The Lock Keepers Quartet (fictional)"], doorsBeforeMin: 30, seating: "Seated, unreserved" },
    restrictions: ["18+ after 9 pm"], tags: ["jazz"], qlooRefs: [{ name: "Jazz", type: "tag" }], tiers: [T("Standard", 18, 80), T("Table for two", 45, 10)],
  },
  {
    id: "hackney-folk-cellar", cityId: LDN, category: "Music", title: "Folk in the Cellar", venue: V.hackneyCellar, organizerId: "org-canal-house",
    days: ["thu"], time: "20:00", durationMin: 120, image: IMG.music,
    summary: "Three folk singer-songwriters, standing", description: "Three short folk sets in a brick cellar.",
    whatYoullDo: ["Hear three acoustic sets"], audience: "Folk and singer-songwriter fans.", facts: { soloFriendly: true },
    show: { performers: ["Three rotating local acts"], seating: "Standing, a few stools" }, restrictions: ["18+"],
    tags: ["indie folk", "acoustic"], qlooRefs: [{ name: "Laura Marling", type: "artist", relation: "for-fans-of" }, { name: "Indie Folk", type: "tag" }],
    tiers: [T("Advance", 14, 90), T("Door", 18, 30)],
  },
  {
    id: "wheel-throwing-taster-ldn", cityId: LDN, category: "Workshops & classes", title: "Wheel-throwing Taster", venue: V.clayLondon, organizerId: "org-canal-house",
    days: ["sat"], time: "10:30", durationMin: 150, image: IMG.cafe,
    summary: "Beginner pottery, two pieces fired for you", description: "Try the potter's wheel and make two small pieces, glazed and fired by the studio.",
    whatYoullDo: ["Learn to centre clay", "Throw two pieces"], audience: "Complete beginners, 16+.", facts: { beginnerFriendly: true, materialsIncluded: true, soloFriendly: true, ageMin: 16 },
    class: { level: "Beginner", materials: "Clay, tools, glaze and firing", durationMin: 150 }, inclusions: ["Clay, tools, glazing and firing"],
    cancellation: "Organizer policy (sample): transfer to another date up to 5 days before.", tags: ["pottery"], qlooRefs: [{ name: "Pottery", type: "tag" }],
    tiers: [T("Standard", 65, 10)],
  },
  {
    id: "chilterns-day-hike", cityId: LDN, category: "Treks & outdoors", title: "Chilterns Day Hike", venue: V.marylebone, organizerId: "org-southbank-walks",
    days: ["sun"], every: 2, time: "08:45", durationMin: 540, image: IMG.street,
    summary: "18 km guided walk through beech woods", description: "A guided day walk through chalk hills and beech woods, with a pub lunch stop.",
    whatYoullDo: ["Train out of London together", "Walk about 18 km with a leader", "Optional pub lunch"], audience: "Regular walkers comfortable with 6 hours on foot.",
    facts: { soloFriendly: true },
    trek: {
      difficulty: "Moderate (organizer's rating)", distanceKm: 18, elevationM: 380, meetingPoint: "Marylebone Station concourse, under the departure boards",
      transport: "Train (buy your own off-peak return; not included)", equipment: ["Walking boots", "Waterproof jacket", "Packed snacks", "1.5 litres of water"],
      itinerary: [{ time: "08:45", step: "Meet at Marylebone" }, { time: "10:00", step: "Start walking" }, { time: "13:00", step: "Pub lunch (optional, pay yourself)" }, { time: "16:30", step: "Finish at station" }],
    },
    inclusions: ["Walk leader", "Route map"], exclusions: ["Train fare", "Lunch"], tags: ["hiking", "outdoors"], qlooRefs: [{ name: "Hiking", type: "tag" }],
    tiers: [T("Standard", 15, 20)],
  },
  {
    id: "midsummer-ldn", cityId: LDN, category: "Theatre", title: "A Midsummer Night's Dream", venue: V.canal, organizerId: "org-canal-house",
    days: ["thu", "sat"], time: "19:30", durationMin: 150, image: IMG.loft,
    summary: "Shakespeare's comedy, one interval", description: "A small-company production of Shakespeare's comedy in a converted warehouse theatre.",
    whatYoullDo: ["Watch the play with one 20-minute interval"], audience: "Ages 10+; no Shakespeare experience needed.", facts: { familyFriendly: true },
    show: { performers: ["Riverside Players (fictional)"], doorsBeforeMin: 30, seating: "Reserved seats" }, tags: ["drama", "comedy", "shakespeare"],
    qlooRefs: [{ name: "Drama", type: "tag" }], seatLayout: "theatre-hall", tiers: [T("Stalls", 24, 0), T("Balcony", 16, 0)],
  },
  {
    id: "improv-jam-ldn", cityId: LDN, category: "Comedy", title: "Sunday Improv Jam", venue: V.canal, organizerId: "org-canal-house",
    days: ["sun"], time: "19:00", durationMin: 90, image: IMG.street,
    summary: "Improvised comedy built from audience suggestions", description: "A troupe builds scenes from your suggestions. Optional jam at the end.",
    whatYoullDo: ["Watch an improvised show"], audience: "Comedy fans.", facts: { soloFriendly: true },
    show: { performers: ["Plot Twist Players (fictional)"], seating: "Seated, unreserved" }, tags: ["improv"], qlooRefs: [{ name: "Improv", type: "tag" }],
    tiers: [T("Standard", 12, 70)],
  },
  // ── New York ─────────────────────────────────────────────────────
  {
    id: "greenpoint-indie-night", cityId: NYC, category: "Music", title: "Greenpoint Indie Night", venue: V.greenpoint, organizerId: "org-greenpoint",
    days: ["sat"], time: "20:00", durationMin: 150, image: IMG.music,
    summary: "Three indie bands, standing room", description: "Three up-and-coming indie bands in a 250-capacity room.",
    whatYoullDo: ["See three live sets"], audience: "Indie rock fans.", facts: {},
    show: { performers: ["Three rotating local bands"], doorsBeforeMin: 30, seating: "Standing" }, restrictions: ["21+ with ID"],
    tags: ["indie rock"], qlooRefs: [{ name: "Indie Rock", type: "tag" }], tiers: [T("Advance", 22, 200), T("Door", 28, 50)],
  },
  {
    id: "night-train-albany-ny", cityId: NYC, category: "Theatre", title: "Night Train to Albany", venue: V.greenpoint, organizerId: "org-greenpoint",
    days: ["fri", "sat"], time: "19:00", durationMin: 105, image: IMG.cafe,
    summary: "New American play, no interval", description: "A new play about three siblings sharing a night train home for a funeral.",
    whatYoullDo: ["Watch a 105-minute play"], audience: "Adults; contains strong language.", facts: { soloFriendly: true, ageMin: 16 },
    show: { performers: ["Greenpoint Rep (fictional)"], doorsBeforeMin: 30, seating: "Reserved seats, studio" }, tags: ["drama", "new writing"],
    qlooRefs: [{ name: "Drama", type: "tag" }], seatLayout: "blackbox-small", tiers: [T("Front", 45, 0), T("Standard", 32, 0)],
  },
  {
    id: "les-standup-showcase", cityId: NYC, category: "Comedy", title: "Lower East Side Stand-up Showcase", venue: V.lesComedy, organizerId: "org-greenpoint",
    days: ["fri", "sat"], time: "21:30", durationMin: 90, image: IMG.street,
    summary: "Six comics, one drink minimum", description: "A showcase of six stand-up comics in a basement room.",
    whatYoullDo: ["Watch six stand-up sets"], audience: "Comedy fans, 21+.", facts: {},
    show: { performers: ["Six rotating comics"], seating: "Seated, tables" }, restrictions: ["21+ with ID", "One-drink minimum (venue rule, sample)"],
    tags: ["stand-up"], qlooRefs: [{ name: "Stand-Up Comedy", type: "tag" }], tiers: [T("General", 20, 60), T("Front table", 35, 12)],
  },
  {
    id: "ceramics-date-night-ny", cityId: NYC, category: "Workshops & classes", title: "Ceramics Date Night", venue: V.clayNY, organizerId: "org-greenpoint",
    days: ["thu"], time: "19:00", durationMin: 120, image: IMG.cafe,
    summary: "Hand-build mugs for two, BYOB", description: "Make a pair of hand-built mugs. The studio glazes and fires them.",
    whatYoullDo: ["Hand-build two mugs"], audience: "Pairs and beginners, 21+ (BYOB).", facts: { beginnerFriendly: true, materialsIncluded: true },
    class: { level: "Beginner", materials: "Clay, tools, glaze and firing", durationMin: 120 }, restrictions: ["21+ (BYOB)"],
    tags: ["pottery"], qlooRefs: [{ name: "Pottery", type: "tag" }], tiers: [T("Per person", 58, 16)],
  },
  {
    id: "hudson-valley-hike", cityId: NYC, category: "Treks & outdoors", title: "Hudson Highlands Day Hike", venue: V.grandCentral, organizerId: "org-hudson-trails",
    days: ["sat"], every: 2, time: "07:45", durationMin: 600, image: IMG.street,
    summary: "Steep 11 km loop with river views", description: "A guided hike with a steep rocky climb and long views over the Hudson River.",
    whatYoullDo: ["Train up the Hudson line", "Hike an 11 km loop", "Picnic at a viewpoint"], audience: "Fit hikers comfortable with steep, rocky scrambles.",
    facts: { soloFriendly: true, ageMin: 18 },
    trek: {
      difficulty: "Strenuous (organizer's rating)", distanceKm: 11, elevationM: 600, meetingPoint: "Grand Central Terminal, main concourse clock",
      transport: "Metro-North train (fare not included)", equipment: ["Hiking boots", "2 litres of water", "Lunch", "Layers"],
      itinerary: [{ time: "07:45", step: "Meet at Grand Central" }, { time: "09:30", step: "Start hike" }, { time: "12:30", step: "Picnic at viewpoint" }, { time: "15:30", step: "Train back" }],
    },
    inclusions: ["Hike leader"], exclusions: ["Train fare", "Food"], restrictions: ["18+"], tags: ["hiking", "outdoors"],
    qlooRefs: [{ name: "Hiking", type: "tag" }], tiers: [T("Standard", 25, 18)],
  },
  {
    id: "west-village-book-club", cityId: NYC, category: "Meetups", title: "West Village Fiction Book Club", venue: V.bookshopNY, organizerId: "org-greenpoint",
    days: ["tue"], every: 2, time: "18:30", durationMin: 90, image: IMG.food,
    summary: "This month: a modern classic, discussion led by a host", description: "A relaxed fiction book club. Read as much as you can; spoilers are fine.",
    whatYoullDo: ["Discuss the month's book"], audience: "Readers; first-timers welcome.", facts: { soloFriendly: true, beginnerFriendly: true },
    tags: ["books", "literary fiction"], qlooRefs: [{ name: "Literary Fiction", type: "tag" }], tiers: [T("Free", 0, 20)],
  },
];

// ── Cinemas: real films (facts and images from Qloo, data/films.json) at fictional venues ──

type Film = { id: string; title: string; qlooName: string; year: number; language: string; description: string | null; image: string | null; genres: string[]; qlooId: string | null };
const FILMS: Record<string, Film> = JSON.parse(readFileSync("data/films.json", "utf8")).films;

const CINEMAS = {
  lakeside: { cityId: BLR, organizerId: "org-lakeside", venue: { name: "Lakeside Cinemas (fictional)", area: "Koramangala", lat: 12.9372, lng: 77.6268 }, prices: [T("Classic", 250, 0), T("Prime", 350, 0), T("Recliner", 650, 0)] },
  picturehouse: { cityId: BLR, organizerId: "org-lakeside", venue: { name: "Indiranagar Picture House (fictional)", area: "Indiranagar", lat: 12.9784, lng: 77.6408 }, prices: [T("Classic", 220, 0), T("Prime", 320, 0), T("Recliner", 599, 0)] },
  talkies: { cityId: BLR, organizerId: "org-rangoli", venue: { name: "Jayanagar Talkies (fictional)", area: "Jayanagar", lat: 12.9279, lng: 77.5826 }, prices: [T("Classic", 199, 0), T("Prime", 280, 0), T("Recliner", 499, 0)] },
  canalScreen: { cityId: LDN, organizerId: "org-canal-house", venue: V.canalCinema, prices: [T("Classic", 9, 0), T("Prime", 12, 0), T("Recliner", 17, 0)] },
  greenpointScreen: { cityId: NYC, organizerId: "org-greenpoint", venue: V.greenpointCinema, prices: [T("Classic", 12, 0), T("Prime", 16, 0), T("Recliner", 22, 0)] },
} as const;

/** [film, cinema, first day, last day, daily showtimes, days of week] */
const PROGRAM: [string, keyof typeof CINEMAS, string, string, string[], Day[]][] = [
  ["3-idiots", "lakeside", "2026-10-17", "2026-11-15", ["13:15", "17:00", "20:45"], ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]],
  ["3-idiots", "talkies", "2026-11-01", "2026-11-29", ["15:30", "19:30"], ["fri", "sat", "sun"]],
  ["zindagi-na-milegi-dobara", "picturehouse", "2026-10-17", "2026-11-22", ["14:00", "18:15", "21:30"], ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]],
  ["zindagi-na-milegi-dobara", "lakeside", "2026-11-16", "2026-12-27", ["16:00", "20:00"], ["fri", "sat", "sun"]],
  ["dangal", "talkies", "2026-10-17", "2026-11-08", ["12:30", "16:15", "20:00"], ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]],
  ["dangal", "picturehouse", "2026-11-23", "2026-12-27", ["17:30", "21:00"], ["fri", "sat", "sun"]],
  ["lagaan", "lakeside", "2026-11-16", "2026-12-20", ["14:30", "19:00"], ["sat", "sun"]],
  ["dil-chahta-hai", "picturehouse", "2026-10-17", "2026-12-27", ["19:00"], ["wed", "sat"]],
  ["andhadhun", "lakeside", "2026-10-17", "2026-12-06", ["18:45", "22:00"], ["thu", "fri", "sat"]],
  ["gully-boy", "talkies", "2026-11-09", "2026-12-27", ["15:00", "18:45", "21:45"], ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]],
  ["taare-zameen-par", "picturehouse", "2026-10-17", "2026-12-27", ["11:00", "14:30"], ["sat", "sun"]],
  ["kumbalangi-nights", "talkies", "2026-10-17", "2026-12-27", ["19:30"], ["thu"]],
  ["the-lunchbox", "picturehouse", "2026-10-17", "2026-12-27", ["16:00"], ["sun"]],
  ["dil-chahta-hai", "canalScreen", "2026-10-17", "2026-12-27", ["19:00"], ["fri"]],
  ["gully-boy", "canalScreen", "2026-10-17", "2026-12-27", ["20:30"], ["sat"]],
  ["paddington-2", "canalScreen", "2026-10-17", "2026-12-27", ["11:00", "14:00"], ["sat", "sun"]],
  ["before-sunrise", "greenpointScreen", "2026-10-17", "2026-12-27", ["19:30"], ["wed", "sun"]],
  ["zindagi-na-milegi-dobara", "greenpointScreen", "2026-10-17", "2026-12-27", ["19:00"], ["fri"]],
  ["3-idiots", "greenpointScreen", "2026-10-17", "2026-12-27", ["15:00"], ["sat"]],
];

/** Screenings book a 3-hour slot; Qloo doesn't supply runtimes, so none is shown. */
const SCREEN_SLOT_MIN = 180;

for (const [filmId, cinemaKey, from, to, times, days] of PROGRAM) {
  const f = FILMS[filmId];
  const c = CINEMAS[cinemaKey];
  if (!f) throw new Error(`Missing film ${filmId} in data/films.json`);
  const subtitled = f.language !== "English" ? "English" : undefined;
  SPECS.push({
    id: `${filmId}--${cinemaKey}`,
    cityId: c.cityId,
    category: "Movies",
    title: f.title,
    venue: c.venue,
    organizerId: c.organizerId,
    days,
    time: times[0],
    times: times.slice(1),
    window: { from, to },
    durationMin: SCREEN_SLOT_MIN,
    image: f.image ?? IMG.cafe,
    summary: `${f.language}${subtitled ? ", English subtitles" : ""} · ${f.year} · ${f.genres.slice(0, 2).join(", ")}`,
    description: f.description ?? `${f.title} (${f.year}), screening at ${c.venue.name}.`,
    whatYoullDo: ["Watch the film in a reserved seat"],
    audience: "Film lovers. Sample screening of a released film at a fictional cinema.",
    facts: { soloFriendly: true },
    movie: { language: f.language, subtitles: subtitled },
    film: { id: f.id, qlooId: f.qlooId, year: f.year, genres: f.genres, imageCredit: f.image ? "Image: Qloo" : undefined },
    tags: ["film", ...f.genres.map((g) => g.toLowerCase())],
    qlooRefs: f.qlooId ? [{ name: f.qlooName, type: "movie", relation: "screening" }] : [],
    seatLayout: "cinema-standard",
    tiers: c.prices.map((t) => ({ ...t })),
  });
}

// ── Session generation ─────────────────────────────────────────────

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 2 ** 32;
}

function datesFor(days: Day[], every: number, window?: { from: string; to: string }) {
  const out: string[] = [];
  const d = new Date(`${window?.from ?? SEASON_START}T00:00:00Z`);
  const end = new Date(`${window?.to ?? SEASON_END}T00:00:00Z`);
  const firstWeek = new Map<Day, number>();
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    for (const day of days) {
      if (d.getUTCDay() !== DAY_INDEX[day]) continue;
      const week = Math.floor((d.getTime() - Date.parse(`${SEASON_START}T00:00:00Z`)) / (7 * 864e5));
      if (!firstWeek.has(day)) firstWeek.set(day, week);
      if ((week - firstWeek.get(day)!) % every === 0) out.push(d.toISOString().slice(0, 10));
    }
  }
  return out;
}

function addMinutes(local: string, min: number) {
  return new Date(Date.parse(`${local}:00Z`) + min * 60000).toISOString().slice(0, 16);
}

/** Freely licensed photos per event (scripts/fetch-photos.ts); falls back to the spec's image. */
const PHOTOS: Record<string, { src: string }> = existsSync("data/photo-credits.json") ? JSON.parse(readFileSync("data/photo-credits.json", "utf8")).photos : {};

const events = SPECS.map(({ days, time, times = [], every = 1, window, tiers: rawTiers, durationMin, cityId, ...rest }) => {
  if (rest.category !== "Movies" && PHOTOS[rest.id]) rest.image = PHOTOS[rest.id].src;
  const city = CITIES[cityId as keyof typeof CITIES];
  // Reserved seating: each tier is a section of the layout, so capacity comes from the seat map.
  const layout = rest.seatLayout ? LAYOUTS[rest.seatLayout as string] : null;
  const tiers = layout ? rawTiers.map((t) => ({ ...t, capacity: sectionCapacity(layout, t.name) })) : rawTiers;
  if (layout) for (const t of tiers) if (!t.capacity) throw new Error(`${rest.id}: tier ${t.name} isn't a section of ${layout.id}`);
  const sessions = datesFor(days, every, window).flatMap((date) => [time, ...times].map((tm) => ({ date, tm }))).map(({ date, tm: time }) => {
    const start = `${date}T${time}`;
    const sessionId = `${rest.id}--${date.replace(/-/g, "")}-${time.replace(":", "")}`;
    return {
      id: sessionId,
      start,
      end: addMinutes(start, durationMin),
      tiers: tiers.map((t, i) => {
        // Deterministic sample sales: 10–75% sold, sold-out tiers stay sold out.
        const sold = t.soldOut ? t.capacity : Math.floor(t.capacity * (0.1 + 0.65 * hash(`${sessionId}#${i}`)));
        return { id: `t${i + 1}`, name: t.name, price: t.price, capacity: t.capacity, seedSold: sold };
      }),
    };
  });
  return { ...rest, cityId, timezone: city.timezone, currency: city.currency, durationMin, status: "published", source: "sample", sessions };
});

writeFileSync(
  "data/catalog.json",
  JSON.stringify(
    {
      _note:
        "Fictional sample catalog generated by scripts/generate-catalog.ts. Every event, venue, organizer, performer and price is made up and is shown as 'Sample listing'. Real films/artists appear only as screening titles or 'for fans of' references. Session dates are fixed so links and reservations stay valid.",
      season: { start: SEASON_START, end: SEASON_END },
      cities: CITIES,
      organizers: ORGANIZERS,
      events,
    },
    null,
    1,
  ),
);
console.log(`${events.length} events, ${events.reduce((n, e) => n + e.sessions.length, 0)} sessions`);
