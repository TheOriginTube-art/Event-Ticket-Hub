import { pgTable, bigint, text, real, boolean, timestamp } from "drizzle-orm/pg-core";

export const telegramUsersTable = pgTable("telegram_users", {
  telegramId:    bigint("telegram_id",  { mode: "number" }).primaryKey(),
  username:      text("username"),
  firstName:     text("first_name").notNull().default(""),
  lastName:      text("last_name"),
  photoUrl:      text("photo_url"),
  city:          text("city").notNull().default("blagoveshchensk"),
  lastLat:       real("last_lat"),
  lastLng:       real("last_lng"),
  lastLocAt:     timestamp("last_loc_at",  { withTimezone: true }),
  shareLocation: boolean("share_location").notNull().default(false),
  isAdmin:       boolean("is_admin").notNull().default(false),
  createdAt:     timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow(),
});

export type TelegramUser       = typeof telegramUsersTable.$inferSelect;
export type InsertTelegramUser = typeof telegramUsersTable.$inferInsert;
