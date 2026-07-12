import { Router, type IRouter } from "express";
import { desc, eq, gte, sql } from "drizzle-orm";
import { db, eventsTable, ordersTable, sessionsTable } from "@workspace/db";
import {
  ListAdminEventsResponse,
  CreateAdminEventBody,
  CreateAdminEventResponse,
  UpdateAdminEventParams,
  UpdateAdminEventBody,
  UpdateAdminEventResponse,
  DeleteAdminEventParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/admin/events", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: eventsTable.id,
      title: eventsTable.title,
      type: eventsTable.type,
      description: eventsTable.description,
      posterUrl: eventsTable.posterUrl,
      genre: eventsTable.genre,
      durationMinutes: eventsTable.durationMinutes,
      ageRating: eventsTable.ageRating,
      rating: eventsTable.rating,
      sourceName: eventsTable.sourceName,
      upcomingSessionsCount: sql<number>`count(${sessionsTable.id}) filter (where ${sessionsTable.startsAt} >= now())::int`,
    })
    .from(eventsTable)
    .leftJoin(sessionsTable, eq(sessionsTable.eventId, eventsTable.id))
    .groupBy(eventsTable.id)
    .orderBy(desc(eventsTable.id));

  res.json(
    ListAdminEventsResponse.parse(
      rows.map((row) => ({
        ...row,
        posterUrl: row.posterUrl ?? "",
        genre: row.genre ?? "",
        durationMinutes: row.durationMinutes ?? 0,
        ageRating: row.ageRating ?? "",
        rating: row.rating ?? 0,
        description: row.description ?? "",
      })),
    ),
  );
});

router.post("/admin/events", requireAdmin, async (req, res): Promise<void> => {
  const body = CreateAdminEventBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [event] = await db.insert(eventsTable).values(body.data).returning();
  res.json(CreateAdminEventResponse.parse({ ...event, upcomingSessionsCount: 0 }));
});

router.patch("/admin/events/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminEventParams.safeParse(req.params);
  const body = UpdateAdminEventBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.error ?? body.error)!.message });
    return;
  }

  const [existing] = await db.select().from(eventsTable).where(eq(eventsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const [updated] = await db.update(eventsTable).set(body.data).where(eq(eventsTable.id, params.data.id)).returning();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*) filter (where ${sessionsTable.startsAt} >= now())::int` })
    .from(sessionsTable)
    .where(eq(sessionsTable.eventId, params.data.id));

  res.json(UpdateAdminEventResponse.parse({ ...updated, upcomingSessionsCount: count }));
});

router.delete("/admin/events/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAdminEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(eventsTable).where(eq(eventsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .innerJoin(sessionsTable, eq(sessionsTable.id, ordersTable.sessionId))
    .where(eq(sessionsTable.eventId, params.data.id));
  if (order) {
    res.status(400).json({ error: "У мероприятия есть заказы — удаление запрещено, чтобы не потерять историю продаж" });
    return;
  }

  await db.delete(eventsTable).where(eq(eventsTable.id, params.data.id));
  res.status(204).send();
});

export default router;
