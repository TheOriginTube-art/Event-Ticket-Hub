import { pgTable, serial, bigint, text, timestamp } from "drizzle-orm/pg-core";
import { telegramUsersTable } from "./telegramUsers";

export const dpsDirectMessagesTable = pgTable("dps_direct_messages", {
  id:        serial("id").primaryKey(),
  fromId:    bigint("from_id", { mode: "number" }).notNull().references(() => telegramUsersTable.telegramId, { onDelete: "cascade" }),
  toId:      bigint("to_id",   { mode: "number" }).notNull().references(() => telegramUsersTable.telegramId, { onDelete: "cascade" }),
  content:   text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt:    timestamp("read_at",    { withTimezone: true }),
});

export type DpsDirectMessage       = typeof dpsDirectMessagesTable.$inferSelect;
export type InsertDpsDirectMessage = typeof dpsDirectMessagesTable.$inferInsert;
