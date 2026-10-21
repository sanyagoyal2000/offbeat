/** Credits for freely licensed photos (Wikimedia Commons), looked up by image path. */
import credits from "../../data/photo-credits.json";

export type PhotoCredit = { src: string; alt: string; title: string; author: string; license: string; licenseUrl: string | null; source: string };
const BY_SRC = new Map(Object.values((credits as unknown as { photos: Record<string, PhotoCredit> }).photos).map((c) => [c.src, c]));

export const creditFor = (src: string) => BY_SRC.get(src) ?? null;
export const allCredits = () => [...BY_SRC.values()];
/** Photos organizers can pick for their own events. */
export const photoLibrary = () => allCredits().filter((c) => !c.src.includes("/food-")).map((c) => ({ src: c.src, label: c.alt }));
