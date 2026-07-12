import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  eventsTable,
  orderSeatsTable,
  ordersTable,
  seatsTable,
  sessionsTable,
  ticketCategoriesTable,
  venuesTable,
} from "@workspace/db";
import {
  GetOrderParams,
  GetOrderResponse,
  GetMyOrdersResponse,
  MarkOrderPaidParams,
  MarkOrderPaidResponse,
} from "@workspace/api-zod";
import { getEventMinPriceCents } from "../lib/eventQueries";
import { requireAuth } from "../lib/auth";
import { releaseExpiredOrders } from "../lib/orderExpiry";

const router: IRouter = Router();

async function buildOrderDetail(order: typeof ordersTable.$inferSelect) {
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
  if (!session || !eventRow) {
    return null;
  }

  const seatRows = await db
    .select({
      id: seatsTable.id,
      rowLabel: seatsTable.rowLabel,
      seatNumber: seatsTable.seatNumber,
      categoryName: ticketCategoriesTable.name,
      priceCents: orderSeatsTable.priceCents,
    })
    .from(orderSeatsTable)
    .innerJoin(seatsTable, eq(seatsTable.id, orderSeatsTable.seatId))
    .innerJoin(ticketCategoriesTable, eq(ticketCategoriesTable.id, seatsTable.ticketCategoryId))
    .where(eq(orderSeatsTable.orderId, order.id));

  const minPriceCents = await getEventMinPriceCents(eventRow.id);

  return {
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    totalAmountCents: order.totalAmountCents,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    event: { ...eventRow, minPriceCents, cities: [session.venue.city] },
    session: { ...session, minPriceCents },
    seats: seatRows,
  };
}

router.get("/orders/mine", requireAuth, async (req, res): Promise<void> => {
  await releaseExpiredOrders();

  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.userId, req.user!.id))
    .orderBy(desc(ordersTable.createdAt));

  const details = (await Promise.all(rows.map(buildOrderDetail))).filter((o) => o !== null);
  res.json(GetMyOrdersResponse.parse(details));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await releaseExpiredOrders();

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const detail = await buildOrderDetail(order);
  if (!detail) {
    res.status(404).json({ error: "Order details incomplete" });
    return;
  }

  res.json(GetOrderResponse.parse(detail));
});

router.post("/orders/:id/mark-paid", async (req, res): Promise<void> => {
  const params = MarkOrderPaidParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await releaseExpiredOrders();

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.paymentMethod !== "ozon_qr" || order.status !== "pending") {
    res.status(400).json({ error: "Заказ не ожидает оплату по QR-коду" });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: "awaiting_confirmation" })
    .where(eq(ordersTable.id, order.id))
    .returning();

  const detail = await buildOrderDetail(updated!);
  if (!detail) {
    res.status(404).json({ error: "Order details incomplete" });
    return;
  }

  res.json(MarkOrderPaidResponse.parse(detail));
});

export default router;
