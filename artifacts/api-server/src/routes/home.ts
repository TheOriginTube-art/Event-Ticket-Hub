import { Router, type IRouter } from "express";
import { and, desc, eq, gt, sql, type SQL } from "drizzle-orm";
import { db, eventsTable, sessionsTable, ticketCategoriesTable, venuesTable } from "@workspace/db";
import { GetHomeHighlightsQueryParams, GetHomeHighlightsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/home/highlights", async (req, res): Promise<void> => {
  const params = GetHomeHighlightsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { city } = params.data;

  const conditions: SQL[] = [];
  if (city) conditions.push(eq(venuesTable.city, city));

  const featuredEvents = await db
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
    .orderBy(desc(eventsTable.rating))
    .limit(6);

  const [[{ totalUpcomingSessions }], [{ citiesCount }], [{ eventsCount }]] = await Promise.all([
    db.select({ totalUpcomingSessions: sql<number>`count(*)::int` }).from(sessionsTable).where(gt(sessionsTable.startsAt, new Date())),
    db.select({ citiesCount: sql<number>`count(distinct ${venuesTable.city})::int` }).from(venuesTable),
    db.select({ eventsCount: sql<number>`count(*)::int` }).from(eventsTable),
  ]);

  res.json(
    GetHomeHighlightsResponse.parse({
      featuredEvents,
      totalUpcomingSessions,
      citiesCount,
      eventsCount,
    }),
  );
});

export default router;
