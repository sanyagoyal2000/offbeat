import { formatMoney } from "@/lib/tz";

/** Display the full per-ticket amount first, with the existing demo fee underneath. */
export function TicketPrice({ price, fee, currency, from = false }: { price: number; fee: number; currency: string; from?: boolean }) {
  const total = Math.round((price + fee) * 100) / 100;
  return (
    <span className="tnum">
      <span className="block font-bold">{from && total > 0 && <span className="font-normal text-muted">From </span>}{formatMoney(total, currency)}</span>
      {total > 0 && (
        <span className="mt-0.5 block text-[11px] font-normal leading-relaxed text-muted">
          {formatMoney(price, currency)} ticket + {formatMoney(fee, currency)} demo fee · per person
        </span>
      )}
    </span>
  );
}
