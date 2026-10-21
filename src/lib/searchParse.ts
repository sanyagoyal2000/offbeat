/**
 * Deterministic search parser: turns "pottery this Sunday under ₹1,500 for 2" into structured,
 * editable filters. Every recognised requirement becomes a visible chip; anything not recognised
 * stays as a text keyword, so no explicit requirement is silently dropped.
 */
import { addDays, format, parseISO } from "date-fns";
import type { Category } from "./categories";
import { pillRange, type DateRange, type TimeOfDay } from "./dateRange";

export type ParsedSearch = {
  keywords: string[];
  category?: Category;
  range?: DateRange;
  dateLabel?: string;
  timeOfDay?: Exclude<TimeOfDay, "any">;
  maxPrice?: number;
  partySize?: number;
  near?: string;
};

const CATEGORY_WORDS: [RegExp, Category, string | null][] = [
  [/\b(pottery|ceramics?|clay)\b/, "Workshops & classes", "pottery"],
  [/\b(block[- ]?printing|printing)\b/, "Workshops & classes", "printing"],
  [/\b(songwriting)\b/, "Workshops & classes", "songwriting"],
  [/\b(class(es)?|workshops?|courses?|lessons?)\b/, "Workshops & classes", null],
  [/\b(movies?|films?|screenings?|cinema|matinee)\b/, "Movies", null],
  [/\b(stand[- ]?up|standup|comedy|comic|improv|open mic)\b/, "Comedy", null],
  [/\b(plays?|theatre|theater|drama)\b/, "Theatre", null],
  [/\b(treks?|trekking|hikes?|hiking|trails?)\b/, "Treks & outdoors", null],
  [/\b(magic|dance|spoken word|storytelling)\b/, "Performances", null],
  [/\b(meetups?|book club|board games?|listening party)\b/, "Meetups", null],
  [/\b(kids?|children|family)\b/, "Kids", null],
  [/\b(football|soccer|sports?|five-a-side)\b/, "Sports", null],
  [/\b(jazz)\b/, "Music", "jazz"],
  [/\b(folk)\b/, "Music", "folk"],
  [/\b(carnatic)\b/, "Music", "carnatic"],
  [/\b(acoustic)\b/, "Music", "acoustic"],
  [/\b(indie)\b/, "Music", "indie"],
  [/\b(gigs?|concerts?|live music|music)\b/, "Music", null],
];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const STOPWORDS = new Set(
  "a an the some something anything things thing stuff event events show shows to do on at in for with and or this that me i we want looking find fun good nice please any".split(" "),
);

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function nextWeekday(today: string, weekday: number, skipThisWeek: boolean) {
  const t = parseISO(today);
  let diff = (weekday - t.getDay() + 7) % 7;
  if (skipThisWeek) diff += 7;
  return iso(addDays(t, diff));
}

export function parseSearch(input: string, today: string): ParsedSearch {
  let text = ` ${input.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ")} `;
  const out: ParsedSearch = { keywords: [] };
  const take = (re: RegExp) => {
    const m = text.match(re);
    if (m) text = text.replace(m[0], " ");
    return m;
  };

  // Budget: "under ₹1,500", "below $40", "max 20", "up to £15", "<= 800", "free".
  const money = take(/\b(?:under|below|less than|max(?:imum)?|up to|upto|within|budget(?: of)?)\s*(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur)?\s*([\d,.]+)\s*(k)?\b|(?:<=?|≤)\s*(?:₹|\$|£|€)?\s*([\d,.]+)/);
  if (money) {
    const raw = (money[1] ?? money[3] ?? "").replace(/,/g, "");
    const n = Number(raw) * (money[2] ? 1000 : 1);
    if (Number.isFinite(n)) out.maxPrice = n;
  } else if (take(/\bfree\b/)) out.maxPrice = 0;

  // Party size: "for 2", "for two people", "with a friend".
  const party = take(/\bfor (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)(?: people| persons| of us| adults)?\b/);
  if (party) out.partySize = Number(party[1]) || NUMBER_WORDS[party[1]];
  else if (take(/\bwith a friend\b|\bfor a couple\b|\bdate night\b/)) out.partySize = 2;

  // Dates.
  if (take(/\btonight\b/)) {
    out.range = { from: today, to: today };
    out.dateLabel = "Tonight";
    out.timeOfDay = "evening";
  } else if (take(/\btoday\b/)) {
    out.range = pillRange("today", today);
    out.dateLabel = "Today";
  } else if (take(/\btomorrow\b/)) {
    out.range = pillRange("tomorrow", today);
    out.dateLabel = "Tomorrow";
  } else if (take(/\bnext weekend\b/)) {
    out.range = pillRange("nextWeekend", today);
    out.dateLabel = "Next weekend";
  } else if (take(/\b(this )?weekend\b/)) {
    out.range = pillRange("weekend", today);
    out.dateLabel = "This weekend";
  } else if (take(/\bnext week\b/)) {
    const mon = nextWeekday(today, 1, parseISO(today).getDay() === 1);
    out.range = { from: mon, to: iso(addDays(parseISO(mon), 6)) };
    out.dateLabel = "Next week";
  } else if (take(/\bthis week\b/)) {
    const sun = nextWeekday(today, 0, false);
    out.range = { from: today, to: sun };
    out.dateLabel = "This week";
  } else {
    const wd = take(new RegExp(`\\b(this |next |on )?(${WEEKDAYS.join("|")})s?\\b`));
    if (wd) {
      const day = WEEKDAYS.indexOf(wd[2]);
      const d = nextWeekday(today, day, wd[1]?.trim() === "next");
      out.range = { from: d, to: d };
      out.dateLabel = format(parseISO(d), "EEE d MMM");
    } else {
      const dm = take(new RegExp(`\\b(?:on )?(\\d{1,2})(?:st|nd|rd|th)? (${MONTHS.join("|")})[a-z]*\\b|\\b(?:on )?(${MONTHS.join("|")})[a-z]* (\\d{1,2})(?:st|nd|rd|th)?\\b`));
      if (dm) {
        const dayNum = Number(dm[1] ?? dm[4]);
        const month = MONTHS.indexOf((dm[2] ?? dm[3]).slice(0, 3));
        const t = parseISO(today);
        let candidate = new Date(t.getFullYear(), month, dayNum);
        if (iso(candidate) < today) candidate = new Date(t.getFullYear() + 1, month, dayNum);
        out.range = { from: iso(candidate), to: iso(candidate) };
        out.dateLabel = format(candidate, "EEE d MMM");
      }
    }
  }

  // Time of day.
  if (!out.timeOfDay) {
    if (take(/\blate[- ]night\b|\blate\b/)) out.timeOfDay = "late";
    else if (take(/\bmornings?\b/)) out.timeOfDay = "morning";
    else if (take(/\bafternoons?\b/)) out.timeOfDay = "afternoon";
    else if (take(/\bevenings?\b|\bnight\b/)) out.timeOfDay = "evening";
  }

  // Area: "near indiranagar", "in koramangala".
  const near = take(/\b(?:near|around|in) ([a-z][a-z .'-]{2,30}?)(?=\s(?:under|below|for|on|this|next|tonight|today|tomorrow|with)\b|\s*$)/);
  if (near) out.near = near[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());

  // Category (first match wins) and specific keywords.
  for (const [re, cat, keyword] of CATEGORY_WORDS) {
    const m = text.match(re);
    if (!m) continue;
    if (!out.category) out.category = cat;
    text = text.replace(m[0], " ");
    if (keyword) out.keywords.push(keyword);
    if (out.category !== cat) out.keywords.push(m[0].trim());
  }

  for (const w of text.split(/[^a-z0-9&-]+/)) if (w && !STOPWORDS.has(w) && w.length > 1) out.keywords.push(w);
  out.keywords = [...new Set(out.keywords)];
  return out;
}
