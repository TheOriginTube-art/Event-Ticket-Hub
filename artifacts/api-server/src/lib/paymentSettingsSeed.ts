import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db, paymentSettingsTable } from "@workspace/db";
import { objectStorageClient } from "./objectStorage";
import { logger } from "./logger";

const SETTINGS_ROW_ID = 1;

/**
 * Seeds the singleton payment_settings row with the real Ozon Bank QR image
 * bundled in attached_assets on first boot, so the checkout flow has real
 * data without requiring the admin to upload it manually first.
 */
export async function seedPaymentSettingsIfEmpty(): Promise<void> {
  const [existing] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.id, SETTINGS_ROW_ID));
  if (existing?.ozonQrImagePath) {
    return;
  }

  const imagePath = path.resolve(process.cwd(), "../../attached_assets/photo_5375149591424079789_x_1783811881692.jpg");
  if (!fs.existsSync(imagePath)) {
    logger.warn({ imagePath }, "Ozon QR seed image not found, skipping payment settings seed");
    return;
  }

  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    logger.warn("Object storage not configured, skipping payment settings seed");
    return;
  }

  const objectId = randomUUID();
  const fullPath = `${privateObjectDir}/uploads/${objectId}`;
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const pathParts = normalized.split("/");
  const bucketName = pathParts[1]!;
  const objectName = pathParts.slice(2).join("/");
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(fs.readFileSync(imagePath), { contentType: "image/jpeg" });

  const ozonQrImagePath = `/objects/uploads/${objectId}`;
  const instructions =
    "Переведите точную сумму заказа по QR-коду через приложение Ozon Банк или любое приложение с поддержкой СБП. После оплаты нажмите «Я оплатил(а)» — мы проверим перевод и подтвердим заказ вручную.";

  if (existing) {
    await db
      .update(paymentSettingsTable)
      .set({ ozonQrImagePath, instructions, updatedAt: new Date() })
      .where(eq(paymentSettingsTable.id, SETTINGS_ROW_ID));
  } else {
    await db.insert(paymentSettingsTable).values({ id: SETTINGS_ROW_ID, ozonQrImagePath, instructions });
  }

  logger.info({ ozonQrImagePath }, "Seeded Ozon Bank payment settings with real QR image");
}
