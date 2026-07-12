import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db, eventsTable, sessionsTable, ticketCategoriesTable, venuesTable } from "@workspace/db";

export async function getEventWithSessions(id: number) {
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
  if (!event) {
    return null;
  }

  const sessions = await db
    .select({
      id: sessionsTable.id,
      eventId: sessionsTable.eventId,
      startsAt: sessionsTable.startsAt,
      hall: sessionsTable.hall,
      venue: {
        id: venuesTable.id,
        name: venuesTable.name,
        city: venuesTable.city,
        address: venuesTable.address,
      },
      minPriceCents: sql<number | null>`min(${ticketCategoriesTable.priceCents})`,
    })
    .from(sessionsTable)
    .innerJoin(venuesTable, eq(venuesTable.id, sessionsTable.venueId))
    .leftJoin(ticketCategoriesTable, eq(ticketCategoriesTable.sessionId, sessionsTable.id))
    .where(and(eq(sessionsTable.eventId, id), gte(sessionsTable.startsAt, new Date())))
    .groupBy(sessionsTable.id, venuesTable.id)
    .orderBy(asc(sessionsTable.startsAt));

  return { ...event, sessions };
}

export async function getEventMinPriceCents(eventId: number): Promise<number | null> {
  const [row] = await db
    .select({ minPriceCents: sql<number | null>`min(${ticketCategoriesTable.priceCents})` })
    .from(ticketCategoriesTable)
    .innerJoin(sessionsTable, eq(sessionsTable.id, ticketCategoriesTable.sessionId))
    .where(and(eq(sessionsTable.eventId, eventId), gte(sessionsTable.startsAt, new Date())));

  return row?.minPriceCents ?? null;
}
