/** Anonymous guest identity cookie. Minted by middleware; signed-in accounts also carry a session cookie. */
export const UID_COOKIE = "ob_uid";
export const GUEST_ID = /^u_[a-f0-9]{16}$/;
export const newGuestId = () => `u_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
