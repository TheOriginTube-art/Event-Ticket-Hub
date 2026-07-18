import { pgTable, serial, bigint, text, timestamp } from "drizzle-orm/pg-core";

export const friendshipsTable = pgTable("friendships", {
  id:        serial("id").primaryKey(),
  userId:    bigint("user_id",   { mode: "number" }).notNull(),  // инициатор
  friendId:  bigint("friend_id", { mode: "number" }).notNull(),  // адресат
  status:    text("status").notNull().default("pending"),         // pending | accepted
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Friendship       = typeof friendshipsTable.$inferSelect;
export type InsertFriendship = typeof friendshipsTable.$inferInsert;
