/**
 * Загружает стационарные камеры фиксации скорости из OpenStreetMap
 * через Overpass API. Кэшируется в localStorage на 24 часа.
 */

const CACHE_KEY   = 'osm_cameras_v1';
const CACHE_TTL   = 24 * 60 * 60 * 1000; // 24 ч

export interface OsmCamera {
  id: number;
  lat: number;
  lon: number;
  /** название / описание если есть */
  name?: string;
  /** направление в градусах (0-360), если указано */
  direction?: number;
  /** максимальная скорость в зоне камеры */
  maxspeed?: string;
}

interface CacheEntry {
  ts: number;
  cameras: OsmCamera[];
}

function loadCache(): OsmCamera[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL) return null;
    return entry.cameras;
  } catch {
    return null;
  }
}

function saveCache(cameras: OsmCamera[]) {
  try {
    const entry: CacheEntry = { ts: Date.now(), cameras };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch { /* ignore quota errors */ }
}

export async function fetchOsmCameras(): Promise<OsmCamera[]> {
  const cached = loadCache();
  if (cached) return cached;

  try {
    // Запрашиваем через наш прокси, чтобы избежать CORS
    const res = await fetch(`${import.meta.env.BASE_URL}api/dps-radar/osm-cameras`);
    if (!res.ok) throw new Error(`API ${res.status}`);

    const json = await res.json() as {
      elements: Array<{
        id: number; lat: number; lon: number;
        tags?: Record<string, string>;
      }>;
    };

    const cameras: OsmCamera[] = (json.elements ?? []).map(el => ({
      id:        el.id,
      lat:       el.lat,
      lon:       el.lon,
      name:      el.tags?.['name'] ?? el.tags?.['description'],
      direction: el.tags?.['direction'] ? parseInt(el.tags['direction']) : undefined,
      maxspeed:  el.tags?.['maxspeed'],
    }));

    saveCache(cameras);
    return cameras;
  } catch (err) {
    console.warn('[OSM cameras] fetch failed:', err);
    return [];
  }
}
