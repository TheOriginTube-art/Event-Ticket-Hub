import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty, seedAdditionalEventsIfMissing, seedConcertsIfMissing } from "./seed";
import { seedPaymentSettingsIfEmpty } from "./lib/paymentSettingsSeed";
import { getStripeSync } from "./stripeClient";

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

async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required for Stripe integration.");
  }

  logger.info("Initializing Stripe schema...");
  await runMigrations({ databaseUrl });
  logger.info("Stripe schema ready");

  const stripeSync = await getStripeSync();

  // On Replit, the public domain is injected automatically. On a self-hosted
  // VDS, set PUBLIC_BASE_URL (e.g. https://example.com) so the webhook can
  // still be registered automatically.
  const webhookBaseUrl =
    process.env.PUBLIC_BASE_URL ??
    (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : undefined);
  if (webhookBaseUrl) {
    logger.info("Setting up managed Stripe webhook...");
    const webhookResult = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
    );
    logger.info({ webhook: webhookResult?.url ?? "setup complete" }, "Webhook configured");
  }

  logger.info("Syncing Stripe data...");
  stripeSync
    .syncBackfill()
    .then(() => {
      logger.info("Stripe data synced");
    })
    .catch((err: unknown) => {
      logger.error({ err }, "Error syncing Stripe data");
    });
}

// Stripe isn't connected yet -- don't let that block the server from starting.
// Real checkout will simply be unavailable until the integration is connected.
try {
  await initStripe();
} catch (err) {
  logger.warn(
    { err },
    "Stripe is not connected yet -- skipping Stripe setup. Real checkout will be unavailable until it's connected.",
  );
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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
