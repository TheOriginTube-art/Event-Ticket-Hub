import { pgTable, serial, real, text, timestamp } from "drizzle-orm/pg-core";

export const permanentCamerasTable = pgTable("permanent_cameras", {
  id:          serial("id").primaryKey(),
  lat:         real("lat").notNull(),
  lng:         real("lng").notNull(),
  description: text("description").notNull().default("Камера фиксации скорости"),
  city:        text("city").notNull().default("blagoveshchensk"),
  addedBy:     text("added_by").notNull().default("unknown"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PermanentCamera       = typeof permanentCamerasTable.$inferSelect;
export type InsertPermanentCamera = typeof permanentCamerasTable.$inferInsert;
