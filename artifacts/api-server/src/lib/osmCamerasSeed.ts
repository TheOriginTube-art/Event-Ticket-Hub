/**
 * Сидер камер из OSM. Запускается при каждом старте —
 * загружает только те города, для которых ещё нет камер.
 */
import { db, permanentCamerasTable } from "@workspace/db";
import { and, between, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

const OVERPASS_URL =
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter";

const CITIES = [
  { name: "blagoveshchensk", label: "Благовещенск",             bbox: "50.0,126.5,50.6,128.5" },
  { name: "khabarovsk",      label: "Хабаровск",                bbox: "48.2,134.7,48.7,135.3" },
  { name: "novosibirsk",     label: "Новосибирск",              bbox: "54.7,82.7,55.2,83.2"   },
  { name: "vladivostok",     label: "Владивосток",              bbox: "43.0,131.8,43.3,132.2" },
  { name: "moscow",          label: "Москва",                   bbox: "55.5,37.3,55.9,37.9"   },
  { name: "spb",             label: "Санкт-Петербург",          bbox: "59.8,30.1,60.1,30.6"   },
  { name: "yekaterinburg",   label: "Екатеринбург",             bbox: "56.7,60.5,56.9,60.8"   },
  { name: "kazan",           label: "Казань",                   bbox: "55.7,49.0,55.9,49.3"   },
  { name: "nizhny_novgorod", label: "Нижний Новгород",          bbox: "56.2,43.8,56.5,44.1"   },
  { name: "chelyabinsk",     label: "Челябинск",                bbox: "55.1,61.3,55.2,61.5"   },
  { name: "omsk",            label: "Омск",                     bbox: "54.9,73.2,55.1,73.5"   },
  { name: "samara",          label: "Самара",                   bbox: "53.1,50.1,53.3,50.4"   },
  { name: "rostov",          label: "Ростов-на-Дону",           bbox: "47.2,39.5,47.3,39.8"   },
  { name: "ufa",             label: "Уфа",                      bbox: "54.7,55.9,54.8,56.1"   },
  { name: "krasnoyarsk",     label: "Красноярск",               bbox: "55.9,92.8,56.1,93.1"   },
  { name: "perm",            label: "Пермь",                    bbox: "57.9,56.1,58.1,56.3"   },
  { name: "voronezh",        label: "Воронеж",                  bbox: "51.6,39.1,51.7,39.3"   },
  { name: "irkutsk",         label: "Иркутск",                  bbox: "52.2,104.2,52.4,104.4" },
  { name: "krasnodar",       label: "Краснодар",                bbox: "45.0,38.9,45.1,39.1"   },
  { name: "tyumen",          label: "Тюмень",                   bbox: "57.1,68.9,57.2,69.1"   },
  { name: "tomsk",           label: "Томск",                    bbox: "56.4,84.9,56.6,85.0"   },
  { name: "barnaul",         label: "Барнаул",                  bbox: "53.3,83.7,53.4,83.9"   },
  { name: "chita",           label: "Чита",                     bbox: "51.9,113.4,52.1,113.6" },
  { name: "yakutsk",         label: "Якутск",                   bbox: "62.0,129.7,62.1,129.9" },
  { name: "makhachkala",     label: "Махачкала",                bbox: "42.9,47.4,43.0,47.6"   },
  { name: "ulan_ude",        label: "Улан-Удэ",                 bbox: "51.8,107.5,51.9,107.7" },
  { name: "izhevsk",         label: "Ижевск",                   bbox: "56.8,53.2,56.9,53.3"   },
  { name: "orenburg",        label: "Оренбург",                 bbox: "51.7,55.1,51.8,55.2"   },
  { name: "saratov",         label: "Саратов",                  bbox: "51.5,46.0,51.6,46.2"   },
  { name: "tolyatti",        label: "Тольятти",                 bbox: "53.5,49.3,53.6,49.5"   },
  { name: "kemerovo",        label: "Кемерово",                 bbox: "55.3,86.0,55.4,86.2"   },
  { name: "novokuznetsk",    label: "Новокузнецк",              bbox: "53.7,87.0,53.8,87.2"   },
  { name: "ryazan",          label: "Рязань",                   bbox: "54.6,39.7,54.7,39.8"   },
  { name: "naberezhnye_chelny", label: "Набережные Челны",      bbox: "55.7,52.3,55.8,52.5"   },
  { name: "astrakhan",       label: "Астрахань",                bbox: "46.3,48.0,46.4,48.1"   },
  { name: "penza",           label: "Пенза",                    bbox: "53.2,44.9,53.3,45.1"   },
  { name: "lipetsk",         label: "Липецк",                   bbox: "52.6,39.5,52.7,39.7"   },
  { name: "kirov",           label: "Киров",                    bbox: "58.6,49.6,58.7,49.7"   },
  { name: "tula",            label: "Тула",                     bbox: "54.1,37.6,54.2,37.7"   },
  { name: "ulyanovsk",       label: "Ульяновск",                bbox: "54.3,48.3,54.4,48.5"   },
  { name: "ivanovo",         label: "Иваново",                  bbox: "56.9,40.9,57.0,41.1"   },
  { name: "bryansk",         label: "Брянск",                   bbox: "53.2,34.3,53.3,34.5"   },
  { name: "tver",            label: "Тверь",                    bbox: "56.8,35.9,56.9,36.0"   },
  { name: "arkhangelsk",     label: "Архангельск",              bbox: "64.5,40.5,64.6,40.6"   },
  { name: "murmansk",        label: "Мурманск",                 bbox: "68.9,33.0,69.0,33.1"   },
  { name: "surgut",          label: "Сургут",                   bbox: "61.2,73.4,61.3,73.5"   },
  { name: "stavropol",       label: "Ставрополь",               bbox: "45.0,41.9,45.1,42.1"   },
  { name: "habarovsk_krai",  label: "Комсомольск-на-Амуре",     bbox: "50.5,137.0,50.6,137.2" },
  { name: "yuzhno_sakhalinsk", label: "Южно-Сахалинск",         bbox: "46.9,142.7,47.0,142.8" },
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

/** Загружает камеры из OSM для городов, которых ещё нет в БД. */
export async function seedOsmCamerasIfEmpty(): Promise<void> {
  // Какие города уже есть в БД
  const rows = await db
    .selectDistinct({ city: permanentCamerasTable.city })
    .from(permanentCamerasTable);
  const seededCities = new Set(rows.map((r) => r.city));

  const toSeed = CITIES.filter((c) => !seededCities.has(c.name));

  if (toSeed.length === 0) {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(permanentCamerasTable);
    logger.info({ total }, "OSM cameras already seeded, skipping");
    return;
  }

  logger.info(
    { cities: toSeed.map((c) => c.label) },
    "Seeding OSM cameras for new cities…",
  );

  let totalInserted = 0;
  let totalSkipped  = 0;

  for (const city of toSeed) {
    let elements: OsmElement[];
    try {
      elements = await fetchOsmCameras(city.bbox);
    } catch (err) {
      logger.warn({ err, city: city.name }, "Overpass fetch failed for city, skipping");
      continue;
    }

    logger.info({ city: city.label, found: elements.length }, "OSM cameras fetched");

    for (const el of elements) {
      if (!el.lat || !el.lon) continue;

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

    logger.info({ city: city.label, totalInserted }, "City done");
  }

  logger.info({ totalInserted, totalSkipped }, "OSM camera seeding complete");
}
