import Link from "next/link";
import { LocationPicker } from "@/components/LocationPicker";
import { currentUid, exploreLocation, homeLocation } from "@/lib/server/identity";
import { getPrefs, inbox } from "@/lib/server/notifications";
import { getTaste } from "@/lib/server/taste";
import { store } from "@/lib/server/store";
import { PrefsForm, MarkRead } from "./PrefsForm";

export default async function ProfilePage() {
  const uid = await currentUid();
  const [explore, home, taste, prefs, notes] = await Promise.all([exploreLocation(), homeLocation(), getTaste(uid), getPrefs(uid), inbox(uid)]);
  const unread = notes.filter((n) => !n.read).length;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pt-6 sm:px-6">
      <h1 className="font-display text-[24px]">Profile and settings</h1>
      <p className="text-[13px] text-muted">No account needed. Settings are tied to this browser.{store().mode === "memory" ? " This deployment doesn't store data persistently." : ""}</p>

      <section className="rounded-[24px] border border-line bg-card p-5" aria-labelledby="inbox-h">
        <div className="flex items-center justify-between">
          <h2 id="inbox-h" className="text-[16px] font-bold">Inbox {unread > 0 && <span className="ml-1 rounded-full bg-citron px-2 text-[12px] text-ink">{unread} new</span>}</h2>
          {unread > 0 && <MarkRead />}
        </div>
        {notes.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">Nothing yet. Organizer proposals for your wishes show up here.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {notes.map((n) => (
              <li key={n.id} className={`rounded-[14px] border p-3 ${n.read ? "border-line" : "border-citron/50"}`}>
                <p className="font-semibold">{n.title}</p>
                <p className="text-[13px] text-ivory/80">{n.body}</p>
                {n.href && <Link href={n.href} className="mt-1 inline-block text-[13px] font-semibold text-citron">Open</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 rounded-[24px] border border-line bg-card p-5 sm:grid-cols-2" aria-labelledby="loc-h">
        <h2 id="loc-h" className="text-[16px] font-bold sm:col-span-2">Locations</h2>
        <div>
          <p className="text-[13px] font-semibold">Home</p>
          <p className="mb-1 text-[12px] text-muted">Where you live. Stays the same when you travel.</p>
          <LocationPicker current={home} kind="home" variant="field" />
        </div>
        <div>
          <p className="text-[13px] font-semibold">Exploring</p>
          <p className="mb-1 text-[12px] text-muted">The city used for browsing, search and planning.</p>
          <LocationPicker current={explore} kind="explore" variant="field" />
        </div>
      </section>

      <section className="rounded-[24px] border border-line bg-card p-5" aria-labelledby="int-h">
        <h2 id="int-h" className="text-[16px] font-bold">Interests</h2>
        <p className="mt-1 text-[14px]">{taste.interests.length ? taste.interests.map((i) => i.name).join(", ") : "None added (optional)."}</p>
        <Link href="/taste" className="mt-2 inline-flex h-11 items-center rounded-full border border-ivory/25 px-4 text-[14px] font-semibold">Edit interests</Link>
      </section>

      <section className="rounded-[24px] border border-line bg-card p-5" aria-labelledby="ntf-h">
        <h2 id="ntf-h" className="text-[16px] font-bold">Notifications</h2>
        <p className="mt-1 text-[13px] text-muted">Offbeat only shows notifications inside the app. No email, SMS or push messages are sent.</p>
        <PrefsForm initial={prefs} />
      </section>

      <section className="rounded-[24px] border border-line bg-card p-5">
        <h2 className="text-[16px] font-bold">More</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          <li><Link href="/wishes" className="flex h-11 items-center rounded-full border border-ivory/25 px-4 text-[14px] font-semibold">My wishes</Link></li>
          <li><Link href="/plan" className="flex h-11 items-center rounded-full border border-ivory/25 px-4 text-[14px] font-semibold">Plan an outing</Link></li>
          <li><Link href="/organizer" className="flex h-11 items-center rounded-full border border-ivory/25 px-4 text-[14px] font-semibold">Organizer workspace</Link></li>
          <li><Link href="/credits" className="flex h-11 items-center rounded-full border border-ivory/25 px-4 text-[14px] font-semibold">Photo credits</Link></li>
        </ul>
      </section>
    </main>
  );
}
