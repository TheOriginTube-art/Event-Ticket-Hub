import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentSettingsTable } from "@workspace/db";
import { GetPaymentSettingsResponse, UpdatePaymentSettingsBody, UpdatePaymentSettingsResponse } from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

const SETTINGS_ROW_ID = 1;

async function getOrCreateSettings() {
  const [existing] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.id, SETTINGS_ROW_ID));
  if (existing) return existing;

  const [created] = await db
    .insert(paymentSettingsTable)
    .values({ id: SETTINGS_ROW_ID, ozonQrImagePath: null, instructions: null })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [row] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.id, SETTINGS_ROW_ID));
  return row!;
}

function toPublicResponse(settings: { ozonQrImagePath: string | null; instructions: string | null }) {
  return {
    ozonQrImageUrl: settings.ozonQrImagePath ? `/api/storage${settings.ozonQrImagePath}` : null,
    instructions: settings.instructions,
  };
}

router.get("/payment-settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(GetPaymentSettingsResponse.parse(toPublicResponse(settings)));
});

router.put("/admin/payment-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdatePaymentSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await getOrCreateSettings();

  const [updated] = await db
    .update(paymentSettingsTable)
    .set({
      ozonQrImagePath: parsed.data.ozonQrImagePath === undefined ? undefined : parsed.data.ozonQrImagePath,
      instructions: parsed.data.instructions ?? null,
      updatedAt: new Date(),
    })
    .where(eq(paymentSettingsTable.id, SETTINGS_ROW_ID))
    .returning();

  res.json(UpdatePaymentSettingsResponse.parse(toPublicResponse(updated!)));
});

export default router;
