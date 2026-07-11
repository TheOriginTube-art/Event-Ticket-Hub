import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, orderSeatsTable, ordersTable, seatsTable, sessionsTable, ticketCategoriesTable } from "@workspace/db";
import { CreateCheckoutBody, CreateCheckoutResponse } from "@workspace/api-zod";
import { getUncachableStripeClient } from "../stripeClient";
import { logger } from "../lib/logger";
import { QR_PAYMENT_WINDOW_MINUTES, releaseExpiredOrders } from "../lib/orderExpiry";

const router: IRouter = Router();

router.post("/checkout", async (req, res): Promise<void> => {
  const parsed = CreateCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { sessionId, seatIds, customerName, customerEmail } = parsed.data;
  const uniqueSeatIds = [...new Set(seatIds)];

  await releaseExpiredOrders();

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const seats = await db.select().from(seatsTable).where(inArray(seatsTable.id, uniqueSeatIds));
  if (seats.length !== uniqueSeatIds.length || seats.some((s) => s.sessionId !== sessionId)) {
    res.status(404).json({ error: "One or more seats were not found for this session" });
    return;
  }
  if (seats.some((s) => s.status !== "available")) {
    res.status(400).json({ error: "One or more selected seats are no longer available" });
    return;
  }

  const categoryIds = [...new Set(seats.map((s) => s.ticketCategoryId))];
  const categories = await db
    .select()
    .from(ticketCategoriesTable)
    .where(inArray(ticketCategoriesTable.id, categoryIds));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const totalAmountCents = seats.reduce((sum, seat) => {
    const category = categoryById.get(seat.ticketCategoryId);
    return sum + (category?.priceCents ?? 0);
  }, 0);

  const origin = `${req.protocol}://${req.get("host")}`;
  const allStripePricesConfigured = seats.every((seat) => categoryById.get(seat.ticketCategoryId)?.stripePriceId);

  if (allStripePricesConfigured) {
    const [order] = await db
      .insert(ordersTable)
      .values({
        sessionId,
        userId: req.user?.id ?? null,
        totalAmountCents,
        customerName,
        customerEmail,
        status: "pending",
        paymentMethod: "stripe",
      })
      .returning();

    if (!order) {
      res.status(500).json({ error: "Failed to create order" });
      return;
    }

    await db.insert(orderSeatsTable).values(
      seats.map((seat) => ({
        orderId: order.id,
        seatId: seat.id,
        priceCents: categoryById.get(seat.ticketCategoryId)?.priceCents ?? 0,
      })),
    );

    try {
      const stripe = await getUncachableStripeClient();
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: seats.map((seat) => ({ price: categoryById.get(seat.ticketCategoryId)!.stripePriceId!, quantity: 1 })),
        customer_email: customerEmail,
        success_url: `${origin}/checkout/success?orderId=${order.id}`,
        cancel_url: `${origin}/checkout/cancel?orderId=${order.id}`,
        metadata: { orderId: String(order.id) },
      });

      if (!checkoutSession.url) {
        throw new Error("Stripe did not return a checkout URL");
      }

      await db
        .update(ordersTable)
        .set({ stripeCheckoutSessionId: checkoutSession.id })
        .where(eq(ordersTable.id, order.id));

      res.json(CreateCheckoutResponse.parse({ url: checkoutSession.url, orderId: order.id }));
      return;
    } catch (err) {
      logger.warn({ err, orderId: order.id }, "Stripe checkout failed, falling back to Ozon QR payment");
      await createOzonQrPayment(order.id, uniqueSeatIds);
      res.json(CreateCheckoutResponse.parse({ url: `${origin}/checkout/pay?orderId=${order.id}`, orderId: order.id }));
      return;
    }
  }

  // No Stripe price configured for these seats -- pay via Ozon Bank QR code,
  // confirmed manually by an admin.
  const [order] = await db
    .insert(ordersTable)
    .values({
      sessionId,
      userId: req.user?.id ?? null,
      totalAmountCents,
      customerName,
      customerEmail,
      status: "pending",
      paymentMethod: "ozon_qr",
      expiresAt: new Date(Date.now() + QR_PAYMENT_WINDOW_MINUTES * 60 * 1000),
    })
    .returning();

  if (!order) {
    res.status(500).json({ error: "Failed to create order" });
    return;
  }

  await db.insert(orderSeatsTable).values(
    seats.map((seat) => ({
      orderId: order.id,
      seatId: seat.id,
      priceCents: categoryById.get(seat.ticketCategoryId)?.priceCents ?? 0,
    })),
  );

  await db.update(seatsTable).set({ status: "reserved" }).where(inArray(seatsTable.id, uniqueSeatIds));

  res.json(CreateCheckoutResponse.parse({ url: `${origin}/checkout/pay?orderId=${order.id}`, orderId: order.id }));
});

/** Used when a Stripe order was created but the redirect call itself failed. */
async function createOzonQrPayment(orderId: number, seatIds: number[]): Promise<void> {
  await db
    .update(ordersTable)
    .set({
      paymentMethod: "ozon_qr",
      expiresAt: new Date(Date.now() + QR_PAYMENT_WINDOW_MINUTES * 60 * 1000),
    })
    .where(eq(ordersTable.id, orderId));
  await db.update(seatsTable).set({ status: "reserved" }).where(inArray(seatsTable.id, seatIds));
}

export default router;
