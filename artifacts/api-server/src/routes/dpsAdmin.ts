/**
 * Admin panel routes for DPS Radar.
 * Requires is_admin=true in telegram_users.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { db, telegramUsersTable, friendshipsTable, dpsEventsTable } from "@workspace/db";
import { eq, count, desc, sql, ilike, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { verifyTelegramInitData } from "../lib/telegramAuth";

const router = Router();

// ── Middleware: verify initData + require is_admin ────────────────────────────
async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const initData =
    (req.body as Record<string, string> | undefined)?.initData ??
    (req.headers["x-init-data"] as string | undefined) ??
    (req.headers["x-telegram-init-data"] as string | undefined);

  // Dev bypass
  if (!token) {
    const devId = req.headers["x-dev-telegram-id"];
    if (devId) {
      (req as any).adminId = Number(devId);
      next(); return;
    }
    res.status(401).json({ error: "auth required" }); return;
  }

  if (!initData) { res.status(401).json({ error: "initData required" }); return; }

  const result = verifyTelegramInitData(initData, token);
  if (!result.ok) { res.status(401).json({ error: "invalid initData" }); return; }

  const [user] = await db
    .select({ isAdmin: telegramUsersTable.isAdmin })
    .from(telegramUsersTable)
    .where(eq(telegramUsersTable.telegramId, result.user.id))
    .limit(1);

  if (!user?.isAdmin) {
    logger.warn({ userId: result.user.id }, "admin access denied");
    res.status(403).json({ error: "not admin" }); return;
  }

  (req as any).adminId = result.user.id;
  next();
}

// ── GET /dps-radar/admin/stats ────────────────────────────────────────────────
router.get("/dps-radar/admin/stats", requireAdmin, async (_req, res) => {
  const [[{ users }], [{ events }]] = await Promise.all([
    db.select({ users: count() }).from(telegramUsersTable),
    db.select({ events: count() }).from(dpsEventsTable),
  ]);
  return res.json({
    totalUsers:  Number(users),
    totalEvents: Number(events),
  });
});

// ── GET /dps-radar/admin/users?q=&limit=50&offset=0 ──────────────────────────
router.get("/dps-radar/admin/users", requireAdmin, async (req, res) => {
  const q      = (req.query.q as string | undefined)?.trim() ?? "";
  const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  const rows = await db
    .select({
      telegramId: telegramUsersTable.telegramId,
      username:   telegramUsersTable.username,
      firstName:  telegramUsersTable.firstName,
      lastName:   telegramUsersTable.lastName,
      isAdmin:    telegramUsersTable.isAdmin,
      createdAt:  telegramUsersTable.createdAt,
    })
    .from(telegramUsersTable)
    .where(q ? or(
      ilike(telegramUsersTable.username,  `%${q}%`),
      ilike(telegramUsersTable.firstName, `%${q}%`),
    ) : undefined)
    .orderBy(desc(telegramUsersTable.createdAt))
    .limit(limit)
    .offset(offset);

  return res.json(rows);
});

// ── POST /dps-radar/admin/users/:id/set-admin ─────────────────────────────────
router.post("/dps-radar/admin/users/:id/set-admin", requireAdmin, async (req, res) => {
  const targetId = parseInt(String(req.params.id));
  const { isAdmin } = req.body as { isAdmin: boolean };
  if (isNaN(targetId)) return res.status(400).json({ error: "invalid id" });

  await db
    .update(telegramUsersTable)
    .set({ isAdmin: Boolean(isAdmin) })
    .where(eq(telegramUsersTable.telegramId, targetId));

  logger.info({ targetId, isAdmin }, "admin toggled");
  return res.json({ ok: true });
});

// ── GET /dps-radar/admin/events?limit=50&offset=0 ────────────────────────────
router.get("/dps-radar/admin/events", requireAdmin, async (req, res) => {
  const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  const rows = await db
    .select()
    .from(dpsEventsTable)
    .orderBy(desc(dpsEventsTable.lastSeenAt))
    .limit(limit)
    .offset(offset);

  return res.json(rows);
});

// ── DELETE /dps-radar/admin/events/:id ───────────────────────────────────────
router.delete("/dps-radar/admin/events/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "invalid id" });

  await db.delete(dpsEventsTable).where(eq(dpsEventsTable.id, id));
  return res.json({ ok: true });
});

export default router;
