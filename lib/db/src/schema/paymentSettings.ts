import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Singleton-style settings row (by convention, id = 1) holding the
 * Ozon Bank payment QR code image and instructions shown to customers
 * at checkout. Managed by admins from the admin panel.
 */
export const paymentSettingsTable = pgTable("payment_settings", {
  id: serial("id").primaryKey(),
  ozonQrImagePath: text("ozon_qr_image_path"),
  instructions: text("instructions"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSettingsSchema = createInsertSchema(paymentSettingsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertPaymentSettings = z.infer<typeof insertPaymentSettingsSchema>;
export type PaymentSettings = typeof paymentSettingsTable.$inferSelect;
