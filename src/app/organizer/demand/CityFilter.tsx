"use client";

import { useRouter } from "next/navigation";

export function CityFilter({ value, cities }: { value: string; cities: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <label className="text-[12px] font-semibold text-muted">
      City
      <select value={value} onChange={(e) => router.push(`/organizer/demand?city=${e.target.value}`)} className="mt-1 block h-11 rounded-full border border-ivory/20 bg-card px-3 text-[14px] text-ivory">
        {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );
}
