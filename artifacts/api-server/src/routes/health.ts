import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const healthHandler = (_req: import("express").Request, res: import("express").Response): void => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
};

// /api/health  — used by deploy/healthcheck.sh and external monitors
// /api/healthz — legacy alias kept for backwards compat
router.get("/health", healthHandler);
router.get("/healthz", healthHandler);

export default router;
