import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

/**
 * Fetches Stripe credentials.
 *
 * On Replit, credentials come from the managed connector (rotated tokens,
 * fetched fresh on every call). Outside Replit (e.g. a self-hosted VDS),
 * there is no connector -- credentials are read directly from plain
 * environment variables (`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`)
 * instead.
 */
export async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  const plainSecretKey = process.env.STRIPE_SECRET_KEY;
  if (plainSecretKey) {
    return {
      secretKey: plainSecretKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "No Stripe credentials found. Set STRIPE_SECRET_KEY (and optionally STRIPE_WEBHOOK_SECRET) " +
        "as environment variables, or connect the Stripe integration via the Integrations tab on Replit.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as {
    items?: Array<{ settings?: { secret_key?: string; webhook_secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret_key) {
    throw new Error(
      "Stripe integration not connected or missing secret key. Connect Stripe via the Integrations tab first.",
    );
  }

  return {
    secretKey: settings.secret_key,
    webhookSecret: settings.webhook_secret,
  };
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached -- fetches credentials on every call so rotated keys are picked up.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

/**
 * Returns a fresh StripeSync instance for webhook processing and data sync.
 * Not cached -- fetches credentials on every call so rotated keys are picked up.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}

/**
 * Verifies and parses an incoming webhook payload into a typed Stripe event.
 * Used alongside `getStripeSync().processWebhook` (which syncs Stripe data into
 * Postgres but does not return the parsed event) whenever application logic
 * needs to react to the event itself, e.g. marking an order paid.
 */
export async function constructWebhookEvent(payload: Buffer, signature: string): Promise<Stripe.Event> {
  const { secretKey, webhookSecret } = await getStripeCredentials();
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured yet");
  }
  const stripe = new Stripe(secretKey);
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
