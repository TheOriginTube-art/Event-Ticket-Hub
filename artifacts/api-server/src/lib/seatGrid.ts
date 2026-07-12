const SEATS_PER_ROW = 12;
const ROW_LETTERS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ";

/** Generates a rectangular grid of seats (rows of SEATS_PER_ROW) for one ticket category, continuing row letters from `startRowIndex`. Returns the next free row index. */
export function buildSeatsForCategory(
  sessionId: number,
  ticketCategoryId: number,
  seatsTotal: number,
  startRowIndex: number,
): {
  seats: { sessionId: number; ticketCategoryId: number; rowLabel: string; seatNumber: number }[];
  nextRowIndex: number;
} {
  const seats: { sessionId: number; ticketCategoryId: number; rowLabel: string; seatNumber: number }[] = [];
  let remaining = seatsTotal;
  let rowIndex = startRowIndex;

  while (remaining > 0) {
    const rowLabel = ROW_LETTERS[rowIndex % ROW_LETTERS.length] ?? String(rowIndex);
    const seatsInRow = Math.min(SEATS_PER_ROW, remaining);
    for (let seatNumber = 1; seatNumber <= seatsInRow; seatNumber++) {
      seats.push({ sessionId, ticketCategoryId, rowLabel, seatNumber });
    }
    remaining -= seatsInRow;
    rowIndex++;
  }

  return { seats, nextRowIndex: rowIndex };
}
