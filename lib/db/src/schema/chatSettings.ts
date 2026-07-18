import { pgTable, text, bigint, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chatSettingsTable = pgTable("chat_settings", {
  chatId: bigint("chat_id", { mode: "number" }).primaryKey(),
  city: text("city").notNull().default("blagoveshchensk"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChatSettingsSchema = createInsertSchema(chatSettingsTable);
export type InsertChatSettings = z.infer<typeof insertChatSettingsSchema>;
export type ChatSettings = typeof chatSettingsTable.$inferSelect;
