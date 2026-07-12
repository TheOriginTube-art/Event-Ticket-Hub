import { useRef, useState } from "react";
import { Check } from "lucide-react";
import type { Seat } from "@workspace/api-zod";
import { formatRubles } from "@/lib/utils";

type SeatMapProps = {
  seats: Seat[];
  selectedSeatIds: number[];
  onToggleSeat: (seat: Seat) => void;
  maxSelectable: number;
};

/** Per-category colour styles, cycled if there are more categories than entries. */
const CATEGORY_STYLES = [
  { swatch: "bg-blue-500", available: "bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/40" },
  { swatch: "bg-purple-500", available: "bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/40" },
  { swatch: "bg-amber-500", available: "bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/40" },
  { swatch: "bg-emerald-500", available: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/40" },
];

function getCategoryStyle(index: number) {
  return CATEGORY_STYLES[index % CATEGORY_STYLES.length];
}

/** Renders seats grouped by row, with a prominent legend, per-category colour coding, and a hover/tap tooltip per seat. */
export function SeatMap({ seats, selectedSeatIds, onToggleSeat, maxSelectable }: SeatMapProps) {
  const [activeSeatId, setActiveSeatId] = useState<number | null>(null);
  const touchHideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = new Map<string, Seat[]>();
  for (const seat of seats) {
    const list = rows.get(seat.rowLabel) ?? [];
    list.push(seat);
    rows.set(seat.rowLabel, list);
  }
  const rowLabels = [...rows.keys()].sort();

  const categoryNames = [...new Set(seats.map((s) => s.categoryName))];
  const categoryPriceRanges = categoryNames.map((name) => {
    const prices = seats.filter((s) => s.categoryName === name).map((s) => s.priceCents);
    return { name, min: Math.min(...prices), max: Math.max(...prices) };
  });

  const showSeatTooltip = (seatId: number) => {
    if (touchHideTimeout.current) clearTimeout(touchHideTimeout.current);
    setActiveSeatId(seatId);
  };

  const hideSeatTooltip = (seatId: number) => {
    setActiveSeatId((current) => (current === seatId ? null : current));
  };

  const handleTouchStart = (seatId: number) => {
    showSeatTooltip(seatId);
    touchHideTimeout.current = setTimeout(() => hideSeatTooltip(seatId), 1600);
  };

  return (
    <div className="space-y-5">
      {/* Legend: prominent, always visible, colours mapped 1:1 with the seat grid below */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5 bg-black/25 border border-white/10 rounded-lg px-4 py-3 text-xs">
        {categoryPriceRanges.map(({ name, min, max }, i) => {
          const style = getCategoryStyle(i);
          return (
            <div key={name} className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 rounded-[4px] ${style.swatch} shrink-0`} />
              <span className="font-medium text-foreground/90">{name}</span>
              <span className="text-muted-foreground">
                {min === max ? formatRubles(min) : `${formatRubles(min)}–${formatRubles(max)}`}
              </span>
            </div>
          );
        })}
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-[4px] bg-primary shrink-0 flex items-center justify-center">
            <Check className="w-2.5 h-2.5 text-white" />
          </span>
          <span className="font-medium text-foreground/90">Выбрано</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-[4px] bg-white/10 border border-white/10 shrink-0" />
          <span className="font-medium text-muted-foreground">Занято / бронь</span>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <div className="w-full max-w-md h-1.5 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>
      <p className="text-center text-[11px] uppercase tracking-wider text-muted-foreground">Сцена / экран</p>

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex flex-col gap-2 items-center min-w-max mx-auto py-2">
          {rowLabels.map((rowLabel) => {
            const rowSeats = rows.get(rowLabel)!.sort((a, b) => a.seatNumber - b.seatNumber);
            return (
              <div key={rowLabel} className="flex items-center gap-2">
                {/* Stays visible while the row scrolls horizontally on narrow screens */}
                <span className="sticky left-0 z-10 w-6 shrink-0 text-right pr-1 text-[11px] font-medium text-muted-foreground bg-black/40 backdrop-blur-sm rounded-sm">
                  {rowLabel}
                </span>
                {rowSeats.map((seat) => {
                  const isSelected = selectedSeatIds.includes(seat.id);
                  const isSold = seat.status === "sold" || seat.status === "reserved";
                  const isDisabled = isSold || (!isSelected && selectedSeatIds.length >= maxSelectable);
                  const categoryIndex = categoryNames.indexOf(seat.categoryName);
                  const style = getCategoryStyle(categoryIndex);
                  const isActive = activeSeatId === seat.id;
                  const seatLabel = `Ряд ${seat.rowLabel}, место ${seat.seatNumber} — ${seat.categoryName}, ${
                    isSold ? "занято" : formatRubles(seat.priceCents)
                  }`;

                  return (
                    <div key={seat.id} className="relative">
                      {isActive && (
                        <div
                          role="tooltip"
                          className="absolute -top-1.5 left-1/2 -translate-x-1/2 -translate-y-full z-20 whitespace-nowrap rounded-md border border-white/10 bg-[#17171c] px-2.5 py-1.5 text-[11px] shadow-lg pointer-events-none"
                        >
                          <div className="font-semibold text-foreground">
                            Ряд {seat.rowLabel}, место {seat.seatNumber}
                          </div>
                          <div className="text-muted-foreground">
                            {seat.categoryName} · {isSold ? "занято" : formatRubles(seat.priceCents)}
                          </div>
                          <div className="absolute left-1/2 top-full -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b border-white/10 bg-[#17171c]" />
                        </div>
                      )}
                      <button
                        type="button"
                        aria-label={seatLabel}
                        disabled={isDisabled}
                        onClick={() => onToggleSeat(seat)}
                        onMouseEnter={() => showSeatTooltip(seat.id)}
                        onMouseLeave={() => hideSeatTooltip(seat.id)}
                        onFocus={() => showSeatTooltip(seat.id)}
                        onBlur={() => hideSeatTooltip(seat.id)}
                        onTouchStart={() => handleTouchStart(seat.id)}
                        className={`
                          w-8 h-8 sm:w-7 sm:h-7 rounded-[5px] text-[10px] font-medium flex items-center justify-center transition-all shrink-0
                          ${
                            isSold
                              ? "bg-white/[0.06] text-white/25 cursor-not-allowed"
                              : isSelected
                                ? "bg-primary text-white shadow-[0_0_8px_rgba(255,69,0,0.6)] scale-110"
                                : isDisabled
                                  ? "bg-white/[0.06] text-white/25 cursor-not-allowed"
                                  : `${style.available} cursor-pointer`
                          }
                        `}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5" /> : seat.seatNumber}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
