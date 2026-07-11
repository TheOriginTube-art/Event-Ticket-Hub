import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type { NextFunction, Request, Response } from "express";
import { eq, and, gt } from "drizzle-orm";
import { authSessionsTable, db, usersTable } from "@workspace/db";

export const AUTH_COOKIE_NAME = "tf_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createAuthSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(authSessionsTable).values({ userId, token, expiresAt });
  return { token, expiresAt };
}

export function setAuthCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
}

export async function getUserFromRequest(req: Request): Promise<{ id: number; email: string; name: string } | null> {
  const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
  if (!token) return null;

  const [row] = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(authSessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, authSessionsTable.userId))
    .where(and(eq(authSessionsTable.token, token), gt(authSessionsTable.expiresAt, new Date())));

  return row ?? null;
}

/** Attaches `req.user` when a valid session cookie is present, but never rejects the request. */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.user = await getUserFromRequest(req);
  next();
}

/** Rejects the request with 401 unless a valid session cookie is present. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.user = user;
  next();
}

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; email: string; name: string } | null;
    }
  }
}
