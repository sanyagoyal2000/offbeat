import "server-only";
import * as social from "./db/social";

export type SavedSearch = social.SavedSearch;
export const addSavedSearch = social.addSavedSearch;
export const listSavedSearches = social.listSavedSearches;
export const removeSavedSearch = social.removeSavedSearch;
