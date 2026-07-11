import { and, eq, inArray, lt, or } from "drizzle-orm";
import { db, orderSeatsTable, ordersTable, seatsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Customers get a fixed window to complete an Ozon Bank transfer and press
 * "I have paid" before their seat hold is released back to the pool.
 */
export const QR_PAYMENT_WINDOW_MINUTES = 30;

/**
 * Cancels any pending/awaiting-confirmation orders whose hold window has
 * expired, and frees the seats they were reserving. Called lazily at the
 * start of the read/write paths that care about seat availability or order
 * status, since there's no background job scheduler in this app.
 */
export async function releaseExpiredOrders(): Promise<void> {
  const now = new Date();

  const expired = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      and(
        or(eq(ordersTable.status, "pending"), eq(ordersTable.status, "awaiting_confirmation")),
        lt(ordersTable.expiresAt, now),
      ),
    );

  if (expired.length === 0) return;

  const expiredIds = expired.map((o) => o.id);

  await db.transaction(async (tx) => {
    const seatRows = await tx
      .select({ seatId: orderSeatsTable.seatId })
      .from(orderSeatsTable)
      .where(inArray(orderSeatsTable.orderId, expiredIds));
    const seatIds = seatRows.map((s) => s.seatId);

    if (seatIds.length > 0) {
      await tx
        .update(seatsTable)
        .set({ status: "available" })
        .where(and(inArray(seatsTable.id, seatIds), eq(seatsTable.status, "reserved")));
    }

    await tx.update(ordersTable).set({ status: "cancelled" }).where(inArray(ordersTable.id, expiredIds));
  });

  logger.info({ orderIds: expiredIds }, "Released expired Ozon QR order holds");
}
