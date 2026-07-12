import { Router, type IRouter } from "express";
import { asc, eq, sql } from "drizzle-orm";
import {
  db,
  eventsTable,
  ordersTable,
  seatsTable,
  sessionsTable,
  ticketCategoriesTable,
  venuesTable,
} from "@workspace/db";
import {
  ListAdminEventSessionsParams,
  ListAdminEventSessionsResponse,
  CreateAdminSessionBody,
  CreateAdminSessionResponse,
  UpdateAdminSessionParams,
  UpdateAdminSessionBody,
  UpdateAdminSessionResponse,
  DeleteAdminSessionParams,
  UpdateAdminTicketCategoryParams,
  UpdateAdminTicketCategoryBody,
  UpdateAdminTicketCategoryResponse,
  ToggleAdminSeatBlockParams,
  ToggleAdminSeatBlockResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { buildSeatsForCategory } from "../lib/seatGrid";
import { getEventWithSessions } from "../lib/eventQueries";

const router: IRouter = Router();

router.get("/admin/events/:id/sessions", requireAdmin, async (req, res): Promise<void> => {
  const params = ListAdminEventSessionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
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
    .where(eq(sessionsTable.eventId, params.data.id))
    .groupBy(sessionsTable.id, venuesTable.id)
    .orderBy(asc(sessionsTable.startsAt));

  res.json(ListAdminEventSessionsResponse.parse(rows));
});

router.post("/admin/sessions", requireAdmin, async (req, res): Promise<void> => {
  const body = CreateAdminSessionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { eventId, venueId, startsAt, hall, ticketCategories } = body.data;

  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, venueId));
  if (!venue) {
    res.status(404).json({ error: "Venue not found" });
    return;
  }

  await db.transaction(async (tx) => {
    const [session] = await tx.insert(sessionsTable).values({ eventId, venueId, startsAt, hall }).returning();

    let rowIndex = 0;
    for (const tier of ticketCategories) {
      const [category] = await tx
        .insert(ticketCategoriesTable)
        .values({ sessionId: session!.id, name: tier.name, priceCents: tier.priceCents, seatsTotal: tier.seatsTotal })
        .returning();

      const { seats, nextRowIndex } = buildSeatsForCategory(session!.id, category!.id, tier.seatsTotal, rowIndex);
      rowIndex = nextRowIndex;
      if (seats.length > 0) {
        await tx.insert(seatsTable).values(seats);
      }
    }
    return session;
  });

  const [created] = await db.select().from(sessionsTable).where(eq(sessionsTable.eventId, eventId)).orderBy(sql`id desc`).limit(1);
  const detail = await getEventWithSessions(eventId);
  const sessionDetail = detail?.sessions.find((s) => s.id === created!.id);

  const categories = await db
    .select({
      id: ticketCategoriesTable.id,
      sessionId: ticketCategoriesTable.sessionId,
      name: ticketCategoriesTable.name,
      priceCents: ticketCategoriesTable.priceCents,
      seatsTotal: ticketCategoriesTable.seatsTotal,
      seatsAvailable: sql<number>`count(${seatsTable.id}) filter (where ${seatsTable.status} = 'available')::int`,
    })
    .from(ticketCategoriesTable)
    .leftJoin(seatsTable, eq(seatsTable.ticketCategoryId, ticketCategoriesTable.id))
    .where(eq(ticketCategoriesTable.sessionId, created!.id))
    .groupBy(ticketCategoriesTable.id);

  res.json(
    CreateAdminSessionResponse.parse({
      id: created!.id,
      eventId: created!.eventId,
      startsAt: created!.startsAt,
      hall: created!.hall,
      venue: sessionDetail?.venue ?? venue,
      ticketCategories: categories,
      event: { ...event, minPriceCents: null, cities: [venue.city] },
    }),
  );
});

router.patch("/admin/sessions/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminSessionParams.safeParse(req.params);
  const body = UpdateAdminSessionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.error ?? body.error)!.message });
    return;
  }

  const [existing] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, body.data.venueId));
  if (!venue) {
    res.status(404).json({ error: "Venue not found" });
    return;
  }

  const [updated] = await db
    .update(sessionsTable)
    .set({ venueId: body.data.venueId, startsAt: body.data.startsAt, hall: body.data.hall })
    .where(eq(sessionsTable.id, params.data.id))
    .returning();

  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, updated!.eventId));
  const categories = await db
    .select({
      id: ticketCategoriesTable.id,
      sessionId: ticketCategoriesTable.sessionId,
      name: ticketCategoriesTable.name,
      priceCents: ticketCategoriesTable.priceCents,
      seatsTotal: ticketCategoriesTable.seatsTotal,
      seatsAvailable: sql<number>`count(${seatsTable.id}) filter (where ${seatsTable.status} = 'available')::int`,
    })
    .from(ticketCategoriesTable)
    .leftJoin(seatsTable, eq(seatsTable.ticketCategoryId, ticketCategoriesTable.id))
    .where(eq(ticketCategoriesTable.sessionId, updated!.id))
    .groupBy(ticketCategoriesTable.id);

  res.json(
    UpdateAdminSessionResponse.parse({
      id: updated!.id,
      eventId: updated!.eventId,
      startsAt: updated!.startsAt,
      hall: updated!.hall,
      venue,
      ticketCategories: categories,
      event: { ...event!, minPriceCents: null, cities: [venue.city] },
    }),
  );
});

router.delete("/admin/sessions/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAdminSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [order] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.sessionId, params.data.id));
  if (order) {
    res.status(400).json({ error: "У сеанса есть заказы — удаление запрещено, чтобы не потерять историю продаж" });
    return;
  }

  await db.delete(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  res.status(204).send();
});

router.patch("/admin/ticket-categories/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminTicketCategoryParams.safeParse(req.params);
  const body = UpdateAdminTicketCategoryBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.error ?? body.error)!.message });
    return;
  }

  const [existing] = await db.select().from(ticketCategoriesTable).where(eq(ticketCategoriesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Ticket category not found" });
    return;
  }

  const [updated] = await db
    .update(ticketCategoriesTable)
    .set({ priceCents: body.data.priceCents })
    .where(eq(ticketCategoriesTable.id, params.data.id))
    .returning();

  const [{ seatsAvailable }] = await db
    .select({ seatsAvailable: sql<number>`count(*) filter (where ${seatsTable.status} = 'available')::int` })
    .from(seatsTable)
    .where(eq(seatsTable.ticketCategoryId, params.data.id));

  res.json(UpdateAdminTicketCategoryResponse.parse({ ...updated, seatsAvailable }));
});

router.post("/admin/seats/:id/toggle-block", requireAdmin, async (req, res): Promise<void> => {
  const params = ToggleAdminSeatBlockParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [seat] = await db
    .select({
      id: seatsTable.id,
      sessionId: seatsTable.sessionId,
      ticketCategoryId: seatsTable.ticketCategoryId,
      rowLabel: seatsTable.rowLabel,
      seatNumber: seatsTable.seatNumber,
      status: seatsTable.status,
      priceCents: ticketCategoriesTable.priceCents,
      categoryName: ticketCategoriesTable.name,
    })
    .from(seatsTable)
    .innerJoin(ticketCategoriesTable, eq(ticketCategoriesTable.id, seatsTable.ticketCategoryId))
    .where(eq(seatsTable.id, params.data.id));

  if (!seat) {
    res.status(404).json({ error: "Seat not found" });
    return;
  }

  if (seat.status !== "available" && seat.status !== "blocked") {
    res.status(400).json({ error: "Место занято или зарезервировано — сначала отмените заказ" });
    return;
  }

  const nextStatus = seat.status === "available" ? "blocked" : "available";
  await db.update(seatsTable).set({ status: nextStatus }).where(eq(seatsTable.id, seat.id));

  res.json(ToggleAdminSeatBlockResponse.parse({ ...seat, status: nextStatus }));
});

export default router;
