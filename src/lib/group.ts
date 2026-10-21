/** Combine optional constraints from board participants. Pure, so it's easy to test. */
export type ParticipantConstraints = { budgetMax?: number; from?: string; to?: string };

export type GroupConstraints = {
  budgetMax: number | null; // lowest stated budget
  budgetsGiven: number;
  from: string | null; // latest stated start
  to: string | null; // earliest stated end
  conflict: boolean; // stated dates don't overlap
  datesGiven: number;
  people: number;
};

export function combineConstraints(ps: ParticipantConstraints[]): GroupConstraints {
  const budgets = ps.map((p) => p.budgetMax).filter((x): x is number => typeof x === "number");
  const froms = ps.map((p) => p.from).filter((x): x is string => !!x).sort();
  const tos = ps.map((p) => p.to).filter((x): x is string => !!x).sort();
  const from = froms.at(-1) ?? null;
  const to = tos[0] ?? null;
  return {
    budgetMax: budgets.length ? Math.min(...budgets) : null,
    budgetsGiven: budgets.length,
    from,
    to,
    conflict: !!(from && to && from > to),
    datesGiven: ps.filter((p) => p.from || p.to).length,
    people: ps.length,
  };
}
