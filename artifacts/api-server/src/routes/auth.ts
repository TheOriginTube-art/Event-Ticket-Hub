import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterBody, LoginBody, RegisterResponse, LoginResponse, GetMeResponse } from "@workspace/api-zod";
import {
  clearAuthCookie,
  createAuthSession,
  hashPassword,
  requireAuth,
  setAuthCookie,
  verifyPassword,
} from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const { password, name } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Пользователь с таким email уже зарегистрирован" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({ email, passwordHash, name }).returning();
  if (!user) {
    res.status(500).json({ error: "Failed to create user" });
    return;
  }

  const { token, expiresAt } = await createAuthSession(user.id);
  setAuthCookie(res, token, expiresAt);
  res.json(RegisterResponse.parse({ id: user.id, email: user.email, name: user.name }));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  const { token, expiresAt } = await createAuthSession(user.id);
  setAuthCookie(res, token, expiresAt);
  res.json(LoginResponse.parse({ id: user.id, email: user.email, name: user.name }));
});

router.post("/auth/logout", (_req, res): void => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, (req, res): void => {
  res.json(GetMeResponse.parse(req.user));
});

export default router;
