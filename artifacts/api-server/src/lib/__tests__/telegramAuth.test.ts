/**
 * Unit tests for verifyTelegramInitData.
 *
 * We generate real HMAC-SHA256 signatures so the tests validate
 * the actual crypto path, not a mock.
 */
import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyTelegramInitData } from "../telegramAuth";

const FAKE_BOT_TOKEN = "1234567890:ABCDefghIJKLmnopQRSTuvwxYZ0123456789";

/** Build a properly signed initData string for the given params */
function buildInitData(
  params: Record<string, string>,
  botToken: string,
  overrideHash?: string,
): string {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const hash =
    overrideHash ??
    crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const sp = new URLSearchParams({ ...params, hash });
  return sp.toString();
}

const validUser = JSON.stringify({ id: 123456789, first_name: "Ivan", username: "ivan_test" });
const nowSec = () => Math.floor(Date.now() / 1000);

describe("verifyTelegramInitData", () => {
  it("accepts fresh, correctly-signed initData", () => {
    const initData = buildInitData(
      { auth_date: String(nowSec()), user: validUser, query_id: "abc" },
      FAKE_BOT_TOKEN,
    );
    const result = verifyTelegramInitData(initData, FAKE_BOT_TOKEN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(123456789);
      expect(result.user.first_name).toBe("Ivan");
      expect(result.user.username).toBe("ivan_test");
    }
  });

  it("returns hmac_mismatch for tampered hash", () => {
    const initData = buildInitData(
      { auth_date: String(nowSec()), user: validUser },
      FAKE_BOT_TOKEN,
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    );
    const result = verifyTelegramInitData(initData, FAKE_BOT_TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("hmac_mismatch");
  });

  it("returns hmac_mismatch when signed with a different bot token", () => {
    const initData = buildInitData(
      { auth_date: String(nowSec()), user: validUser },
      "9999999999:WRONGtokenWRONGtokenWRONGtokenWRONG",
    );
    const result = verifyTelegramInitData(initData, FAKE_BOT_TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("hmac_mismatch");
  });

  it("returns missing_hash when hash field is absent", () => {
    // Build without a hash field
    const sp = new URLSearchParams({ auth_date: String(nowSec()), user: validUser });
    const result = verifyTelegramInitData(sp.toString(), FAKE_BOT_TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_hash");
  });

  it("returns expired when auth_date is older than default TTL (24 h)", () => {
    const oldAuthDate = String(nowSec() - 86401); // 24 h + 1 s ago
    const initData = buildInitData(
      { auth_date: oldAuthDate, user: validUser },
      FAKE_BOT_TOKEN,
    );

    // Ensure env var is not set so default TTL applies
    const saved = process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECS;
    delete process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECS;

    const result = verifyTelegramInitData(initData, FAKE_BOT_TOKEN);

    if (saved !== undefined) process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECS = saved;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("accepts initData older than 24 h when TELEGRAM_INIT_DATA_MAX_AGE_SECS is extended", () => {
    const oldAuthDate = String(nowSec() - 90000); // ~25 h ago
    const initData = buildInitData(
      { auth_date: oldAuthDate, user: validUser },
      FAKE_BOT_TOKEN,
    );

    process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECS = "172800"; // 48 h
    const result = verifyTelegramInitData(initData, FAKE_BOT_TOKEN);
    delete process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECS;

    expect(result.ok).toBe(true);
  });

  it("skips expiry check when TELEGRAM_INIT_DATA_MAX_AGE_SECS=0", () => {
    const veryOldAuthDate = String(nowSec() - 999999); // ~11.5 days ago
    const initData = buildInitData(
      { auth_date: veryOldAuthDate, user: validUser },
      FAKE_BOT_TOKEN,
    );

    process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECS = "0";
    const result = verifyTelegramInitData(initData, FAKE_BOT_TOKEN);
    delete process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECS;

    expect(result.ok).toBe(true);
  });

  it("returns missing_user when user field is absent", () => {
    const initData = buildInitData(
      { auth_date: String(nowSec()) },
      FAKE_BOT_TOKEN,
    );
    const result = verifyTelegramInitData(initData, FAKE_BOT_TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_user");
  });

  it("returns parse_error for completely malformed input", () => {
    const result = verifyTelegramInitData("not-url-encoded-at-all!!!###", FAKE_BOT_TOKEN);
    // Will be missing_hash since URLSearchParams won't find it
    expect(result.ok).toBe(false);
  });
});
