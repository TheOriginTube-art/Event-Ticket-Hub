import { doublePrecision, integer, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventTypeEnum = pgEnum("event_type", ["movie", "theater", "concert"]);

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: eventTypeEnum("type").notNull(),
  description: text("description").notNull(),
  posterUrl: text("poster_url").notNull(),
  genre: text("genre").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  ageRating: text("age_rating").notNull(),
  rating: doublePrecision("rating").notNull(),
  sourceName: text("source_name").notNull(),
  stripeProductId: text("stripe_product_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;
