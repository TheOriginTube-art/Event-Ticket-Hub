import { and, eq, gte, inArray } from "drizzle-orm";
import { db, eventsTable, orderSeatsTable, ordersTable, seatsTable, sessionsTable, ticketCategoriesTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Each day, every upcoming movie session gets a random extra slice of its
 * still-available seats marked as sold -- so the seat map fills up
 * gradually and organically as a showtime approaches, instead of every
 * seat starting (and staying) empty.
 */
const MIN_DAILY_FILL_RATIO = 0.05;
const MAX_DAILY_FILL_RATIO = 0.18;
/** Never auto-sell a session out completely -- always leave some real choice. */
const MAX_TOTAL_SOLD_RATIO = 0.9;
/** Seats get grouped into small synthetic orders, like real groups of friends buying together. */
const MIN_GROUP_SIZE = 1;
const MAX_GROUP_SIZE = 4;

const DEMO_CUSTOMERS = [
  { name: "Иван Петров", email: "ivan.petrov@example.com" },
  { name: "Мария Смирнова", email: "maria.smirnova@example.com" },
  { name: "Алексей Кузнецов", email: "alexey.kuznetsov@example.com" },
  { name: "Екатерина Волкова", email: "ekaterina.volkova@example.com" },
  { name: "Дмитрий Соколов", email: "dmitry.sokolov@example.com" },
  { name: "Ольга Попова", email: "olga.popova@example.com"},
  { name: "Сергей Лебедев", email: "sergey.lebedev@example.com" },
  { name: "Анна Новикова", email: "anna.novikova@example.com" },
  { name: "Николай Морозов", email: "nikolay.morozov@example.com" },
  { name: "Татьяна Козлова", email: "tatyana.kozlova@example.com" },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Fisher-Yates shuffle -- avoids always biasing toward the first rows/seats. */
function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export async function fillSessionRandomly(sessionId: number): Promise<number> {
  const seats = await db
    .select({
      id: seatsTable.id,
      status: seatsTable.status,
      priceCents: ticketCategoriesTable.priceCents,
    })
    .from(seatsTable)
    .innerJoin(ticketCategoriesTable, eq(ticketCategoriesTable.id, seatsTable.ticketCategoryId))
    .where(eq(seatsTable.sessionId, sessionId));

  if (seats.length === 0) return 0;

  const totalSeats = seats.length;
  const alreadySold = seats.filter((s) => s.status === "sold").length;
  const maxSoldAllowed = Math.floor(totalSeats * MAX_TOTAL_SOLD_RATIO);
  if (alreadySold >= maxSoldAllowed) return 0;

  const available = seats.filter((s) => s.status === "available");
  if (available.length === 0) return 0;

  const fillRatio = randomBetween(MIN_DAILY_FILL_RATIO, MAX_DAILY_FILL_RATIO);
  const desiredCount = Math.max(1, Math.round(totalSeats * fillRatio));
  const roomLeft = maxSoldAllowed - alreadySold;
  const countToSell = Math.min(desiredCount, roomLeft, available.length);
  if (countToSell <= 0) return 0;

  const seatsToSell = shuffle(available).slice(0, countToSell);

  let sold = 0;
  let remaining = [...seatsToSell];
  while (remaining.length > 0) {
    const groupSize = Math.min(remaining.length, Math.floor(randomBetween(MIN_GROUP_SIZE, MAX_GROUP_SIZE + 1)));
    const group = remaining.slice(0, groupSize);
    remaining = remaining.slice(groupSize);

    const customer = pickRandom(DEMO_CUSTOMERS);
    const totalAmountCents = group.reduce((sum, s) => sum + s.priceCents, 0);

    const [order] = await db
      .insert(ordersTable)
      .values({
        sessionId,
        totalAmountCents,
        customerName: customer.name,
        customerEmail: customer.email,
        status: "paid",
        paymentMethod: "ozon_qr",
        confirmedAt: new Date(),
      })
      .returning({ id: ordersTable.id });

    if (!order) continue;

    await db.insert(orderSeatsTable).values(
      group.map((s) => ({
        orderId: order.id,
        seatId: s.id,
        priceCents: s.priceCents,
      })),
    );

    await db
      .update(seatsTable)
      .set({ status: "sold" })
      .where(inArray(seatsTable.id, group.map((s) => s.id)));

    sold += group.length;
  }

  return sold;
}

/** Runs once: sells a random slice of remaining seats on every upcoming movie session. */
export async function simulateDailySeatDemand(): Promise<void> {
  const now = new Date();
  try {
    const movieSessions = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .innerJoin(eventsTable, eq(eventsTable.id, sessionsTable.eventId))
      .where(and(eq(eventsTable.type, "movie"), gte(sessionsTable.startsAt, now)));

    let totalSold = 0;
    for (const session of movieSessions) {
      totalSold += await fillSessionRandomly(session.id);
    }

    if (totalSold > 0) {
      logger.info({ sessions: movieSessions.length, seatsSold: totalSold }, "Simulated daily seat demand for movies");
    }
  } catch (err) {
    logger.error({ err }, "Daily seat demand simulation failed");
  }
}

let lastRunDateKey: string | null = null;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Runs the seat demand simulation at most once per calendar day. Lazily
 * triggered from the public listing routes, same pattern as
 * ensureDailySessionRollover -- the first request of the day pays the
 * (small) one-time cost.
 */
export async function ensureDailySeatDemand(): Promise<void> {
  const today = dateKey(new Date());
  if (lastRunDateKey === today) return;
  lastRunDateKey = today;
  await simulateDailySeatDemand();
}
