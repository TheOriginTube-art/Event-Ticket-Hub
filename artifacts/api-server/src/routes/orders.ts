import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, eventsTable, ordersTable, sessionsTable, ticketCategoriesTable, venuesTable } from "@workspace/db";
import { GetOrderParams, GetOrderResponse } from "@workspace/api-zod";
import { getEventMinPriceCents } from "../lib/eventQueries";

const router: IRouter = Router();

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
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
    .where(eq(sessionsTable.id, order.sessionId));

  const [eventRow] = await db.select().from(eventsTable).where(eq(eventsTable.id, session?.eventId ?? -1));
  const [ticketCategory] = await db
    .select()
    .from(ticketCategoriesTable)
    .where(eq(ticketCategoriesTable.id, order.ticketCategoryId));

  if (!session || !eventRow || !ticketCategory) {
    res.status(404).json({ error: "Order details incomplete" });
    return;
  }

  const [sessionMinPriceCents, eventMinPriceCents] = await Promise.all([
    getEventMinPriceCents(eventRow.id),
    getEventMinPriceCents(eventRow.id),
  ]);

  res.json(
    GetOrderResponse.parse({
      id: order.id,
      status: order.status,
      quantity: order.quantity,
      totalAmountCents: order.totalAmountCents,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      createdAt: order.createdAt,
      event: { ...eventRow, minPriceCents: eventMinPriceCents },
      session: { ...session, minPriceCents: sessionMinPriceCents },
      ticketCategory,
    }),
  );
});

export default router;
