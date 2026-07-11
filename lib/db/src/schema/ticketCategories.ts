import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sessionsTable } from "./sessions";

export const ticketCategoriesTable = pgTable("ticket_categories", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  seatsTotal: integer("seats_total").notNull(),
  stripePriceId: text("stripe_price_id"),
});

export const insertTicketCategorySchema = createInsertSchema(ticketCategoriesTable).omit({
  id: true,
});
export type InsertTicketCategory = z.infer<typeof insertTicketCategorySchema>;
export type TicketCategory = typeof ticketCategoriesTable.$inferSelect;
