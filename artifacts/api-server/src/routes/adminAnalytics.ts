import { Router, type IRouter } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, eventsTable, ordersTable, orderSeatsTable, sessionsTable } from "@workspace/db";
import { GetAdminAnalyticsQueryParams, GetAdminAnalyticsResponse } from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/admin/analytics", requireAdmin, async (req, res): Promise<void> => {
  const params = GetAdminAnalyticsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const days = params.data.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totals] = await db
    .select({
      totalRevenueCents: sql<number>`coalesce(sum(${ordersTable.totalAmountCents}), 0)::int`,
      totalOrders: sql<number>`count(*)::int`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.status, "paid"));

  const [{ totalTicketsSold }] = await db
    .select({ totalTicketsSold: sql<number>`count(*)::int` })
    .from(orderSeatsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, orderSeatsTable.orderId))
    .where(eq(ordersTable.status, "paid"));

  const [{ upcomingSessionsCount }] = await db
    .select({ upcomingSessionsCount: sql<number>`count(*)::int` })
    .from(sessionsTable)
    .where(gte(sessionsTable.startsAt, new Date()));

  const dailyRows = await db
    .select({
      date: sql<string>`to_char(${ordersTable.createdAt}, 'YYYY-MM-DD')`,
      revenueCents: sql<number>`coalesce(sum(${ordersTable.totalAmountCents}), 0)::int`,
      ordersCount: sql<number>`count(*)::int`,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.status, "paid"), gte(ordersTable.createdAt, since)))
    .groupBy(sql`to_char(${ordersTable.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${ordersTable.createdAt}, 'YYYY-MM-DD')`);

  const ticketsByDay = await db
    .select({
      date: sql<string>`to_char(${ordersTable.createdAt}, 'YYYY-MM-DD')`,
      ticketsSold: sql<number>`count(*)::int`,
    })
    .from(orderSeatsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, orderSeatsTable.orderId))
    .where(and(eq(ordersTable.status, "paid"), gte(ordersTable.createdAt, since)))
    .groupBy(sql`to_char(${ordersTable.createdAt}, 'YYYY-MM-DD')`);

  const ticketsByDayMap = new Map(ticketsByDay.map((row) => [row.date, row.ticketsSold]));
  const dailyBreakdown = dailyRows.map((row) => ({
    date: row.date,
    revenueCents: row.revenueCents,
    ordersCount: row.ordersCount,
    ticketsSold: ticketsByDayMap.get(row.date) ?? 0,
  }));

  const topEventsRows = await db
    .select({
      eventId: eventsTable.id,
      title: eventsTable.title,
      ticketsSold: sql<number>`count(${orderSeatsTable.id})::int`,
      revenueCents: sql<number>`coalesce(sum(${orderSeatsTable.priceCents}), 0)::int`,
    })
    .from(orderSeatsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, orderSeatsTable.orderId))
    .innerJoin(sessionsTable, eq(sessionsTable.id, ordersTable.sessionId))
    .innerJoin(eventsTable, eq(eventsTable.id, sessionsTable.eventId))
    .where(eq(ordersTable.status, "paid"))
    .groupBy(eventsTable.id)
    .orderBy(sql`count(${orderSeatsTable.id}) desc`)
    .limit(10);

  res.json(
    GetAdminAnalyticsResponse.parse({
      totalRevenueCents: totals?.totalRevenueCents ?? 0,
      totalTicketsSold: totalTicketsSold ?? 0,
      totalOrders: totals?.totalOrders ?? 0,
      upcomingSessionsCount: upcomingSessionsCount ?? 0,
      dailyBreakdown,
      topEvents: topEventsRows,
    }),
  );
});

export default router;
