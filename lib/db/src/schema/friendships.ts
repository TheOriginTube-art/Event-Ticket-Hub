import { pgTable, serial, bigint, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { telegramUsersTable } from "./telegramUsers";

export const friendshipsTable = pgTable(
  "friendships",
  {
    id:        serial("id").primaryKey(),
    userId:    bigint("user_id",   { mode: "number" }).notNull().references(() => telegramUsersTable.telegramId, { onDelete: "cascade" }),
    friendId:  bigint("friend_id", { mode: "number" }).notNull().references(() => telegramUsersTable.telegramId, { onDelete: "cascade" }),
    status:    text("status").notNull().default("pending"), // "pending" | "accepted"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("friendships_user_friend_uniq").on(t.userId, t.friendId),
  }),
);

export type Friendship       = typeof friendshipsTable.$inferSelect;
export type InsertFriendship = typeof friendshipsTable.$inferInsert;
