export const CATEGORIES = [
  "Music",
  "Movies",
  "Comedy",
  "Theatre",
  "Performances",
  "Workshops & classes",
  "Treks & outdoors",
  "Meetups",
  "Kids",
  "Sports",
] as const;

export type Category = (typeof CATEGORIES)[number];
