import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
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
  ListAdminOrdersQueryParams,
  ListAdminOrdersResponse,
  ConfirmAdminOrderParams,
  ConfirmAdminOrderResponse,
  RejectAdminOrderParams,
  RejectAdminOrderResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { getEventMinPriceCents } from "../lib/eventQueries";
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
    event: { ...eventRow, minPriceCents },
    session: { ...session, minPriceCents },
    seats: seatRows,
  };
}

router.get("/admin/orders", requireAdmin, async (req, res): Promise<void> => {
  const params = ListAdminOrdersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await releaseExpiredOrders();

  const status = params.data.status;
  const rows = await db
    .select()
    .from(ordersTable)
    .where(
      !status || status === "all"
        ? undefined
        : status === "pending"
          ? eq(ordersTable.status, "pending")
          : status === "awaiting_confirmation"
            ? eq(ordersTable.status, "awaiting_confirmation")
            : status === "paid"
              ? eq(ordersTable.status, "paid")
              : eq(ordersTable.status, "cancelled"),
    )
    .orderBy(desc(ordersTable.createdAt));

  const filtered = status && status !== "all" ? rows : rows.filter((o) => o.status !== "cancelled");

  const details = (await Promise.all(filtered.map(buildOrderDetail))).filter((o) => o !== null);
  res.json(ListAdminOrdersResponse.parse(details));
});

router.post("/admin/orders/:id/confirm", requireAdmin, async (req, res): Promise<void> => {
  const params = ConfirmAdminOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "pending" && order.status !== "awaiting_confirmation") {
    res.status(400).json({ error: "Заказ нельзя подтвердить в текущем статусе" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const seatRows = await tx
      .select({ seatId: orderSeatsTable.seatId })
      .from(orderSeatsTable)
      .where(eq(orderSeatsTable.orderId, order.id));
    const seatIds = seatRows.map((s) => s.seatId);

    if (seatIds.length > 0) {
      await tx.update(seatsTable).set({ status: "sold" }).where(inArray(seatsTable.id, seatIds));
    }

    const [row] = await tx
      .update(ordersTable)
      .set({ status: "paid", confirmedAt: new Date(), confirmedByUserId: req.user!.id })
      .where(eq(ordersTable.id, order.id))
      .returning();
    return row;
  });

  const detail = await buildOrderDetail(updated!);
  if (!detail) {
    res.status(404).json({ error: "Order details incomplete" });
    return;
  }

  res.json(ConfirmAdminOrderResponse.parse(detail));
});

router.post("/admin/orders/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const params = RejectAdminOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "pending" && order.status !== "awaiting_confirmation") {
    res.status(400).json({ error: "Заказ нельзя отклонить в текущем статусе" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const seatRows = await tx
      .select({ seatId: orderSeatsTable.seatId })
      .from(orderSeatsTable)
      .where(eq(orderSeatsTable.orderId, order.id));
    const seatIds = seatRows.map((s) => s.seatId);

    if (seatIds.length > 0) {
      await tx
        .update(seatsTable)
        .set({ status: "available" })
        .where(and(inArray(seatsTable.id, seatIds), eq(seatsTable.status, "reserved")));
    }

    const [row] = await tx
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, order.id))
      .returning();
    return row;
  });

  const detail = await buildOrderDetail(updated!);
  if (!detail) {
    res.status(404).json({ error: "Order details incomplete" });
    return;
  }

  res.json(RejectAdminOrderResponse.parse(detail));
});

export default router;
