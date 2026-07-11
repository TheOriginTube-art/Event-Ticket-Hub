import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, venuesTable } from "@workspace/db";
import { ListCitiesResponse, ListVenuesQueryParams, ListVenuesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/cities", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ city: venuesTable.city })
    .from(venuesTable)
    .orderBy(asc(venuesTable.city));

  res.json(ListCitiesResponse.parse(rows.map((row) => row.city)));
});

router.get("/venues", async (req, res): Promise<void> => {
  const params = ListVenuesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const venues = params.data.city
    ? await db.select().from(venuesTable).where(eq(venuesTable.city, params.data.city)).orderBy(asc(venuesTable.name))
    : await db.select().from(venuesTable).orderBy(asc(venuesTable.name));

  res.json(ListVenuesResponse.parse(venues));
});

export default router;
