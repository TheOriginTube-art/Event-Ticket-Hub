/**
 * Одноразовый сидер камер из OpenStreetMap через Overpass API.
 * Запуск: node artifacts/api-server/src/scripts/seedOsmCameras.mjs
 *
 * Требует: DATABASE_URL в окружении (уже есть в Replit workspace).
 */
import pg from "pg";

const { Pool } = pg;

const OVERPASS_URL = "https://maps.mail.ru/osm/tools/overpass/api/interpreter";

const CITIES = [
  { name: "blagoveshchensk", label: "Благовещенск",  bbox: "50.0,126.5,50.6,128.5" },
  { name: "khabarovsk",      label: "Хабаровск",     bbox: "48.2,134.7,48.7,135.3" },
  { name: "novosibirsk",     label: "Новосибирск",   bbox: "54.7,82.7,55.2,83.2"   },
  { name: "vladivostok",     label: "Владивосток",   bbox: "43.0,131.8,43.3,132.2" },
];

async function fetchCameras(bbox) {
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
  const data = await res.json();
  return data.elements ?? [];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let totalInserted = 0;
  let totalSkipped  = 0;

  for (const city of CITIES) {
    console.log(`\n📡 ${city.label} (${city.bbox})…`);
    let elements;
    try {
      elements = await fetchCameras(city.bbox);
    } catch (e) {
      console.error(`  ❌ Overpass error: ${e.message}`);
      continue;
    }
    console.log(`  OSM найдено: ${elements.length}`);

    for (const el of elements) {
      if (!el.lat || !el.lon) continue;

      // Проверяем дубликат ±0.0001° (≈10 м)
      const DELTA = 0.0001;
      const { rows } = await pool.query(
        `SELECT id FROM permanent_cameras
         WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4
         LIMIT 1`,
        [el.lat - DELTA, el.lat + DELTA, el.lon - DELTA, el.lon + DELTA],
      );

      if (rows.length > 0) { totalSkipped++; continue; }

      const maxspeed = el.tags?.maxspeed;
      const desc = maxspeed
        ? `Камера фиксации скорости (${maxspeed} км/ч)`
        : "Камера фиксации скорости";

      await pool.query(
        `INSERT INTO permanent_cameras (lat, lng, description, city, added_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [el.lat, el.lon, desc, city.name, "osm-seeder"],
      );
      totalInserted++;
    }
    console.log(`  ✅ Добавлено: ${totalInserted} | Пропущено дублей: ${totalSkipped}`);
  }

  console.log(`\n🏁 Готово. Итого добавлено: ${totalInserted}, пропущено: ${totalSkipped}`);
  await pool.end();
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
