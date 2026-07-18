import { pgTable, serial, text, real, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dpsEventsTable = pgTable("dps_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "dps_post" | "accident"
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  address: text("address").notNull(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  author: text("author").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDpsEventSchema = createInsertSchema(dpsEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDpsEvent = z.infer<typeof insertDpsEventSchema>;
export type DpsEvent = typeof dpsEventsTable.$inferSelect;
