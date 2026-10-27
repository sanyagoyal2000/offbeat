/**
 * Shared planning boards. Anyone with the link can view a board; joining, voting, adding options
 * and sharing a budget or dates need a signed-in account. Members are the accounts that joined.
 */
import "server-only";
import { z } from "zod";
import { combineConstraints } from "@/lib/group";
import * as social from "./db/social";
import { anchorsForUsers, userIdFor } from "./db/users";

export const ParticipantSchema = z.object({
  budgetMax: z.number().nonnegative().max(1_000_000).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type Board = social.Board;
export type Member = social.Member;
export type BoardAction = social.BoardAction;

export const createBoard = social.createBoard;
export const getBoard = social.getBoard;
export const listBoards = social.listBoards;
/** One change per call. Everything except "join" requires membership. */
export const applyBoardAction = social.applyBoardAction;

/** Group size = members; budget and dates combine what members shared. */
export const groupConstraints = (b: Board) => combineConstraints(b.members);

/** This visitor's users.id (to find "you" among members and votes). */
export const viewerId = (uid: string) => userIdFor(uid);

/** Interests of the board's members, combined (used only to order suggestions). */
export const memberInterests = (b: Board) => anchorsForUsers(b.members.map((m) => m.userId));
