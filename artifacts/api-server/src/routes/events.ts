import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, type SQL, sql } from "drizzle-orm";
import { db, eventsTable, sessionsTable, ticketCategoriesTable, venuesTable } from "@workspace/db";
import { GetEventParams, GetEventResponse, GetSessionParams, GetSessionResponse, ListEventsQueryParams, ListEventsResponse } from "@workspace/api-zod";
import { getEventMinPriceCents, getEventWithSessions } from "../lib/eventQueries";

const router: IRouter = Router();

router.get("/events", async (req, res): Promise<void> => {
  const params = ListEventsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { type, city, search } = params.data;

  const conditions: SQL[] = [];
  if (type) conditions.push(eq(eventsTable.type, type));
  if (search) conditions.push(ilike(eventsTable.title, `%${search}%`));
  if (city) conditions.push(eq(venuesTable.city, city));

  const rows = await db
    .select({
      id: eventsTable.id,
      title: eventsTable.title,
      type: eventsTable.type,
      posterUrl: eventsTable.posterUrl,
      genre: eventsTable.genre,
      durationMinutes: eventsTable.durationMinutes,
      ageRating: eventsTable.ageRating,
      rating: eventsTable.rating,
      sourceName: eventsTable.sourceName,
      minPriceCents: sql<number | null>`min(${ticketCategoriesTable.priceCents})`,
    })
    .from(eventsTable)
    .leftJoin(sessionsTable, eq(sessionsTable.eventId, eventsTable.id))
    .leftJoin(venuesTable, eq(venuesTable.id, sessionsTable.venueId))
    .leftJoin(ticketCategoriesTable, eq(ticketCategoriesTable.sessionId, sessionsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(eventsTable.id)
    .orderBy(asc(eventsTable.id));

  res.json(ListEventsResponse.parse(rows));
});

router.get("/events/:id", async (req, res): Promise<void> => {
  const params = GetEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const event = await getEventWithSessions(params.data.id);
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  res.json(GetEventResponse.parse(event));
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db
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
    })
    .from(sessionsTable)
    .innerJoin(venuesTable, eq(venuesTable.id, sessionsTable.venueId))
    .where(eq(sessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [ticketCategories, [eventRow]] = await Promise.all([
    db.select().from(ticketCategoriesTable).where(eq(ticketCategoriesTable.sessionId, session.id)),
    db.select().from(eventsTable).where(eq(eventsTable.id, session.eventId)),
  ]);

  if (!eventRow) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const minPriceCents = await getEventMinPriceCents(eventRow.id);

  res.json(
    GetSessionResponse.parse({
      ...session,
      ticketCategories,
      event: { ...eventRow, minPriceCents },
    }),
  );
});

export default router;
