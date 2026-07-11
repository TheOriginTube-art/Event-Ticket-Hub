import { eq, sql } from "drizzle-orm";
import { db, ordersTable, ticketCategoriesTable } from "@workspace/db";
import { logger } from "./lib/logger";
import { constructWebhookEvent, getStripeSync } from "./stripeClient";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "Received type: " +
          typeof payload +
          ". This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    // Sync raw Stripe data (products/prices/etc.) into Postgres.
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Also parse the event ourselves to react to it in application logic.
    const event = await constructWebhookEvent(payload, signature);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      await markOrderPaid(session.id);
    }
  }
}

async function markOrderPaid(stripeCheckoutSessionId: string): Promise<void> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.stripeCheckoutSessionId, stripeCheckoutSessionId));

  if (!order) {
    logger.warn({ stripeCheckoutSessionId }, "No order found for completed checkout session");
    return;
  }

  if (order.status === "paid") {
    // Already processed (webhook retried) -- do not double-decrement seats.
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, order.id));

    await tx
      .update(ticketCategoriesTable)
      .set({ seatsAvailable: sql`${ticketCategoriesTable.seatsAvailable} - ${order.quantity}` })
      .where(eq(ticketCategoriesTable.id, order.ticketCategoryId));
  });

  logger.info({ orderId: order.id }, "Order marked as paid, seats decremented");
}
