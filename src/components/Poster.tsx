import Image from "next/image";

/** Film poster from Qloo when available; otherwise a typographic placeholder (never a fake poster). */
export function Poster({ title, year, image, priority = false, sizes = "200px" }: { title: string; year: number; image: string | null; priority?: boolean; sizes?: string }) {
  return (
    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[16px] border border-line bg-raised">
      {image ? (
        <Image src={image} alt={`${title} (${year}) poster`} fill sizes={sizes} priority={priority} className="object-cover" />
      ) : (
        <div className="flex h-full flex-col justify-end bg-gradient-to-b from-raised to-ink p-3">
          <p className="font-display text-[15px] leading-tight">{title}</p>
          <p className="text-[12px] text-muted">{year}</p>
        </div>
      )}
    </div>
  );
}
