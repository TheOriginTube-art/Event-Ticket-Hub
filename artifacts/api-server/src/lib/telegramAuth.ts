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

/** Reasons verifyTelegramInitData can return null */
export type VerifyFailReason = "missing_hash" | "hmac_mismatch" | "expired" | "missing_user" | "parse_error";

export interface VerifyResult {
  ok: true;
  user: TelegramUser;
  authDate: number;
}

export interface VerifyFailure {
  ok: false;
  reason: VerifyFailReason;
}

/**
 * Verifies Telegram Mini App initData HMAC-SHA256 signature.
 *
 * TTL is controlled by the TELEGRAM_INIT_DATA_MAX_AGE_SECS env-var
 * (default 86400 = 24 h). Set to 0 to disable the expiry check
 * (not recommended for production).
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
): VerifyResult | VerifyFailure {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { ok: false, reason: "missing_hash" };

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

    if (expectedHash !== hash) return { ok: false, reason: "hmac_mismatch" };

    // Check auth_date freshness
    const maxAgeSecs = process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECS != null
      ? parseInt(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECS, 10)
      : 86400; // default 24 h

    const authDate = parseInt(params.get("auth_date") ?? "0", 10);
    const nowSec = Math.floor(Date.now() / 1000);

    if (maxAgeSecs > 0 && nowSec - authDate > maxAgeSecs) {
      return { ok: false, reason: "expired" };
    }

    const userStr = params.get("user");
    if (!userStr) return { ok: false, reason: "missing_user" };

    return {
      ok: true,
      user: JSON.parse(userStr) as TelegramUser,
      authDate,
    };
  } catch {
    return { ok: false, reason: "parse_error" };
  }
}

/**
 * Express middleware that extracts and verifies Telegram initData from:
 *   - X-Telegram-Init-Data header
 *   - X-Init-Data header
 *   - Authorization: tma <initData> header
 *   - req.body.initData (when body-parser is active)
 *
 * On success, sets req.telegramUser.
 * On failure, returns 401 with a machine-readable `code` field.
 * In dev (no TELEGRAM_BOT_TOKEN), sets req.telegramUser = null and passes through.
 */
export function requireTelegramAuth(req: Request, res: Response, next: NextFunction): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    // Dev-mode: accept explicit override header for curl testing
    const devId = req.headers["x-dev-telegram-id"];
    if (devId) {
      (req as any).telegramUser = { id: Number(devId), first_name: "Dev", last_name: undefined };
    } else {
      (req as any).telegramUser = null;
    }
    next();
    return;
  }

  const initData =
    (req.headers["x-telegram-init-data"] as string | undefined) ??
    (req.headers["x-init-data"] as string | undefined) ??
    (req.headers.authorization?.startsWith("tma ") ? req.headers.authorization.slice(4) : undefined) ??
    (req.body as Record<string, string> | undefined)?.initData;

  if (!initData) {
    res.status(401).json({ error: "Missing Telegram initData", code: "missing_init_data" });
    return;
  }

  const result = verifyTelegramInitData(initData, botToken);

  if (!result.ok) {
    const statusMap: Record<VerifyFailReason, number> = {
      missing_hash: 401,
      hmac_mismatch: 401,
      expired: 401,
      missing_user: 401,
      parse_error: 400,
    };
    res.status(statusMap[result.reason]).json({
      error: reasonMessage(result.reason),
      code: result.reason,
    });
    return;
  }

  (req as any).telegramUser = result.user;
  next();
}

function reasonMessage(reason: VerifyFailReason): string {
  switch (reason) {
    case "missing_hash":    return "initData has no hash field";
    case "hmac_mismatch":   return "initData HMAC verification failed";
    case "expired":         return "initData has expired (auth_date too old)";
    case "missing_user":    return "initData has no user field";
    case "parse_error":     return "initData could not be parsed";
  }
}
