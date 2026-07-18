import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "node:path";
import { existsSync } from "node:fs";

const app: Express = express();

// Trust the reverse proxy (nginx on a self-hosted VDS, or Replit's own proxy)
// so req.protocol reflects X-Forwarded-Proto instead of always reporting "http".
app.set("trust proxy", true);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

// ── Статика ДПС Радар (для VDS — один процесс вместо nginx) ──────────────────
// Если фронтенд собран (`pnpm --filter @workspace/dps-radar run build`),
// раздаём его по /dps-radar/ прямо из Express.
const frontendDist = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../dps-radar/dist/public",
);
if (existsSync(frontendDist)) {
  logger.info({ frontendDist }, "Serving dps-radar static frontend");
  app.use("/dps-radar", express.static(frontendDist));
  // SPA fallback — все неизвестные пути под /dps-radar/ → index.html
  app.get("/dps-radar/*splat", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  logger.info("dps-radar static build not found — skipping static serving");
}

export default app;
