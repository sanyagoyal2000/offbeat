"use client";

import { useRouter } from "next/navigation";

export function RemoveSavedSearch({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch(`/api/saved-searches?id=${id}`, { method: "DELETE" });
        router.refresh();
      }}
      className="h-10 rounded-full px-3 text-[13px] font-semibold text-muted underline underline-offset-4"
    >
      Remove
    </button>
  );
}
