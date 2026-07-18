import { Router, type IRouter } from "express";
import { db, dpsEventsTable, chatSettingsTable, permanentCamerasTable } from "@workspace/db";
import { gt, sql, eq, and, desc, between } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getWebhookSecret } from "../lib/dpsWebhookSetup";

const router: IRouter = Router();

// City config — add more cities here as needed
const CITIES: Record<string, { name: string; lat: number; lng: number; viewbox: string }> = {
  blagoveshchensk: {
    name: "Благовещенск",
    lat: 50.2906,
    lng: 127.5272,
    viewbox: "127.3,50.15,127.75,50.45",
  },
  khabarovsk: {
    name: "Хабаровск",
    lat: 48.4827,
    lng: 135.0839,
    viewbox: "134.7,48.3,135.4,48.7",
  },
};
const DEFAULT_CITY = "blagoveshchensk";

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

async function geocodeAddress(
  hint: string,
  citySlug: string,
): Promise<{ lat: number; lng: number; display: string } | null> {
  if (!hint) return null;
  const city = CITIES[citySlug] ?? CITIES[DEFAULT_CITY];
  const query = `${city.name} ${hint}`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ru");
  if (city.viewbox) {
    url.searchParams.set("viewbox", city.viewbox);
    url.searchParams.set("bounded", "1");
  }

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

async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
  } catch (err) {
    logger.warn({ err }, "Failed to answer callback query");
  }
}

function getMiniAppUrl(citySlug?: string): string {
  const domain =
    process.env.PUBLIC_BASE_URL ??
    (process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "https://example.com");
  const base = `${domain}/dps-radar/`;
  return citySlug ? `${base}?city=${encodeURIComponent(citySlug)}` : base;
}

function makeMiniAppButton(citySlug?: string) {
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: "🗺 Открыть карту ДПС Радар", web_app: { url: getMiniAppUrl(citySlug) } }],
      ],
    }),
  };
}

function makeCitySelectionKeyboard() {
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          { text: "🏙 Благовещенск", callback_data: "set_city:blagoveshchensk" },
          { text: "🏙 Хабаровск", callback_data: "set_city:khabarovsk" },
        ],
        [
          { text: "📍 Другой город", callback_data: "set_city:blagoveshchensk" },
        ],
      ],
    }),
  };
}

async function getChatCity(chatId: number): Promise<string> {
  const rows = await db
    .select()
    .from(chatSettingsTable)
    .where(eq(chatSettingsTable.chatId, chatId))
    .limit(1);
  return rows[0]?.city ?? DEFAULT_CITY;
}

async function saveChatCity(chatId: number, citySlug: string): Promise<void> {
  await db
    .insert(chatSettingsTable)
    .values({ chatId, city: citySlug, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: chatSettingsTable.chatId,
      set: { city: citySlug, updatedAt: new Date() },
    });
}

// GET /api/dps-radar/events
router.get("/dps-radar/events", async (req, res): Promise<void> => {
  try {
    const citySlug = (req.query.city as string) || DEFAULT_CITY;
    const cutoff = new Date(Date.now() - EVENT_TTL_MS);

    const events = await db
      .select()
      .from(dpsEventsTable)
      .where(
        and(
          gt(dpsEventsTable.lastSeenAt, cutoff),
          eq(dpsEventsTable.city, citySlug),
        ),
      )
      .orderBy(sql`${dpsEventsTable.lastSeenAt} DESC`);

    const now = Date.now();
    const result = events.map((e) => ({
      id: e.id,
      type: e.type,
      lat: e.lat,
      lng: e.lng,
      address: e.address,
      city: e.city,
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
router.get("/dps-radar/stats", async (req, res): Promise<void> => {
  try {
    const citySlug = (req.query.city as string) || DEFAULT_CITY;
    const cutoff = new Date(Date.now() - EVENT_TTL_MS);
    const rows = await db
      .select({ type: dpsEventsTable.type, cnt: sql<number>`count(*)::int` })
      .from(dpsEventsTable)
      .where(
        and(
          gt(dpsEventsTable.lastSeenAt, cutoff),
          eq(dpsEventsTable.city, citySlug),
        ),
      )
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
    // ── Handle callback_query (city selection buttons) ──────────────────────
    const callbackQuery = update.callback_query as Record<string, unknown> | undefined;
    if (callbackQuery) {
      const callbackData = (callbackQuery.data as string) ?? "";
      const callbackMsg = callbackQuery.message as Record<string, unknown> | undefined;
      const callbackChatId = (callbackMsg?.chat as Record<string, unknown>)?.id as number;

      if (callbackData.startsWith("set_city:") && callbackChatId) {
        const citySlug = callbackData.replace("set_city:", "");
        const validSlug = CITIES[citySlug] ? citySlug : DEFAULT_CITY;
        await saveChatCity(callbackChatId, validSlug);
        await answerCallbackQuery(callbackQuery.id as string);
        const cityName = CITIES[validSlug]?.name ?? validSlug;
        await sendTelegramMessage(
          callbackChatId,
          `✅ Город установлен: <b>${cityName}</b>\n\nТеперь пишите в чат о постах ДПС и авариях — они появятся на карте. Откройте карту:`,
          makeMiniAppButton(validSlug),
        );
      }

      // ── Подтверждение добавления камеры ─────────────────────────────────
      if (callbackData.startsWith("add_cam:") && callbackChatId) {
        const parts = callbackData.split(":");
        // format: add_cam:yes/no:lat:lng:city:author
        const confirm = parts[1];
        await answerCallbackQuery(callbackQuery.id as string);
        if (confirm === "yes") {
          const lat  = parseFloat(parts[2]);
          const lng  = parseFloat(parts[3]);
          const city = parts[4] ?? DEFAULT_CITY;
          const addedBy = decodeURIComponent(parts[5] ?? "unknown");
          await db.insert(permanentCamerasTable).values({ lat, lng, city, addedBy });
          await sendTelegramMessage(
            callbackChatId,
            `📷 <b>Камера добавлена на карту!</b>\n📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          );
        } else {
          await sendTelegramMessage(callbackChatId, "Отменено.");
        }
      }

      return;
    }

    // ── Handle regular messages ─────────────────────────────────────────────
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
            "👮 <b>ДПС Радар активирован!</b>\n\nВыберите город для этого чата:",
            makeCitySelectionKeyboard(),
          );
          return;
        }
      }
    }

    // /start command
    if (text.startsWith("/start")) {
      const existingCity = await getChatCity(chatId);
      await sendTelegramMessage(
        chatId,
        "👮 <b>ДПС Радар</b> — карта постов ДПС и аварий\n\nДобавьте меня в групповой чат и сообщайте о постах ДПС и авариях — метки появятся на карте автоматически.",
        makeMiniAppButton(existingCity),
      );
      return;
    }

    // /city command — change city
    if (text.startsWith("/city")) {
      await sendTelegramMessage(
        chatId,
        "🏙 Выберите город для этого чата:",
        makeCitySelectionKeyboard(),
      );
      return;
    }

    // /камеры — список постоянных камер
    if (text.startsWith("/камеры") || text.startsWith("/cameras")) {
      const chatCity = await getChatCity(chatId);
      const cams = await db
        .select()
        .from(permanentCamerasTable)
        .where(eq(permanentCamerasTable.city, chatCity))
        .orderBy(desc(permanentCamerasTable.createdAt))
        .limit(20);
      if (!cams.length) {
        await sendTelegramMessage(chatId, "📷 Камер пока нет. Пришлите геолокацию камеры, чтобы добавить.");
      } else {
        const lines = cams.map((c, i) =>
          `${i + 1}. 📍 ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} — ${c.description} (добавил ${c.addedBy})`
        ).join("\n");
        await sendTelegramMessage(chatId, `📷 <b>Камеры на карте (${cams.length}):</b>\n\n${lines}`);
      }
      return;
    }

    // ── Геолокация — предлагаем добавить камеру ──────────────────────────────
    const location = message.location as { latitude: number; longitude: number } | undefined;
    if (location) {
      const chatCity = await getChatCity(chatId);
      const encodedAuthor = encodeURIComponent(author);
      await sendTelegramMessage(
        chatId,
        `📷 Добавить камеру фиксации скорости в точке <b>${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}</b>?`,
        {
          reply_markup: JSON.stringify({
            inline_keyboard: [[
              { text: "✅ Да, добавить камеру", callback_data: `add_cam:yes:${location.latitude}:${location.longitude}:${chatCity}:${encodedAuthor}` },
              { text: "❌ Нет", callback_data: `add_cam:no:0:0:${chatCity}:${encodedAuthor}` },
            ]],
          }),
        },
      );
      return;
    }

    // Ignore commands and empty messages
    if (!text || text.startsWith("/")) return;

    // Detect event type
    const eventType = detectEventType(text);
    if (!eventType) return;

    // Get this chat's city
    const chatCity = await getChatCity(chatId);
    const cityConfig = CITIES[chatCity] ?? CITIES[DEFAULT_CITY];

    // Extract address hint
    const addressHint = extractAddressHint(text);

    // Geocode
    let lat = cityConfig.lat + (Math.random() - 0.5) * 0.02;
    let lng = cityConfig.lng + (Math.random() - 0.5) * 0.02;
    let displayAddress = addressHint || cityConfig.name;

    if (addressHint) {
      const geo = await geocodeAddress(addressHint, chatCity);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        displayAddress = addressHint; // Use user's text, not full Nominatim display
      }
    }

    // Check for nearby existing event to merge/update (within same city)
    const cutoff = new Date(Date.now() - EVENT_TTL_MS);
    const nearbyEvents = await db
      .select()
      .from(dpsEventsTable)
      .where(
        and(
          gt(dpsEventsTable.lastSeenAt, cutoff),
          eq(dpsEventsTable.type, eventType),
          eq(dpsEventsTable.city, chatCity),
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
        city: chatCity,
        chatId,
        author,
        lastSeenAt: new Date(),
      });
      logger.info({ eventType, displayAddress, city: chatCity }, "DPS event created");
    }

    // Reply with a map button
    const typeLabel = eventType === "dps_post" ? "🚔 Пост ДПС" : "🚗💥 Авария";
    const replyText = `${typeLabel} добавлен на карту: <b>${displayAddress}</b>\nМетка активна 2 часа.`;
    await sendTelegramMessage(chatId, replyText, makeMiniAppButton(chatCity));
  } catch (err) {
    logger.error({ err }, "Error processing Telegram webhook update");
  }
});

// ── Камеры: bbox по городу ────────────────────────────────────────────────────
const CITY_BBOX: Record<string, { top: number; bottom: number; left: number; right: number }> = {
  blagoveshchensk: { bottom: 50.15, top: 50.45, left: 127.30, right: 127.75 },
  khabarovsk:      { bottom: 48.35, top: 48.65, left: 134.85, right: 135.30 },
};
const DEFAULT_BBOX = CITY_BBOX.blagoveshchensk;

function osmQuery(b: typeof DEFAULT_BBOX) {
  const box = `${b.bottom},${b.left},${b.top},${b.right}`;
  return `[out:json][timeout:25];(` +
    `node["highway"="speed_camera"](${box});` +
    `node["enforcement"="maxspeed"](${box});` +
    `node["man_made"="surveillance"]["surveillance:type"="camera"]["surveillance:zone"="traffic"](${box});` +
    `node["traffic_sign"~"maxspeed"]["camera"="yes"](${box});` +
    `);out body;`;
}

const CAMERA_TTL = 6 * 60 * 60 * 1000; // 6ч — Waze меняется чаще
let osmCache:   { ts: number; city: string; data: unknown } | null = null;
let wazeCache:  { ts: number; city: string; data: unknown } | null = null;

interface CameraElement { id: number | string; lat: number; lon: number; tags?: Record<string, string>; _source?: string }

// Получаем Waze live-данные (POLICE/CAMERA alerts)
async function fetchWazeCameras(b: typeof DEFAULT_BBOX, city: string): Promise<CameraElement[]> {
  if (wazeCache && wazeCache.city === city && Date.now() - wazeCache.ts < CAMERA_TTL) {
    return (wazeCache.data as CameraElement[]);
  }
  const url = `https://www.waze.com/live-map/api/georss` +
    `?top=${b.top}&bottom=${b.bottom}&left=${b.left}&right=${b.right}&env=row&types=alerts`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
      "Referer": "https://www.waze.com/",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Waze ${resp.status}`);
  const json = await resp.json() as { alerts?: Array<{ type: string; subtype?: string; location: { y: number; x: number }; uuid: string; reportDescription?: string }> };
  const cameras: CameraElement[] = (json.alerts ?? [])
    .filter(a => a.type === "POLICE" || a.type === "HAZARD" && a.subtype === "HAZARD_ON_ROAD_CAR_STOPPED")
    .map(a => ({
      id: `waze-${a.uuid}`,
      lat: a.location.y,
      lon: a.location.x,
      _source: "waze",
      tags: { name: a.reportDescription ?? "Камера/пост (Waze)", "maxspeed": "60" },
    }));
  wazeCache = { ts: Date.now(), city, data: cameras };
  return cameras;
}

router.get("/dps-radar/osm-cameras", async (req, res) => {
  const city = typeof req.query.city === "string" && CITY_BBOX[req.query.city]
    ? req.query.city : "blagoveshchensk";
  const bbox = CITY_BBOX[city];

  // 1. Постоянные камеры из нашей БД
  const dbCams = await db.select().from(permanentCamerasTable)
    .where(eq(permanentCamerasTable.city, city))
    .orderBy(desc(permanentCamerasTable.createdAt));
  const dbElements: CameraElement[] = dbCams.map(c => ({
    id: c.id,
    lat: c.lat,
    lon: c.lng,
    _source: "db",
    tags: { name: c.description, maxspeed: "60" },
  }));

  // 2. OSM камеры (кэш 6ч)
  let osmElements: CameraElement[] = [];
  try {
    if (osmCache && osmCache.city === city && Date.now() - osmCache.ts < CAMERA_TTL) {
      osmElements = osmCache.data as CameraElement[];
    } else {
      const resp = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(osmQuery(bbox))}`,
        signal: AbortSignal.timeout(25_000),
      });
      if (resp.ok) {
        const json = await resp.json() as { elements: CameraElement[] };
        osmCache = { ts: Date.now(), city, data: json.elements ?? [] };
        osmElements = json.elements ?? [];
      }
    }
  } catch (err) {
    logger.warn({ err }, "OSM cameras fetch failed");
  }

  // 3. Waze live камеры
  let wazeElements: CameraElement[] = [];
  try {
    wazeElements = await fetchWazeCameras(bbox, city);
  } catch (err) {
    logger.warn({ err }, "Waze cameras fetch failed");
  }

  return res.json({ elements: [...dbElements, ...osmElements, ...wazeElements] });
});

// ── Метки нарушений ───────────────────────────────────────────────────────────
const VIOLATION_TITLE: Record<string, string> = {
  speed:      "Камера скорости",
  seatbelt:   "Ремень безопасности",
  stop_line:  "Стоп-линия",
  red_light:  "Проезд на красный",
  pedestrian: "Пешеходный переход",
  parking:    "Остановка/стоянка",
};

// ── Извлекаем читаемый адрес из сырого текста docx ───────────────────────────
function extractAddress(desc: string): string {
  // 1) После названия города: "г. Благовещенск, …"
  let m = desc.match(/г\.\s*[А-ЯЁ][а-яё]+[,\s]+(.+)/);
  if (m) return cleanAddr(m[1]);

  // 2) Первое вхождение улицы / шоссе / переулка
  m = desc.match(/((?:ул|пр|пер|ш|пл|просп|бул|наб)\.\s*.+)/i);
  if (m) return cleanAddr(m[1]);

  // 3) «Игнатьевское ш.» / «Новотроицкое ш.» — без «ул.»
  m = desc.match(/((?:Игнатьевское|Новотроицкое|Кольцевая|Тепличн).+)/);
  if (m) return cleanAddr(m[1]);

  return "";
}

function cleanAddr(s: string): string {
  return s
    // Пробел перед маленькой буквой → большой (напр. «шосИгн»)
    .replace(/([а-яё])([А-ЯЁ])/g, "$1 $2")
    // Пробел перед сокращениями улиц когда нет пробела (напр. «наул.» → «на ул.»)
    .replace(/([а-яё])(ул\.|пер\.|ш\.|пл\.|наб\.|бул\.|просп\.|пр\.)/g, "$1 $2")
    // Пробел перед типичными словами-продолжениями (напр. «стороныул» → «стороны ул»)
    .replace(/([а-яё])(въезд|выезд|пересечени|проезжих|сторон|перекрест)/g, "$1 $2")
    // Убираем лишние пробелы и хвостовые запятые
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/, "")
    .trim()
    .slice(0, 70);
}

// ── Собираем читаемое название камеры ────────────────────────────────────────
function buildDisplayName(desc: string, violations: string[]): string {
  // Уже чистое имя (OSM или пользовательское) — возвращаем как есть
  if (/^Камера фиксации скорости/.test(desc)) return "Камера скорости";

  const title = VIOLATION_TITLE[violations[0] ?? "speed"] ?? "Камера";
  const addr  = extractAddress(desc);
  return addr ? `${title} · ${addr}` : title;
}

// ── Парсим нарушения из description ──────────────────────────────────────────
function parseViolations(desc: string): string[] {
  const d = desc.toLowerCase();
  const v: string[] = [];
  if (/скорост|превышен/.test(d))                         v.push("speed");
  if (/ремн|безопасност/.test(d))                         v.push("seatbelt");
  if (/стоп-лини|знак 6\.16/.test(d))                     v.push("stop_line");
  if (/запрещающий сигнал светофора|проезд на запрещ/.test(d)) v.push("red_light");
  if (/пешеход/.test(d))                                  v.push("pedestrian");
  if (/остановки|стоянки/.test(d))                        v.push("parking");
  // если ничего не распознали — считаем камерой скорости
  return v.length ? v : ["speed"];
}

// ── Камеры по видимой области карты (без привязки к городу) ──────────────────
router.get("/dps-radar/cameras-in-bounds", async (req, res) => {
  const minLat = parseFloat(req.query.minLat as string);
  const maxLat = parseFloat(req.query.maxLat as string);
  const minLng = parseFloat(req.query.minLng as string);
  const maxLng = parseFloat(req.query.maxLng as string);

  if ([minLat, maxLat, minLng, maxLng].some(isNaN)) {
    return res.status(400).json({ error: "minLat/maxLat/minLng/maxLng required" });
  }

  const cams = await db
    .select()
    .from(permanentCamerasTable)
    .where(
      and(
        between(permanentCamerasTable.lat, minLat, maxLat),
        between(permanentCamerasTable.lng, minLng, maxLng),
      ),
    )
    .limit(500);

  return res.json({
    elements: cams.map(c => {
      const desc       = c.description ?? "";
      const violations = parseViolations(desc);
      return {
        id:         c.id,
        lat:        c.lat,
        lon:        c.lng,
        _source:    "db",
        violations,
        tags:       { name: buildDisplayName(desc, violations), maxspeed: "60" },
      };
    }),
  });
});

// ── Добавить камеру с карты (POST) ────────────────────────────────────────────
router.post("/dps-radar/cameras", async (req, res) => {
  try {
    const { lat, lng, description, city } = req.body as {
      lat: number; lng: number; description?: string; city?: string;
    };
    if (!lat || !lng) return res.status(400).json({ error: "lat/lng required" });
    const [row] = await db.insert(permanentCamerasTable).values({
      lat,
      lng,
      description: description?.slice(0, 100) || "Камера фиксации скорости",
      city: city || "blagoveshchensk",
      addedBy: "map",
    }).returning();
    return res.json(row);
  } catch (err) {
    logger.error({ err }, "Failed to add camera");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── Удалить камеру из БД ──────────────────────────────────────────────────────
router.delete("/dps-radar/cameras/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(permanentCamerasTable).where(eq(permanentCamerasTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete camera");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
