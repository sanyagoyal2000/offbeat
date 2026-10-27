import Link from "next/link";

/** Shown when a booking started from the planner hits a sell-out: re-runs the last plan with live availability. */
export function ReplanNotice({ sessionId }: { sessionId: string }) {
  return (
    <p className="rounded-[16px] border border-citron/40 p-3 text-[14px]">
      This came from your plan.{" "}
      <Link href={`/plan?replan=${encodeURIComponent(sessionId)}`} className="font-bold text-citron underline-offset-4 hover:underline">
        Re-plan with live availability
      </Link>
    </p>
  );
}
