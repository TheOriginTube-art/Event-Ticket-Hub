import { Router, type IRouter } from "express";
import { desc, eq, gt, sql } from "drizzle-orm";
import { db, eventsTable, sessionsTable, ticketCategoriesTable, venuesTable } from "@workspace/db";
import { GetHomeHighlightsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/home/highlights", async (_req, res): Promise<void> => {
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
    .leftJoin(ticketCategoriesTable, eq(ticketCategoriesTable.sessionId, sessionsTable.id))
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
