/**
 * Одноразовый сидер камер из OSM.
 * Запускается при старте сервера, если таблица permanent_cameras пустая.
 */
import { db, permanentCamerasTable } from "@workspace/db";
import { and, between, sql } from "drizzle-orm";
import { logger } from "./logger";

const OVERPASS_URL =
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter";

const CITIES = [
  { name: "blagoveshchensk", label: "Благовещенск",  bbox: "50.0,126.5,50.6,128.5" },
  { name: "khabarovsk",      label: "Хабаровск",     bbox: "48.2,134.7,48.7,135.3" },
  { name: "novosibirsk",     label: "Новосибирск",   bbox: "54.7,82.7,55.2,83.2"   },
  { name: "vladivostok",     label: "Владивосток",   bbox: "43.0,131.8,43.3,132.2" },
] as const;

interface OsmElement {
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

async function fetchOsmCameras(bbox: string): Promise<OsmElement[]> {
  const query = `[out:json][timeout:30];
(
  node["highway"="speed_camera"](${bbox});
  node["enforcement"="maxspeed"](${bbox});
);
out body;`;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "DPSRadar/1.0 osm-camera-seeder",
    },
    body: "data=" + encodeURIComponent(query),
    signal: AbortSignal.timeout(35_000),
  });

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as { elements: OsmElement[] };
  return data.elements ?? [];
}

export async function seedOsmCamerasIfEmpty(): Promise<void> {
  // Проверяем: есть ли уже камеры в БД
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(permanentCamerasTable);

  if (count > 0) {
    logger.info({ count }, "OSM cameras already seeded, skipping");
    return;
  }

  logger.info("permanent_cameras is empty — seeding from OSM Overpass…");

  let totalInserted = 0;
  let totalSkipped  = 0;

  for (const city of CITIES) {
    let elements: OsmElement[];
    try {
      elements = await fetchOsmCameras(city.bbox);
    } catch (err) {
      logger.warn({ err, city: city.name }, "Overpass fetch failed for city, skipping");
      continue;
    }

    logger.info({ city: city.name, found: elements.length }, "OSM cameras fetched");

    for (const el of elements) {
      if (!el.lat || !el.lon) continue;

      const DELTA = 0.0001; // ~10 м
      const existing = await db
        .select({ id: permanentCamerasTable.id })
        .from(permanentCamerasTable)
        .where(
          and(
            between(permanentCamerasTable.lat, el.lat - DELTA, el.lat + DELTA),
            between(permanentCamerasTable.lng, el.lon - DELTA, el.lon + DELTA),
          ),
        )
        .limit(1);

      if (existing.length > 0) { totalSkipped++; continue; }

      const maxspeed = el.tags?.maxspeed;
      const desc = maxspeed
        ? `Камера фиксации скорости (${maxspeed} км/ч)`
        : "Камера фиксации скорости";

      await db.insert(permanentCamerasTable).values({
        lat:         el.lat,
        lng:         el.lon,
        description: desc,
        city:        city.name,
        addedBy:     "osm-seeder",
      });
      totalInserted++;
    }
  }

  logger.info({ totalInserted, totalSkipped }, "OSM camera seeding complete");
}
