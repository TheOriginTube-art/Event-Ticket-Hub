import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, ordersTable, sessionsTable, ticketCategoriesTable } from "@workspace/db";
import { CreateCheckoutBody, CreateCheckoutResponse } from "@workspace/api-zod";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();

router.post("/checkout", async (req, res): Promise<void> => {
  const parsed = CreateCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { sessionId, ticketCategoryId, quantity, customerName, customerEmail } = parsed.data;

  const [ticketCategory] = await db
    .select()
    .from(ticketCategoriesTable)
    .where(eq(ticketCategoriesTable.id, ticketCategoryId));

  if (!ticketCategory || ticketCategory.sessionId !== sessionId) {
    res.status(400).json({ error: "Ticket category does not belong to the given session" });
    return;
  }

  if (!ticketCategory.stripePriceId) {
    req.log.error({ ticketCategoryId }, "Ticket category is missing a Stripe price");
    res.status(500).json({ error: "This ticket category is not available for purchase yet" });
    return;
  }

  if (ticketCategory.seatsAvailable < quantity) {
    res.status(400).json({ error: "Not enough seats available" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const totalAmountCents = ticketCategory.priceCents * quantity;

  const [order] = await db
    .insert(ordersTable)
    .values({
      sessionId,
      ticketCategoryId,
      quantity,
      totalAmountCents,
      customerName,
      customerEmail,
      status: "pending",
    })
    .returning();

  if (!order) {
    res.status(500).json({ error: "Failed to create order" });
    return;
  }

  const origin = `${req.protocol}://${req.get("host")}`;

  try {
    const stripe = await getUncachableStripeClient();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: ticketCategory.stripePriceId, quantity }],
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
  } catch (err) {
    req.log.error({ err, orderId: order.id }, "Failed to create Stripe checkout session");
    await db.update(ordersTable).set({ status: "cancelled" }).where(eq(ordersTable.id, order.id));
    res.status(502).json({ error: "Failed to start checkout" });
  }
});

export default router;
