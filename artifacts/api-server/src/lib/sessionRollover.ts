import { and, desc, eq, gte, lt, notInArray, sql } from "drizzle-orm";
import { db, eventsTable, seatsTable, sessionsTable, ticketCategoriesTable, orderSeatsTable } from "@workspace/db";
import { logger } from "./logger";

/** How far ahead the schedule should always be filled for every event. */
const HORIZON_DAYS = 14;
/** How the "same weekday/time" template session repeats when rolled forward. */
const ROLLOVER_STEP_DAYS = 7;
/** Past sessions older than this (and with no orders) are pruned so the DB doesn't grow forever. */
const PRUNE_AFTER_DAYS = 2;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Deletes past sessions that nobody bought tickets for. Sessions with any
 * order_seats are kept forever (order history depends on them) -- only the
 * public listing queries hide them once they're in the past.
 */
async function pruneOrphanedPastSessions(now: Date): Promise<void> {
  const cutoff = addDays(now, -PRUNE_AFTER_DAYS);

  const soldSessionIds = await db
    .select({ sessionId: seatsTable.sessionId })
    .from(seatsTable)
    .innerJoin(orderSeatsTable, eq(orderSeatsTable.seatId, seatsTable.id));
  const excludeIds = [...new Set(soldSessionIds.map((r) => r.sessionId))];

  const deleted = await db
    .delete(sessionsTable)
    .where(
      and(
        lt(sessionsTable.startsAt, cutoff),
        excludeIds.length > 0 ? notInArray(sessionsTable.id, excludeIds) : undefined,
      ),
    )
    .returning({ id: sessionsTable.id });

  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, "Pruned orphaned past sessions with no orders");
  }
}

/**
 * For every event, makes sure it has at least one session starting within
 * HORIZON_DAYS from now. If not, clones its most recent session (same venue,
 * hall and time of day) forward in ROLLOVER_STEP_DAYS increments -- copying
 * ticket categories (incl. Stripe price ids) and generating a fresh seat map
 * -- until the schedule reaches the horizon again.
 */
async function rolloverStaleEvents(now: Date): Promise<void> {
  const horizon = addDays(now, HORIZON_DAYS);

  const events = await db.select({ id: eventsTable.id, title: eventsTable.title }).from(eventsTable);

  for (const evt of events) {
    const [latest] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.eventId, evt.id))
      .orderBy(desc(sessionsTable.startsAt))
      .limit(1);

    if (!latest) continue; // event has no sessions at all -- nothing to clone from
    if (latest.startsAt >= horizon) continue; // already scheduled far enough ahead

    let nextStartsAt = latest.startsAt;
    let templateSessionId = latest.id;

    while (nextStartsAt < horizon) {
      nextStartsAt = addDays(nextStartsAt, ROLLOVER_STEP_DAYS);

      const [templateSession] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, templateSessionId));
      if (!templateSession) break;

      const templateCategories = await db
        .select()
        .from(ticketCategoriesTable)
        .where(eq(ticketCategoriesTable.sessionId, templateSessionId));

      const [newSession] = await db
        .insert(sessionsTable)
        .values({
          eventId: evt.id,
          venueId: templateSession.venueId,
          hall: templateSession.hall,
          startsAt: nextStartsAt,
        })
        .returning();

      if (!newSession) break;

      for (const cat of templateCategories) {
        const [newCategory] = await db
          .insert(ticketCategoriesTable)
          .values({
            sessionId: newSession.id,
            name: cat.name,
            priceCents: cat.priceCents,
            seatsTotal: cat.seatsTotal,
            stripePriceId: cat.stripePriceId,
          })
          .returning();

        if (!newCategory) continue;

        const templateSeats = await db
          .select({ rowLabel: seatsTable.rowLabel, seatNumber: seatsTable.seatNumber })
          .from(seatsTable)
          .where(eq(seatsTable.ticketCategoryId, cat.id));

        if (templateSeats.length > 0) {
          await db.insert(seatsTable).values(
            templateSeats.map((s) => ({
              sessionId: newSession.id,
              ticketCategoryId: newCategory.id,
              rowLabel: s.rowLabel,
              seatNumber: s.seatNumber,
            })),
          );
        }
      }

      logger.info(
        { event: evt.title, startsAt: nextStartsAt.toISOString() },
        "Rolled a session forward to keep the schedule filled",
      );

      templateSessionId = newSession.id;
    }
  }
}

/** Runs both maintenance steps. Safe to call as often as needed -- fully idempotent. */
export async function refreshSessionSchedule(): Promise<void> {
  const now = new Date();
  try {
    // Roll events forward BEFORE pruning: rollover needs an event's latest
    // (possibly past) session as a template, so an event must never be
    // pruned down to zero sessions before it's had a chance to roll forward.
    await rolloverStaleEvents(now);
    await pruneOrphanedPastSessions(now);
  } catch (err) {
    logger.error({ err }, "Session schedule refresh failed");
  }
}

let lastRunDateKey: string | null = null;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Runs the schedule refresh at most once per calendar day. There's no
 * background job scheduler in this app, so this is called lazily from the
 * public listing routes (same pattern as releaseExpiredOrders) -- the first
 * request of the day pays the (small) one-time cost.
 */
export async function ensureDailySessionRollover(): Promise<void> {
  const today = dateKey(new Date());
  if (lastRunDateKey === today) return;
  lastRunDateKey = today;
  await refreshSessionSchedule();
}
