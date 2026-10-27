import { describe, expect, it } from "vitest";
import { applyBoardAction, createBoard, getBoard, groupConstraints, listBoards } from "./boards";
import { signUp } from "./userAuth";

const BLR = { id: "bengaluru-in", name: "Bengaluru", currency: "INR" };
const PW = "long enough password";
const account = async (guest: string, username: string) => (await signUp(guest, { username, password: PW })).account.key;

describe("boards with accounts", () => {
  it("counts only accounts that joined as members, and only members can act", async () => {
    const asha = await account("u_1000000000000001", "asha");
    const ravi = await account("u_1000000000000002", "ravi");
    const board = await createBoard(asha, "Friday plans", BLR, "acoustic-sundowner");
    expect(board.members.map((m) => m.name)).toEqual(["asha"]);
    expect(groupConstraints(board).people).toBe(1);

    // Opening the link isn't joining: a non-member can't vote.
    expect(await applyBoardAction(board.id, ravi, { action: "vote", eventId: "acoustic-sundowner", on: true })).toEqual({ ok: false, reason: "not-member" });
    expect(await listBoards(ravi)).toEqual([]);

    const joined = await applyBoardAction(board.id, ravi, { action: "join" });
    expect(joined.ok && joined.board.members.map((m) => m.name)).toEqual(["asha", "ravi"]);
    await applyBoardAction(board.id, ravi, { action: "vote", eventId: "acoustic-sundowner", on: true });
    await applyBoardAction(board.id, ravi, { action: "me", me: { budgetMax: 900, from: "2026-11-01", to: "2026-11-30" } });
    await applyBoardAction(board.id, asha, { action: "me", me: { budgetMax: 1500, from: "2026-11-10" } });

    const b = (await getBoard(board.id))!;
    expect(b.votes["acoustic-sundowner"]).toHaveLength(1);
    expect(groupConstraints(b)).toMatchObject({ people: 2, budgetMax: 900, from: "2026-11-10", to: "2026-11-30" });
    expect((await listBoards(ravi)).map((x) => x.id)).toEqual([board.id]);
  });

  it("lets members leave (removing their votes) but not the creator", async () => {
    const owner = await account("u_2000000000000001", "owner");
    const friend = await account("u_2000000000000002", "friend");
    const board = await createBoard(owner, "Plans", BLR, "acoustic-sundowner");
    await applyBoardAction(board.id, friend, { action: "join" });
    await applyBoardAction(board.id, friend, { action: "vote", eventId: "acoustic-sundowner", on: true });
    await applyBoardAction(board.id, friend, { action: "leave" });
    const b = (await getBoard(board.id))!;
    expect(b.members.map((m) => m.name)).toEqual(["owner"]);
    expect(b.votes["acoustic-sundowner"] ?? []).toEqual([]);
    expect(await applyBoardAction(board.id, owner, { action: "leave" })).toEqual({ ok: false, reason: "owner-cant-leave" });
  });

  it("ignores guest rows from before accounts, until that guest signs up", async () => {
    const guest = "u_3000000000000001";
    const board = await createBoard(guest, "Old board", BLR); // created before accounts existed
    expect((await getBoard(board.id))!.members).toEqual([]);
    await signUp(guest, { username: "late.joiner", password: PW });
    expect((await getBoard(board.id))!.members.map((m) => m.name)).toEqual(["late.joiner"]);
  });
});
