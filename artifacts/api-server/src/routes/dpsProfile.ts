/**
 * Profile, friends, and real-time location sharing for DPS Radar Telegram Mini App.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db, telegramUsersTable, friendshipsTable, dpsEventsTable } from "@workspace/db";
import { eq, or, and, count, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

interface TgUserPayload {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
}

// ── Telegram initData verification ───────────────────────────────────────────
function verifyInitData(
  initData: string,
  botToken: string,
): { user: TgUserPayload } | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();
    const computedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (computedHash !== hash) return null;

    const userRaw = params.get("user");
    if (!userRaw) return null;
    return { user: JSON.parse(userRaw) as TgUserPayload };
  } catch {
    return null;
  }
}

// Middleware — parse & verify initData, attach tgUser to req
function requireTgUser(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // Dev-mode: accept explicit telegramId header for curl testing
    const devId = req.headers["x-dev-telegram-id"];
    if (devId) {
      (req as Request & { tgUser: TgUserPayload }).tgUser = { id: Number(devId), first_name: "Dev" };
      next();
      return;
    }
    res.status(503).json({ error: "Bot token not configured" });
    return;
  }

  const initData =
    (req.body as Record<string, string>)?.initData ??
    (req.headers["x-init-data"] as string) ??
    (req.headers["x-telegram-init-data"] as string);

  if (!initData) {
    logger.warn("profile auth: initData missing");
    res.status(401).json({ error: "initData required" });
    return;
  }

  const parsed = verifyInitData(initData, token);
  if (!parsed) {
    logger.warn({ initDataLen: initData.length, initDataSnippet: initData.slice(0, 60) }, "profile auth: HMAC failed");
    res.status(401).json({ error: "Invalid Telegram initData" });
    return;
  }

  (req as Request & { tgUser: TgUserPayload }).tgUser = parsed.user;
  next();
}

function getTgUser(req: Request): TgUserPayload {
  return (req as Request & { tgUser: TgUserPayload }).tgUser;
}

// ── POST /profile/sync — upsert user from initData ───────────────────────────
router.post("/profile/sync", requireTgUser, async (req, res) => {
  const u = getTgUser(req);

  const [profile] = await db
    .insert(telegramUsersTable)
    .values({
      telegramId: u.id,
      username:   u.username   ?? null,
      firstName:  u.first_name ?? "",
      lastName:   u.last_name  ?? null,
      photoUrl:   u.photo_url  ?? null,
      updatedAt:  new Date(),
    })
    .onConflictDoUpdate({
      target: telegramUsersTable.telegramId,
      set: {
        username:  u.username   ?? null,
        firstName: u.first_name ?? "",
        lastName:  u.last_name  ?? null,
        photoUrl:  u.photo_url  ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  // Count events reported by this user
  const [{ value: reportCount }] = await db
    .select({ value: count() })
    .from(dpsEventsTable)
    .where(eq(dpsEventsTable.chatId, u.id));

  // Count accepted friends
  const [{ value: friendCount }] = await db
    .select({ value: count() })
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.status, "accepted"),
        or(
          eq(friendshipsTable.userId,   u.id),
          eq(friendshipsTable.friendId, u.id),
        ),
      ),
    );

  return res.json({ ...profile, reportCount: Number(reportCount), friendCount: Number(friendCount) });
});

// ── POST /profile/location — update realtime location ────────────────────────
router.post("/profile/location", requireTgUser, async (req, res) => {
  const u = getTgUser(req);
  const { lat, lng } = req.body as { lat: number; lng: number };
  if (lat == null || lng == null) return res.status(400).json({ error: "lat/lng required" });

  await db
    .update(telegramUsersTable)
    .set({ lastLat: lat, lastLng: lng, lastLocAt: new Date() })
    .where(eq(telegramUsersTable.telegramId, u.id));

  return res.json({ ok: true });
});

// ── PATCH /profile/sharing — toggle location sharing ─────────────────────────
router.patch("/profile/sharing", requireTgUser, async (req, res) => {
  const u = getTgUser(req);
  const { share } = req.body as { share: boolean };

  await db
    .update(telegramUsersTable)
    .set({ shareLocation: Boolean(share) })
    .where(eq(telegramUsersTable.telegramId, u.id));

  return res.json({ ok: true, shareLocation: Boolean(share) });
});

// ── GET /friends — my accepted friends + incoming pending requests ────────────
router.get("/friends", requireTgUser, async (req, res) => {
  const u = getTgUser(req);

  // accepted friendships where I am either side
  const accepted = await db
    .select({ fs: friendshipsTable, them: telegramUsersTable })
    .from(friendshipsTable)
    .innerJoin(
      telegramUsersTable,
      or(
        and(eq(friendshipsTable.userId, u.id),   eq(telegramUsersTable.telegramId, friendshipsTable.friendId)),
        and(eq(friendshipsTable.friendId, u.id), eq(telegramUsersTable.telegramId, friendshipsTable.userId)),
      ),
    )
    .where(eq(friendshipsTable.status, "accepted"));

  // incoming pending (others sent to me)
  const pending = await db
    .select({ fs: friendshipsTable, them: telegramUsersTable })
    .from(friendshipsTable)
    .innerJoin(telegramUsersTable, eq(telegramUsersTable.telegramId, friendshipsTable.userId))
    .where(and(eq(friendshipsTable.friendId, u.id), eq(friendshipsTable.status, "pending")));

  return res.json({
    friends: accepted.map(r => ({ ...r.them, friendshipId: r.fs.id })),
    pending: pending.map(r => ({ ...r.them, friendshipId: r.fs.id })),
  });
});

// ── POST /friends/request — send friend request by Telegram username ──────────
router.post("/friends/request", requireTgUser, async (req, res) => {
  const u = getTgUser(req);
  const { username } = req.body as { username: string };
  if (!username?.trim()) return res.status(400).json({ error: "username required" });

  const clean = username.replace(/^@/, "").trim().toLowerCase();

  const [target] = await db
    .select()
    .from(telegramUsersTable)
    .where(sql`lower(${telegramUsersTable.username}) = ${clean}`)
    .limit(1);

  if (!target) {
    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "dps_radar_bot";
    return res.json({
      notFound: true,
      inviteLink: `https://t.me/${botUsername}?start=invite_${u.id}`,
    });
  }

  if (target.telegramId === u.id) {
    return res.status(400).json({ error: "Нельзя добавить себя в друзья" });
  }

  // Check if friendship already exists
  const [existing] = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(eq(friendshipsTable.userId, u.id),          eq(friendshipsTable.friendId, target.telegramId)),
        and(eq(friendshipsTable.userId, target.telegramId), eq(friendshipsTable.friendId, u.id)),
      ),
    )
    .limit(1);

  if (existing) {
    return res.json({ alreadyExists: true, status: existing.status });
  }

  const [friendship] = await db
    .insert(friendshipsTable)
    .values({ userId: u.id, friendId: target.telegramId, status: "pending" })
    .returning();

  // Notify target via bot
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "dps_radar_bot";
    const senderName = u.first_name ?? `@${u.username ?? "Пользователь"}`;
    if (token) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id:    target.telegramId,
          text:       `👥 <b>${senderName}</b> хочет добавить вас в друзья в ДПС Радар!\n\nОткройте приложение чтобы принять запрос.`,
          parse_mode: "HTML",
          reply_markup: JSON.stringify({
            inline_keyboard: [[
              { text: "📲 Открыть приложение", url: `https://t.me/${botUsername}/app` },
            ]],
          }),
        }),
      });
    }
  } catch (err) {
    logger.warn({ err }, "Failed to notify friend request");
  }

  return res.json({ ok: true, friendship });
});

// ── POST /friends/:id/accept — accept a pending request ──────────────────────
router.post("/friends/:id/accept", requireTgUser, async (req, res) => {
  const u = getTgUser(req);
  const id = parseInt(String(req.params.id));

  const [fs] = await db
    .select()
    .from(friendshipsTable)
    .where(and(eq(friendshipsTable.id, id), eq(friendshipsTable.friendId, u.id)))
    .limit(1);

  if (!fs) return res.status(404).json({ error: "Запрос не найден" });
  if (fs.status === "accepted") return res.json({ ok: true });

  await db
    .update(friendshipsTable)
    .set({ status: "accepted" })
    .where(eq(friendshipsTable.id, id));

  // Notify initiator
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "dps_radar_bot";
    const acceptorName = u.first_name ?? `@${u.username ?? "Пользователь"}`;
    if (token) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id:    fs.userId,
          text:       `✅ <b>${acceptorName}</b> принял(а) вашу заявку в друзья в ДПС Радар!`,
          parse_mode: "HTML",
          reply_markup: JSON.stringify({
            inline_keyboard: [[
              { text: "📲 Открыть приложение", url: `https://t.me/${botUsername}/app` },
            ]],
          }),
        }),
      });
    }
  } catch (err) {
    logger.warn({ err }, "Failed to notify friend accept");
  }

  return res.json({ ok: true });
});

// ── DELETE /friends/:id — decline or remove ───────────────────────────────────
router.delete("/friends/:id", requireTgUser, async (req, res) => {
  const u = getTgUser(req);
  const id = parseInt(String(req.params.id));

  await db
    .delete(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.id, id),
        or(eq(friendshipsTable.userId, u.id), eq(friendshipsTable.friendId, u.id)),
      ),
    );

  return res.json({ ok: true });
});

// ── GET /friends/locations — active friend positions (last 10 min) ─────────────
router.get("/friends/locations", requireTgUser, async (req, res) => {
  const u = getTgUser(req);

  // Get friend IDs
  const friendships = await db
    .select()
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.status, "accepted"),
        or(eq(friendshipsTable.userId, u.id), eq(friendshipsTable.friendId, u.id)),
      ),
    );

  const friendIds = friendships.map(f => (f.userId === u.id ? f.friendId : f.userId));

  if (!friendIds.length) return res.json([]);

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

  const locations = await db
    .select({
      telegramId: telegramUsersTable.telegramId,
      username:   telegramUsersTable.username,
      firstName:  telegramUsersTable.firstName,
      lastName:   telegramUsersTable.lastName,
      photoUrl:   telegramUsersTable.photoUrl,
      lastLat:    telegramUsersTable.lastLat,
      lastLng:    telegramUsersTable.lastLng,
      lastLocAt:  telegramUsersTable.lastLocAt,
    })
    .from(telegramUsersTable)
    .where(
      and(
        sql`${telegramUsersTable.telegramId} = ANY(ARRAY[${sql.join(friendIds.map(id => sql`${id}`), sql`, `)}]::bigint[])`,
        eq(telegramUsersTable.shareLocation, true),
        sql`${telegramUsersTable.lastLocAt} > ${tenMinAgo.toISOString()}`,
        sql`${telegramUsersTable.lastLat} IS NOT NULL`,
      ),
    );

  return res.json(locations);
});

export default router;
