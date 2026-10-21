/* Hand-drawn citron accents (BUILD_PROMPT §2: stars, orbits, ticket motifs; no mascots). */

type DoodleProps = { className?: string; size?: number };

/** Four-point sketched sparkle star. */
export function DoodleStar({ className = "", size = 22 }: DoodleProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-citron)"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2.5c.6 4.4 2.4 7.3 7.5 9.3-5 1.6-6.9 4.7-7.4 9.7-.8-5-2.7-8.1-7.6-9.6 5-1.8 6.8-4.9 7.5-9.4z" />
      <path d="M12.2 6.5c.2 2 1 3.9 3.2 5.2" opacity=".55" />
    </svg>
  );
}

/** Loose elliptical orbit with a small planet dot. */
export function DoodleOrbit({ className = "", size = 64 }: DoodleProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size * 0.6}
      viewBox="0 0 100 60"
      fill="none"
      stroke="var(--color-citron)"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
    >
      <path d="M8 34c-4-10 18-22 44-24s44 6 42 16-22 21-46 22S10 43 8 34z" />
      <path d="M14 39c10 6 30 8 50 4" opacity=".45" />
      <circle cx="88" cy="20" r="4" fill="var(--color-citron)" stroke="none" />
    </svg>
  );
}

/** Small burst of three strokes, used beside date badges. */
export function DoodleBurst({ className = "", size = 26 }: DoodleProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-citron)"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
    >
      <path d="M5 14l-3 1M8 8L6 4M14 6l1-4" />
    </svg>
  );
}

/** Mini ticket stub outline. */
export function DoodleTicket({ className = "", size = 34 }: DoodleProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size * 0.6}
      viewBox="0 0 40 24"
      fill="none"
      stroke="var(--color-citron)"
      strokeWidth="1.6"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 5c3 0 3-3 3-3h30s0 3 3 3v4a3 3 0 0 0 0 6v4c-3 0-3 3-3 3H5s0-3-3-3v-4a3 3 0 0 0 0-6z" />
      <path d="M27 3v18" strokeDasharray="2 2.5" />
    </svg>
  );
}
