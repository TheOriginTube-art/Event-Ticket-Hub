import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty, seedAdditionalEventsIfMissing, seedConcertsIfMissing } from "./seed";
import { seedPaymentSettingsIfEmpty } from "./lib/paymentSettingsSeed";
import { seedOsmCamerasIfEmpty } from "./lib/osmCamerasSeed";
import { setupTelegramWebhook } from "./lib/dpsWebhookSetup";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Авто-миграция: создаём таблицы которых ещё нет ──────────────────────────
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dps_direct_messages (
      id         SERIAL PRIMARY KEY,
      from_id    BIGINT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
      to_id      BIGINT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at    TIMESTAMPTZ
    )
  `);
  await pool.query(`ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`UPDATE telegram_users SET is_admin = true WHERE lower(username) = 'etxarriz'`);
  logger.info("Migrations OK");
} catch (err) {
  logger.warn({ err }, "Migration warning (non-fatal)");
}

try {
  await seedIfEmpty();
} catch (err) {
  logger.error({ err }, "Failed to seed demo data");
}

try {
  await seedPaymentSettingsIfEmpty();
} catch (err) {
  logger.error({ err }, "Failed to seed payment settings");
}

try {
  await seedAdditionalEventsIfMissing();
} catch (err) {
  logger.error({ err }, "Failed to seed additional afisha events");
}

try {
  await seedConcertsIfMissing();
} catch (err) {
  logger.error({ err }, "Failed to seed concert events");
}

try {
  await seedOsmCamerasIfEmpty();
} catch (err) {
  logger.warn({ err }, "OSM camera seeding failed (non-critical, will retry on next restart)");
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Log Telegram bot configuration status so it's easy to verify in deployment logs
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (botUsername) {
    logger.info({ botUsername }, "Telegram bot username configured — invite links will use t.me/" + botUsername);
  } else {
    logger.warn("TELEGRAM_BOT_USERNAME is not set — invite links will fall back to hardcoded default");
  }

  // Set up Telegram webhook for DPS Radar bot (non-blocking)
  setupTelegramWebhook().catch((e: unknown) =>
    logger.warn({ err: e }, "Telegram webhook setup failed"),
  );
});
