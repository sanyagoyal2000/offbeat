import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { EventEditor } from "@/components/organizer/EventEditor";
import { CITIES } from "@/lib/locations";
import { getEvent, reservedKey } from "@/lib/server/catalog";
import { eventToInput } from "@/lib/server/eventForm";
import { canEdit, requireOrgPage } from "@/lib/server/organizer";
import { store } from "@/lib/server/store";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await requireOrgPage(`/organizer/events/${id}/edit`);
  const e = await getEvent(id);
  if (!e || e.organizerId !== org.id) notFound();
  const reserved = await store().mget<Record<string, number>>(e.sessions.map((s) => reservedKey(s.id)));
  const bySession = Object.fromEntries(e.sessions.map((s, i) => [s.id, Object.values(reserved[i] ?? {}).reduce((a, b) => a + b, 0)]));
  const editable = canEdit(e, org.id);
  return (
    <main className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
      <BackLink href={`/organizer/events/${id}`} label="Event overview" />
      <h1 className="font-display text-[24px]">Edit {e.title}</h1>
      {!editable && <p className="mt-2 rounded-[16px] border border-dashed border-citron/50 p-3 text-[13px] text-citron">Sample listings are read-only in this demo.</p>}
      <div className="mt-4">
        <EventEditor initial={eventToInput(e)} eventId={id} readOnly={!editable} cities={CITIES.map((c) => ({ id: c.id, name: c.name, currency: c.currency, lat: c.lat, lng: c.lng }))} reservedBySession={bySession} />
      </div>
    </main>
  );
}
