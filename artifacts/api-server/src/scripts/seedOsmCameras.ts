/**
 * Одноразовый сидер камер из OpenStreetMap через Overpass API.
 * Запуск: pnpm --filter @workspace/api-server run seed:cameras
 *
 * Добавляет только те камеры, которых ещё нет в БД (по координатам ±0.0001°).
 */
import { db, permanentCamerasTable } from "@workspace/db";
import { and, between } from "drizzle-orm";

const OVERPASS_URL =
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter";

const CITIES: { name: string; label: string; bbox: string }[] = [
  { name: "blagoveshchensk", label: "Благовещенск",  bbox: "50.0,126.5,50.6,128.5" },
  { name: "khabarovsk",      label: "Хабаровск",     bbox: "48.2,134.7,48.7,135.3" },
  { name: "novosibirsk",     label: "Новосибирск",   bbox: "54.7,82.7,55.2,83.2"   },
  { name: "vladivostok",     label: "Владивосток",   bbox: "43.0,131.8,43.3,132.2" },
];

interface OsmElement {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

async function fetchCameras(bbox: string): Promise<OsmElement[]> {
  const query = `
[out:json][timeout:30];
(
  node["highway"="speed_camera"](${bbox});
  node["enforcement"="maxspeed"](${bbox});
);
out body;
  `.trim();

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

async function main() {
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const city of CITIES) {
    console.log(`\n📡 Запрашиваю камеры: ${city.label} (${city.bbox})…`);
    let elements: OsmElement[];
    try {
      elements = await fetchCameras(city.bbox);
    } catch (e) {
      console.error(`  ❌ Ошибка Overpass: ${e}`);
      continue;
    }
    console.log(`  Найдено в OSM: ${elements.length}`);

    for (const el of elements) {
      if (!el.lat || !el.lon) continue;

      // Проверяем дубликат по близости (±0.0001° ≈ 10 м)
      const DELTA = 0.0001;
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

      if (existing.length > 0) {
        totalSkipped++;
        continue;
      }

      const maxspeed = el.tags?.maxspeed;
      const desc = maxspeed
        ? `Камера фиксации скорости (${maxspeed} км/ч)`
        : "Камера фиксации скорости";

      await db.insert(permanentCamerasTable).values({
        lat: el.lat,
        lng: el.lon,
        description: desc,
        city: city.name,
        addedBy: "osm-seeder",
      });
      totalInserted++;
    }
    console.log(`  ✅ Добавлено: ${elements.length - totalSkipped} | Пропущено дублей: ${totalSkipped}`);
  }

  console.log(`\n🏁 Готово. Добавлено всего: ${totalInserted}, пропущено дублей: ${totalSkipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
