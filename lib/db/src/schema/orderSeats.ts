import { integer, pgTable, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { seatsTable } from "./seats";

export const orderSeatsTable = pgTable("order_seats", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  seatId: integer("seat_id")
    .notNull()
    .references(() => seatsTable.id, { onDelete: "cascade" })
    .unique(),
  priceCents: integer("price_cents").notNull(),
});

export const insertOrderSeatSchema = createInsertSchema(orderSeatsTable).omit({
  id: true,
});
export type InsertOrderSeat = z.infer<typeof insertOrderSeatSchema>;
export type OrderSeat = typeof orderSeatsTable.$inferSelect;
