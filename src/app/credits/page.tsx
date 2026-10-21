import Image from "next/image";
import { allCredits } from "@/lib/photoCredits";

export default function CreditsPage() {
  const credits = allCredits();
  return (
    <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
      <h1 className="font-display text-[24px]">Photo and data credits</h1>
      <p className="mt-1 max-w-2xl text-[14px] text-ivory/75">
        Event photos are illustrative, freely licensed images from Wikimedia Commons. They were not taken at these fictional events and don&apos;t show the
        performers listed. Film posters and film details come from Qloo.
      </p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {credits.map((c) => (
          <li key={c.src} className="flex gap-3 rounded-[16px] border border-line bg-card p-3">
            <Image src={c.src} alt={c.alt} width={96} height={64} className="h-16 w-24 flex-none rounded-[10px] object-cover" />
            <div className="min-w-0 text-[12px]">
              <p className="truncate font-semibold text-ivory">{c.alt}</p>
              <p className="text-muted">
                <a href={c.source} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{c.author}</a>
                {" · "}
                {c.licenseUrl ? <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{c.license}</a> : c.license}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
