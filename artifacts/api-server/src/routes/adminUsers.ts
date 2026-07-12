import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, ordersTable, usersTable } from "@workspace/db";
import {
  ListAdminUsersResponse,
  UpdateAdminUserParams,
  UpdateAdminUserBody,
  UpdateAdminUserResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/admin/users", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      isAdmin: usersTable.isAdmin,
      createdAt: usersTable.createdAt,
      ordersCount: sql<number>`count(${ordersTable.id})::int`,
    })
    .from(usersTable)
    .leftJoin(ordersTable, eq(ordersTable.userId, usersTable.id))
    .groupBy(usersTable.id)
    .orderBy(desc(usersTable.createdAt));

  res.json(ListAdminUsersResponse.parse(rows));
});

router.patch("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminUserParams.safeParse(req.params);
  const body = UpdateAdminUserBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.error ?? body.error)!.message });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (existing.id === req.user!.id && !body.data.isAdmin) {
    res.status(400).json({ error: "Нельзя снять права администратора с самого себя" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ isAdmin: body.data.isAdmin })
    .where(eq(usersTable.id, params.data.id))
    .returning();

  const [{ ordersCount }] = await db
    .select({ ordersCount: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(eq(ordersTable.userId, updated!.id));

  res.json(UpdateAdminUserResponse.parse({ ...updated, ordersCount }));
});

export default router;
