import type { Seat } from "@workspace/api-zod";
import { formatRubles } from "@/lib/utils";

type SeatMapProps = {
  seats: Seat[];
  selectedSeatIds: number[];
  onToggleSeat: (seat: Seat) => void;
  maxSelectable: number;
};

/** Renders seats grouped by row, with a legend and per-category colour coding. */
export function SeatMap({ seats, selectedSeatIds, onToggleSeat, maxSelectable }: SeatMapProps) {
  const rows = new Map<string, Seat[]>();
  for (const seat of seats) {
    const list = rows.get(seat.rowLabel) ?? [];
    list.push(seat);
    rows.set(seat.rowLabel, list);
  }
  const rowLabels = [...rows.keys()].sort();

  const categoryNames = [...new Set(seats.map((s) => s.categoryName))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center">
        <div className="w-full max-w-md h-1.5 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>
      <p className="text-center text-[11px] uppercase tracking-wider text-muted-foreground">Сцена / экран</p>

      <div className="overflow-x-auto">
        <div className="flex flex-col gap-1.5 items-center min-w-max mx-auto py-2">
          {rowLabels.map((rowLabel) => {
            const rowSeats = rows.get(rowLabel)!.sort((a, b) => a.seatNumber - b.seatNumber);
            return (
              <div key={rowLabel} className="flex items-center gap-1.5">
                <span className="w-4 text-[10px] text-muted-foreground text-right mr-1">{rowLabel}</span>
                {rowSeats.map((seat) => {
                  const isSelected = selectedSeatIds.includes(seat.id);
                  const isSold = seat.status === "sold" || seat.status === "reserved";
                  const isDisabled = isSold || (!isSelected && selectedSeatIds.length >= maxSelectable);
                  const categoryIndex = categoryNames.indexOf(seat.categoryName);

                  return (
                    <button
                      key={seat.id}
                      type="button"
                      title={`Ряд ${seat.rowLabel}, место ${seat.seatNumber} — ${seat.categoryName}, ${formatRubles(seat.priceCents)}`}
                      disabled={isDisabled}
                      onClick={() => onToggleSeat(seat)}
                      className={`
                        w-6 h-6 rounded-[4px] text-[9px] font-medium flex items-center justify-center transition-all shrink-0
                        ${
                          isSold
                            ? "bg-white/5 text-white/20 cursor-not-allowed"
                            : isSelected
                              ? "bg-primary text-white shadow-[0_0_8px_rgba(255,69,0,0.6)] scale-110"
                              : isDisabled
                                ? "bg-white/5 text-white/20 cursor-not-allowed"
                                : categoryIndex === 0
                                  ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/40 cursor-pointer"
                                  : categoryIndex === 1
                                    ? "bg-purple-500/20 text-purple-300 hover:bg-purple-500/40 cursor-pointer"
                                    : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/40 cursor-pointer"
                        }
                      `}
                    >
                      {seat.seatNumber}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs text-muted-foreground">
        {categoryNames.map((name, i) => (
          <div key={name} className="flex items-center gap-1.5">
            <span
              className={`w-3 h-3 rounded-[3px] ${
                i === 0 ? "bg-blue-500/40" : i === 1 ? "bg-purple-500/40" : "bg-amber-500/40"
              }`}
            />
            {name}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px] bg-primary" />
          Выбрано
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px] bg-white/5" />
          Занято / бронь
        </div>
      </div>
    </div>
  );
}
