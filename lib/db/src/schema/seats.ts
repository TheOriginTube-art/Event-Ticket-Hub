import { integer, pgEnum, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sessionsTable } from "./sessions";
import { ticketCategoriesTable } from "./ticketCategories";

export const seatStatusEnum = pgEnum("seat_status", ["available", "reserved", "sold", "blocked"]);

export const seatsTable = pgTable("seats", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id, { onDelete: "cascade" }),
  ticketCategoryId: integer("ticket_category_id")
    .notNull()
    .references(() => ticketCategoriesTable.id, { onDelete: "cascade" }),
  rowLabel: text("row_label").notNull(),
  seatNumber: integer("seat_number").notNull(),
  status: seatStatusEnum("status").notNull().default("available"),
});

export const insertSeatSchema = createInsertSchema(seatsTable).omit({
  id: true,
});
export type InsertSeat = z.infer<typeof insertSeatSchema>;
export type Seat = typeof seatsTable.$inferSelect;
