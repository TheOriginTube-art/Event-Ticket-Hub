import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, sessionsTable, venuesTable } from "@workspace/db";
import {
  ListAdminVenuesResponse,
  CreateAdminVenueBody,
  CreateAdminVenueResponse,
  UpdateAdminVenueParams,
  UpdateAdminVenueBody,
  UpdateAdminVenueResponse,
  DeleteAdminVenueParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/admin/venues", requireAdmin, async (_req, res): Promise<void> => {
  const venues = await db.select().from(venuesTable).orderBy(asc(venuesTable.city), asc(venuesTable.name));
  res.json(ListAdminVenuesResponse.parse(venues));
});

router.post("/admin/venues", requireAdmin, async (req, res): Promise<void> => {
  const body = CreateAdminVenueBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [venue] = await db.insert(venuesTable).values(body.data).returning();
  res.json(CreateAdminVenueResponse.parse(venue));
});

router.patch("/admin/venues/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminVenueParams.safeParse(req.params);
  const body = UpdateAdminVenueBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.error ?? body.error)!.message });
    return;
  }

  const [existing] = await db.select().from(venuesTable).where(eq(venuesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Venue not found" });
    return;
  }

  const [updated] = await db
    .update(venuesTable)
    .set(body.data)
    .where(eq(venuesTable.id, params.data.id))
    .returning();
  res.json(UpdateAdminVenueResponse.parse(updated));
});

router.delete("/admin/venues/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAdminVenueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(venuesTable).where(eq(venuesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Venue not found" });
    return;
  }

  const [session] = await db.select({ id: sessionsTable.id }).from(sessionsTable).where(eq(sessionsTable.venueId, params.data.id));
  if (session) {
    res.status(400).json({ error: "У площадки есть сеансы — сначала удалите или перенесите их" });
    return;
  }

  await db.delete(venuesTable).where(eq(venuesTable.id, params.data.id));
  res.status(204).send();
});

export default router;
