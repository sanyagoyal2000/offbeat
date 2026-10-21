/**
 * Location model. Any city worldwide can be selected; inventory exists only where the catalog
 * has events. Coverage is always checked separately and never implied by the selection.
 */
import { z } from "zod";

export const LocationSchema = z.object({
  id: z.string(), // stable slug, e.g. "bengaluru-in"
  name: z.string(),
  region: z.string().optional(),
  country: z.string(),
  countryCode: z.string().length(2),
  lat: z.number(),
  lng: z.number(),
  timezone: z.string(),
  currency: z.string().length(3),
});
export type Location = z.infer<typeof LocationSchema>;

/** ISO 4217 currency by country (common countries; used for budgets where no events exist yet). */
export const CURRENCY_BY_COUNTRY: Record<string, string> = {
  IN: "INR", GB: "GBP", US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD", IE: "EUR", FR: "EUR", DE: "EUR",
  ES: "EUR", PT: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", FI: "EUR", GR: "EUR", LU: "EUR",
  SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", HR: "EUR", MT: "EUR", CY: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN",
  TR: "TRY", RU: "RUB", UA: "UAH", IL: "ILS", AE: "AED", SA: "SAR", QA: "QAR", EG: "EGP", MA: "MAD",
  NG: "NGN", KE: "KES", ZA: "ZAR", GH: "GHS", ET: "ETB", JP: "JPY", CN: "CNY", HK: "HKD", TW: "TWD",
  KR: "KRW", SG: "SGD", MY: "MYR", TH: "THB", VN: "VND", ID: "IDR", PH: "PHP", PK: "PKR", BD: "BDT",
  LK: "LKR", NP: "NPR", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", UY: "UYU",
  IS: "ISK",
};

const L = (
  id: string, name: string, country: string, countryCode: string, lat: number, lng: number, timezone: string, region?: string,
): Location => ({ id, name, region, country, countryCode, lat, lng, timezone, currency: CURRENCY_BY_COUNTRY[countryCode] ?? "USD" });

/** Built-in list for instant, offline search. Other cities come from the server-side geocoder. */
export const CITIES: Location[] = [
  L("bengaluru-in", "Bengaluru", "India", "IN", 12.9716, 77.5946, "Asia/Kolkata", "Karnataka"),
  L("london-gb", "London", "United Kingdom", "GB", 51.5074, -0.1278, "Europe/London", "England"),
  L("new-york-us", "New York", "United States", "US", 40.7128, -74.006, "America/New_York", "New York"),
  L("mumbai-in", "Mumbai", "India", "IN", 19.076, 72.8777, "Asia/Kolkata", "Maharashtra"),
  L("delhi-in", "New Delhi", "India", "IN", 28.6139, 77.209, "Asia/Kolkata", "Delhi"),
  L("chennai-in", "Chennai", "India", "IN", 13.0827, 80.2707, "Asia/Kolkata", "Tamil Nadu"),
  L("hyderabad-in", "Hyderabad", "India", "IN", 17.385, 78.4867, "Asia/Kolkata", "Telangana"),
  L("pune-in", "Pune", "India", "IN", 18.5204, 73.8567, "Asia/Kolkata", "Maharashtra"),
  L("kolkata-in", "Kolkata", "India", "IN", 22.5726, 88.3639, "Asia/Kolkata", "West Bengal"),
  L("goa-in", "Panaji", "India", "IN", 15.4909, 73.8278, "Asia/Kolkata", "Goa"),
  L("kochi-in", "Kochi", "India", "IN", 9.9312, 76.2673, "Asia/Kolkata", "Kerala"),
  L("jaipur-in", "Jaipur", "India", "IN", 26.9124, 75.7873, "Asia/Kolkata", "Rajasthan"),
  L("manchester-gb", "Manchester", "United Kingdom", "GB", 53.4808, -2.2426, "Europe/London", "England"),
  L("edinburgh-gb", "Edinburgh", "United Kingdom", "GB", 55.9533, -3.1883, "Europe/London", "Scotland"),
  L("dublin-ie", "Dublin", "Ireland", "IE", 53.3498, -6.2603, "Europe/Dublin"),
  L("paris-fr", "Paris", "France", "FR", 48.8566, 2.3522, "Europe/Paris"),
  L("berlin-de", "Berlin", "Germany", "DE", 52.52, 13.405, "Europe/Berlin"),
  L("munich-de", "Munich", "Germany", "DE", 48.1351, 11.582, "Europe/Berlin", "Bavaria"),
  L("amsterdam-nl", "Amsterdam", "Netherlands", "NL", 52.3676, 4.9041, "Europe/Amsterdam"),
  L("brussels-be", "Brussels", "Belgium", "BE", 50.8503, 4.3517, "Europe/Brussels"),
  L("madrid-es", "Madrid", "Spain", "ES", 40.4168, -3.7038, "Europe/Madrid"),
  L("barcelona-es", "Barcelona", "Spain", "ES", 41.3874, 2.1686, "Europe/Madrid", "Catalonia"),
  L("lisbon-pt", "Lisbon", "Portugal", "PT", 38.7223, -9.1393, "Europe/Lisbon"),
  L("rome-it", "Rome", "Italy", "IT", 41.9028, 12.4964, "Europe/Rome"),
  L("milan-it", "Milan", "Italy", "IT", 45.4642, 9.19, "Europe/Rome"),
  L("vienna-at", "Vienna", "Austria", "AT", 48.2082, 16.3738, "Europe/Vienna"),
  L("zurich-ch", "Zurich", "Switzerland", "CH", 47.3769, 8.5417, "Europe/Zurich"),
  L("copenhagen-dk", "Copenhagen", "Denmark", "DK", 55.6761, 12.5683, "Europe/Copenhagen"),
  L("stockholm-se", "Stockholm", "Sweden", "SE", 59.3293, 18.0686, "Europe/Stockholm"),
  L("oslo-no", "Oslo", "Norway", "NO", 59.9139, 10.7522, "Europe/Oslo"),
  L("helsinki-fi", "Helsinki", "Finland", "FI", 60.1699, 24.9384, "Europe/Helsinki"),
  L("warsaw-pl", "Warsaw", "Poland", "PL", 52.2297, 21.0122, "Europe/Warsaw"),
  L("prague-cz", "Prague", "Czechia", "CZ", 50.0755, 14.4378, "Europe/Prague"),
  L("budapest-hu", "Budapest", "Hungary", "HU", 47.4979, 19.0402, "Europe/Budapest"),
  L("athens-gr", "Athens", "Greece", "GR", 37.9838, 23.7275, "Europe/Athens"),
  L("istanbul-tr", "Istanbul", "Türkiye", "TR", 41.0082, 28.9784, "Europe/Istanbul"),
  L("reykjavik-is", "Reykjavík", "Iceland", "IS", 64.1466, -21.9426, "Atlantic/Reykjavik"),
  L("dubai-ae", "Dubai", "United Arab Emirates", "AE", 25.2048, 55.2708, "Asia/Dubai"),
  L("tel-aviv-il", "Tel Aviv", "Israel", "IL", 32.0853, 34.7818, "Asia/Jerusalem"),
  L("cairo-eg", "Cairo", "Egypt", "EG", 30.0444, 31.2357, "Africa/Cairo"),
  L("marrakesh-ma", "Marrakesh", "Morocco", "MA", 31.6295, -7.9811, "Africa/Casablanca"),
  L("lagos-ng", "Lagos", "Nigeria", "NG", 6.5244, 3.3792, "Africa/Lagos"),
  L("nairobi-ke", "Nairobi", "Kenya", "KE", -1.2921, 36.8219, "Africa/Nairobi"),
  L("accra-gh", "Accra", "Ghana", "GH", 5.6037, -0.187, "Africa/Accra"),
  L("cape-town-za", "Cape Town", "South Africa", "ZA", -33.9249, 18.4241, "Africa/Johannesburg"),
  L("johannesburg-za", "Johannesburg", "South Africa", "ZA", -26.2041, 28.0473, "Africa/Johannesburg"),
  L("tokyo-jp", "Tokyo", "Japan", "JP", 35.6762, 139.6503, "Asia/Tokyo"),
  L("osaka-jp", "Osaka", "Japan", "JP", 34.6937, 135.5023, "Asia/Tokyo"),
  L("seoul-kr", "Seoul", "South Korea", "KR", 37.5665, 126.978, "Asia/Seoul"),
  L("beijing-cn", "Beijing", "China", "CN", 39.9042, 116.4074, "Asia/Shanghai"),
  L("shanghai-cn", "Shanghai", "China", "CN", 31.2304, 121.4737, "Asia/Shanghai"),
  L("hong-kong-hk", "Hong Kong", "Hong Kong", "HK", 22.3193, 114.1694, "Asia/Hong_Kong"),
  L("taipei-tw", "Taipei", "Taiwan", "TW", 25.033, 121.5654, "Asia/Taipei"),
  L("singapore-sg", "Singapore", "Singapore", "SG", 1.3521, 103.8198, "Asia/Singapore"),
  L("kuala-lumpur-my", "Kuala Lumpur", "Malaysia", "MY", 3.139, 101.6869, "Asia/Kuala_Lumpur"),
  L("bangkok-th", "Bangkok", "Thailand", "TH", 13.7563, 100.5018, "Asia/Bangkok"),
  L("ho-chi-minh-vn", "Ho Chi Minh City", "Vietnam", "VN", 10.8231, 106.6297, "Asia/Ho_Chi_Minh"),
  L("jakarta-id", "Jakarta", "Indonesia", "ID", -6.2088, 106.8456, "Asia/Jakarta"),
  L("bali-id", "Denpasar", "Indonesia", "ID", -8.65, 115.2167, "Asia/Makassar", "Bali"),
  L("manila-ph", "Manila", "Philippines", "PH", 14.5995, 120.9842, "Asia/Manila"),
  L("karachi-pk", "Karachi", "Pakistan", "PK", 24.8607, 67.0011, "Asia/Karachi"),
  L("dhaka-bd", "Dhaka", "Bangladesh", "BD", 23.8103, 90.4125, "Asia/Dhaka"),
  L("colombo-lk", "Colombo", "Sri Lanka", "LK", 6.9271, 79.8612, "Asia/Colombo"),
  L("kathmandu-np", "Kathmandu", "Nepal", "NP", 27.7172, 85.324, "Asia/Kathmandu"),
  L("sydney-au", "Sydney", "Australia", "AU", -33.8688, 151.2093, "Australia/Sydney", "New South Wales"),
  L("melbourne-au", "Melbourne", "Australia", "AU", -37.8136, 144.9631, "Australia/Melbourne", "Victoria"),
  L("auckland-nz", "Auckland", "New Zealand", "NZ", -36.8485, 174.7633, "Pacific/Auckland"),
  L("los-angeles-us", "Los Angeles", "United States", "US", 34.0522, -118.2437, "America/Los_Angeles", "California"),
  L("san-francisco-us", "San Francisco", "United States", "US", 37.7749, -122.4194, "America/Los_Angeles", "California"),
  L("seattle-us", "Seattle", "United States", "US", 47.6062, -122.3321, "America/Los_Angeles", "Washington"),
  L("chicago-us", "Chicago", "United States", "US", 41.8781, -87.6298, "America/Chicago", "Illinois"),
  L("austin-us", "Austin", "United States", "US", 30.2672, -97.7431, "America/Chicago", "Texas"),
  L("miami-us", "Miami", "United States", "US", 25.7617, -80.1918, "America/New_York", "Florida"),
  L("boston-us", "Boston", "United States", "US", 42.3601, -71.0589, "America/New_York", "Massachusetts"),
  L("washington-us", "Washington", "United States", "US", 38.9072, -77.0369, "America/New_York", "District of Columbia"),
  L("toronto-ca", "Toronto", "Canada", "CA", 43.6532, -79.3832, "America/Toronto", "Ontario"),
  L("montreal-ca", "Montréal", "Canada", "CA", 45.5019, -73.5674, "America/Toronto", "Quebec"),
  L("vancouver-ca", "Vancouver", "Canada", "CA", 49.2827, -123.1207, "America/Vancouver", "British Columbia"),
  L("mexico-city-mx", "Mexico City", "Mexico", "MX", 19.4326, -99.1332, "America/Mexico_City"),
  L("sao-paulo-br", "São Paulo", "Brazil", "BR", -23.5505, -46.6333, "America/Sao_Paulo"),
  L("rio-de-janeiro-br", "Rio de Janeiro", "Brazil", "BR", -22.9068, -43.1729, "America/Sao_Paulo"),
  L("buenos-aires-ar", "Buenos Aires", "Argentina", "AR", -34.6037, -58.3816, "America/Argentina/Buenos_Aires"),
  L("santiago-cl", "Santiago", "Chile", "CL", -33.4489, -70.6693, "America/Santiago"),
  L("bogota-co", "Bogotá", "Colombia", "CO", 4.711, -74.0721, "America/Bogota"),
  L("lima-pe", "Lima", "Peru", "PE", -12.0464, -77.0428, "America/Lima"),
];

export const DEFAULT_LOCATION_ID = "bengaluru-in";
export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? null;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Prefix/word match on name, region and country, accent-insensitive. */
export function searchBuiltInCities(query: string, limit = 8): Location[] {
  const q = fold(query.trim());
  if (!q) return CITIES.slice(0, limit);
  const scored = CITIES.map((c) => {
    const name = fold(c.name);
    const rest = fold(`${c.region ?? ""} ${c.country}`);
    const score = name.startsWith(q) ? 0 : name.split(/[\s-]/).some((w) => w.startsWith(q)) ? 1 : rest.includes(q) ? 2 : -1;
    return { c, score };
  }).filter((x) => x.score >= 0);
  return scored.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name)).slice(0, limit).map((x) => x.c);
}

export const locationLabel = (l: Pick<Location, "name" | "country">) => `${l.name}, ${l.country}`;

/** Cookie names for the two independent locations. */
export const EXPLORE_COOKIE = "ob_explore";
export const HOME_COOKIE = "ob_home";

export function parseLocationCookie(raw: string | undefined): Location | null {
  if (!raw) return null;
  try {
    const parsed = LocationSchema.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
