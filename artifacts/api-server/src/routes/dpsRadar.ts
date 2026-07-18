import { Router, type IRouter } from "express";
import { db, dpsEventsTable } from "@workspace/db";
import { gt, sql, eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getWebhookSecret } from "../lib/dpsWebhookSetup";

const router: IRouter = Router();

// Blagoveshchensk center for geocoding bias
const BLAGOVESHCHENSK_LAT = 50.2906;
const BLAGOVESHCHENSK_LNG = 127.5272;

// Events expire after 2 hours (in ms)
const EVENT_TTL_MS = 2 * 60 * 60 * 1000;

// Merge radius in degrees (~150-200m)
const MERGE_RADIUS_DEG = 0.0018;

// Keywords for event detection
const DPS_KEYWORDS = [
  "дпс", "гаи", "пост", "стоят", "патрулируют", "патруль", "засада",
  "экипаж", "радар", "засекли", "останавливают", "тормозят",
];
const ACCIDENT_KEYWORDS = [
  "авария", "дтп", "столкновение", "авар", "разбились", "въехал",
  "улетел", "перевернулся", "сбил",
];
const CAMERA_KEYWORDS = [
  "камера", "фоторадар", "фото радар", "видеофиксация", "видео фиксация",
  "треног", "треноги", "автофиксация", "скоростна", "камер",
];

function detectEventType(text: string): "dps_post" | "accident" | "camera" | null {
  const lower = text.toLowerCase();
  if (ACCIDENT_KEYWORDS.some((kw) => lower.includes(kw))) return "accident";
  if (CAMERA_KEYWORDS.some((kw) => lower.includes(kw))) return "camera";
  if (DPS_KEYWORDS.some((kw) => lower.includes(kw))) return "dps_post";
  return null;
}

// Extract street/intersection hint from message text
function extractAddressHint(text: string): string {
  // Look for patterns like "ул. Ленина", "Калинина/Горького", "пр. Победы 100"
  const streetPatterns = [
    /(?:ул\.|улица|пр\.|проспект|пер\.|переулок|бульвар|б-р|ш\.|шоссе|пл\.|площадь)\s+[\w.-]+(?:\s+\d+)?/gi,
    /(?:ул\.|улица|пр\.|проспект|пер\.|переулок|бульвар|б-р|ш\.|шоссе|пл\.|площадь)[\w.-]+(?:\s+\d+)?/gi,
    /[А-ЯЁа-яёA-Za-z]+(?:\/[А-ЯЁа-яёA-Za-z]+)+/g,
    /[А-ЯЁ][а-яё]+\s+(?:и|\/)\s+[А-ЯЁ][а-яё]+/g,
  ];
  for (const pat of streetPatterns) {
    const match = text.match(pat);
    if (match?.[0]) return match[0];
  }
  // Fall back to any capitalized word sequence that looks like a place
  const capWords = text.match(/[А-ЯЁ][а-яё]{3,}(?:\s+[а-яё]+){0,2}/g);
  return capWords?.[0] ?? "";
}

async function geocodeAddress(hint: string): Promise<{ lat: number; lng: number; display: string } | null> {
  if (!hint) return null;
  const query = `Благовещенск ${hint}`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ru");
  url.searchParams.set("viewbox", "127.3,50.15,127.75,50.45");
  url.searchParams.set("bounded", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "DPS-Radar-Bot/1.0" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display: data[0].display_name,
    };
  } catch {
    return null;
  }
}

async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", ...extra }),
    });
  } catch (err) {
    logger.warn({ err }, "Failed to send Telegram message");
  }
}

function getMiniAppUrl(): string {
  const domain =
    process.env.PUBLIC_BASE_URL ??
    (process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "https://example.com");
  return `${domain}/dps-radar/`;
}

function makeMiniAppButton() {
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: "🗺 Открыть карту ДПС Радар", web_app: { url: getMiniAppUrl() } }],
      ],
    }),
  };
}

// GET /api/dps-radar/events
router.get("/dps-radar/events", async (_req, res): Promise<void> => {
  try {
    const cutoff = new Date(Date.now() - EVENT_TTL_MS);
    const events = await db
      .select()
      .from(dpsEventsTable)
      .where(gt(dpsEventsTable.lastSeenAt, cutoff))
      .orderBy(sql`${dpsEventsTable.lastSeenAt} DESC`);

    const now = Date.now();
    const result = events.map((e) => ({
      id: e.id,
      type: e.type,
      lat: e.lat,
      lng: e.lng,
      address: e.address,
      author: e.author,
      lastSeenAt: e.lastSeenAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      minutesAgo: Math.floor((now - e.lastSeenAt.getTime()) / 60000),
    }));

    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to list DPS events");
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /api/dps-radar/stats
router.get("/dps-radar/stats", async (_req, res): Promise<void> => {
  try {
    const cutoff = new Date(Date.now() - EVENT_TTL_MS);
    const rows = await db
      .select({ type: dpsEventsTable.type, cnt: sql<number>`count(*)::int` })
      .from(dpsEventsTable)
      .where(gt(dpsEventsTable.lastSeenAt, cutoff))
      .groupBy(dpsEventsTable.type);

    let dpsPostCount = 0;
    let accidentCount = 0;
    let cameraCount = 0;
    for (const r of rows) {
      if (r.type === "dps_post") dpsPostCount = r.cnt;
      if (r.type === "accident") accidentCount = r.cnt;
      if (r.type === "camera") cameraCount = r.cnt;
    }

    res.json({ dpsPostCount, accidentCount, cameraCount, totalActive: dpsPostCount + accidentCount + cameraCount });
  } catch (err) {
    logger.error({ err }, "Failed to get DPS stats");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/dps-radar/telegram-webhook
router.post("/dps-radar/telegram-webhook", async (req, res): Promise<void> => {
  // Проверяем подлинность запроса через секретный токен Telegram
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    const expected = getWebhookSecret(botToken);
    const received = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
    if (received !== expected) {
      logger.warn({ received }, "Webhook: invalid secret token — ignoring request");
      res.status(403).json({ ok: false });
      return;
    }
  }

  res.status(200).json({ ok: true }); // Сразу отвечаем Telegram (до обработки)

  const update = req.body as Record<string, unknown>;

  try {
    // Handle /start and new_chat_members (bot added to group)
    const message = update.message as Record<string, unknown> | undefined;
    if (!message) return;

    const chatId = (message.chat as Record<string, unknown>)?.id as number;
    const text = (message.text as string) ?? "";
    const from = message.from as Record<string, unknown> | undefined;
    const rawAuthor =
      from?.username ? `@${from.username}` : (from?.first_name as string) ?? "Неизвестный";
    // Оставляем только безопасные символы; убираем HTML-спецсимволы и ограничиваем длину
    const author = rawAuthor.replace(/[<>"'&]/g, "").slice(0, 64);

    // Bot added to a group
    const newMembers = message.new_chat_members as Array<Record<string, unknown>> | undefined;
    if (newMembers?.length) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        // Check if our bot is among new members
        const botRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const botData = (await botRes.json()) as { result?: { id: number } };
        const botId = botData.result?.id;
        const isBotAdded = newMembers.some((m) => m.id === botId);
        if (isBotAdded) {
          await sendTelegramMessage(
            chatId,
            "👮 <b>ДПС Радар активирован!</b>\n\nПишите в чат о постах ДПС и авариях — я буду добавлять их на карту. Пример:\n• «ДПС на Ленина/Горького»\n• «Авария на пр. Победы 50»\n\nОткройте карту, чтобы видеть все активные метки:",
            makeMiniAppButton(),
          );
          return;
        }
      }
    }

    // /start command
    if (text.startsWith("/start")) {
      await sendTelegramMessage(
        chatId,
        "👮 <b>ДПС Радар</b> — карта постов ДПС и аварий Благовещенска\n\nДобавьте меня в групповой чат и сообщайте о постах ДПС и авариях — метки появятся на карте автоматически.\n\nОткройте мини-приложение с картой:",
        makeMiniAppButton(),
      );
      return;
    }

    // Ignore commands and empty messages
    if (!text || text.startsWith("/")) return;

    // Detect event type
    const eventType = detectEventType(text);
    if (!eventType) return;

    // Extract address hint
    const addressHint = extractAddressHint(text);

    // Geocode
    let lat = BLAGOVESHCHENSK_LAT + (Math.random() - 0.5) * 0.02;
    let lng = BLAGOVESHCHENSK_LNG + (Math.random() - 0.5) * 0.02;
    let displayAddress = addressHint || "Благовещенск";

    if (addressHint) {
      const geo = await geocodeAddress(addressHint);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        displayAddress = addressHint; // Use user's text, not full Nominatim display
      }
    }

    // Check for nearby existing event to merge/update
    const cutoff = new Date(Date.now() - EVENT_TTL_MS);
    const nearbyEvents = await db
      .select()
      .from(dpsEventsTable)
      .where(
        and(
          gt(dpsEventsTable.lastSeenAt, cutoff),
          eq(dpsEventsTable.type, eventType),
        ),
      );

    const nearby = nearbyEvents.find(
      (e) =>
        Math.abs(e.lat - lat) < MERGE_RADIUS_DEG &&
        Math.abs(e.lng - lng) < MERGE_RADIUS_DEG,
    );

    if (nearby) {
      // Update last_seen_at to extend TTL
      await db
        .update(dpsEventsTable)
        .set({ lastSeenAt: new Date() })
        .where(eq(dpsEventsTable.id, nearby.id));
      logger.info({ id: nearby.id }, "DPS event refreshed");
    } else {
      // Create new event
      await db.insert(dpsEventsTable).values({
        type: eventType,
        lat,
        lng,
        address: displayAddress,
        chatId,
        author,
        lastSeenAt: new Date(),
      });
      logger.info({ eventType, displayAddress }, "DPS event created");
    }

    // Reply with a map button
    const typeLabel = eventType === "dps_post" ? "🚔 Пост ДПС" : "🚗💥 Авария";
    const replyText = `${typeLabel} добавлен на карту: <b>${displayAddress}</b>\nМетка активна 2 часа.`;
    await sendTelegramMessage(chatId, replyText, makeMiniAppButton());
  } catch (err) {
    logger.error({ err }, "Error processing Telegram webhook update");
  }
});

export default router;
