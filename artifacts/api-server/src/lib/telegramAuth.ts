import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export interface TelegramUser {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  photo_url?: string;
  language_code?: string;
}

/**
 * Verifies Telegram Mini App initData HMAC-SHA256 signature.
 * Returns the parsed user object if valid, null otherwise.
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    params.delete("hash");
    const sortedEntries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = sortedEntries.map(([k, v]) => `${k}=${v}`).join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (expectedHash !== hash) return null;

    // Check auth_date is not too old (allow up to 24 hours)
    const authDate = parseInt(params.get("auth_date") ?? "0", 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDate > 86400) return null;

    const userStr = params.get("user");
    if (!userStr) return null;
    return JSON.parse(userStr) as TelegramUser;
  } catch {
    return null;
  }
}

/**
 * Express middleware that extracts and verifies Telegram initData from
 * the Authorization header (Bearer <initData>) or X-Telegram-Init-Data header.
 * On success, sets req.telegramUser; on failure returns 401.
 */
export function requireTelegramAuth(req: Request, res: Response, next: NextFunction): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // In development without a bot token, allow unauthenticated access for testing
  if (!botToken) {
    (req as any).telegramUser = null;
    next();
    return;
  }

  const initData =
    req.headers["x-telegram-init-data"] as string | undefined ??
    (req.headers.authorization?.startsWith("tma ") ? req.headers.authorization.slice(4) : undefined);

  if (!initData) {
    res.status(401).json({ error: "Missing Telegram initData" });
    return;
  }

  const user = verifyTelegramInitData(initData, botToken);
  if (!user) {
    res.status(401).json({ error: "Invalid Telegram initData" });
    return;
  }

  (req as any).telegramUser = user;
  next();
}
