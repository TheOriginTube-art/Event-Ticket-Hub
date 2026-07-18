import { Router } from "express";
import fs from "node:fs";
import path from "node:path";

const router = Router();

// Временный маршрут — отдаёт скрипт удаления Stripe для VDS
router.get("/dev/stripe-cleanup.sh", (_req, res): void => {
  const srcDir = path.resolve(import.meta.dirname, "..");

  const script = `#!/bin/bash
set -e
cd "$(dirname "$0")/.." 2>/dev/null || true
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SRC="$ROOT/artifacts/api-server/src"

echo "Removing Stripe files..."
rm -f "$SRC/stripeClient.ts" "$SRC/webhookHandlers.ts"

echo "Writing index.ts..."
cat > "$SRC/index.ts" << 'TSEOF'
import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty, seedAdditionalEventsIfMissing, seedConcertsIfMissing } from "./seed";
import { seedPaymentSettingsIfEmpty } from "./lib/paymentSettingsSeed";
import { seedOsmCamerasIfEmpty } from "./lib/osmCamerasSeed";
import { setupTelegramWebhook } from "./lib/dpsWebhookSetup";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(\`Invalid PORT value: "\${rawPort}"\`);

try { await seedIfEmpty(); } catch (err) { logger.error({ err }, "Failed to seed demo data"); }
try { await seedPaymentSettingsIfEmpty(); } catch (err) { logger.error({ err }, "Failed to seed payment settings"); }
try { await seedAdditionalEventsIfMissing(); } catch (err) { logger.error({ err }, "Failed to seed additional afisha events"); }
try { await seedConcertsIfMissing(); } catch (err) { logger.error({ err }, "Failed to seed concert events"); }
try { await seedOsmCamerasIfEmpty(); } catch (err) { logger.warn({ err }, "OSM camera seeding failed (non-critical, will retry on next restart)"); }

app.listen(port, async (err) => {
  if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
  logger.info({ port }, "Server listening");
  setupTelegramWebhook().catch((e: unknown) => logger.warn({ err: e }, "Telegram webhook setup failed"));
});
TSEOF

echo "Writing app.ts..."
cat > "$SRC/app.ts" << 'TSEOF'
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", true);
app.use(pinoHttp({ logger, serializers: { req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; }, res(res) { return { statusCode: res.statusCode }; } } }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/api", router);

export default app;
TSEOF

echo "Done. Now run: docker compose up -d --build"
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=stripe-cleanup.sh");
  res.send(script);
});

export default router;
