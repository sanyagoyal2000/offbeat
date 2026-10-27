/** Only same-site paths are allowed as post-login redirects (no "//host" or absolute URLs). */
export const safeNext = (next: string | undefined, fallback = "/") => (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback);
