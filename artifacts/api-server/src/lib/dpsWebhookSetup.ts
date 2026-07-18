import crypto from "node:crypto";
import { logger } from "./logger";

/**
 * Возвращает секретный токен для верификации Telegram webhook-запросов.
 * Используется как secret_token при регистрации webhook и проверяется
 * в заголовке X-Telegram-Bot-Api-Secret-Token каждого входящего запроса.
 *
 * Генерируется детерминированно из токена бота — никаких доп. переменных.
 */
export function getWebhookSecret(botToken: string): string {
  return crypto.createHmac("sha256", "dps-radar-webhook-secret").update(botToken).digest("hex").slice(0, 64);
}

export async function setupTelegramWebhook(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — skipping webhook setup");
    return;
  }

  const baseUrl =
    process.env.PUBLIC_BASE_URL ??
    (process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : null);

  if (!baseUrl) {
    logger.warn("No public URL available — skipping Telegram webhook setup");
    return;
  }

  const webhookUrl = `${baseUrl}/api/dps-radar/telegram-webhook`;
  const secretToken = getWebhookSecret(token);

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secretToken,
          allowed_updates: ["message"],
          drop_pending_updates: false,
        }),
      },
    );
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (data.ok) {
      logger.info({ webhookUrl }, "Telegram webhook set successfully");
    } else {
      logger.warn({ description: data.description }, "Failed to set Telegram webhook");
    }

    // Устанавливаем кнопку меню бота
    const miniAppUrl = `${baseUrl}/dps-radar/`;
    await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "🗺 ДПС Радар",
          web_app: { url: miniAppUrl },
        },
      }),
    });
    logger.info("Bot menu button configured");
  } catch (err) {
    logger.warn({ err }, "Error setting up Telegram webhook");
  }
}
